import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams, Navigate } from "react-router-dom";

import { LandingPage } from "./LandingPage";
import { ExtensionsPage } from "./ExtensionsPage";
import { ExtensionDetailPage } from "./ExtensionDetailPage";
import { detectLanguage, saveLanguagePreference, type LanguageCode, isValidLanguage } from "./i18n";
import "./styles.css";

/**
 * Route wrapper to handle language in URL
 */
function LanguageRoute() {
  const { lang } = useParams<{ lang?: string }>();
  const [currentLang, setCurrentLang] = useState<LanguageCode>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let detected: LanguageCode = 'en';

    if (lang && isValidLanguage(lang)) {
      detected = lang as LanguageCode;
    } else if (!lang) {
      detected = detectLanguage();
    }

    setCurrentLang(detected);
    saveLanguagePreference(detected);
    document.documentElement.lang = detected;
    setMounted(true);
  }, [lang]);

  if (!mounted) {
    return null;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage currentLanguage={currentLang} />} />
      <Route path="/extensions" element={<ExtensionsPage currentLanguage={currentLang} />} />
      <Route path="/extensions/:slug" element={<ExtensionDetailPage currentLanguage={currentLang} />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Root path - auto-detect language */}
        <Route path="/" element={<LanguageRoute />} />
        {/* Language-specific paths */}
        <Route path="/:lang/*" element={<LanguageRoute />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
