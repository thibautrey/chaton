import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams, useNavigate, useLocation } from "react-router-dom";

import { LandingPage } from "./LandingPage";
import { ExtensionsPage } from "./ExtensionsPage";
import { ExtensionDetailPage } from "./ExtensionDetailPage";
import { CloudPortalPage } from "./CloudPortalPage";
import { CloudSignupPage } from "./CloudSignupPage";
import { CloudLoginPage } from "./CloudLoginPage";
import { CloudOnboardingPage } from "./CloudOnboardingPage";
import { detectLanguage, saveLanguagePreference, type LanguageCode, isValidLanguage } from "./i18n";
import "./styles.css";

/**
 * Route component that extracts language and renders appropriate page
 */
function RoutePage({ Component }: { Component: React.ComponentType<{ currentLanguage: LanguageCode; onLanguageChange?: (code: LanguageCode) => void }> }) {
  const { lang, slug } = useParams<{ lang?: string; slug?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentLang, setCurrentLang] = useState<LanguageCode>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let detected: LanguageCode = 'en';

    if (lang && isValidLanguage(lang)) {
      detected = lang as LanguageCode;
    } else if (!lang) {
      detected = detectLanguage();

      // Redirect to lang-prefixed URL so the address bar matches
      if (detected !== 'en') {
        const pathParts = location.pathname.split('/').filter(Boolean);
        const subPath = pathParts.join('/');
        navigate(`/${detected}${subPath ? `/${subPath}` : ''}`, { replace: true });
      }
    }

    setCurrentLang(detected);
    saveLanguagePreference(detected);
    document.documentElement.lang = detected;
    setMounted(true);
  }, [lang]);

  const handleLanguageChange = (code: LanguageCode) => {
    setCurrentLang(code);
    saveLanguagePreference(code);
    document.documentElement.lang = code;

    // Build the new path preserving the current sub-route
    const pathParts = location.pathname.split('/').filter(Boolean);

    // Strip existing lang prefix if present
    if (pathParts.length > 0 && isValidLanguage(pathParts[0])) {
      pathParts.shift();
    }

    // Build new path with lang prefix (omit for English)
    const subPath = pathParts.join('/');
    const newPath = code === 'en'
      ? `/${subPath}`
      : `/${code}${subPath ? `/${subPath}` : ''}`;

    navigate(newPath);
  };

  if (!mounted) {
    return null;
  }

  return <Component currentLanguage={currentLang} onLanguageChange={handleLanguageChange} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Language-prefixed paths - must come before root paths */}
        <Route path="/:lang" element={<RoutePage Component={LandingPage} />} />
        <Route path="/:lang/extensions" element={<RoutePage Component={ExtensionsPage} />} />
        <Route path="/:lang/extensions/:slug" element={<RoutePage Component={ExtensionDetailPage} />} />
        <Route path="/:lang/cloud" element={<RoutePage Component={CloudPortalPage} />} />
        <Route path="/:lang/cloud/signup" element={<RoutePage Component={CloudSignupPage} />} />
        <Route path="/:lang/cloud/login" element={<RoutePage Component={CloudLoginPage} />} />
        <Route path="/:lang/cloud/onboarding" element={<RoutePage Component={CloudOnboardingPage} />} />
        
        {/* Root paths - auto-detect language */}
        <Route path="/" element={<RoutePage Component={LandingPage} />} />
        <Route path="/extensions" element={<RoutePage Component={ExtensionsPage} />} />
        <Route path="/extensions/:slug" element={<RoutePage Component={ExtensionDetailPage} />} />
        <Route path="/cloud" element={<RoutePage Component={CloudPortalPage} />} />
        <Route path="/cloud/signup" element={<RoutePage Component={CloudSignupPage} />} />
        <Route path="/cloud/login" element={<RoutePage Component={CloudLoginPage} />} />
        <Route path="/cloud/onboarding" element={<RoutePage Component={CloudOnboardingPage} />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
