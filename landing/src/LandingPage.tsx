import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Blocks,
  BookOpen,
  ChevronDown,
  Code,
  Github,
  Lock,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import heroCat from "/chaton-hero.gif";
import { useHomeSeo } from "./seo";
import { getTranslation, type LanguageCode, LanguageSwitcher } from "./i18n";

const GITHUB_REPO_URL = "https://github.com/thibautrey/chaton";
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`;
const DOCS_URL = "https://docs.chatons.ai";

const DOWNLOAD_OPTIONS = [
  {
    id: "mac-apple-silicon",
    label: "macOS (Apple Silicon)",
    detail: "Best for M1, M2, M3 and newer Macs",
    fileName: "Chatons-latest-arm64.dmg",
  },
  {
    id: "mac-intel",
    label: "macOS (Intel)",
    detail: "Best for Intel-based Macs",
    fileName: "Chatons-latest-x64.dmg",
  },
  {
    id: "windows",
    label: "Windows",
    detail: "Installer for Windows 10 and 11",
    fileName: "ChatonsSetup-latest.exe",
  },
  {
    id: "linux",
    label: "Linux",
    detail: "Portable desktop build for Linux",
    fileName: "Chatons-latest.AppImage",
  },
] as const;

type DownloadOption = (typeof DOWNLOAD_OPTIONS)[number];

function getPreferredDownloadOption(): DownloadOption {
  if (typeof navigator === "undefined") {
    return DOWNLOAD_OPTIONS[0];
  }

  const fingerprint =
    `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  const isMac = /mac|darwin/.test(fingerprint);
  const isWindows = /win/.test(fingerprint);
  const isLinux = /linux|x11/.test(fingerprint);
  const isAppleSilicon = /arm|apple/.test(fingerprint);

  if (isMac && isAppleSilicon) return DOWNLOAD_OPTIONS[0];
  if (isMac) return DOWNLOAD_OPTIONS[1];
  if (isWindows) return DOWNLOAD_OPTIONS[2];
  if (isLinux) return DOWNLOAD_OPTIONS[3];
  return DOWNLOAD_OPTIONS[0];
}

function getDownloadUrl(option: DownloadOption) {
  return `${GITHUB_RELEASES_URL}/download/${option.fileName}`;
}

type ProviderEntry = {
  name: string;
  iconUrl: string;
};

const PROVIDER_LIST: ProviderEntry[] = [
  {
    name: "OpenAI",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=openai.com",
  },
  {
    name: "Anthropic",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=anthropic.com",
  },
  {
    name: "Google",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=ai.google.dev",
  },
  {
    name: "GitHub Copilot",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=github.com",
  },
  {
    name: "Mistral",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=mistral.ai",
  },
  {
    name: "Groq",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=groq.com",
  },
  {
    name: "xAI",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=x.ai",
  },
  {
    name: "Perplexity",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=perplexity.ai",
  },
  {
    name: "DeepSeek",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=deepseek.com",
  },
  {
    name: "Together",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=together.ai",
  },
  {
    name: "OpenRouter",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=openrouter.ai",
  },
  {
    name: "Ollama",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=ollama.com",
  },
  {
    name: "LM Studio",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=lmstudio.ai",
  },
];

const quickLinks = [
  { label: "Docs", href: DOCS_URL, icon: BookOpen },
  { label: "GitHub", href: GITHUB_REPO_URL, icon: Github },
] as const;

// -- Extension Carousel --
// Extension data is fetched at runtime from marketplace.chatons.ai
// with fallback to bundled static catalog if API is unavailable.
import { getAllExtensions } from "./extensions-data";

type MarketplaceExtension = {
  id: string;
  name: string;
  version: string;
  iconUrl: string | null;
};

// Fallback letter icon when no SVG icon is available
function LetterIcon({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className="carousel-icon-letter" aria-hidden="true">
      {letter}
    </div>
  );
}

function ExtensionIcon({ ext }: { ext: MarketplaceExtension }) {
  const [failed, setFailed] = useState(false);

  if (!ext.iconUrl || failed) {
    return <LetterIcon name={ext.name} />;
  }

  return (
    <img
      src={ext.iconUrl}
      alt=""
      className="carousel-icon-img"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ExtensionCarousel() {
  const [extensions, setExtensions] = useState<MarketplaceExtension[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    getAllExtensions()
      .then((exts) => {
        if (isMounted) {
          const marketplaceExts = exts.map((e) => ({
            id: e.id,
            name: e.name,
            version: e.version,
            iconUrl: e.iconUrl,
          }));
          setExtensions(marketplaceExts);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error("Failed to load extensions:", error);
        if (isMounted) {
          setExtensions([]);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Split into two rows for visual richness
  const mid = Math.ceil(extensions.length / 2);
  const row1 = extensions.slice(0, mid);
  const row2 = extensions.slice(mid);

  // Duplicate items enough times for seamless infinite scroll
  const repeat = 3;
  const row1Items = Array.from({ length: repeat }, () => row1).flat();
  const row2Items = Array.from({ length: repeat }, () => row2).flat();

  // Show empty carousel while loading
  if (isLoading || extensions.length === 0) {
    return (
      <div className="ext-carousel" aria-label="Available extensions">
        <div className="ext-carousel-track ext-carousel-track--left">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="ext-carousel-item" key={`skeleton-${i}`}>
              <div className="ext-carousel-icon-wrap">
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    backgroundColor: "#e5e7eb",
                    borderRadius: "8px",
                    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                  }}
                  aria-hidden="true"
                />
              </div>
              <span
                style={{
                  height: "20px",
                  backgroundColor: "#e5e7eb",
                  borderRadius: "4px",
                  width: "80px",
                  display: "inline-block",
                  animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                }}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
        <div className="ext-carousel-track ext-carousel-track--right" />
      </div>
    );
  }

  return (
    <div className="ext-carousel" aria-label="Available extensions">
      <div className="ext-carousel-track ext-carousel-track--left">
        {row1Items.map((ext, i) => (
          <div className="ext-carousel-item" key={`r1-${i}-${ext.id}`}>
            <div className="ext-carousel-icon-wrap">
              <ExtensionIcon ext={ext} />
            </div>
            <span className="ext-carousel-name">{ext.name}</span>
          </div>
        ))}
      </div>
      <div className="ext-carousel-track ext-carousel-track--right">
        {row2Items.map((ext, i) => (
          <div className="ext-carousel-item" key={`r2-${i}-${ext.id}`}>
            <div className="ext-carousel-icon-wrap">
              <ExtensionIcon ext={ext} />
            </div>
            <span className="ext-carousel-name">{ext.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderCarousel() {
  // Single row, duplicated 3x for seamless infinite loop
  const repeat = 3;
  const items = Array.from({ length: repeat }, () => PROVIDER_LIST).flat();

  return (
    <div className="ext-carousel" aria-label="Supported AI providers">
      <div className="ext-carousel-track ext-carousel-track--left">
        {items.map((p, i) => (
          <div className="ext-carousel-item" key={`p-${i}-${p.name}`}>
            <div className="ext-carousel-icon-wrap">
              <img
                src={p.iconUrl}
                alt=""
                className="carousel-icon-img carousel-icon-img--favicon"
                loading="lazy"
              />
            </div>
            <span className="ext-carousel-name">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingPage({ currentLanguage, onLanguageChange }: { currentLanguage: LanguageCode; onLanguageChange?: (code: LanguageCode) => void }) {
  const [selectedOption, setSelectedOption] = useState<DownloadOption>(() =>
    getPreferredDownloadOption(),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const t = getTranslation(currentLanguage);

  useHomeSeo();

  useEffect(() => {
    setSelectedOption(getPreferredDownloadOption());
  }, []);

  const downloadHref = useMemo(
    () => getDownloadUrl(selectedOption),
    [selectedOption],
  );

  // Map download option IDs to translation keys
  const downloadOptionTranslations: Record<string, { label: string; detail: string }> = {
    "mac-apple-silicon": t.downloadOptions.macAppleSilicon,
    "mac-intel": t.downloadOptions.macIntel,
    "windows": t.downloadOptions.windows,
    "linux": t.downloadOptions.linux,
  };

  const translatedFeatures = [
    { ...t.features.useAnyModel, icon: Zap },
    { ...t.features.buildExtensions, icon: Blocks },
    { ...t.features.ownSetup, icon: Lock },
  ];

  return (
    <div className="landing-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />

      <header className="site-header">
        <nav className="site-nav" aria-label="Primary">
          <Link to="/extensions">Extensions</Link>
          <a href={DOCS_URL}>{t.common.docs}</a>
          <a href={GITHUB_REPO_URL}>{t.common.github}</a>
          <a href={GITHUB_RELEASES_URL}>{t.common.releases}</a>
          <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
        </nav>
      </header>

      <main className="site-main">
        <section className="hero hero-centered">
          <motion.div
            className="hero-visual hero-visual-cat-only"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          >
            <div className="cat-stage-free">
              <img
                src={heroCat}
                alt="Chatons hero animation"
                className="cat-video-free"
              />
            </div>
          </motion.div>

          <motion.div
            className="hero-copy hero-copy-centered"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <div className="eyebrow">
              <Sparkles size={16} />
              {t.hero.eyebrow}
            </div>

            <motion.h1
              className="hero-title"
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: [0, -2, 0], scale: 1 }}
              transition={{
                opacity: { duration: 0.45, ease: "easeOut" },
                scale: { duration: 0.45, ease: "easeOut" },
                y: {
                  duration: 6,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "mirror",
                },
              }}
            >
              {t.hero.title}
            </motion.h1>
            <p className="hero-subtitle">
              {t.hero.subtitle}
            </p>

            <div className="cta-row">
              <div className="download-combo">
                <a className="download-button" href={downloadHref}>
                  {t.hero.downloadButton} {downloadOptionTranslations[selectedOption.id]?.label ?? selectedOption.label}
                  <ArrowRight size={18} />
                </a>

                <div className="download-menu-wrap">
                  <button
                    type="button"
                    className="download-toggle"
                    aria-label={t.hero.selectBinary}
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((current) => !current)}
                  >
                    <ChevronDown
                      size={18}
                      className={menuOpen ? "chevron-open" : ""}
                    />
                  </button>

                  <AnimatePresence>
                    {menuOpen ? (
                      <motion.div
                        className="download-menu"
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                      >
                        {DOWNLOAD_OPTIONS.map((option) => {
                          const optionT = downloadOptionTranslations[option.id];
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={`download-option ${option.id === selectedOption.id ? "active" : ""}`}
                              onClick={() => {
                                setSelectedOption(option);
                                setMenuOpen(false);
                              }}
                            >
                              <span>{optionT?.label ?? option.label}</span>
                              <small>{optionT?.detail ?? option.detail}</small>
                            </button>
                          );
                        })}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>

              <div className="quick-links">
                {quickLinks.map(({ label, href, icon: Icon }) => (
                  <a key={label} className="quick-link" href={href}>
                    <Icon size={16} />
                    {label}
                  </a>
                ))}
              </div>
            </div>

            <div
              className="bullet-list"
              role="list"
              aria-label="Product highlights"
            >
              {t.signals.map((bullet, index) => (
                <motion.div
                  key={index}
                  className="bullet-item"
                  role="listitem"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: 0.12 + index * 0.08 }}
                >
                  <span className="bullet-dot" />
                  {bullet}
                </motion.div>
              ))}
            </div>

            <div className="proof-grid" aria-label="Why Chatons stands out">
              <div className="proof-card">
                <strong>{t.proof.providerAgnostic}</strong>
              </div>
              <div className="proof-card">
                <strong>{t.proof.fullyExtensible}</strong>
              </div>
              <div className="proof-card">
                <strong>{t.proof.openSource}</strong>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="features" aria-label="Product features">
          {translatedFeatures.map(({ title, body, icon: Icon }, index) => (
            <motion.article
              key={title}
              className="feature-card"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.35, delay: index * 0.08 }}
            >
              <div className="feature-icon">
                <Icon size={18} />
              </div>
              <h2>{title}</h2>
              <p>{body}</p>
            </motion.article>
          ))}
        </section>

        <section
          className="providers-section"
          aria-label="Supported AI providers"
        >
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.35 }}
          >
            <span className="marketing-eyebrow">{t.sections.providers.eyebrow}</span>
            <h2>{t.sections.providers.title}</h2>
            <p>{t.sections.providers.description}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6 }}
          >
            <ProviderCarousel />
          </motion.div>
        </section>

        <section
          className="extensions-section"
          aria-label="Extensions and customization"
        >
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.35 }}
          >
            <span className="marketing-eyebrow">{t.sections.extensions.eyebrow}</span>
            <h2>{t.sections.extensions.title}</h2>
            <p>{t.sections.extensions.description}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6 }}
          >
            <ExtensionCarousel />
          </motion.div>

          <motion.div
            className="extensions-grid"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.45 }}
          >
            <motion.article
              className="extension-highlight"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.35 }}
            >
              <div className="extension-icon">
                <Wrench size={28} />
              </div>
              <h3>{t.sections.extensions.customTools.title}</h3>
              <p>{t.sections.extensions.customTools.description}</p>
            </motion.article>

            <motion.article
              className="extension-highlight"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.35, delay: 0.08 }}
            >
              <div className="extension-icon">
                <Zap size={28} />
              </div>
              <h3>{t.sections.extensions.teamAutomation.title}</h3>
              <p>{t.sections.extensions.teamAutomation.description}</p>
            </motion.article>

            <motion.article
              className="extension-highlight"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.35, delay: 0.16 }}
            >
              <div className="extension-icon">
                <Code size={28} />
              </div>
              <h3>{t.sections.extensions.developerExperience.title}</h3>
              <p>{t.sections.extensions.developerExperience.description}</p>
            </motion.article>
          </motion.div>

          <motion.div
            className="extension-cta"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.35, delay: 0.24 }}
          >
            <Link to="/extensions" className="learn-more-link">
              {t.sections.extensions.exploreSDK}
              <ArrowRight size={16} />
            </Link>
          </motion.div>
        </section>

        <section className="bottom-cta" aria-label="Final call to action">
          <div className="bottom-cta-card">
            <div>
              <span className="marketing-eyebrow">{t.sections.bottomCTA.eyebrow}</span>
              <h2>{t.sections.bottomCTA.title}</h2>
              <p>{t.sections.bottomCTA.description}</p>
            </div>

            <div className="bottom-cta-actions">
              <a
                className="download-button download-button-full"
                href={downloadHref}
              >
                {t.sections.bottomCTA.downloadButton} {downloadOptionTranslations[selectedOption.id]?.label ?? selectedOption.label}
                <ArrowRight size={18} />
              </a>
              <a className="quick-link" href={GITHUB_REPO_URL}>
                <Github size={16} />
                {t.sections.bottomCTA.exploreGitHub}
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
