import { useState, useEffect, useRef, useCallback } from "react";
import { workspaceIpc } from "@/services/ipc/workspace";

export interface AutocompleteSuggestion {
  id: string;
  text: string;
  type: "inline" | "suffix" | "block";
  /** Display priority (lower is better) */
  priority?: number;
}

interface UseComposerAutocompleteOptions {
  /** Debounce delay in ms before triggering autocomplete */
  debounceMs?: number;
  /** Minimum text length before triggering autocomplete */
  minTextLength?: number;
  /** Maximum suggestions to return */
  maxSuggestions?: number;
  /** Whether autocomplete is enabled */
  enabled?: boolean;
}

interface UseComposerAutocompleteReturn {
  /** Current suggestion to display inline (single best match) */
  suggestion: AutocompleteSuggestion | null;
  /** Whether autocomplete is currently loading */
  isLoading: boolean;
  /** Whether autocomplete is available (model configured) */
  isAvailable: boolean;
  /** Error message if last request failed */
  error: string | null;
  /** Request autocomplete for the given text and cursor position */
  requestAutocomplete: (
    text: string,
    cursorPosition: number,
    conversationId?: string | null,
  ) => void;
  /** Clear the current suggestion */
  clearSuggestions: () => void;
  /** Accept the current suggestion (returns updated text) */
  acceptSuggestion: (
    text: string,
    suggestion: AutocompleteSuggestion,
    cursorPosition: number,
  ) => { newText: string; newCursorPosition: number };
  /** Refresh availability from settings (useful after settings change) */
  refreshAvailability: () => Promise<void>;
}

/**
 * Hook for composer text autocomplete using an AI model.
 * 
 * This hook provides non-intrusive autocomplete suggestions that:
 * - Don't block typing (fire-and-forget requests)
 * - Fail gracefully without affecting normal operation
 * - Are debounced to avoid excessive API calls
 * - Can be dismissed by the user
 */
export function useComposerAutocomplete(
  options: UseComposerAutocompleteOptions = {},
): UseComposerAutocompleteReturn {
  const {
    debounceMs = 400,
    minTextLength = 10,
    maxSuggestions = 3,
    enabled = true,
  } = options;

  const [suggestion, setSuggestion] = useState<AutocompleteSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs to track current state without causing re-renders
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load autocomplete model preference
  const refreshAvailability = useCallback(async () => {
    try {
      const result = await workspaceIpc.getAutocompleteModelPreference();
      setIsAvailable(result.ok && result.enabled);
    } catch {
      setIsAvailable(false);
    }
  }, []);

  // Load on mount and periodically refresh to pick up settings changes
  useEffect(() => {
    void refreshAvailability();
    
    // Refresh every 5 seconds to pick up settings changes without restart
    const intervalId = setInterval(() => {
      void refreshAvailability();
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [refreshAvailability]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Generate autocomplete suggestions using the configured model
   */
  const generateSuggestions = useCallback(
    async (
      text: string,
      cursorPosition: number,
      conversationId: string | null,
    ): Promise<void> => {
      if (!isAvailable || !enabled) {
        return;
      }

      // Abort any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        const result = await workspaceIpc.getAutocompleteSuggestions({
          text,
          cursorPosition,
          conversationId,
          maxSuggestions,
        });

        if (!result.ok) {
          // Don't show error to user - autocomplete is optional
          setError(result.message ?? null);
          setSuggestion(null);
          return;
        }

        if (result.suggestions && result.suggestions.length > 0) {
          // Take the first/best suggestion for inline display
          const best = result.suggestions[0];
          setSuggestion(best);
        } else {
          setSuggestion(null);
        }
      } catch (err) {
        // Fail silently - autocomplete is a bonus feature
        setError(null);
        setSuggestion(null);
      } finally {
        setIsLoading(false);
      }
    },
    [isAvailable, enabled, maxSuggestions],
  );

  /**
   * Request autocomplete with debouncing
   */
  const requestAutocomplete = useCallback(
    (
      text: string,
      cursorPosition: number,
      conversationId: string | null = null,
    ): void => {
      if (!isAvailable || !enabled) {
        return;
      }

      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Clear suggestion if text is too short
      if (text.length < minTextLength) {
        setSuggestion(null);
        return;
      }

      // Debounce the request
      debounceTimerRef.current = setTimeout(() => {
        void generateSuggestions(text, cursorPosition, conversationId);
      }, debounceMs);
    },
    [isAvailable, enabled, minTextLength, debounceMs, generateSuggestions],
  );

  /**
   * Clear the current suggestion and cancel pending requests
   */
  const clearSuggestions = useCallback((): void => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setSuggestion(null);
    setError(null);
  }, []);

  /**
   * Accept a suggestion and update text
   */
  const acceptSuggestion = useCallback(
    (
      text: string,
      suggestion: AutocompleteSuggestion,
      cursorPosition: number,
    ): { newText: string; newCursorPosition: number } => {
      // Insert the suggestion text at cursor position
      let newText: string;
      let newCursorPosition: number;

      if (suggestion.type === "inline") {
        // Insert text at cursor
        const before = text.slice(0, cursorPosition);
        const after = text.slice(cursorPosition);
        newText = before + suggestion.text + after;
        newCursorPosition = cursorPosition + suggestion.text.length;
      } else if (suggestion.type === "suffix") {
        // Replace from cursor to end with suggestion
        newText = text.slice(0, cursorPosition) + suggestion.text;
        newCursorPosition = newText.length;
      } else {
        // Block suggestion - insert on new line
        const before = text.slice(0, cursorPosition);
        const after = text.slice(cursorPosition);
        const needsNewline = before.trim().length > 0 && !before.endsWith("\n");
        const separator = needsNewline ? "\n" : "";
        newText = before + separator + suggestion.text + after;
        newCursorPosition = before.length + separator.length + suggestion.text.length;
      }

      clearSuggestions();
      return { newText, newCursorPosition };
    },
    [clearSuggestions],
  );

  return {
    suggestion,
    isLoading,
    isAvailable,
    error,
    requestAutocomplete,
    clearSuggestions,
    acceptSuggestion,
    refreshAvailability,
  };
}
