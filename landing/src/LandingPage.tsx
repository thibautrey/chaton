import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Blocks,
  BookOpen,
  ChevronDown,
  Github,
  Lock,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import heroCat from "/chaton-hero.gif";
import { useHomeSeo } from "./seo";
import { getTranslation, type LanguageCode } from "./i18n";

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

const heroSignals = [
  "Work with every major AI provider—no vendor lock-in, unlimited flexibility",
  "Automate your workflow with built-in tools, projects, and custom extensions",
  "Desktop-first design that respects your privacy, data, and independence",
] as const;

const proofItems = [
  {
    value: "Provider Agnostic",
    label: "ChatGPT, Claude, GitHub Copilot, and more",
  },
  { value: "Fully Extensible", label: "build the workspace your team needs" },
  { value: "Open Source", label: "audit the code, own your setup" },
] as const;

const featureCards = [
  {
    title: "Use Any AI Model",
    body: "ChatGPT, Claude, GitHub Copilot, Llama, or your own API. Switch providers instantly without losing context or workspace continuity. Never be trapped by a single vendor.",
    icon: Zap,
  },
  {
    title: "Build Custom Extensions",
    body: "Create powerful integrations, custom tools, and team automations. Extend Chatons into a workspace uniquely suited to how your team actually works.",
    icon: Blocks,
  },
  {
    title: "Own Your Setup",
    body: "100% open source, inspect every line, run locally or in the cloud. Keep your API keys private, your data secure, and complete control over your AI infrastructure.",
    icon: Lock,
  },
] as const;

// -- Provider Carousel Data --

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

type MarketplaceExtension = {
  id: string;
  name: string;
  version: string;
  iconUrl: string | null;
};

// Static fallback list (updated at build time or manually).
// At runtime the component tries to fetch a fresh list from the npm registry.
const FALLBACK_EXTENSIONS: MarketplaceExtension[] = [
  {
    id: "@thibautrey/chatons-channel-telegram",
    name: "Telegram",
    version: "2.1.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-telegram.png",
  },
  {
    id: "@thibautrey/chatons-channel-discord",
    name: "Discord",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-discord.png",
  },
  {
    id: "@thibautrey/chatons-channel-slack",
    name: "Slack",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-slack.png",
  },
  {
    id: "@thibautrey/chatons-channel-whatsapp",
    name: "WhatsApp",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-whatsapp.png",
  },
  {
    id: "@thibautrey/chatons-channel-msteams",
    name: "MS Teams",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-msteams.png",
  },
  {
    id: "@thibautrey/chatons-channel-matrix",
    name: "Matrix",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-matrix.svg",
  },
  {
    id: "@thibautrey/chatons-channel-signal",
    name: "Signal",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-signal.png",
  },
  {
    id: "@thibautrey/chatons-channel-imessage",
    name: "iMessage",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-imessage.png",
  },
  {
    id: "@thibautrey/chatons-channel-line",
    name: "LINE",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-line.png",
  },
  {
    id: "@thibautrey/chatons-channel-mattermost",
    name: "Mattermost",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-mattermost.svg",
  },
  {
    id: "@thibautrey/chatons-channel-nextcloud-talk",
    name: "Nextcloud Talk",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-nextcloud-talk.svg",
  },
  {
    id: "@thibautrey/chatons-channel-feishu",
    name: "Feishu",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-feishu.svg",
  },
  {
    id: "@thibautrey/chatons-channel-zalo",
    name: "Zalo",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-zalo.png",
  },
  {
    id: "@thibautrey/chatons-channel-tlon",
    name: "Tlon",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-tlon.svg",
  },
  {
    id: "@thibautrey/chatons-channel-twitch",
    name: "Twitch",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-twitch.png",
  },
  {
    id: "@thibautrey/chatons-channel-irc",
    name: "IRC",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-irc.svg",
  },
  {
    id: "@thibautrey/chatons-channel-googlechat",
    name: "Google Chat",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-googlechat.svg",
  },
  {
    id: "@thibautrey/chatons-channel-nostr",
    name: "Nostr",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-nostr.svg",
  },
  {
    id: "@thibautrey/chatons-channel-synology-chat",
    name: "Synology Chat",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-synology-chat.png",
  },
  {
    id: "@thibautrey/chatons-channel-bluebubbles",
    name: "BlueBubbles",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-channel-bluebubbles.png",
  },
  {
    id: "@thibautrey/chatons-extension-linear",
    name: "Linear",
    version: "1.0.1",
    iconUrl: "/extension-icons/@thibautrey-chatons-extension-linear.svg",
  },
  {
    id: "@thibautrey/chatons-extension-usage-tracker",
    name: "Usage Tracker",
    version: "1.0.0",
    iconUrl: "/extension-icons/@thibautrey-chatons-extension-usage-tracker.svg",
  },
];

const BUILTIN_EXTENSIONS: MarketplaceExtension[] = [
  {
    id: "@chaton/automation",
    name: "Automation",
    version: "1.1.0",
    iconUrl: "/extension-icons/@chaton-automation.svg",
  },
  {
    id: "@chaton/memory",
    name: "Memory",
    version: "1.0.0",
    iconUrl: "/extension-icons/@chaton-memory.svg",
  },
  {
    id: "@chaton/browser",
    name: "Browser",
    version: "1.0.0",
    iconUrl: "/extension-icons/@chaton-browser.svg",
  },
];

function extensionIconSrc(ext: MarketplaceExtension): string | null {
  if (ext.iconUrl) return ext.iconUrl;
  // Try to get local icon from public/extension-icons
  const localPath = ext.id.replace(/\//g, "-");
  // Try both .svg and .png
  for (const ext_type of ["svg", "png"]) {
    return `/extension-icons/${localPath}.${ext_type}`;
  }
  return null;
}

/** Fetches the current list of chatons extensions from the npm registry */
async function fetchMarketplaceExtensions(): Promise<MarketplaceExtension[]> {
  try {
    const res = await fetch(
      "https://registry.npmjs.org/-/v1/search?text=chatons-&size=40",
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const objects: Array<{
      package: { name: string; version: string; description?: string };
    }> = data?.objects ?? [];

    return objects
      .map((o) => o.package)
      .filter((p) => /^@[^/]+\/chatons-(channel|extension)-/.test(p.name))
      .map((p) => {
        // Derive a display name from the package name
        const shortName = p.name
          .replace(/^@[^/]+\/chatons-(channel|extension)-/, "")
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        return {
          id: p.name,
          name: shortName,
          version: p.version,
          iconUrl: null,
        };
      });
  } catch {
    return [];
  }
}

function useMarketplaceExtensions() {
  const [extensions, setExtensions] = useState<MarketplaceExtension[]>(() => [
    ...BUILTIN_EXTENSIONS,
    ...FALLBACK_EXTENSIONS,
  ]);

  useEffect(() => {
    let cancelled = false;
    fetchMarketplaceExtensions().then((fetched) => {
      if (cancelled || fetched.length === 0) return;
      // Merge builtins at the front, then fetched, deduped by id
      const seen = new Set<string>();
      const merged: MarketplaceExtension[] = [];
      for (const ext of [...BUILTIN_EXTENSIONS, ...fetched]) {
        if (!seen.has(ext.id)) {
          seen.add(ext.id);
          merged.push(ext);
        }
      }
      setExtensions(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return extensions;
}

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
  const src = extensionIconSrc(ext);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <LetterIcon name={ext.name} />;
  }

  return (
    <img
      src={src}
      alt=""
      className="carousel-icon-img"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ExtensionCarousel() {
  const extensions = useMarketplaceExtensions();

  // Split into two rows for visual richness
  const mid = Math.ceil(extensions.length / 2);
  const row1 = extensions.slice(0, mid);
  const row2 = extensions.slice(mid);

  // Duplicate items enough times for seamless infinite scroll
  const repeat = 3;
  const row1Items = Array.from({ length: repeat }, () => row1).flat();
  const row2Items = Array.from({ length: repeat }, () => row2).flat();

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

export function LandingPage({ currentLanguage }: { currentLanguage: LanguageCode }) {
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
              The desktop AI workspace built for teams that value freedom
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
              Ship faster with AI. On your own terms.
            </motion.h1>
            <p className="hero-subtitle">
              Chatons is the professional desktop workspace where you choose
              your AI provider, build custom extensions, and maintain complete
              control. Stop being locked into proprietary platforms. Start
              building the workspace your team actually needs.
            </p>

            <div className="cta-row">
              <div className="download-combo">
                <a className="download-button" href={downloadHref}>
                  Download for {selectedOption.label}
                  <ArrowRight size={18} />
                </a>

                <div className="download-menu-wrap">
                  <button
                    type="button"
                    className="download-toggle"
                    aria-label="Select another binary"
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
                        {DOWNLOAD_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={`download-option ${option.id === selectedOption.id ? "active" : ""}`}
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
              {heroSignals.map((bullet, index) => (
                <motion.div
                  key={bullet}
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
          {featureCards.map(({ title, body, icon: Icon }, index) => (
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
            <span className="marketing-eyebrow">No Vendor Lock-In</span>
            <h2>Use Every AI Provider</h2>
            <p>
              ChatGPT one day, Claude the next. GitHub Copilot at work, local
              models at home. Your workspace adapts to your choices, not the
              other way around. Complete freedom. Zero lock-in.
            </p>
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
            <span className="marketing-eyebrow">Limitless Extensibility</span>
            <h2>Tailor It to Your Team</h2>
            <p>
              Generic tools don't cut it. Build custom extensions and
              automations that match your exact workflow. Chatons is a
              foundation for the workspace only your team could dream up.
            </p>
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
                <img
                  src="/extension-icons/@chaton-automation.svg"
                  alt="Automation icon"
                />
              </div>
              <h3>Custom Tools & Scripts</h3>
              <p>
                Write tools once, use them everywhere. Integrate with your APIs,
                databases, or internal systems. Your team's superpowers in one
                workspace.
              </p>
            </motion.article>

            <motion.article
              className="extension-highlight"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.35, delay: 0.08 }}
            >
              <div className="extension-icon">
                <img
                  src="/extension-icons/@chaton-memory.svg"
                  alt="Memory icon"
                />
              </div>
              <h3>Team Automation</h3>
              <p>
                Build workflows that let your team focus on what matters. Reduce
                repetitive tasks, enforce standards, and ship consistent
                quality.
              </p>
            </motion.article>

            <motion.article
              className="extension-highlight"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.35, delay: 0.16 }}
            >
              <div className="extension-icon">
                <img
                  src="/extension-icons/@chaton-browser.svg"
                  alt="Browser icon"
                />
              </div>
              <h3>Developer Experience</h3>
              <p>
                Full SDK and comprehensive docs. Build complex extensions or
                simple scripts. Chatons scales from quick wins to enterprise
                solutions.
              </p>
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
              Browse the Extensions Marketplace
              <ArrowRight size={16} />
            </Link>
          </motion.div>
        </section>

        <section className="bottom-cta" aria-label="Final call to action">
          <div className="bottom-cta-card">
            <div>
              <span className="marketing-eyebrow">Get Started</span>
              <h2>The workspace your team deserves</h2>
              <p>
                Choose your AI. Build your tools. Own your setup. Chatons gives
                you the freedom to work your way, without compromise.
              </p>
            </div>

            <div className="bottom-cta-actions">
              <a
                className="download-button download-button-full"
                href={downloadHref}
              >
                Download for {selectedOption.label}
                <ArrowRight size={18} />
              </a>
              <a className="quick-link" href={GITHUB_REPO_URL}>
                <Github size={16} />
                Explore on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
