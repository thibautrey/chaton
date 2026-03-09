import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Blocks,
  BookOpen,
  ChevronDown,
  Github,
  Sparkles,
  Zap,
  Lock,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getTranslation, LanguageSwitcher, type LanguageCode } from "./i18n";
import heroCat from "/chaton-hero.gif";

const GITHUB_REPO_URL = "https://github.com/thibautrey/chaton";
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`;
const DOCS_URL = "https://docs.chatons.ai";

interface LandingPageProps {
  currentLanguage?: LanguageCode;
}

type DownloadOption = {
  id: string;
  fileName: string;
  label: string;
  detail: string;
};

function getPreferredDownloadOption(): DownloadOption | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const fingerprint =
    `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  const isMac = /mac|darwin/.test(fingerprint);
  const isWindows = /win/.test(fingerprint);
  const isLinux = /linux|x11/.test(fingerprint);
  const isAppleSilicon = /arm|apple/.test(fingerprint);

  if (isMac && isAppleSilicon) {
    return {
      id: "mac-apple-silicon",
      fileName: "Chatons-latest-arm64.dmg",
      label: "macOS (Apple Silicon)",
      detail: "M1, M2, M3+",
    };
  }
  if (isMac) {
    return {
      id: "mac-intel",
      fileName: "Chatons-latest-x64.dmg",
      label: "macOS (Intel)",
      detail: "Intel-based",
    };
  }
  if (isWindows) {
    return {
      id: "windows",
      fileName: "ChatonsSetup-latest.exe",
      label: "Windows",
      detail: "10 & 11",
    };
  }
  if (isLinux) {
    return {
      id: "linux",
      fileName: "Chatons-latest.AppImage",
      label: "Linux",
      detail: "AppImage",
    };
  }
  return null;
}

function getDownloadUrl(option: DownloadOption) {
  return `${GITHUB_RELEASES_URL}/download/${option.fileName}`;
}

// ... rest of component implementation

/**
 * Example implementation showing how to use i18n
 */
export function LandingPage({ currentLanguage = "en" }: LandingPageProps) {
  const t = getTranslation(currentLanguage);
  const [selectedOption, setSelectedOption] = useState<DownloadOption | null>(
    null,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setSelectedOption(getPreferredDownloadOption());
  }, []);

  const downloadHref = useMemo(
    () => (selectedOption ? getDownloadUrl(selectedOption) : "#"),
    [selectedOption],
  );

  // Get download options with translations
  const downloadOptions: DownloadOption[] = useMemo(
    () => [
      {
        id: "mac-apple-silicon",
        fileName: "Chatons-latest-arm64.dmg",
        label: t.downloadOptions.macAppleSilicon.label,
        detail: t.downloadOptions.macAppleSilicon.detail,
      },
      {
        id: "mac-intel",
        fileName: "Chatons-latest-x64.dmg",
        label: t.downloadOptions.macIntel.label,
        detail: t.downloadOptions.macIntel.detail,
      },
      {
        id: "windows",
        fileName: "ChatonsSetup-latest.exe",
        label: t.downloadOptions.windows.label,
        detail: t.downloadOptions.windows.detail,
      },
      {
        id: "linux",
        fileName: "Chatons-latest.AppImage",
        label: t.downloadOptions.linux.label,
        detail: t.downloadOptions.linux.detail,
      },
    ],
    [t],
  );

  // Proof items with translations
  const proofItems = useMemo(
    () => [
      {
        value: t.proof.providerAgnostic,
        label: "ChatGPT, Claude, GitHub Copilot, and more",
      },
      {
        value: t.proof.fullyExtensible,
        label: "build the workspace your team needs",
      },
      { value: t.proof.openSource, label: "audit the code, own your setup" },
    ],
    [t],
  );

  // Feature cards with translations
  const featureCards = useMemo(
    () => [
      { titleKey: "useAnyModel" as const, icon: Zap },
      { titleKey: "buildExtensions" as const, icon: Blocks },
      { titleKey: "ownSetup" as const, icon: Lock },
    ],
    [],
  );

  const quickLinks = [
    { label: t.common.docs, href: DOCS_URL, icon: BookOpen },
    { label: t.common.github, href: GITHUB_REPO_URL, icon: Github },
  ];

  return (
    <div className="landing-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />

      <header className="site-header">
        <nav className="site-nav" aria-label="Primary">
          <a href={DOCS_URL}>{t.common.docs}</a>
          <a href={GITHUB_REPO_URL}>{t.common.github}</a>
          <a href={GITHUB_RELEASES_URL}>{t.common.releases}</a>
        </nav>

        {/* Language Switcher */}
        <LanguageSwitcher currentLanguage={currentLanguage} />
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
            <p className="hero-subtitle">{t.hero.subtitle}</p>

            <div className="cta-row">
              <div className="download-combo">
                {selectedOption && (
                  <>
                    <a className="download-button" href={downloadHref}>
                      {t.hero.downloadButton} {selectedOption.label}
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
                            {downloadOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className={`download-option ${
                                  option.id === selectedOption.id
                                    ? "active"
                                    : ""
                                }`}
                                onClick={() => {
                                  setSelectedOption(option);
                                  setMenuOpen(false);
                                }}
                              >
                                <span>{option.label}</span>
                                <small>{option.detail}</small>
                              </button>
                            ))}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </>
                )}
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
              {proofItems.map((item) => (
                <div key={item.value} className="proof-card">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="features" aria-label="Product features">
          {featureCards.map(({ titleKey, icon: Icon }, index) => {
            const feature = t.features[titleKey];
            return (
              <motion.article
                key={titleKey}
                className="feature-card"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.35, delay: index * 0.08 }}
              >
                <div className="feature-icon">
                  <Icon size={18} />
                </div>
                <h2>{feature.title}</h2>
                <p>{feature.body}</p>
              </motion.article>
            );
          })}
        </section>

        {/* Continue with other sections using t.sections... */}
      </main>
    </div>
  );
}
