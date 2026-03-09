import { SUPPORTED_LANGUAGES } from '../i18n/translations';

/**
 * Generate Schema.org JSON-LD for multilingual support
 * This helps search engines understand language alternatives
 */
export function generateMultilingualSchema(currentUrl: string, currentLanguage: string) {
  // Language alternative URLs
  const inLanguage = SUPPORTED_LANGUAGES.map((lang) => ({
    '@type': 'Language',
    name: lang.name,
    alternateName: lang.code,
  }));

  // Get base URL
  const baseUrl = 'https://chatons.ai';
  
  // Create a schema for multilingual content
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Chatons',
    url: baseUrl,
    description: 'Free and open source desktop AI workspace for people who build things.',
    inLanguage: SUPPORTED_LANGUAGES.map((lang) => lang.code),
    availableLanguage: inLanguage,
    // Main entity
    mainEntity: {
      '@type': 'SoftwareApplication',
      name: 'Chatons',
      description: 'Free and open source desktop AI workspace for coding, automations, conversations, and model workflows.',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: ['Windows', 'macOS', 'Linux'],
      url: baseUrl,
      inLanguage: SUPPORTED_LANGUAGES.map((lang) => lang.code),
    },
    // Alternate versions for each language
    alternateVersions: SUPPORTED_LANGUAGES.map((lang) => ({
      '@type': 'WebPage',
      url: lang.code === 'en' ? baseUrl : `${baseUrl}/${lang.code}/`,
      inLanguage: lang.code,
      name: `Chatons - ${lang.name}`,
    })),
  };

  return schema;
}

/**
 * Generate hreflang meta tags for all languages
 * Returns array of link elements to include in head
 */
export function generateHrefLangTags(currentLanguage: string = 'en') {
  const baseUrl = 'https://chatons.ai';
  
  const tags = SUPPORTED_LANGUAGES.map((lang) => ({
    rel: 'alternate',
    hreflang: lang.code,
    href: lang.code === 'en' ? baseUrl + '/' : baseUrl + '/' + lang.code + '/',
  }));

  // Add x-default
  tags.push({
    rel: 'alternate',
    hreflang: 'x-default',
    href: baseUrl + '/',
  });

  return tags;
}

/**
 * Create structured data for language switcher
 * Helps accessibility tools and search engines understand language options
 */
export function generateLanguageSwitcherSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Thing',
    name: 'Language Selector',
    about: 'Select your preferred language',
    potentialAction: {
      '@type': 'SelectAction',
      target: SUPPORTED_LANGUAGES.map((lang) => ({
        '@type': 'EntryPoint',
        name: lang.name,
        urlTemplate: lang.code === 'en' ? 'https://chatons.ai/' : `https://chatons.ai/${lang.code}/`,
        actionPlatform: ['DesktopWebPlatform', 'MobileWebPlatform'],
      })),
    },
  };
}

/**
 * Generate a sitemap entry format for language alternatives
 * This can be used to generate language-specific sitemaps
 */
export function generateSitemapEntries(pagePath: string = '/') {
  return SUPPORTED_LANGUAGES.map((lang) => ({
    loc:
      lang.code === 'en'
        ? `https://chatons.ai${pagePath}`
        : `https://chatons.ai/${lang.code}${pagePath}`,
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'weekly',
    priority: lang.code === 'en' ? 1.0 : 0.9,
    'xhtml:link': {
      rel: 'alternate',
      hreflang: lang.code,
      href: lang.code === 'en'
        ? `https://chatons.ai${pagePath}`
        : `https://chatons.ai/${lang.code}${pagePath}`,
    },
  }));
}
