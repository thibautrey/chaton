import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";

import { LandingPage } from "./LandingPage";
import { ExtensionsPage } from "./ExtensionsPage";
import { ExtensionDetailPage } from "./ExtensionDetailPage";
import { detectLanguage, saveLanguagePreference, type LanguageCode, isValidLanguage } from "./i18n";
import "./styles.css";

/**
 * Route component that extracts language and renders appropriate page
 */
function RoutePage({ Component }: { Component: React.ComponentType<{ currentLanguage: LanguageCode }> }) {
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

  return <Component currentLanguage={currentLang} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Root paths - auto-detect language */}
        <Route path="/" element={<RoutePage Component={LandingPage} />} />
        <Route path="/extensions" element={<RoutePage Component={ExtensionsPage} />} />
        <Route path="/extensions/:slug" element={<RoutePage Component={ExtensionDetailPage} />} />
        
        {/* Language-prefixed paths */}
        <Route path="/:lang" element={<RoutePage Component={LandingPage} />} />
        <Route path="/:lang/extensions" element={<RoutePage Component={ExtensionsPage} />} />
        <Route path="/:lang/extensions/:slug" element={<RoutePage Component={ExtensionDetailPage} />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
