export type ProviderPreset = {
  label: string;
  provider: string;
  api: "openai-completions" | "openai-responses";
  baseUrl: string;
  keyUrl?: string;
  /** Pi OAuth provider ID — when set, OAuth login is available for this preset */
  oauthProvider?: string;
};

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

export const KNOWN_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: "Ollama",
    provider: "ollama",
    api: "openai-completions",
    baseUrl: "http://localhost:11434/v1",
  },
  {
    label: "LM Studio",
    provider: "lmstudio",
    api: "openai-completions",
    baseUrl: "http://localhost:1234/v1",
  },
  {
    label: "Mistral",
    provider: "mistral",
    api: "openai-completions",
    baseUrl: "https://api.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/codestral/cli",
  },
  {
    label: "Anthropic",
    provider: "anthropic",
    api: "openai-completions",
    baseUrl: "https://api.anthropic.com/v1",
    keyUrl: "https://console.anthropic.com/settings/keys",
    oauthProvider: "anthropic",
  },
  {
    label: "Google",
    provider: "google",
    api: "openai-completions",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    label: "Groq",
    provider: "groq",
    api: "openai-completions",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
  },
  {
    label: "xAI",
    provider: "xai",
    api: "openai-completions",
    baseUrl: "https://api.x.ai/v1",
    keyUrl: "https://console.x.ai/",
  },
  {
    label: "Perplexity",
    provider: "perplexity",
    api: "openai-completions",
    baseUrl: "https://api.perplexity.ai",
    keyUrl: "https://www.perplexity.ai/settings/api",
  },
  {
    label: "Together",
    provider: "together",
    api: "openai-completions",
    baseUrl: "https://api.together.xyz/v1",
    keyUrl: "https://api.together.xyz/settings/api-keys",
  },
  {
    label: "DeepSeek",
    provider: "deepseek",
    api: "openai-completions",
    baseUrl: "https://api.deepseek.com/v1",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    label: "OpenRouter",
    provider: "openrouter",
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    label: "OpenAI",
    provider: "openai-codex",
    api: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    oauthProvider: "openai-codex",
  },
  {
    label: "GitHub Copilot",
    provider: "github-copilot",
    api: "openai-completions",
    baseUrl: "https://api.individual.githubcopilot.com",
    oauthProvider: "github-copilot",
  },
  {
    label: "Custom",
    provider: "custom",
    api: "openai-completions",
    baseUrl: "",
  },
];

export function normalizeProviderName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}
