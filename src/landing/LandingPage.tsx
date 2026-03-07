import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Blocks,
  BookOpen,
  ChevronDown,
  Github,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'

import heroCat from '@/assets/chaton-hero.webm'
import { Button } from '@/components/ui/button'

const GITHUB_REPO_URL = 'https://github.com/thibautrey/chaton'
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`
const DOCS_URL = 'https://docs.chatons.ai'

const DOWNLOAD_OPTIONS = [
  {
    id: 'mac-apple-silicon',
    label: 'macOS (Apple Silicon)',
    detail: 'DMG for M1, M2, M3 and newer',
    fileName: 'Chatons-latest-arm64.dmg',
  },
  {
    id: 'mac-intel',
    label: 'macOS (Intel)',
    detail: 'DMG for Intel Macs',
    fileName: 'Chatons-latest-x64.dmg',
  },
  {
    id: 'windows',
    label: 'Windows',
    detail: 'Installer for Windows 10 and 11',
    fileName: 'ChatonsSetup-latest.exe',
  },
  {
    id: 'linux',
    label: 'Linux',
    detail: 'Desktop build for Linux',
    fileName: 'Chatons-latest.AppImage',
  },
] as const

type DownloadOption = (typeof DOWNLOAD_OPTIONS)[number]

function getPreferredDownloadOption(): DownloadOption {
  if (typeof navigator === 'undefined') {
    return DOWNLOAD_OPTIONS[0]
  }

  const platform = `${navigator.userAgent} ${navigator.platform}`.toLowerCase()
  const isMac = /mac|darwin/.test(platform)
  const isWindows = /win/.test(platform)
  const isLinux = /linux|x11/.test(platform)
  const isAppleSilicon = /arm|apple/.test(platform)

  if (isMac && isAppleSilicon) return DOWNLOAD_OPTIONS[0]
  if (isMac) return DOWNLOAD_OPTIONS[1]
  if (isWindows) return DOWNLOAD_OPTIONS[2]
  if (isLinux) return DOWNLOAD_OPTIONS[3]
  return DOWNLOAD_OPTIONS[0]
}

function buildReleaseDownloadUrl(option: DownloadOption) {
  return `${GITHUB_RELEASES_URL}/download/${option.fileName}`
}

const heroSignals = [
  'Desktop-native AI workspace for serious daily use',
  'Multiple providers, local runtimes, tools, and automations',
  'Extensions let you adapt Chatons to your own workflow',
] as const

const proofItems = [
  { value: 'Desktop-first', label: 'built for focus' },
  { value: 'Open source', label: 'trust by default' },
  { value: 'Extensible', label: 'grow with your workflow' },
] as const

const featureCards = [
  {
    title: 'Ship faster in one workspace',
    body: 'Conversations, code changes, tools, projects, models, and automations live together so momentum is never broken.',
    icon: Zap,
  },
  {
    title: 'Trust what runs your workflow',
    body: 'Chatons is open source, inspectable, and compatible with hosted or local model setups. No black-box dependency required.',
    icon: ShieldCheck,
  },
  {
    title: 'Extend it beyond the default app',
    body: 'Use extensions to add capabilities, tailor interfaces, and shape Chatons around your team, stack, or personal workflow.',
    icon: Blocks,
  },
] as const

const marketingSections = [
  {
    eyebrow: 'For people who actually build',
    title: 'More than a chatbot. A real command center for AI work.',
    body: 'Most AI tools are optimized for quick demos. Chatons is optimized for repeated real-world use: project context, model choice, tool execution, clean navigation, and a desktop experience that feels stable and deliberate.',
  },
  {
    eyebrow: 'Extensions and customization',
    title: 'Make the product fit your workflow instead of the opposite.',
    body: 'Chatons supports extensions so you can add new capabilities, build tailored surfaces, and integrate the product with the way you already work. That means more longevity, less lock-in, and a platform that can evolve with your needs.',
  },
] as const

const showcaseBullets = [
  'Connect hosted providers or local runtimes',
  'Manage projects, threads, and model scope cleanly',
  'Automate repetitive tasks and extend the app over time',
] as const

const secondaryLinks = [
  {
    label: 'Documentation',
    href: DOCS_URL,
    icon: BookOpen,
  },
  {
    label: 'GitHub',
    href: GITHUB_REPO_URL,
    icon: Github,
  },
] as const

const consoleLines = [
  '> open project workspace',
  '> ask Chatons to review and modify code',
  '> run tools, automate repetitive steps',
  '> keep everything in one polished desktop flow',
] as const

export function LandingPage() {
  const [selectedOption, setSelectedOption] = useState<DownloadOption>(() => getPreferredDownloadOption())
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setSelectedOption(getPreferredDownloadOption())
  }, [])

  const downloadHref = useMemo(() => buildReleaseDownloadUrl(selectedOption), [selectedOption])

  return (
    <div className="landing-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-primary" />
      <div className="landing-orb landing-orb-secondary" />

      <header className="landing-header">
        <a className="landing-brand" href="https://chatons.ai" aria-label="Chatons home">
          <span className="landing-brand-mark">C</span>
          <span>Chatons</span>
        </a>

        <nav className="landing-nav" aria-label="Primary">
          <a href={DOCS_URL}>Docs</a>
          <a href={GITHUB_REPO_URL}>GitHub</a>
          <a href={GITHUB_RELEASES_URL}>Downloads</a>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <motion.div
            className="landing-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <div className="landing-eyebrow">
              <Sparkles size={16} />
              Premium desktop AI experience, open source at the core
            </div>

            <h1>The AI workspace that looks sharp, feels focused, and scales with how you work.</h1>
            <p className="landing-subtitle">
              Chatons brings together projects, conversations, code-oriented tools, model management,
              automations, and extensions inside one slick desktop product. It is designed to feel premium
              on day one and remain flexible as your workflow grows.
            </p>

            <div className="landing-cta-row">
              <div className="landing-download-group">
                <Button asChild size="lg" className="landing-download-button">
                  <a href={downloadHref}>
                    Download for {selectedOption.label}
                    <ArrowRight size={18} />
                  </a>
                </Button>

                <div className="landing-download-picker">
                  <button
                    type="button"
                    className="landing-download-toggle"
                    aria-label="Select another binary"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((current) => !current)}
                  >
                    <ChevronDown size={18} className={menuOpen ? 'rotate-180' : ''} />
                  </button>

                  <AnimatePresence>
                    {menuOpen ? (
                      <motion.div
                        className="landing-download-menu"
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                      >
                        {DOWNLOAD_OPTIONS.map((option) => {
                          const active = option.id === selectedOption.id
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={`landing-download-option ${active ? 'is-active' : ''}`}
                              onClick={() => {
                                setSelectedOption(option)
                                setMenuOpen(false)
                              }}
                            >
                              <span>{option.label}</span>
                              <small>{option.detail}</small>
                            </button>
                          )
                        })}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>

              <div className="landing-inline-links">
                {secondaryLinks.map(({ href, label, icon: Icon }) => (
                  <a key={label} href={href} className="landing-inline-link">
                    <Icon size={16} />
                    {label}
                  </a>
                ))}
              </div>
            </div>

            <div className="landing-hero-signals" role="list" aria-label="Product highlights">
              {heroSignals.map((signal, index) => (
                <motion.div
                  key={signal}
                  className="landing-hero-signal"
                  role="listitem"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + index * 0.08, duration: 0.35 }}
                >
                  <span className="landing-signal-dot" />
                  {signal}
                </motion.div>
              ))}
            </div>

            <div className="landing-proof-grid" aria-label="Why Chatons stands out">
              {proofItems.map((item) => (
                <div key={item.value} className="landing-proof-card">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="landing-visual"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
          >
            <div className="landing-showcase-shell">
              <div className="landing-showcase-noise" />
              <div className="landing-showcase-topbar">
                <div className="landing-showcase-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-showcase-search">chatons.ai/workspace</div>
              </div>

              <div className="landing-showcase-body">
                <aside className="landing-showcase-sidebar">
                  <div className="landing-showcase-sidebar-title">Workspace</div>
                  <div className="landing-showcase-nav">
                    <span className="is-active">New thread</span>
                    <span>Projects</span>
                    <span>Automations</span>
                    <span>Extensions</span>
                  </div>
                  <div className="landing-showcase-mini-card">
                    <small>Plugin-ready</small>
                    <strong>Extend the app for your own use cases</strong>
                  </div>
                </aside>

                <div className="landing-showcase-panel">
                  <div className="landing-showcase-chip">Animated mascot + product story</div>
                  <div className="landing-showcase-hero-row">
                    <div className="landing-cat-stage">
                      <video autoPlay loop muted playsInline className="landing-cat-video">
                        <source src={heroCat} type="video/webm" />
                      </video>
                    </div>

                    <div className="landing-showcase-copy">
                      <h2>A desktop AI product with personality, clarity, and serious utility.</h2>
                      <p>
                        The animated Chatons mascot gives the page a recognizable branded centerpiece, while
                        the surrounding UI story explains what matters: code work, automations, project
                        awareness, and extensibility.
                      </p>
                    </div>
                  </div>

                  <div className="landing-console-card">
                    {consoleLines.map((line, index) => (
                      <div key={line} className={`landing-console-line ${index === 0 ? 'is-bright' : ''}`}>
                        {line}
                      </div>
                    ))}
                  </div>

                  <div className="landing-showcase-bullets">
                    {showcaseBullets.map((bullet) => (
                      <div key={bullet} className="landing-showcase-bullet">
                        <span className="landing-signal-dot" />
                        {bullet}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="landing-floating-badge landing-floating-badge-top">
                <Sparkles size={16} />
                Slick on first impression, useful long-term
              </div>
              <div className="landing-floating-badge landing-floating-badge-bottom">
                <Blocks size={16} />
                Extensions make Chatons adaptable
              </div>
            </div>
          </motion.div>
        </section>

        <section className="landing-features" aria-label="Product features">
          {featureCards.map(({ title, body, icon: Icon }, index) => (
            <motion.article
              key={title}
              className="landing-feature-card"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.35, delay: index * 0.08 }}
            >
              <div className="landing-feature-icon">
                <Icon size={18} />
              </div>
              <h2>{title}</h2>
              <p>{body}</p>
            </motion.article>
          ))}
        </section>

        <section className="landing-marketing-grid" aria-label="Why teams choose Chatons">
          {marketingSections.map((section) => (
            <article key={section.title} className="landing-marketing-card">
              <span className="landing-marketing-eyebrow">{section.eyebrow}</span>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>

        <section className="landing-bottom-cta" aria-label="Final call to action">
          <div className="landing-bottom-cta-card">
            <div>
              <span className="landing-marketing-eyebrow">Built for momentum</span>
              <h2>Download Chatons and turn AI into part of your actual workflow.</h2>
              <p>
                Use a product that feels more professional than a toy demo, more flexible than a closed SaaS,
                and more scalable than a single chat window.
              </p>
            </div>

            <div className="landing-bottom-cta-actions">
              <Button asChild size="lg" className="landing-download-button landing-download-button-full">
                <a href={downloadHref}>
                  Get Chatons for {selectedOption.label}
                  <ArrowRight size={18} />
                </a>
              </Button>
              <a href={GITHUB_REPO_URL} className="landing-inline-link">
                <Github size={16} />
                View source on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
