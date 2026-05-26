import type { Conversation } from "@/features/workspace/types";
import type { ThinkingLevel } from "./types";
import { extractModelId } from "@/utils/model-pricing";

export const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

export const DEFAULT_CHATON_MODEL_PROVIDER = "litellm";
export const DEFAULT_CHATON_MODEL_ID = "gpt-5.5";
export const DEFAULT_CHATON_MODEL_KEY = `${DEFAULT_CHATON_MODEL_PROVIDER}/${DEFAULT_CHATON_MODEL_ID}`;

const GLOBAL_MODEL_KEY = "dashboard:modele-pi-global";
const GLOBAL_ACCESS_MODE_KEY = "dashboard:agent-access-mode-global";

export function readSavedGlobalModel(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(GLOBAL_MODEL_KEY);
  return value && value.includes("/") ? value : null;
}

export function saveGlobalModel(model: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(GLOBAL_MODEL_KEY, model);
}

export function readSavedGlobalAccessMode(): "secure" | "open" {
  if (typeof window === "undefined") {
    return "secure";
  }
  const value = window.localStorage.getItem(GLOBAL_ACCESS_MODE_KEY);
  return value === "open" ? "open" : "secure";
}

export function saveGlobalAccessMode(mode: "secure" | "open") {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(GLOBAL_ACCESS_MODE_KEY, mode);
}

/**
 * @deprecated Use extractModelId from @/utils/model-pricing instead
 */
export function parseModelKey(modelKey: string): { provider: string; modelId: string } | null {
  const separator = modelKey.indexOf("/");
  if (separator <= 0 || separator >= modelKey.length - 1) {
    return null;
  }

  return {
    provider: modelKey.slice(0, separator),
    modelId: extractModelId(modelKey),
  };
}

export function findLastConversationModel(conversations: Conversation[]): string | null {
  const sorted = [...conversations].sort((a, b) =>
    (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt),
  );
  const conversationWithModel = sorted.find(
    (conversation) => conversation.modelProvider && conversation.modelId,
  );
  if (!conversationWithModel?.modelProvider || !conversationWithModel.modelId) {
    return null;
  }
  return `${conversationWithModel.modelProvider}/${conversationWithModel.modelId}`;
}
