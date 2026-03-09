/**
 * Extension catalog consumed by marketplace pages and schema.org markup.
 *
 * All data is generated at build time by `scripts/fetch-extensions.js` from
 * the extension registry (`extensions-registry.json`). To add a new extension
 * just append its npm package name to the registry and rebuild.
 */

import catalog from "./generated/extensions-catalog.json";

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

export const BUILTIN_EXTENSIONS: ExtensionEntry[] =
  catalog.builtin as ExtensionEntry[];

export const CHANNEL_EXTENSIONS: ExtensionEntry[] =
  catalog.channel as ExtensionEntry[];

export const TOOL_EXTENSIONS: ExtensionEntry[] =
  catalog.tool as ExtensionEntry[];

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
