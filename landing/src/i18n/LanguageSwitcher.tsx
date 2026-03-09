import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SUPPORTED_LANGUAGES, type LanguageCode } from './translations';
import { buildLanguageUrl } from './utils';

interface LanguageSwitcherProps {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}

export function LanguageSwitcher({ currentLanguage, onLanguageChange }: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentLangName = SUPPORTED_LANGUAGES.find(
    (lang) => lang.code === currentLanguage
  )?.name || 'English';

  const handleLanguageSelect = (code: LanguageCode) => {
    setIsOpen(false);
    if (onLanguageChange) {
      onLanguageChange(code);
    }
    // Navigate to the new language URL
    const newUrl = buildLanguageUrl(code);
    window.location.href = newUrl;
  };

  return (
    <div className="language-switcher">
      <button
        type="button"
        className="language-switcher-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={`Current language: ${currentLangName}`}
      >
        <span className="language-code">{currentLanguage.toUpperCase()}</span>
        <ChevronDown size={16} className={isOpen ? 'chevron-open' : ''} />
      </button>

      {isOpen && (
        <div className="language-switcher-menu">
          <div className="language-switcher-grid">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                className={`language-switcher-option ${
                  lang.code === currentLanguage ? 'active' : ''
                }`}
                onClick={() => handleLanguageSelect(lang.code)}
                aria-current={lang.code === currentLanguage ? 'true' : 'false'}
              >
                <span className="language-code-small">{lang.code.toUpperCase()}</span>
                <span className="language-name">{lang.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
