import { useEffect, useState, useRef, useCallback } from 'react';
import type {
  ComposerButtonExtension,
  ComposerButtonAction,
  ComposerButtonContext,
  ComposerButtonRequirement,
} from '@/extensions/composer-button-sdk';
import { composerButtonRegistry, startExtensionLoader } from '@/extensions/composer-button-sdk';

/**
 * Extended button action type that includes extension ID
 */
interface ComposerButtonActionWithExtension extends ComposerButtonAction {
  _extensionId?: string;
}

/**
 * Hook to manage and discover composer button extensions from the extension system.
 *
 * This hook:
 * 1. Initializes the extension loader
 * 2. Listens for new extensions being registered
 * 3. Provides utilities to get button actions and context
 *
 * @param options - Configuration options
 * @returns Object with buttons and utilities
 */
export function useComposerExtensionButtons(options?: {
  conversationId?: string | null;
  projectId?: string | null;
  setText?: (text: string, append?: boolean) => void;
  getText?: () => string;
  addAttachment?: (file: File) => Promise<void>;
  sendMessage?: () => Promise<void>;
  notify?: (title: string, body?: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  getCurrentModel?: () => Promise<{ provider: string; id: string } | null>;
  getAvailableModels?: () => Promise<Array<{
    provider: string;
    id: string;
    name: string;
    capabilities?: string[];
  }>>;
  accessMode?: 'secure' | 'open';
}) {
  const [extensions, setExtensions] = useState<ComposerButtonExtension[]>([]);
  const [buttons, setButtons] = useState<ComposerButtonActionWithExtension[]>([]);
  const [requirement, setRequirement] = useState<ComposerButtonRequirement | null>(null);
  const initializeRef = useRef(false);

  /**
   * Create a context object for button actions
   */
  const createContext = useCallback((): ComposerButtonContext => {
    return {
      conversationId: options?.conversationId ?? null,
      projectId: options?.projectId ?? null,
      setText: options?.setText ?? (() => {}),
      getText: options?.getText ?? (() => ''),
      addAttachment: options?.addAttachment ?? (async () => {}),
      sendMessage: options?.sendMessage ?? (async () => {}),
      notify: options?.notify ?? (() => {}),
      getCurrentModel: options?.getCurrentModel ?? (async () => null),
      getAvailableModels: options?.getAvailableModels,
      showRequirementSheet: async (req) => {
        setRequirement(req);
        return new Promise((resolve) => {
          (window as any).__composer_requirement_resolve = resolve;
        });
      },
      accessMode: options?.accessMode ?? 'secure',
    };
  }, [options]);

  /**
   * Get all buttons from all extensions
   */
  const getAllButtons = useCallback((): ComposerButtonActionWithExtension[] => {
    return buttons;
  }, [buttons]);

  /**
   * Execute a button action
   */
  const executeButtonAction = useCallback(
    async (buttonId: string) => {
      const button = buttons.find((b) => b.id === buttonId);
      if (!button) {
        console.warn(`[Composer Extensions] Button not found: ${buttonId}`);
        return;
      }

      const context = createContext();
      
      // Check requirements
      if (button.requirements && button.requirements.length > 0) {
        for (const req of button.requirements) {
          const satisfied = await req.satisfied();
          if (!satisfied) {
            // Show requirement sheet
            const result = await context.showRequirementSheet?.(req);
            if (result !== 'confirm') {
              console.log(`[Composer Extensions] Requirement not satisfied, canceling button action`);
              return;
            }
          }
        }
      }

      try {
        await button.onAction(context);
      } catch (error) {
        console.error(`[Composer Extensions] Error executing button ${buttonId}:`, error);
        context.notify('Error', `Failed to execute button: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      }
    },
    [buttons, createContext]
  );

  /**
   * Dismiss the requirement sheet
   */
  const dismissRequirement = useCallback(() => {
    if ((window as any).__composer_requirement_resolve) {
      (window as any).__composer_requirement_resolve('dismiss');
      delete (window as any).__composer_requirement_resolve;
    }
    setRequirement(null);
  }, []);

  /**
   * Confirm the requirement sheet
   */
  const confirmRequirement = useCallback(() => {
    if ((window as any).__composer_requirement_resolve) {
      (window as any).__composer_requirement_resolve('confirm');
      delete (window as any).__composer_requirement_resolve;
    }
    setRequirement(null);
  }, []);

  /**
   * Initialize the extension system on mount
   */
  useEffect(() => {
    if (initializeRef.current) return;
    initializeRef.current = true;

    console.log('[Composer Extensions] Initializing...');
    
    // Start the extension loader (registers built-in extensions like Speech-to-Text)
    startExtensionLoader();

    // Subscribe to registry changes
    const unsubscribe = composerButtonRegistry.subscribe((exts) => {
      console.log('[Composer Extensions] Extensions changed:', exts.length);
      setExtensions(exts);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Update buttons when extensions change
   */
  useEffect(() => {
    (async () => {
      const allExtensions = composerButtonRegistry.getExtensions();
      const newButtons: ComposerButtonActionWithExtension[] = [];

      for (const ext of allExtensions) {
        try {
          const extButtons = await ext.getButtons();
          console.log('[Composer Extensions] Extension', ext.id, 'returned', extButtons.length, 'buttons');
          
          // Add extension ID to each button
          const buttonsWithExtId = extButtons.map(btn => ({
            ...btn,
            _extensionId: ext.id,
          }));
          
          newButtons.push(...buttonsWithExtId);
        } catch (error) {
          console.error('[Composer Extensions] Error getting buttons from', ext.id, error);
        }
      }

      console.log('[Composer Extensions] Total buttons:', newButtons.length);
      setButtons(newButtons);
    })();
  }, [extensions]);

  return {
    buttons,
    extensions,
    getAllButtons,
    executeButtonAction,
    createContext,
    requirement,
    dismissRequirement,
    confirmRequirement,
  };
}
