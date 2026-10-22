import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { useUi } from "../store/uiStore";
import en from "./en";
import es from "./es";
import hi from "./hi";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, es: { translation: es } },
  lng: useUi.getState().lang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = useUi.getState().lang;
useUi.subscribe((s, prev) => {
  if (s.lang !== prev.lang) void i18n.changeLanguage(s.lang);
});

export default i18n;
