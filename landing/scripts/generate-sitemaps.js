#!/usr/bin/env node

/**
 * Generate sitemaps for all language versions
 * Run this after building to create language-specific sitemaps
 * 
 * Usage: node scripts/generate-sitemaps.js
 */

const fs = require('fs');
const path = require('path');

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'ko', name: '한국어' },
  { code: 'pl', name: 'Polski' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'sv', name: 'Svenska' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिंदी' },
];

const BASE_URL = 'https://chatons.ai';
const PAGES = [
  '/',
  // Add other pages as needed
];

/**
 * Generate sitemap URL entry with hreflang for language alternatives
 */
function generateUrlEntry(pagePath, currentLanguage) {
  const baseUrl = currentLanguage === 'en' ? `${BASE_URL}${pagePath}` : `${BASE_URL}/${currentLanguage}${pagePath}`;

  let xml = `  <url>\n`;
  xml += `    <loc>${baseUrl}</loc>\n`;
  xml += `    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n`;
  xml += `    <changefreq>weekly</changefreq>\n`;
  xml += `    <priority>${currentLanguage === 'en' ? '1.0' : '0.9'}</priority>\n`;

  // Add hreflang alternatives
  xml += `    <xhtml:link rel="alternate" hreflang="en" href="${BASE_URL}${pagePath}" />\n`;
  LANGUAGES.forEach((lang) => {
    if (lang.code !== 'en') {
      xml += `    <xhtml:link rel="alternate" hreflang="${lang.code}" href="${BASE_URL}/${lang.code}${pagePath}" />\n`;
    }
  });
  xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE_URL}${pagePath}" />\n`;

  xml += `  </url>\n`;
  return xml;
}

/**
 * Generate sitemap for a specific language
 */
function generateSitemapForLanguage(languageCode) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;

  // Add URLs for all pages
  PAGES.forEach((page) => {
    xml += generateUrlEntry(page, languageCode);
  });

  xml += `</urlset>\n`;
  return xml;
}

/**
 * Generate sitemap index that lists all language sitemaps
 */
function generateSitemapIndex() {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  // Main sitemap (English)
  xml += `  <sitemap>\n`;
  xml += `    <loc>${BASE_URL}/sitemap.xml</loc>\n`;
  xml += `    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n`;
  xml += `  </sitemap>\n`;

  // Language-specific sitemaps
  LANGUAGES.forEach((lang) => {
    if (lang.code !== 'en') {
      xml += `  <sitemap>\n`;
      xml += `    <loc>${BASE_URL}/sitemap-${lang.code}.xml</loc>\n`;
      xml += `    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n`;
      xml += `  </sitemap>\n`;
    }
  });

  xml += `</sitemapindex>\n`;
  return xml;
}

/**
 * Write sitemap files to the dist directory
 */
function writeSitemaps() {
  const distPath = path.join(__dirname, '..', 'dist');

  // Create sitemap index
  const indexPath = path.join(distPath, 'sitemap-index.xml');
  fs.writeFileSync(indexPath, generateSitemapIndex());
  console.log(`✓ Created ${indexPath}`);

  // Create main sitemap (English)
  const mainSitemapPath = path.join(distPath, 'sitemap.xml');
  fs.writeFileSync(mainSitemapPath, generateSitemapForLanguage('en'));
  console.log(`✓ Created ${mainSitemapPath}`);

  // Create language-specific sitemaps
  LANGUAGES.forEach((lang) => {
    if (lang.code !== 'en') {
      const sitemapPath = path.join(distPath, `sitemap-${lang.code}.xml`);
      fs.writeFileSync(sitemapPath, generateSitemapForLanguage(lang.code));
      console.log(`✓ Created ${sitemapPath}`);
    }
  });

  console.log(`\n✨ All sitemaps generated successfully!`);
}

// Run the script
try {
  writeSitemaps();
} catch (error) {
  console.error('❌ Error generating sitemaps:', error);
  process.exit(1);
}
