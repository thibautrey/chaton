import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Download,
  Github,
  Images,
  Monitor,
  Sparkles,
  Users,
} from 'lucide-react'

import appScreenshot from '../../src/assets/homeview.png'
import conversationScreenshot from '../../src/assets/simple conversation.png'
import workspaceScreenshot from '../../src/assets/coding_session.png'
import statusbarScreenshot from '../../src/assets/statusbar.png'

const GITHUB_REPO_URL = 'https://github.com/thibautrey/chaton'
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`
const DOCS_URL = 'https://chatons.ai/docs'

const DOWNLOAD_OPTIONS = [
  {
    id: 'mac-apple-silicon',
    label: 'macOS (Apple Silicon)',
    detail: 'Best for M1, M2, M3 and newer Macs',
    fileName: 'Chatons-latest-arm64.dmg',
  },
  {
    id: 'mac-intel',
    label: 'macOS (Intel)',
    detail: 'Best for Intel-based Macs',
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
    detail: 'Portable desktop build for Linux',
    fileName: 'Chatons-latest.AppImage',
  },
] as const

type DownloadOption = (typeof DOWNLOAD_OPTIONS)[number]

function getPreferredDownloadOption(): DownloadOption {
  if (typeof navigator === 'undefined') {
    return DOWNLOAD_OPTIONS[0]
  }

  const fingerprint = `${navigator.userAgent} ${navigator.platform}`.toLowerCase()
  const isMac = /mac|darwin/.test(fingerprint)
  const isWindows = /win/.test(fingerprint)
  const isLinux = /linux|x11/.test(fingerprint)
  const isAppleSilicon = /arm|apple/.test(fingerprint)

  if (isMac && isAppleSilicon) return DOWNLOAD_OPTIONS[0]
  if (isMac) return DOWNLOAD_OPTIONS[1]
  if (isWindows) return DOWNLOAD_OPTIONS[2]
  if (isLinux) return DOWNLOAD_OPTIONS[3]
  return DOWNLOAD_OPTIONS[0]
}

function getDownloadUrl(option: DownloadOption) {
  return `${GITHUB_RELEASES_URL}/download/${option.fileName}`
}

const featureCards = [
  {
    title: 'Useful from the first minute',
    body: 'Ask questions, organize projects, and work with AI in a desktop app that feels approachable even if you never write code.',
    icon: Users,
  },
  {
    title: 'A real app, not a thin web wrapper',
    body: 'Chatons brings conversations, projects, tools, downloads, and everyday workflows together in one polished desktop experience.',
    icon: Monitor,
  },
  {
    title: 'Open source and easy to explore',
    body: 'Use it freely, inspect how it works, and build on top of the product without being locked into a closed platform.',
    icon: Github,
  },
] as const

const quickLinks = [
  { label: 'Docs', href: DOCS_URL, icon: BookOpen },
  { label: 'GitHub', href: GITHUB_REPO_URL, icon: Github },
] as const

const bullets = [
  'For conversations, projects, and everyday AI tasks',
  'Works with hosted and local model setups',
  'Free, open source, and available on desktop',
] as const

const galleryItems = [
  {
    title: 'Clear home workspace',
    image: appScreenshot,
    alt: 'Chatons home screen with conversations and projects',
  },
  {
    title: 'Simple conversations',
    image: conversationScreenshot,
    alt: 'Chatons conversation view showing a clean chat interface',
  },
  {
    title: 'Focused work sessions',
    image: workspaceScreenshot,
    alt: 'Chatons workspace view during an active task session',
  },
  {
    title: 'Stays close at hand',
    image: statusbarScreenshot,
    alt: 'Chatons status bar quick access menu',
  },
] as const

export function LandingPage() {
  const [selectedOption, setSelectedOption] = useState<DownloadOption>(() => getPreferredDownloadOption())
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setSelectedOption(getPreferredDownloadOption())
  }, [])

  const downloadHref = useMemo(() => getDownloadUrl(selectedOption), [selectedOption])

  return (
    <div className="landing-page">
      <div className="landing-blur landing-blur-top" />
      <div className="landing-blur landing-blur-bottom" />

      <header className="site-header">
        <a className="brand" href="https://chatons.ai" aria-label="Chatons home">
          <span className="brand-mark">C</span>
          <span>Chatons</span>
        </a>

        <nav className="site-nav" aria-label="Primary">
          <a href={DOCS_URL}>Docs</a>
          <a href={GITHUB_REPO_URL}>GitHub</a>
          <a href={GITHUB_RELEASES_URL}>Releases</a>
        </nav>
      </header>

      <main className="site-main">
        <section className="hero">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <div className="eyebrow">
              <Sparkles size={16} />
              Free and open source desktop AI
            </div>

            <h1>Chatons is a desktop AI workspace for anyone who wants to get things done.</h1>
            <p className="hero-subtitle">
              Use Chatons for conversations, projects, automations, and daily workflows in one polished app.
              It is approachable for non-coders, powerful for advanced users, and open for everyone to inspect.
            </p>

            <div className="cta-row">
              <div className="download-combo">
                <a className="download-button" href={downloadHref}>
                  <Download size={18} />
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
                    <ChevronDown size={18} className={menuOpen ? 'chevron-open' : ''} />
                  </button>

                  <AnimatePresence>
                    {menuOpen ? (
                      <motion.div
                        className="download-menu"
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                      >
                        {DOWNLOAD_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={`download-option ${option.id === selectedOption.id ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedOption(option)
                              setMenuOpen(false)
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

            <div className="bullet-list" role="list" aria-label="Product highlights">
              {bullets.map((bullet, index) => (
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
          </motion.div>

          <motion.div
            className="hero-visual"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
          >
            <div className="hero-gallery-shell">
              <div className="hero-gallery-main">
                <img src={appScreenshot} alt="Chatons app home view" />
                <div className="hero-gallery-badge">
                  <Images size={16} />
                  Real product screenshots
                </div>
              </div>

              <div className="hero-gallery-grid" aria-label="Chatons screenshots">
                {galleryItems.slice(1).map((item) => (
                  <figure key={item.title} className="gallery-card">
                    <img src={item.image} alt={item.alt} />
                    <figcaption>{item.title}</figcaption>
                  </figure>
                ))}
              </div>
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
      </main>
    </div>
  )
}
