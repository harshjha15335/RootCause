import { useTranslation } from "react-i18next";
import { MatchLibrary } from "../components/MatchLibrary";

/** The library: every demo match, one card each. */
export function Matches() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-12 sm:px-8 sm:pt-20">
      <h1 className="font-display text-[clamp(36px,6vw,72px)] font-black leading-[0.98] text-chalk [font-variation-settings:'wdth'_125]">{t("library.title")}</h1>
      <p className="mt-4 max-w-[38ch] text-[17px] text-chalk-dim">{t("library.lede")}</p>
      <div className="mt-10">
        <MatchLibrary heading={false} />
      </div>
    </div>
  );
}
