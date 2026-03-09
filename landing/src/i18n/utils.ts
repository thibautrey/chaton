import { SUPPORTED_LANGUAGES, LanguageCode } from './translations';

/**
 * Detect browser's preferred language from multiple sources:
 * 1. URL pathname (e.g., /es/, /fr/, /de/) - highest priority
 * 2. localStorage saved preference
 * 3. browser navigator.languages (full list) then navigator.language
 * 4. Fallback to English
 */
export function detectLanguage(): LanguageCode {
  // 1. Check URL path first - explicit URL always wins
  if (typeof window !== 'undefined') {
    const pathLang = extractLanguageFromPath();
    if (pathLang && isValidLanguage(pathLang)) {
      return pathLang as LanguageCode;
    }
  }

  // 2. Check localStorage for saved preference
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('preferred-language');
    if (saved && isValidLanguage(saved)) {
      return saved as LanguageCode;
    }
  }

  // 3. Check browser language preferences (ordered list)
  if (typeof navigator !== 'undefined') {
    const candidates = navigator.languages ?? (navigator.language ? [navigator.language] : []);
    for (const raw of candidates) {
      const tag = raw.toLowerCase();
      // Try exact match (e.g. "en", "pt")
      if (isValidLanguage(tag)) {
        return tag as LanguageCode;
      }
      // Try primary subtag (e.g. "en" from "en-US", "pt" from "pt-BR")
      const primary = tag.split('-')[0];
      if (isValidLanguage(primary)) {
        return primary as LanguageCode;
      }
    }
  }

  // 4. Default to English
  return 'en';
}

/**
 * Extract language code from current URL path
 * Expects paths like /, /es/, /fr/, /de/, etc.
 */
function extractLanguageFromPath(): string | null {
  if (typeof window === 'undefined') return null;

  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);

  if (parts.length > 0) {
    const potential = parts[0].toLowerCase();
    if (potential.length === 2 || potential.length === 5) {
      // Could be "es" or "zh-hans"
      return potential;
    }
  }

  return null;
}

/**
 * Check if a language code is supported
 */
export function isValidLanguage(code: string | null | undefined): code is LanguageCode {
  if (!code) return false;
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
}

/**
 * Save language preference to localStorage
 */
export function saveLanguagePreference(code: LanguageCode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('preferred-language', code);
  }
}

/**
 * Get human-readable language name
 */
export function getLanguageName(code: LanguageCode): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return lang?.name || 'English';
}

/**
 * Build SEO-friendly URL for a language
 */
export function buildLanguageUrl(code: LanguageCode): string {
  if (code === 'en') {
    return '/';
  }
  return `/${code}/`;
}

/**
 * Get all language URLs for hreflang tags (SEO)
 */
export function getHreflangLinks(): Array<{ rel: string; hrefLang: string; href: string }> {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return SUPPORTED_LANGUAGES.map((lang) => ({
    rel: 'alternate',
    hrefLang: lang.code,
    href: `${baseUrl}${buildLanguageUrl(lang.code)}`,
  }));
}
