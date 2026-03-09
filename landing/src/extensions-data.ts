/**
 * Static extension catalog used by marketplace pages and schema.org markup.
 * At runtime the marketplace page also fetches from npm for fresh data.
 */

export type ExtensionCategory = "channel" | "tool" | "builtin";

export interface ExtensionEntry {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string;
  category: ExtensionCategory;
  author: string;
  license: string;
  keywords: string[];
  capabilities: string[];
  repositoryUrl: string | null;
  npmUrl: string;
  iconUrl: string | null;
}

function npmUrl(pkg: string): string {
  return `https://www.npmjs.com/package/${pkg}`;
}

function channelIcon(pkg: string, version: string): string {
  return `https://unpkg.com/${pkg}@${version}/icon.svg`;
}

// Derive a URL-safe slug from the npm package name
function slugFromId(id: string): string {
  return id
    .replace(/^@[^/]+\/chatons-(channel|extension)-/, "")
    .replace(/^@[^/]+\//, "");
}

export const BUILTIN_EXTENSIONS: ExtensionEntry[] = [
  {
    id: "@chaton/automation",
    slug: "automation",
    name: "Automation",
    version: "1.1.0",
    description:
      "Schedule recurring or event-driven tasks directly from conversations. Build automated workflows that run on triggers like new messages or on a timer.",
    category: "builtin",
    author: "Chatons",
    license: "MIT",
    keywords: ["automation", "scheduling", "workflows", "triggers"],
    capabilities: [
      "ui.menu",
      "ui.mainView",
      "llm.tools",
      "events.subscribe",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.projects.read",
    ],
    repositoryUrl: null,
    npmUrl: "",
    iconUrl: null,
  },
  {
    id: "@chaton/memory",
    slug: "memory",
    name: "Memory",
    version: "1.0.0",
    description:
      "Persistent memory store that lets the AI remember facts, preferences, and project context across conversations. Search by semantic similarity.",
    category: "builtin",
    author: "Chatons",
    license: "MIT",
    keywords: ["memory", "context", "persistence", "embeddings"],
    capabilities: [
      "ui.menu",
      "ui.mainView",
      "llm.tools",
      "host.projects.read",
      "host.conversations.read",
    ],
    repositoryUrl: null,
    npmUrl: "",
    iconUrl: null,
  },
  {
    id: "@chaton/browser",
    slug: "browser",
    name: "Browser",
    version: "1.0.0",
    description:
      "Headless browser automation built into your AI workspace. Navigate, click, type, take snapshots, and interact with web pages directly from conversations.",
    category: "builtin",
    author: "Chatons",
    license: "MIT",
    keywords: ["browser", "web", "automation", "scraping", "headless"],
    capabilities: ["llm.tools"],
    repositoryUrl: null,
    npmUrl: "",
    iconUrl: null,
  },
];

export const CHANNEL_EXTENSIONS: ExtensionEntry[] = [
  {
    id: "@thibautrey/chatons-channel-telegram",
    slug: "telegram",
    name: "Telegram",
    version: "2.1.1",
    description:
      "Telegram channel bridge for Chatons. Automatically polls for messages, syncs replies, and runs in the background.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["telegram", "messaging", "bridge", "channel"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-telegram",
    npmUrl: npmUrl("@thibautrey/chatons-channel-telegram"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-telegram", "2.1.1"),
  },
  {
    id: "@thibautrey/chatons-channel-discord",
    slug: "discord",
    name: "Discord",
    version: "1.0.1",
    description:
      "Discord bot bridge for Chatons. Connect your Discord bot to automatically sync messages from channels and DMs.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["discord", "bot", "messaging", "bridge"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-discord",
    npmUrl: npmUrl("@thibautrey/chatons-channel-discord"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-discord", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-slack",
    slug: "slack",
    name: "Slack",
    version: "1.0.1",
    description:
      "Slack bot bridge for Chatons. Connect your Slack app to sync messages from channels, DMs, and threads.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["slack", "bot", "messaging", "bridge", "workspace"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-slack",
    npmUrl: npmUrl("@thibautrey/chatons-channel-slack"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-slack", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-whatsapp",
    slug: "whatsapp",
    name: "WhatsApp",
    version: "1.0.1",
    description:
      "WhatsApp channel bridge for Chatons. Connect via QR code, automatically syncs messages, and runs in the background.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["whatsapp", "messaging", "bridge", "qr-code"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-whatsapp",
    npmUrl: npmUrl("@thibautrey/chatons-channel-whatsapp"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-whatsapp", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-msteams",
    slug: "msteams",
    name: "Microsoft Teams",
    version: "1.0.1",
    description:
      "Microsoft Teams bridge for Chatons. Connect via Bot Framework to sync messages from Teams channels and chats.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["teams", "microsoft", "messaging", "bridge", "enterprise"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-msteams",
    npmUrl: npmUrl("@thibautrey/chatons-channel-msteams"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-msteams", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-matrix",
    slug: "matrix",
    name: "Matrix",
    version: "1.0.1",
    description:
      "Matrix bridge for Chatons. Connect to any Matrix homeserver and sync messages from rooms and direct chats.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["matrix", "decentralized", "messaging", "bridge"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-matrix",
    npmUrl: npmUrl("@thibautrey/chatons-channel-matrix"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-matrix", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-signal",
    slug: "signal",
    name: "Signal",
    version: "1.0.1",
    description:
      "Signal bridge for Chatons. Connect via Signal CLI REST API to sync encrypted messages.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["signal", "encrypted", "messaging", "bridge", "privacy"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-signal",
    npmUrl: npmUrl("@thibautrey/chatons-channel-signal"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-signal", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-imessage",
    slug: "imessage",
    name: "iMessage",
    version: "1.0.1",
    description:
      "iMessage bridge for Chatons. Connect via a local macOS relay to sync iMessage conversations.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["imessage", "apple", "macos", "messaging", "bridge"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-imessage",
    npmUrl: npmUrl("@thibautrey/chatons-channel-imessage"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-imessage", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-line",
    slug: "line",
    name: "LINE",
    version: "1.0.1",
    description:
      "LINE Messaging API bridge for Chatons. Connect your LINE bot to sync messages from users and groups.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["line", "messaging", "bridge", "japan", "asia"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-line",
    npmUrl: npmUrl("@thibautrey/chatons-channel-line"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-line", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-mattermost",
    slug: "mattermost",
    name: "Mattermost",
    version: "1.0.1",
    description:
      "Mattermost bridge for Chatons. Connect to your Mattermost server and sync messages from channels and DMs.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["mattermost", "messaging", "bridge", "self-hosted"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-mattermost",
    npmUrl: npmUrl("@thibautrey/chatons-channel-mattermost"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-mattermost", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-nextcloud-talk",
    slug: "nextcloud-talk",
    name: "Nextcloud Talk",
    version: "1.0.1",
    description:
      "Nextcloud Talk bridge for Chatons. Connect to your Nextcloud instance and sync messages from Talk rooms.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["nextcloud", "talk", "messaging", "bridge", "self-hosted"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl:
      "https://github.com/thibautrey/chatons-channel-nextcloud-talk",
    npmUrl: npmUrl("@thibautrey/chatons-channel-nextcloud-talk"),
    iconUrl: channelIcon(
      "@thibautrey/chatons-channel-nextcloud-talk",
      "1.0.1",
    ),
  },
  {
    id: "@thibautrey/chatons-channel-feishu",
    slug: "feishu",
    name: "Feishu",
    version: "1.0.1",
    description:
      "Feishu (Lark) bridge for Chatons. Connect your Feishu bot to sync messages from groups and direct chats.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["feishu", "lark", "messaging", "bridge", "china"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-feishu",
    npmUrl: npmUrl("@thibautrey/chatons-channel-feishu"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-feishu", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-zalo",
    slug: "zalo",
    name: "Zalo",
    version: "1.0.1",
    description:
      "Zalo bridge for Chatons. Connect your Zalo Official Account to sync messages with users.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["zalo", "messaging", "bridge", "vietnam"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-zalo",
    npmUrl: npmUrl("@thibautrey/chatons-channel-zalo"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-zalo", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-tlon",
    slug: "tlon",
    name: "Tlon",
    version: "1.0.1",
    description:
      "Tlon (Urbit) bridge for Chatons. Connect to your Urbit ship and sync messages from Landscape groups and DMs.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["tlon", "urbit", "decentralized", "messaging", "bridge"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-tlon",
    npmUrl: npmUrl("@thibautrey/chatons-channel-tlon"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-tlon", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-twitch",
    slug: "twitch",
    name: "Twitch",
    version: "1.0.1",
    description:
      "Twitch chat bridge for Chatons. Connect your Twitch bot to sync messages from Twitch chat channels.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["twitch", "streaming", "chat", "bridge"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-twitch",
    npmUrl: npmUrl("@thibautrey/chatons-channel-twitch"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-twitch", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-irc",
    slug: "irc",
    name: "IRC",
    version: "1.0.1",
    description:
      "IRC bridge for Chatons. Connect to any IRC network and relay messages between IRC channels and Chatons conversations.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["irc", "messaging", "bridge", "classic"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-irc",
    npmUrl: npmUrl("@thibautrey/chatons-channel-irc"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-irc", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-googlechat",
    slug: "googlechat",
    name: "Google Chat",
    version: "1.0.1",
    description:
      "Google Chat bridge for Chatons. Connect via Google Chat API to sync messages from spaces and DMs.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["google", "chat", "messaging", "bridge", "workspace"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-googlechat",
    npmUrl: npmUrl("@thibautrey/chatons-channel-googlechat"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-googlechat", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-nostr",
    slug: "nostr",
    name: "Nostr",
    version: "1.0.1",
    description:
      "Nostr protocol bridge for Chatons. Connect to Nostr relays and sync direct messages and channel posts.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["nostr", "decentralized", "protocol", "bridge"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl: "https://github.com/thibautrey/chatons-channel-nostr",
    npmUrl: npmUrl("@thibautrey/chatons-channel-nostr"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-nostr", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-synology-chat",
    slug: "synology-chat",
    name: "Synology Chat",
    version: "1.0.1",
    description:
      "Synology Chat bridge for Chatons. Connect to your Synology NAS chat service and sync messages.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["synology", "nas", "chat", "messaging", "bridge"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl:
      "https://github.com/thibautrey/chatons-channel-synology-chat",
    npmUrl: npmUrl("@thibautrey/chatons-channel-synology-chat"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-synology-chat", "1.0.1"),
  },
  {
    id: "@thibautrey/chatons-channel-bluebubbles",
    slug: "bluebubbles",
    name: "BlueBubbles",
    version: "1.0.1",
    description:
      "BlueBubbles bridge for Chatons. Connect to your BlueBubbles server to sync iMessage conversations.",
    category: "channel",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["bluebubbles", "imessage", "apple", "messaging", "bridge"],
    capabilities: [
      "ui.mainView",
      "queue.publish",
      "queue.consume",
      "storage.kv",
      "host.notifications",
      "host.conversations.read",
      "host.conversations.write",
    ],
    repositoryUrl:
      "https://github.com/thibautrey/chatons-channel-bluebubbles",
    npmUrl: npmUrl("@thibautrey/chatons-channel-bluebubbles"),
    iconUrl: channelIcon("@thibautrey/chatons-channel-bluebubbles", "1.0.1"),
  },
];

export const TOOL_EXTENSIONS: ExtensionEntry[] = [
  {
    id: "@thibautrey/chatons-extension-linear",
    slug: "linear",
    name: "Linear",
    version: "1.0.1",
    description:
      "Interact with Linear (linear.app) from conversations. List, create, update, and search issues, teams, and projects directly in your AI workspace.",
    category: "tool",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["linear", "project-management", "issues", "tracking"],
    capabilities: ["llm.tools", "storage.kv"],
    repositoryUrl: null,
    npmUrl: npmUrl("@thibautrey/chatons-extension-linear"),
    iconUrl: null,
  },
  {
    id: "@thibautrey/chatons-extension-usage-tracker",
    slug: "usage-tracker",
    name: "Usage Tracker",
    version: "1.0.0",
    description:
      "Track token usage (in/out), costs, and tool calls per provider, model, and project. Get full visibility into your AI spending.",
    category: "tool",
    author: "Thibaut Rey",
    license: "MIT",
    keywords: ["usage", "tracking", "cost", "analytics", "tokens"],
    capabilities: [
      "ui.mainView",
      "storage.kv",
      "events.subscribe",
      "host.conversations.read",
      "host.projects.read",
    ],
    repositoryUrl: null,
    npmUrl: npmUrl("@thibautrey/chatons-extension-usage-tracker"),
    iconUrl: null,
  },
];

export const ALL_EXTENSIONS: ExtensionEntry[] = [
  ...BUILTIN_EXTENSIONS,
  ...TOOL_EXTENSIONS,
  ...CHANNEL_EXTENSIONS,
];

export function getExtensionBySlug(
  slug: string,
): ExtensionEntry | undefined {
  return ALL_EXTENSIONS.find((ext) => ext.slug === slug);
}

export function getCategoryLabel(category: ExtensionCategory): string {
  switch (category) {
    case "builtin":
      return "Built-in";
    case "channel":
      return "Channel";
    case "tool":
      return "Tool";
  }
}

export function getCategoryDescription(category: ExtensionCategory): string {
  switch (category) {
    case "builtin":
      return "Core extensions included with every Chatons installation";
    case "channel":
      return "Connect your favorite messaging platforms to Chatons";
    case "tool":
      return "Add new capabilities and integrations to your workspace";
  }
}
