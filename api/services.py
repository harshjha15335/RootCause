import asyncio
import logging
from xml.sax.saxutils import escape

import httpx

from api.contracts import Verdict

logger = logging.getLogger(__name__)


class AzureServices:
    """Managed-identity Content Safety, Translator and Speech; no local secret files."""

    def __init__(self, settings, credential, http=None, safety=None, provider=None):
        from azure.ai.contentsafety.aio import ContentSafetyClient

        self.settings, self.credential = settings, credential
        self.http = http or httpx.AsyncClient(timeout=8)
        self.safety = safety or ContentSafetyClient(settings.safety_endpoint, credential)
        self.limit = asyncio.Semaphore(4)
        self.provider = provider

    async def safe(self, text: str) -> bool:
        from azure.ai.contentsafety.models import AnalyzeTextOptions

        async with self.limit:
            # The API accepts at most 10,000 characters per request.
            for offset in range(0, len(text), 8000):
                result = await self.safety.analyze_text(
                    AnalyzeTextOptions(text=text[offset : offset + 8000])
                )
                if any((x.severity or 0) >= 4 for x in result.categories_analysis):
                    return False
        return True

    async def filter_verdict(self, verdict: Verdict) -> Verdict:
        result = verdict.model_copy(deep=True)
        try:
            # Check every courtroom output, including rejection and attribution descriptions.
            if await asyncio.wait_for(self.safe(result.model_dump_json()), 5):
                return result
            result.warnings.append(
                "Content Safety flagged output; neutral evidence view substituted"
            )
            if self.provider:
                from api.contracts import NeutralPlan

                # The light model selects only an audited neutral rewrite, never new facts.
                await asyncio.wait_for(
                    self.provider.generate("neutral", {}, NeutralPlan, light=True), 2
                )
        except Exception as error:  # noqa: BLE001 - fail closed on safety service failure
            logger.warning("Safety unavailable: %s", type(error).__name__)
            result.warnings.append("Content Safety unavailable; narrative withheld")
        # Only server-controlled neutral text is retained. No flagged generated text escapes.
        result.recaps = {
            mode: "Narrative withheld. Review the structured attribution."
            for mode in ("fan", "analyst", "studio")
        }
        result.reasoning = "Narrative withheld by output safety checks."
        for testimony in result.testimonies:
            testimony.statement = "Testimony withheld by output safety checks."
            testimony.claims = []
        result.accepted_claims = []
        result.rejected_claims = []
        for link in result.blame_order:
            link.description = "Description withheld by output safety checks."
            link.bug_type = "withheld"
        result.source = "evidence-only"
        return result

    async def translate(self, text: str, lang: str):
        if lang == "en":
            return text
        if lang not in {"hi", "es"}:
            raise ValueError("Unsupported language")
        token = await self.credential.get_token("https://cognitiveservices.azure.com/.default")
        response = await self.http.post(
            self.settings.translator_endpoint.rstrip("/") + "/translator/text/v3.0/translate",
            params={"api-version": "3.0", "from": "en", "to": lang},
            headers={"Authorization": f"Bearer {token.token}"},
            json=[{"Text": text}],
        )
        response.raise_for_status()
        translated = response.json()[0]["translations"][0]["text"]
        if not await self.safe(translated):
            raise ValueError("Translated output failed safety checks")
        return translated

    async def speech(self, text: str, lang: str) -> bytes:
        import azure.cognitiveservices.speech as speechsdk

        if not await self.safe(text):
            raise ValueError("Speech output failed safety checks")
        token = await self.credential.get_token("https://cognitiveservices.azure.com/.default")
        resource = self.settings.speech_resource_id
        if not resource:
            raise ValueError("SPEECH_RESOURCE_ID is required for managed identity speech")
        voices = {"en": "en-US-JennyNeural", "hi": "hi-IN-SwaraNeural", "es": "es-ES-ElviraNeural"}
        config = speechsdk.SpeechConfig(
            auth_token=f"aad#{resource}#{token.token}", region=self.settings.speech_region
        )
        config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )
        config.speech_synthesis_voice_name = voices[lang]
        synth = speechsdk.SpeechSynthesizer(speech_config=config, audio_config=None)
        # Escaped text prevents evidence from injecting SSML directives.
        ssml = (
            f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
            f'xml:lang="{lang}"><voice name="{voices[lang]}">{escape(text)}</voice></speak>'
        )
        result = await asyncio.to_thread(lambda: synth.speak_ssml_async(ssml).get())
        if result is None or result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
            raise RuntimeError("Speech synthesis failed")
        return result.audio_data

    async def close(self):
        await self.http.aclose()
        await self.safety.close()
