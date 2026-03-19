/**
 * Autocomplete functionality for Chatons composer.
 * 
 * This module handles:
 * - Storing the autocomplete model preference in app_settings
 * - Generating autocomplete suggestions using a lightweight Pi session
 * 
 * Uses minimal Pi sessions without tools for fast autocomplete suggestions.
 */

import { getDb } from "../db/index.js";
import { createAgentSession } from "@mariozechner/pi-coding-agent";

// ── Settings helpers ────────────────────────────────────────────────────────

const AUTOCOMPLETE_ENABLED_KEY = "autocomplete_enabled";
const AUTOCOMPLETE_MODEL_KEY = "autocomplete_model";

export function getAutocompleteModelPreference(): {
  enabled: boolean;
  modelKey: string | null;
} {
  const db = getDb();
  const enabledRow = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(AUTOCOMPLETE_ENABLED_KEY) as { value: string } | undefined;
  const modelRow = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(AUTOCOMPLETE_MODEL_KEY) as { value: string } | undefined;

  return {
    enabled: enabledRow?.value === "true",
    modelKey: modelRow?.value ?? null,
  };
}

export function setAutocompleteModelPreference(
  enabled: boolean,
  modelKey: string | null,
): void {
  const db = getDb();
  const now = new Date().toISOString();

  // Update enabled setting
  db.prepare(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  ).run(AUTOCOMPLETE_ENABLED_KEY, String(enabled), now);

  // Update model key setting
  if (modelKey) {
    db.prepare(
      `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    ).run(AUTOCOMPLETE_MODEL_KEY, modelKey, now);
  } else {
    db.prepare("DELETE FROM app_settings WHERE key = ?").run(
      AUTOCOMPLETE_MODEL_KEY,
    );
  }
}

// ── Suggestion generation ───────────────────────────────────────────────────

export interface AutocompleteSuggestion {
  id: string;
  text: string;
  type: "inline" | "suffix" | "block";
}

interface GenerateSuggestionsParams {
  text: string;
  cursorPosition: number;
  maxSuggestions?: number;
  modelKey?: string | null;
  availableModelKeys?: string[];
}

/**
 * Generate autocomplete suggestions based on the current text.
 * 
 * Uses an ephemeral Pi session to generate natural language completions.
 * If the model is not available or the request fails, it gracefully returns
 * an empty array without affecting normal operation.
 */
export async function generateAutocompleteSuggestions(
  params: GenerateSuggestionsParams,
): Promise<AutocompleteSuggestion[]> {
  const { text, cursorPosition, maxSuggestions = 3, modelKey, availableModelKeys } =
    params;

  // Get the text before cursor for context
  const textBeforeCursor = text.slice(0, cursorPosition);
  
  // Get a meaningful snippet for context (last ~500 chars before cursor)
  const contextSnippet = textBeforeCursor.slice(-500);
  
  // Get text after cursor (what user might be typing)
  const textAfterCursor = text.slice(cursorPosition);

  // Build a simple prompt for completion
  const prompt = buildAutocompletePrompt(contextSnippet, textAfterCursor);

  // Try to get a response from the model
  const suggestions = await tryGenerateSuggestions(
    prompt,
    modelKey,
    availableModelKeys,
    maxSuggestions,
  );

  return suggestions;
}

function buildAutocompletePrompt(
  contextBefore: string,
  textAfter: string,
): string {
  // Extract meaningful context (last 300 chars before cursor)
  const context = contextBefore.slice(-300).trim() || "(start)";
  const after = textAfter.trim() || "";

  return `Tu es un assistant qui complète le texte d'un utilisateur dans un champ de saisie.

Texte actuel (le curseur est à la fin):
${context}${after}

Indique UNIQUEMENT la suite logique du texte, sans explanation ni phrase d'introduction. Sois concis (10-30 caractères max).

Réponse:`;
}

async function tryGenerateSuggestions(
  prompt: string,
  preferredModelKey: string | null | undefined,
  _availableModelKeys: string[] | undefined,
  maxSuggestions: number,
): Promise<AutocompleteSuggestion[]> {
  // Determine model to use
  const modelToUse = preferredModelKey ?? "openai/gpt-4o-mini";
  const parsed = parseModelKey(modelToUse);
  
  if (!parsed) {
    console.warn("[Autocomplete] Invalid model key:", modelToUse);
    return [];
  }

  try {
    // Get agent dir from env
    const agentDir = process.env.PI_CODING_AGENT_DIR;
    if (!agentDir) {
      console.warn("[Autocomplete] PI_CODING_AGENT_DIR not set");
      return [];
    }

    // Create a minimal session without any tools
    const { session } = await createAgentSession({
      agentDir,
      tools: [], // No tools - pure text completion
    });

    // Find and set the model
    const model = session.modelRegistry.find(parsed.provider, parsed.modelId);
    if (!model) {
      console.warn("[Autocomplete] Model not found:", parsed.provider, parsed.modelId);
      return [];
    }

    await session.setModel(model);

    // Send the prompt and wait for completion
    await session.prompt(prompt);

    // Get the response
    const assistantText = session.getLastAssistantText() ?? "";

    // Parse suggestions from response
    const suggestions = parseSuggestions(assistantText, maxSuggestions);
    return suggestions;

  } catch (err) {
    console.warn("[Autocomplete] Error generating suggestions:", err);
    return [];
  }
}

/**
 * Parse suggestions from the model's response text.
 * Expects a single completion text, optionally with simple bullet points.
 */
function parseSuggestions(
  responseText: string,
  maxSuggestions: number,
): AutocompleteSuggestion[] {
  if (!responseText) return [];

  // Clean up the response - remove common prefixes and get the raw completion
  let cleaned = responseText
    .trim()
    .replace(/^(suite|continuation|next|completion):\s*/i, "")
    .replace(/^[-*]\s*/gm, "")
    .replace(/^\d+\.\s*/gm, "")
    .replace(/^réponse:\s*/i, "")
    .replace(/^response:\s*/i, "");

  // Get just the first line (the actual completion)
  const firstLine = cleaned.split(/\n/)[0].trim();

  // Validate the completion
  if (!firstLine || firstLine.length < 2 || firstLine.length > 150) {
    return [];
  }

  // Skip if it looks like an instruction or header
  if (/^(donne moi|voici|voila|the|here is|here's)/i.test(firstLine)) {
    return [];
  }

  // Return single suggestion (maxSuggestions typically 1)
  const suggestions: AutocompleteSuggestion[] = [{
    id: crypto.randomUUID(),
    text: firstLine,
    type: "inline",
  }];

  // If maxSuggestions > 1, we could add variations, but for now keep it simple
  return suggestions;
}

/**
 * Parse a model key like "provider/model" into its components.
 */
function parseModelKey(
  modelKey: string,
): { provider: string; modelId: string } | null {
  const parts = modelKey.split("/");
  if (parts.length < 2) {
    // Try to infer provider from model name patterns
    if (modelKey.startsWith("gpt-") || modelKey.startsWith("o1") || modelKey.startsWith("o3")) {
      return { provider: "openai", modelId: modelKey };
    }
    if (modelKey.startsWith("claude-")) {
      return { provider: "anthropic", modelId: modelKey };
    }
    if (modelKey.startsWith("gemini-")) {
      return { provider: "google", modelId: modelKey };
    }
    return null;
  }
  return {
    provider: parts[0],
    modelId: parts.slice(1).join("/"),
  };
}
