import { useEffect } from 'react';
import { useShortcuts, useShortcutAction } from '@/hooks/use-shortcuts';
import { useWorkspace } from '@/features/workspace/store';

export function GlobalShortcutHandler() {
  const { createConversationGlobal } = useWorkspace();
  const { registerAction, registerShortcut } = useShortcuts();

  useEffect(() => {
    const setupShortcuts = async () => {
      try {
        // Register the action for creating a new workspace conversation
        await registerAction({
          id: 'new-workspace-conversation',
          name: 'New Workspace Conversation',
          description: 'Create a new global workspace conversation'
        });

        // Register the shortcut for creating a new workspace conversation
        // Default: Ctrl+Shift+N (Windows/Linux) or Cmd+Shift+N (Mac)
        const accelerator = process.platform === 'darwin' ? 'Cmd+Shift+N' : 'Ctrl+Shift+N';
        
        await registerShortcut({
          id: 'new-workspace-conversation-shortcut',
          scope: 'global', // This makes it work system-wide
          accelerator: accelerator,
          actionId: 'new-workspace-conversation',
          enabled: true
        });
      } catch (error) {
        console.error('Failed to setup shortcuts:', error);
      }
    };

    setupShortcuts();
  }, [registerAction, registerShortcut]);

  // Handle the action when triggered
  useShortcutAction((actionId) => {
    if (actionId === 'new-workspace-conversation') {
      createConversationGlobal();
    }
  });

  return null; // This component doesn't render anything
}

export function ForegroundShortcutHandler() {
  const { createConversationGlobal } = useWorkspace();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl/Cmd + Shift + N
      const isMeta = process.platform === 'darwin' ? e.metaKey : e.ctrlKey;
      if (isMeta && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        e.stopPropagation();
        createConversationGlobal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createConversationGlobal]);

  return null; // This component doesn't render anything
}