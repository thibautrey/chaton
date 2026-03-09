import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  MessageSquare,
  Package,
  Search,
  Shield,
  Sparkles,
  Wrench,
  Github,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  ALL_EXTENSIONS,
  BUILTIN_EXTENSIONS,
  CHANNEL_EXTENSIONS,
  TOOL_EXTENSIONS,
  getCategoryLabel,
  type ExtensionCategory,
  type ExtensionEntry,
} from "./extensions-data";
import { useExtensionsIndexSeo } from "./seo";
import { type LanguageCode, getTranslation } from "./i18n";

const DOCS_URL = "https://docs.chatons.ai";
const GITHUB_REPO_URL = "https://github.com/thibautrey/chaton";
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`;

// Reuse icon component from landing
function LetterIcon({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className="carousel-icon-letter" aria-hidden="true">
      {letter}
    </div>
  );
}

function ExtIcon({ ext }: { ext: ExtensionEntry }) {
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

const categoryIcon: Record<ExtensionCategory, typeof Blocks> = {
  builtin: Shield,
  channel: MessageSquare,
  tool: Wrench,
};

type FilterValue = "all" | ExtensionCategory;

function ExtensionCard({ ext }: { ext: ExtensionEntry }) {
  const CatIcon = categoryIcon[ext.category];

  return (
    <Link
      to={`/extensions/${ext.slug}`}
      className="mp-card"
      aria-label={`View ${ext.name} extension details`}
    >
      <div className="mp-card-header">
        <div className="mp-card-icon-wrap">
          <ExtIcon ext={ext} />
        </div>
        <div className="mp-card-meta">
          <h3>{ext.name}</h3>
          <span className="mp-card-version">v{ext.version}</span>
        </div>
      </div>
      <p className="mp-card-desc">{ext.description}</p>
      <div className="mp-card-footer">
        <span className="mp-card-badge">
          <CatIcon size={12} />
          {getCategoryLabel(ext.category)}
        </span>
        <span className="mp-card-author">{ext.author}</span>
      </div>
    </Link>
  );
}

export function ExtensionsPage({ currentLanguage }: { currentLanguage?: LanguageCode }) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");
  const t = getTranslation(currentLanguage || "en");

  useExtensionsIndexSeo();

  const filtered = useMemo(() => {
    let list =
      filter === "all"
        ? ALL_EXTENSIONS
        : ALL_EXTENSIONS.filter((e) => e.category === filter);

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.keywords.some((k) => k.includes(q)),
      );
    }

    return list;
  }, [filter, query]);

  const counts = useMemo(
    () => ({
      all: ALL_EXTENSIONS.length,
      builtin: BUILTIN_EXTENSIONS.length,
      channel: CHANNEL_EXTENSIONS.length,
      tool: TOOL_EXTENSIONS.length,
    }),
    [],
  );

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />

      <header className="site-header">
        <nav className="site-nav" aria-label="Primary">
          <Link to="/">Home</Link>
          <Link to="/extensions" aria-current="page">
            Extensions
          </Link>
          <a href={DOCS_URL}>Docs</a>
          <a href={GITHUB_REPO_URL}>GitHub</a>
        </nav>
      </header>

      <main className="site-main">
        <section className="mp-hero" aria-label="Extensions marketplace">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <Link to="/" className="mp-back">
              <ArrowLeft size={14} />
              Back to home
            </Link>

            <div className="eyebrow">
              <Sparkles size={16} />
              Extensions Marketplace
            </div>

            <h1 className="mp-title">
              Supercharge your AI workspace
            </h1>
            <p className="mp-subtitle">
              Browse {ALL_EXTENSIONS.length} extensions to connect messaging
              platforms, add powerful tools, and automate your workflow.
              Every extension is open source and installs in one click.
            </p>
          </motion.div>

          <motion.div
            className="mp-toolbar"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            <div className="mp-search-wrap">
              <Search size={16} className="mp-search-icon" />
              <input
                type="search"
                className="mp-search"
                placeholder="Search extensions..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search extensions"
              />
            </div>

            <div className="mp-filters" role="tablist" aria-label="Filter by category">
              {(
                [
                  ["all", "All"],
                  ["builtin", "Built-in"],
                  ["channel", "Channels"],
                  ["tool", "Tools"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  className={`mp-filter-btn ${filter === value ? "active" : ""}`}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  <span className="mp-filter-count">
                    {counts[value]}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </section>

        <motion.section
          className="mp-grid"
          aria-label="Extension listing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          {filtered.length === 0 ? (
            <div className="mp-empty">
              <Package size={48} />
              <p>No extensions match your search.</p>
            </div>
          ) : (
            filtered.map((ext) => (
              <motion.div
                key={ext.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <ExtensionCard ext={ext} />
              </motion.div>
            ))
          )}
        </motion.section>

        <motion.section
          className="mp-cta-section"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.35 }}
        >
          <div className="bottom-cta-card">
            <div>
              <span className="marketing-eyebrow">Build Your Own</span>
              <h2>Create custom extensions</h2>
              <p>
                Full SDK, comprehensive docs, and examples. Build anything from
                simple scripts to full integrations. Publish to npm and share
                with the community.
              </p>
            </div>
            <div className="bottom-cta-actions">
              <a
                className="download-button download-button-full"
                href={`${DOCS_URL}/extensions`}
              >
                Extension SDK Docs
                <ArrowRight size={18} />
              </a>
              <a className="quick-link" href={GITHUB_REPO_URL}>
                <Github size={16} />
                Explore on GitHub
              </a>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
