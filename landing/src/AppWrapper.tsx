import { useEffect, useState } from 'react';
import { LandingPage } from './LandingPage';
import { detectLanguage, saveLanguagePreference, type LanguageCode } from './i18n';

/**
 * App wrapper that detects and manages language
 */
export function App() {
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Detect language on mount
    const detected = detectLanguage();
    setLanguage(detected);
    saveLanguagePreference(detected);
    setMounted(true);

    // Update HTML lang attribute
    document.documentElement.lang = detected;
  }, []);

  if (!mounted) {
    return null; // Or a loading spinner
  }

  return <LandingPage currentLanguage={language} onLanguageChange={saveLanguagePreference} />;
}

export default App;
