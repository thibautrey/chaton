import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Blocks,
  BookOpen,
  ChevronDown,
  Github,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Zap,
  Lock,
  Code2,
  Monitor,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import heroCat from "/chaton-hero.gif";

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
  { value: "Provider Agnostic", label: "ChatGPT, Claude, GitHub Copilot, and more" },
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

const providerCards = [
  { name: "ChatGPT", desc: "Leverage GPT-4, GPT-4 Turbo, and the latest from OpenAI", logo: "⚡" },
  { name: "GitHub Copilot", desc: "Enterprise subscriptions fully supported—native integration", logo: "🐙" },
  { name: "Claude", desc: "Anthropic's reasoning and context mastery at your fingertips", logo: "🧠" },
  { name: "Local Models", desc: "Run Ollama, Llama 2, Mistral—complete privacy and control", logo: "🖥️" },
  { name: "Any API", desc: "Custom models, fine-tuned endpoints, proprietary solutions", logo: "🔧" },
  { name: "Multi-Provider", desc: "Use them all together—pick the best tool for each task", logo: "🚀" },
] as const;

const showcaseCards = [
  {
    id: "workspace",
    title: "Unified Workspace",
    description: "Projects, conversations, automations, and tools—all in one professional desktop app. Context stays with you.",
    image: "/screenshots/workspace.svg",
  },
  {
    id: "providers",
    title: "Multi-Provider at a Glance",
    description: "Switch between ChatGPT, Claude, GitHub Copilot, or local models instantly. Your workspace adapts to your choice.",
    image: "/screenshots/providers.svg",
  },
  {
    id: "extensions",
    title: "Custom Extensions in Action",
    description: "Teams build powerful integrations and automations. From quick scripts to enterprise workflows, Chatons scales with you.",
    image: "/screenshots/extensions.svg",
  },
] as const;

const quickLinks = [
  { label: "Docs", href: DOCS_URL, icon: BookOpen },
  { label: "GitHub", href: GITHUB_REPO_URL, icon: Github },
] as const;

const consoleLines = [
  "> open project workspace",
  "> ask Chatons to review, edit, and automate",
  "> keep context, tools, and conversations together",
  "> ship faster inside one focused desktop environment",
] as const;

export function LandingPage() {
  const [selectedOption, setSelectedOption] = useState<DownloadOption>(() =>
    getPreferredDownloadOption(),
  );
  const [menuOpen, setMenuOpen] = useState(false);

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
          <a href={DOCS_URL}>Docs</a>
          <a href={GITHUB_REPO_URL}>GitHub</a>
          <a href={GITHUB_RELEASES_URL}>Releases</a>
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
              <img src={heroCat} alt="Chatons hero animation" className="cat-video-free" />
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
              Chatons is the professional desktop workspace where you choose your AI provider, build custom extensions, and maintain complete control. Stop being locked into proprietary platforms. Start building the workspace your team actually needs.
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

        <section className="providers-section" aria-label="Supported AI providers">
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
              ChatGPT one day, Claude the next. GitHub Copilot at work, local models at home. Your workspace adapts to your choices, not the other way around. Complete freedom. Zero lock-in.
            </p>
          </motion.div>

          <motion.div
            className="providers-grid"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.45 }}
          >
            {providerCards.map(({ name, desc, logo }, index) => (
              <motion.div
                key={name}
                className="provider-card"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.35, delay: index * 0.08 }}
              >
                <div className="provider-logo">{logo}</div>
                <h3>{name}</h3>
                <p>{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="extensions-section" aria-label="Extensions and customization">
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
              Generic tools don't cut it. Build custom extensions and automations that match your exact workflow. Chatons is a foundation for the workspace only your team could dream up.
            </p>
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
                <Code2 size={20} />
              </div>
              <h3>Custom Tools & Scripts</h3>
              <p>
                Write tools once, use them everywhere. Integrate with your APIs, databases, or internal systems. Your team's superpowers in one workspace.
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
                <Blocks size={20} />
              </div>
              <h3>Team Automation</h3>
              <p>
                Build workflows that let your team focus on what matters. Reduce repetitive tasks, enforce standards, and ship consistent quality.
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
                <TerminalSquare size={20} />
              </div>
              <h3>Developer Experience</h3>
              <p>
                Full SDK and comprehensive docs. Build complex extensions or simple scripts. Chatons scales from quick wins to enterprise solutions.
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
            <a href={DOCS_URL} className="learn-more-link">
              Explore the extension SDK
              <ArrowRight size={16} />
            </a>
          </motion.div>
        </section>

        <section className="showcase-section" aria-label="Product showcase and features in action">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.35 }}
          >
            <span className="marketing-eyebrow">See It in Action</span>
            <h2>Professional Workspace. Real World Ready.</h2>
            <p>
              From day one, Chatons feels like a workspace built for teams that ship. Powerful, flexible, and designed for how you actually work.
            </p>
          </motion.div>

          <motion.div
            className="showcase-grid"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.45 }}
          >
            {showcaseCards.map(({ id, title, description, image }, index) => (
              <motion.div
                key={id}
                className="showcase-item"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.35, delay: index * 0.1 }}
              >
                <div className="showcase-mockup">
                  <div className="macbook-frame">
                    <div className="macbook-notch" />
                    <img 
                      src={image} 
                      alt={title}
                      className="showcase-image"
                    />
                  </div>
                </div>
                <div className="showcase-content">
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="bottom-cta" aria-label="Final call to action">
          <div className="bottom-cta-card">
            <div>
              <span className="marketing-eyebrow">Get Started</span>
              <h2>
                The workspace your team deserves
              </h2>
              <p>
                Choose your AI. Build your tools. Own your setup. Chatons gives you the freedom to work your way, without compromise.
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
