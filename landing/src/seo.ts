import { useEffect } from "react";
import type { ExtensionEntry } from "./extensions-data";
import { getCategoryLabel } from "./extensions-data";
import fallbackCatalog from "./generated/extensions-catalog.json";

// Use fallback catalog for static SEO metadata
const FALLBACK_EXTENSIONS = (fallbackCatalog as any).builtin
  .concat(fallbackCatalog.channel)
  .concat(fallbackCatalog.tool) as ExtensionEntry[];

const SITE_URL = "https://chatons.ai";
const SITE_NAME = "Chatons";
const LOGO_URL = `${SITE_URL}/icon.png`;

/**
 * Organization schema reused across pages.
 */
function organizationSchema() {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: LOGO_URL,
    sameAs: [
      "https://github.com/thibautrey/chaton",
    ],
  };
}

/**
 * WebSite schema with SearchAction for sitelinks search box.
 */
function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/extensions?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * BreadcrumbList schema for extension pages.
 */
function breadcrumbSchema(
  items: Array<{ name: string; url: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * CollectionPage schema for the marketplace index.
 */
function extensionsCollectionSchema(extensions: ExtensionEntry[] = FALLBACK_EXTENSIONS) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Chatons Extensions Marketplace",
    description:
      "Browse and install extensions for Chatons AI workspace. Connect messaging platforms, add tools, and automate workflows.",
    url: `${SITE_URL}/extensions`,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    provider: organizationSchema(),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: extensions.length,
      itemListElement: extensions.map((ext, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/extensions/${ext.slug}`,
        name: ext.name,
      })),
    },
  };
}

/**
 * SoftwareApplication schema for an individual extension.
 */
function extensionProductSchema(ext: ExtensionEntry) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${ext.name} - Chatons Extension`,
    description: ext.description,
    url: `${SITE_URL}/extensions/${ext.slug}`,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: getCategoryLabel(ext.category),
    operatingSystem: "Windows, macOS, Linux",
    softwareVersion: ext.version,
    author: {
      "@type": ext.author === "Chatons" ? "Organization" : "Person",
      name: ext.author,
    },
    publisher: organizationSchema(),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    license: `https://opensource.org/licenses/${ext.license}`,
    isPartOf: {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
    },
    keywords: ext.keywords.join(", "),
  };
}

/**
 * Injects JSON-LD script blocks into the document head.
 * Cleans up on unmount.
 */
function useJsonLd(schemas: object[]) {
  useEffect(() => {
    const scripts: HTMLScriptElement[] = [];

    for (const schema of schemas) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
      scripts.push(script);
    }

    return () => {
      for (const script of scripts) {
        script.remove();
      }
    };
  }, [schemas]);
}

/**
 * Sets the canonical link and Open Graph meta tags.
 */
function useCanonicalAndOg(opts: {
  path: string;
  title: string;
  description: string;
}) {
  useEffect(() => {
    const url = `${SITE_URL}${opts.path}`;

    // Title
    document.title = opts.title;

    // Canonical
    let canonical = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    // Meta description
    let metaDesc = document.querySelector(
      'meta[name="description"]',
    ) as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = opts.description;

    // Open Graph
    const ogTags: Record<string, string> = {
      "og:title": opts.title,
      "og:description": opts.description,
      "og:url": url,
      "og:type": "website",
      "og:site_name": SITE_NAME,
      "og:image": LOGO_URL,
    };

    for (const [property, content] of Object.entries(ogTags)) {
      let tag = document.querySelector(
        `meta[property="${property}"]`,
      ) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
      }
      tag.content = content;
    }

    // Twitter card
    const twitterTags: Record<string, string> = {
      "twitter:card": "summary",
      "twitter:title": opts.title,
      "twitter:description": opts.description,
    };

    for (const [name, content] of Object.entries(twitterTags)) {
      let tag = document.querySelector(
        `meta[name="${name}"]`,
      ) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.name = name;
        document.head.appendChild(tag);
      }
      tag.content = content;
    }
  }, [opts.path, opts.title, opts.description]);
}

// --- Exported hooks for each page ---

export function useHomeSeo() {
  useCanonicalAndOg({
    path: "/",
    title: "Chatons - Free and Open Source Desktop AI",
    description:
      "Chatons is a free and open source desktop AI workspace. Use any AI provider, build custom extensions, and own your setup.",
  });

  useJsonLd([
    webSiteSchema(),
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Chatons - Desktop AI Workspace",
      description:
        "Free and open source desktop AI workspace for people who build things.",
      url: SITE_URL,
      publisher: organizationSchema(),
    },
  ]);
}

export function useExtensionsIndexSeo(extensions?: ExtensionEntry[]) {
  const extensionsToUse = extensions || FALLBACK_EXTENSIONS;

  useCanonicalAndOg({
    path: "/extensions",
    title:
      "Extensions Marketplace - Chatons AI Workspace",
    description: `Browse ${extensionsToUse.length} extensions for Chatons. Connect Telegram, Discord, Slack, and more. Add tools like Linear, Usage Tracker, and automation.`,
  });

  useJsonLd([
    webSiteSchema(),
    extensionsCollectionSchema(extensionsToUse),
    breadcrumbSchema([
      { name: "Home", url: SITE_URL },
      { name: "Extensions", url: `${SITE_URL}/extensions` },
    ]),
  ]);
}

export function useExtensionDetailSeo(ext: ExtensionEntry | undefined) {
  useCanonicalAndOg({
    path: ext ? `/extensions/${ext.slug}` : "/extensions",
    title: ext
      ? `${ext.name} Extension for Chatons - AI Workspace Plugin`
      : "Extension Not Found - Chatons",
    description: ext
      ? `${ext.description} Free and open source ${getCategoryLabel(ext.category).toLowerCase()} extension for Chatons AI workspace.`
      : "The requested extension was not found.",
  });

  useJsonLd(
    ext
      ? [
          extensionProductSchema(ext),
          breadcrumbSchema([
            { name: "Home", url: SITE_URL },
            { name: "Extensions", url: `${SITE_URL}/extensions` },
            {
              name: ext.name,
              url: `${SITE_URL}/extensions/${ext.slug}`,
            },
          ]),
        ]
      : [],
  );
}
