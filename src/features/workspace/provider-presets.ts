export function normalizeProviderName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export const KNOWN_PROVIDER_ICON: Record<string, string> = {
  openai: "https://www.google.com/s2/favicons?sz=64&domain=openai.com",
  "openai-codex": "https://www.google.com/s2/favicons?sz=64&domain=openai.com",
  anthropic: "https://www.google.com/s2/favicons?sz=64&domain=anthropic.com",
  google: "https://www.google.com/s2/favicons?sz=64&domain=ai.google.dev",
  gemini: "https://www.google.com/s2/favicons?sz=64&domain=ai.google.dev",
  mistral: "https://www.google.com/s2/favicons?sz=64&domain=mistral.ai",
  groq: "https://www.google.com/s2/favicons?sz=64&domain=groq.com",
  xai: "https://www.google.com/s2/favicons?sz=64&domain=x.ai",
  perplexity: "https://www.google.com/s2/favicons?sz=64&domain=perplexity.ai",
  deepseek: "https://www.google.com/s2/favicons?sz=64&domain=deepseek.com",
  together: "https://www.google.com/s2/favicons?sz=64&domain=together.ai",
  ollama: "https://www.google.com/s2/favicons?sz=64&domain=ollama.com",
  lmstudio: "https://www.google.com/s2/favicons?sz=64&domain=lmstudio.ai",
  openrouter: "https://www.google.com/s2/favicons?sz=64&domain=openrouter.ai",
  "github-copilot":
    "https://www.google.com/s2/favicons?sz=64&domain=github.com",
};

export type ProviderPreset = {
  label: string;
  provider: string;
  api:
    | "anthropic-messages"
    | "openai-completions"
    | "openai-responses"
    | "openai-codex-responses";
  baseUrl: string;
  keyUrl?: string;
  /** Pi OAuth provider ID — when set, OAuth login is available for this preset */
  oauthProvider?: string;
  groupId?: string;
  groupLabel?: string;
};

export type ProviderPresetGroup = {
  id: string;
  label: string;
  icon?: string;
  presets: ProviderPreset[];
};

export const KNOWN_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: "Ollama",
    provider: "ollama",
    api: "openai-completions",
    baseUrl: "http://localhost:11434/v1",
    groupId: "ollama",
    groupLabel: "Ollama",
  },
  {
    label: "LM Studio",
    provider: "lmstudio",
    api: "openai-completions",
    baseUrl: "http://localhost:1234/v1",
    groupId: "lmstudio",
    groupLabel: "LM Studio",
  },
  {
    label: "Mistral",
    provider: "mistral",
    api: "openai-completions",
    baseUrl: "https://api.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/home?profile_dialog=api-keys",
    groupId: "mistral",
    groupLabel: "Mistral",
  },
  {
    label: "Mistral Vibe",
    provider: "mistral-vibe",
    api: "openai-completions",
    baseUrl: "https://vibe.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/codestral/cli",
    groupId: "mistral",
    groupLabel: "Mistral",
  },
  {
    label: "Anthropic",
    provider: "anthropic",
    api: "openai-completions",
    baseUrl: "https://api.anthropic.com/v1",
    keyUrl: "https://console.anthropic.com/settings/keys",
    oauthProvider: "anthropic",
    groupId: "anthropic",
  },
  {
    label: "Google",
    provider: "google",
    api: "openai-completions",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/app/apikey",
    groupId: "google",
  },
  {
    label: "Groq",
    provider: "groq",
    api: "openai-completions",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    groupId: "groq",
  },
  {
    label: "xAI",
    provider: "xai",
    api: "openai-completions",
    baseUrl: "https://api.x.ai/v1",
    keyUrl: "https://console.x.ai/",
    groupId: "xai",
  },
  {
    label: "Perplexity",
    provider: "perplexity",
    api: "openai-completions",
    baseUrl: "https://api.perplexity.ai",
    keyUrl: "https://www.perplexity.ai/settings/api",
    groupId: "perplexity",
  },
  {
    label: "Together",
    provider: "together",
    api: "openai-completions",
    baseUrl: "https://api.together.xyz/v1",
    keyUrl: "https://api.together.xyz/settings/api-keys",
    groupId: "together",
  },
  {
    label: "DeepSeek",
    provider: "deepseek",
    api: "openai-completions",
    baseUrl: "https://api.deepseek.com/v1",
    keyUrl: "https://platform.deepseek.com/api_keys",
    groupId: "deepseek",
  },
  {
    label: "OpenRouter",
    provider: "openrouter",
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    groupId: "openrouter",
  },
  {
    label: "ChatGPT",
    provider: "openai-codex",
    api: "openai-codex-responses",
    baseUrl: "https://chatgpt.com/backend-api",
    keyUrl: "https://platform.openai.com/api-keys",
    oauthProvider: "openai-codex",
    groupId: "openai",
    groupLabel: "OpenAI",
  },
  {
    label: "OpenAI",
    provider: "openai",
    api: "openai-completions",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    groupId: "openai",
    groupLabel: "OpenAI",
  },
  {
    label: "GitHub Copilot",
    provider: "github-copilot",
    api: "anthropic-messages",
    baseUrl: "https://api.individual.githubcopilot.com",
    oauthProvider: "github-copilot",
    groupId: "github-copilot",
  },
  {
    label: "Custom",
    provider: "custom",
    api: "openai-completions",
    baseUrl: "",
    groupId: "custom",
  },
];

function buildProviderPresetGroups(): ProviderPresetGroup[] {
  const groups = new Map<string, ProviderPreset[]>();
  const order: string[] = [];

  for (const preset of KNOWN_PROVIDER_PRESETS) {
    const fallbackLabel = preset.groupLabel ?? preset.label;
    const groupId =
      preset.groupId ?? normalizeProviderName(fallbackLabel ?? preset.provider);
    if (!groups.has(groupId)) {
      order.push(groupId);
      groups.set(groupId, []);
    }
    groups.get(groupId)?.push(preset);
  }

  return order.map((groupId) => {
    const presets = groups.get(groupId)!;
    const label =
      presets.find((preset) => preset.groupLabel)?.groupLabel ??
      presets[0].groupLabel ??
      presets[0].label;
    const icon = KNOWN_PROVIDER_ICON[groupId];
    return {
      id: groupId,
      label,
      icon,
      presets,
    };
  });
}

export const KNOWN_PROVIDER_PRESET_GROUPS = buildProviderPresetGroups();
