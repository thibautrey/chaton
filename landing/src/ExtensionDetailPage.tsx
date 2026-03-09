import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  BookOpen,
  Download,
  ExternalLink,
  Github,
  MessageSquare,
  Package,
  Shield,
  Tag,
  User,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ALL_EXTENSIONS,
  getExtensionBySlug,
  getCategoryLabel,
  type ExtensionCategory,
  type ExtensionEntry,
} from "./extensions-data";
import { useExtensionDetailSeo } from "./seo";
import { type LanguageCode, getTranslation } from "./i18n";

const DOCS_URL = "https://docs.chatons.ai";
const GITHUB_REPO_URL = "https://github.com/thibautrey/chaton";

const categoryIcon: Record<ExtensionCategory, typeof Blocks> = {
  builtin: Shield,
  channel: MessageSquare,
  tool: Wrench,
};

function LetterIcon({ name, large }: { name: string; large?: boolean }) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div
      className={`carousel-icon-letter ${large ? "carousel-icon-letter--lg" : ""}`}
      aria-hidden="true"
    >
      {letter}
    </div>
  );
}

function ExtIconLarge({ ext }: { ext: ExtensionEntry }) {
  const [failed, setFailed] = useState(false);
  if (!ext.iconUrl || failed) {
    return <LetterIcon name={ext.name} large />;
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

function ExtIconSmall({ ext }: { ext: ExtensionEntry }) {
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

function InstallSnippet({ ext }: { ext: ExtensionEntry }) {
  const [copied, setCopied] = useState(false);
  const command =
    ext.category === "builtin"
      ? "# Built-in - included with Chatons"
      : `npm install ${ext.id}`;

  const handleCopy = () => {
    if (ext.category === "builtin") return;
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="ed-install">
      <h3>Install</h3>
      {ext.category === "builtin" ? (
        <p className="ed-install-note">
          This extension is included with every Chatons installation. No
          additional setup required.
        </p>
      ) : (
        <>
          <p className="ed-install-note">
            Install from Settings &gt; Extensions inside Chatons, or via npm:
          </p>
          <a
            href={`chatons://extensions/install/${encodeURIComponent(ext.id)}`}
            className="ed-install-deeplink"
          >
            <Download size={16} />
            Open in Chatons &amp; Install
          </a>
          <button
            type="button"
            className="ed-code-block"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            <code>{command}</code>
            <span className="ed-copy-hint">
              {copied ? "Copied!" : "Click to copy"}
            </span>
          </button>
        </>
      )}
    </div>
  );
}

function RelatedExtensions({ current }: { current: ExtensionEntry }) {
  const related = useMemo(() => {
    return ALL_EXTENSIONS.filter(
      (e) => e.category === current.category && e.id !== current.id,
    ).slice(0, 4);
  }, [current]);

  if (related.length === 0) return null;

  return (
    <section className="ed-related" aria-label="Related extensions">
      <h2>Related Extensions</h2>
      <div className="mp-grid mp-grid--compact">
        {related.map((ext) => (
          <Link
            key={ext.id}
            to={`/extensions/${ext.slug}`}
            className="mp-card"
          >
            <div className="mp-card-header">
              <div className="mp-card-icon-wrap">
                <ExtIconSmall ext={ext} />
              </div>
              <div className="mp-card-meta">
                <h3>{ext.name}</h3>
                <span className="mp-card-version">v{ext.version}</span>
              </div>
            </div>
            <p className="mp-card-desc">{ext.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function NotFound() {
  return (
    <div className="landing-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />

      <header className="site-header">
        <nav className="site-nav" aria-label="Primary">
          <Link to="/">Home</Link>
          <Link to="/extensions">Extensions</Link>
          <a href={DOCS_URL}>Docs</a>
          <a href={GITHUB_REPO_URL}>GitHub</a>
        </nav>
      </header>

      <main className="site-main">
        <div className="mp-empty" style={{ marginTop: 120 }}>
          <Package size={48} />
          <h2>Extension not found</h2>
          <p>The extension you are looking for does not exist.</p>
          <Link to="/extensions" className="learn-more-link">
            <ArrowLeft size={16} />
            Browse all extensions
          </Link>
        </div>
      </main>
    </div>
  );
}

export function ExtensionDetailPage({ currentLanguage }: { currentLanguage?: LanguageCode }) {
  const { slug } = useParams<{ slug: string }>();
  const ext = slug ? getExtensionBySlug(slug) : undefined;
  const t = getTranslation(currentLanguage || "en");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useExtensionDetailSeo(ext);

  if (!ext) return <NotFound />;

  const CatIcon = categoryIcon[ext.category];

  return (
    <div className="landing-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />

      <header className="site-header">
        <nav className="site-nav" aria-label="Primary">
          <Link to="/">Home</Link>
          <Link to="/extensions">Extensions</Link>
          <a href={DOCS_URL}>Docs</a>
          <a href={GITHUB_REPO_URL}>GitHub</a>
        </nav>
      </header>

      <main className="site-main">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <Link to="/extensions" className="mp-back">
            <ArrowLeft size={14} />
            All extensions
          </Link>

          <div className="ed-header">
            <div className="ed-icon-wrap">
              <ExtIconLarge ext={ext} />
            </div>

            <div className="ed-header-copy">
              <div className="ed-header-top">
                <h1>{ext.name}</h1>
                <span className="mp-card-badge">
                  <CatIcon size={12} />
                  {getCategoryLabel(ext.category)}
                </span>
              </div>
              <p className="ed-version">
                Version {ext.version} &middot; {ext.license} License
              </p>
              <p className="ed-desc">{ext.description}</p>

              <div className="ed-actions">
                {ext.category !== "builtin" && (
                  <a
                    href={`chatons://extensions/install/${encodeURIComponent(ext.id)}`}
                    className="download-button download-button-full ed-action-btn ed-action-btn-primary"
                  >
                    <Download size={16} />
                    Install in Chatons
                  </a>
                )}
                {ext.npmUrl && (
                  <a
                    href={ext.npmUrl}
                    className="download-button download-button-full ed-action-btn"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Package size={16} />
                    View on npm
                  </a>
                )}
                {ext.repositoryUrl && (
                  <a
                    href={ext.repositoryUrl}
                    className="quick-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github size={16} />
                    Source Code
                  </a>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="ed-body"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <div className="ed-main">
            <InstallSnippet ext={ext} />

            <div className="ed-section">
              <h3>Capabilities</h3>
              <div className="ed-caps">
                {ext.capabilities.map((cap) => (
                  <span key={cap} className="ed-cap-badge">
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            {ext.keywords.length > 0 && (
              <div className="ed-section">
                <h3>Tags</h3>
                <div className="ed-tags">
                  {ext.keywords.map((kw) => (
                    <span key={kw} className="ed-tag">
                      <Tag size={11} />
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="ed-sidebar">
            <div className="ed-sidebar-block">
              <h4>Author</h4>
              <p>
                <User size={14} />
                {ext.author}
              </p>
            </div>
            <div className="ed-sidebar-block">
              <h4>Package</h4>
              <p className="ed-sidebar-mono">{ext.id}</p>
            </div>
            <div className="ed-sidebar-block">
              <h4>License</h4>
              <p>{ext.license}</p>
            </div>
            {ext.repositoryUrl && (
              <div className="ed-sidebar-block">
                <h4>Repository</h4>
                <a
                  href={ext.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ed-sidebar-link"
                >
                  <Github size={13} />
                  GitHub
                  <ExternalLink size={11} />
                </a>
              </div>
            )}
            <div className="ed-sidebar-block">
              <h4>Documentation</h4>
              <a
                href={`${DOCS_URL}/extensions`}
                className="ed-sidebar-link"
              >
                <BookOpen size={13} />
                Extension SDK
                <ExternalLink size={11} />
              </a>
            </div>
          </aside>
        </motion.div>

        <RelatedExtensions current={ext} />
      </main>
    </div>
  );
}
