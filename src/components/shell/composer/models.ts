import type { Conversation } from "@/features/workspace/types";
import type { ThinkingLevel } from "./types";

export const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

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

export function parseModelKey(modelKey: string): { provider: string; modelId: string } | null {
  const separator = modelKey.indexOf("/");
  if (separator <= 0 || separator >= modelKey.length - 1) {
    return null;
  }

  return {
    provider: modelKey.slice(0, separator),
    modelId: modelKey.slice(separator + 1),
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
