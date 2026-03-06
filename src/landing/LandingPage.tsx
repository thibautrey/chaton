import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Github,
  Laptop,
  Monitor,
  Sparkles,
  TerminalSquare,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

const GITHUB_REPO_URL = 'https://github.com/thibautrey/chaton'
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`
const DOCS_URL = 'https://chatons.ai/docs'

const DOWNLOAD_OPTIONS = [
  {
    id: 'mac-apple-silicon',
    label: 'macOS (Apple Silicon)',
    detail: 'DMG for M1, M2, M3 and newer',
    fileName: 'Chatons-latest-arm64.dmg',
    keywords: ['mac', 'macos', 'darwin', 'arm', 'apple', 'silicon'],
  },
  {
    id: 'mac-intel',
    label: 'macOS (Intel)',
    detail: 'DMG for Intel Macs',
    fileName: 'Chatons-latest-x64.dmg',
    keywords: ['mac', 'macos', 'darwin', 'intel', 'x64'],
  },
  {
    id: 'windows',
    label: 'Windows',
    detail: 'Installer for Windows 10 and 11',
    fileName: 'ChatonsSetup-latest.exe',
    keywords: ['win', 'windows'],
  },
  {
    id: 'linux',
    label: 'Linux',
    detail: 'Desktop build for Linux',
    fileName: 'Chatons-latest.AppImage',
    keywords: ['linux', 'x11', 'wayland', 'ubuntu', 'debian', 'fedora'],
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

const featureCards = [
  {
    title: 'Desktop AI that respects your workflow',
    body: 'Run Chatons locally as a fast desktop app with projects, conversations, tools, and models in one place.',
    icon: Laptop,
  },
  {
    title: 'Free and open source',
    body: 'Use it, inspect it, modify it, and contribute back. No lock-in, no closed black box, no paid gate to get started.',
    icon: Github,
  },
  {
    title: 'Built for shipping work',
    body: 'Chat, edit code, connect providers, manage models, and automate repetitive tasks without leaving your desktop workspace.',
    icon: TerminalSquare,
  },
] as const

const secondaryLinks = [
  {
    label: 'Documentation',
    href: DOCS_URL,
    icon: BookOpen,
  },
  {
    label: 'GitHub repository',
    href: GITHUB_REPO_URL,
    icon: Github,
  },
] as const

const productPillars = [
  'Works with multiple providers and local setups',
  'Native desktop experience with project-aware workflows',
  'Open source foundations you can trust and extend',
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
      <div className="landing-background landing-background-top" />
      <div className="landing-background landing-background-bottom" />

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
              Free. Open source. Ready for your desktop.
            </div>

            <h1>Chatons is the open source desktop AI workspace for people who actually build things.</h1>
            <p className="landing-subtitle">
              A polished desktop app for coding, conversations, models, automations, and daily AI workflows.
              Download it for free, inspect the code on GitHub, and make it your own.
            </p>

            <div className="landing-download-row">
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

            <div className="landing-pillars" role="list" aria-label="Key product highlights">
              {productPillars.map((pillar, index) => (
                <motion.div
                  key={pillar}
                  className="landing-pillar"
                  role="listitem"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + index * 0.08, duration: 0.35 }}
                >
                  <span className="landing-pillar-dot" />
                  {pillar}
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="landing-visual"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
          >
            <div className="landing-window">
              <div className="landing-window-toolbar">
                <span />
                <span />
                <span />
              </div>
              <div className="landing-window-body">
                <div className="landing-window-sidebar">
                  <div className="landing-window-sidebar-title">Chatons</div>
                  <div className="landing-window-sidebar-list">
                    <span>New thread</span>
                    <span>Projects</span>
                    <span>Automations</span>
                    <span>Extensions</span>
                  </div>
                </div>
                <div className="landing-window-panel">
                  <div className="landing-terminal-card">
                    <div className="landing-terminal-chip">Open source desktop AI workspace</div>
                    <div className="landing-terminal-line">$ ask Chatons to wire a feature</div>
                    <div className="landing-terminal-line muted">- analyzes your repo</div>
                    <div className="landing-terminal-line muted">- edits files with tools</div>
                    <div className="landing-terminal-line muted">- keeps the workflow in one place</div>
                  </div>
                  <div className="landing-floating-card landing-floating-card-top">
                    <Github size={18} />
                    <div>
                      <strong>Free forever to inspect and use</strong>
                      <p>Built in the open on GitHub.</p>
                    </div>
                  </div>
                  <div className="landing-floating-card landing-floating-card-bottom">
                    <Monitor size={18} />
                    <div>
                      <strong>Suggested download</strong>
                      <p>{selectedOption.label}</p>
                    </div>
                  </div>
                </div>
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
              viewport={{ once: true, amount: 0.4 }}
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
      </main>
    </div>
  )
}
