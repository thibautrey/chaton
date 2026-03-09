#!/usr/bin/env node
/**
 * Post-build script to generate language-specific HTML files for SEO
 * This creates /es/index.html, /fr/index.html, etc.
 * 
 * Usage: node scripts/generate-i18n-pages.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../dist');
const indexPath = path.join(distDir, 'index.html');

// Language codes we want to generate pages for
const LANGUAGES = [
  'en', 'es', 'fr', 'de', 'ja', 'zh', 'it', 'pt',
  'ru', 'ko', 'pl', 'nl', 'sv', 'tr', 'ar', 'hi'
];

// Read the base index.html
let htmlContent = fs.readFileSync(indexPath, 'utf-8');

// For each language (except English which stays at root)
LANGUAGES.forEach((lang) => {
  if (lang === 'en') return; // English stays at root

  // Create language-specific directory
  const langDir = path.join(distDir, lang);
  if (!fs.existsSync(langDir)) {
    fs.mkdirSync(langDir, { recursive: true });
  }

  // Generate HTML with language-specific hreflang tags and meta tags
  let languageHtml = htmlContent
    .replace(
      '<html lang="en">',
      `<html lang="${lang}">`
    )
    // Add hreflang meta tags inside <head>
    .replace(
      '</head>',
      `    <link rel="alternate" hreflang="en" href="https://chatons.ai/" />\n` +
      LANGUAGES.map(l => 
        l !== 'en' 
          ? `    <link rel="alternate" hreflang="${l}" href="https://chatons.ai/${l}/" />`
          : ''
      ).filter(Boolean).join('\n') +
      `\n    <meta property="og:url" content="https://chatons.ai/${lang}/" />\n` +
      `    <meta name="theme-color" content="#f7f8fc" />\n` +
      `</head>`
    );

  // Write language-specific index.html
  const langIndexPath = path.join(langDir, 'index.html');
  fs.writeFileSync(langIndexPath, languageHtml, 'utf-8');
  console.log(`✓ Generated ${lang}/index.html`);
});

// Update root index.html with all hreflang links
let rootHtml = htmlContent.replace(
  '</head>',
  `    <link rel="alternate" hreflang="en" href="https://chatons.ai/" />\n` +
  LANGUAGES.map(l => 
    l !== 'en' 
      ? `    <link rel="alternate" hreflang="${l}" href="https://chatons.ai/${l}/" />`
      : ''
  ).filter(Boolean).join('\n') +
  `\n</head>`
);

fs.writeFileSync(indexPath, rootHtml, 'utf-8');
console.log('✓ Updated root index.html with hreflang tags');

console.log(`\n✓ Generated ${LANGUAGES.length} language pages for SEO`);
console.log('Language pages can be accessed at:');
LANGUAGES.forEach(lang => {
  const url = lang === 'en' ? '/' : `/${lang}/`;
  console.log(`  https://chatons.ai${url}`);
});
