import asyncio
import logging
from xml.sax.saxutils import escape

import httpx

from agents.grounding import NEUTRAL, iter_sentences
from api.contracts import CitedSentence, Explanation

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

    async def filter_explanation(self, explanation: Explanation) -> Explanation:
        result = explanation.model_copy(deep=True)
        try:
            text = "\n".join(s.text for s in iter_sentences(result))
            if await asyncio.wait_for(self.safe(text), 5):
                return result
            result.warnings.append("Content Safety flagged output; neutral rewrite substituted")
            if self.provider:
                from api.contracts import NeutralPlan

                await asyncio.wait_for(
                    self.provider.generate("neutral", {}, NeutralPlan, light=True), 2
                )
        except Exception as error:  # noqa: BLE001 - safety failures withhold narrative
            logger.warning("Safety unavailable: %s", type(error).__name__)
            result.warnings.append("Content Safety unavailable; narrative withheld")

        def neutral(eid):
            return CitedSentence(text=NEUTRAL, evidence_ids=[eid], kind="neutral")

        for paragraph in result.paragraphs:
            paragraph.sentences = [neutral(paragraph.evidence_id)]
        result.root_summary = [neutral(result.root_cause_evidence_id)]
        for clip in result.highlights:
            clip.caption = neutral(clip.evidence_id)
        result.recaps = {
            mode: [neutral(result.root_cause_evidence_id)] for mode in ("fan", "analyst", "studio")
        }
        # Preserve immutable blame and the separately available trace, even when prose is withheld.
        result.source = "evidence-only"
        result.status = "pending"
        return result

    async def translate(self, text: str, lang: str):
        return (await self.translate_many([text], lang))[0]

    async def translate_many(self, texts: list[str], lang: str) -> list[str]:
        if lang == "en":
            return texts
        if lang not in {"hi", "es"}:
            raise ValueError("Unsupported language")
        token = await self.credential.get_token("https://cognitiveservices.azure.com/.default")
        results = []
        # Bound the request size below Translator's 50,000-character limit.
        batches = []
        batch = []
        size = 0
        for text in texts:
            if batch and (size + len(text) > 10000 or len(batch) >= 100):
                batches.append(batch)
                batch = []
                size = 0
            batch.append(text)
            size += len(text)
        if batch:
            batches.append(batch)
        for batch in batches:
            response = await self.http.post(
                self.settings.translator_endpoint.rstrip("/") + "/translator/text/v3.0/translate",
                params={"api-version": "3.0", "from": "en", "to": lang},
                headers={"Authorization": f"Bearer {token.token}"},
                json=[{"Text": text} for text in batch],
            )
            response.raise_for_status()
            rows = response.json()
            if len(rows) != len(batch):
                raise ValueError("Translator omitted a sentence")
            translated = [row["translations"][0]["text"] for row in rows]
            if not await self.safe("\n".join(translated)):
                raise ValueError("Translation failed Content Safety")
            results.extend(translated)
        return results

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
