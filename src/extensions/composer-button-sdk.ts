/**
 * Chatons Composer Button Extension SDK
 * 
 * This SDK allows extensions to register custom buttons in the Composer.
 * Extensions can inject buttons next to the send button for extended functionality.
 */

export interface ComposerButtonAction {
  /**
   * Unique identifier for this button
   */
  id: string;

  /**
   * Display label for accessibility
   */
  label: string;

  /**
   * Icon name from lucide-react (e.g., "Mic", "Camera").
   * Used when renderMode is 'icon' (the default).
   */
  icon: string;

  /**
   * Tooltip shown on hover
   */
  tooltip?: string;

  /**
   * Whether button is currently disabled
   */
  disabled?: boolean;

  /**
   * Whether button is in loading state
   */
  isLoading?: boolean;

  /**
   * Rendering mode: 'icon' renders a Lucide icon button (default),
   * 'widget' renders custom HTML in an iframe.
   */
  renderMode?: 'icon' | 'widget';

  /**
   * HTML string to render when renderMode is 'widget'.
   * The HTML receives context updates via postMessage.
   */
  widgetHtml?: string;

  /**
   * Widget dimensions in pixels. Defaults to { width: 32, height: 32 }.
   */
  widgetSize?: { width: number; height: number };

  /**
   * Requirements that must be satisfied before the button can be used
   */
  requirements?: ComposerButtonRequirement[];

  /**
   * Action to execute when button is clicked
   */
  onAction: (context: ComposerButtonContext) => Promise<void>;

  /**
   * Optional callback when button receives focus
   */
  onFocus?: () => void;

  /**
   * Optional callback when button loses focus
   */
  onBlur?: () => void;
}

/**
 * Represents a requirement for using a button
 */
export interface ComposerButtonRequirement {
  /**
   * Unique ID for this requirement
   */
  id: string;

  /**
   * Human-readable title
   */
  title: string;

  /**
   * HTML content for the requirement sheet
   */
  html: string;

  /**
   * Whether this requirement is satisfied
   */
  satisfied: () => Promise<boolean>;
}

/**
 * Live context usage stats for the active conversation.
 */
export interface ComposerContextUsageData {
  /** Estimated tokens currently occupying the active thread context window */
  usedTokens: number
  /** Model context window capacity, 0 if unknown */
  contextWindow: number
  /** Percentage of context window used (0-100), 0 if contextWindow unknown */
  percentage: number
}

export interface ComposerButtonContext {
  /**
   * Current conversation ID (null if no conversation)
   */
  conversationId: string | null;

  /**
   * Current project ID (null if not in project)
   */
  projectId: string | null;

  /**
   * Set the composer message text
   */
  setText(text: string, append?: boolean): void;

  /**
   * Get the current composer message text
   */
  getText(): string;

  /**
   * Add an attachment to the message
   */
  addAttachment(file: File): Promise<void>;

  /**
   * Send the current message
   */
  sendMessage(): Promise<void>;

  /**
   * Show a notification to the user
   */
  notify(title: string, body?: string, type?: 'info' | 'success' | 'error' | 'warning'): void;

  /**
   * Get the current model
   */
  getCurrentModel(): Promise<{ provider: string; id: string } | null>;

  /**
   * Get available models
   */
  getAvailableModels?(): Promise<Array<{
    provider: string;
    id: string;
    name: string;
    capabilities?: string[];
  }>>;

  /**
   * Show a requirement sheet
   */
  showRequirementSheet?(requirement: ComposerButtonRequirement): Promise<'confirm' | 'dismiss' | 'open-settings'>;

  /**
   * Current access mode
   */
  accessMode: 'secure' | 'open';

  /**
   * Live context usage stats for the active conversation.
   * Null when no conversation is active or context window is unknown.
   */
  contextUsage: ComposerContextUsageData | null;
}

export interface ComposerButtonExtension {
  /**
   * Unique identifier for this extension
   */
  id: string;

  /**
   * Display name
   */
  name: string;

  /**
   * Version
   */
  version: string;

  /**
   * Get the buttons provided by this extension
   */
  getButtons(): Promise<ComposerButtonAction[]>;

  /**
   * Optional: called when extension is enabled
   */
  onEnable?(): void;

  /**
   * Optional: called when extension is disabled
   */
  onDisable?(): void;

  /**
   * Optional: called when a button action completes
   */
  onButtonAction?(buttonId: string, context: ComposerButtonContext): void;
}

/**
 * Registry for composer button extensions
 */
export class ComposerButtonRegistry {
  private extensions: Map<string, ComposerButtonExtension> = new Map();
  private subscribers: Set<(extensions: ComposerButtonExtension[]) => void> = new Set();

  /**
   * Register an extension
   */
  register(extension: ComposerButtonExtension): void {
    console.log(`[Composer Button SDK] Registering: ${extension.id} (v${extension.version})`);
    this.extensions.set(extension.id, extension);
    this.notifySubscribers();
    if (extension.onEnable) {
      extension.onEnable();
    }
  }

  /**
   * Unregister an extension
   */
  unregister(extensionId: string): void {
    const ext = this.extensions.get(extensionId);
    if (ext?.onDisable) {
      ext.onDisable();
    }
    this.extensions.delete(extensionId);
    this.notifySubscribers();
  }

  /**
   * Get an extension by ID
   */
  getExtension(extensionId: string): ComposerButtonExtension | undefined {
    return this.extensions.get(extensionId);
  }

  /**
   * Get all registered extensions
   */
  getExtensions(): ComposerButtonExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Subscribe to registry changes
   */
  subscribe(callback: (extensions: ComposerButtonExtension[]) => void): () => void {
    this.subscribers.add(callback);
    // Call immediately with current state
    callback(this.getExtensions());
    // Return unsubscribe function
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify all subscribers
   */
  private notifySubscribers(): void {
    const extensions = this.getExtensions();
    for (const callback of this.subscribers) {
      callback(extensions);
    }
  }
}

// Global registry instance
export const composerButtonRegistry = new ComposerButtonRegistry();

// Make it globally accessible
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).composerButtonRegistry = composerButtonRegistry;
  console.log('[Composer Button SDK] ✅ Global registry initialized');
}

/**
 * Initialize the extension loader
 */
export function startExtensionLoader(): void {
  if (typeof window === 'undefined') return;

  console.log('[Composer Button SDK] Extension loader started');
  
  // Register built-in extensions
  registerBuiltInExtensions();
}

/**
 * Register built-in extensions
 */
function registerBuiltInExtensions(): void {
  console.log('[Composer Button SDK] Registering built-in extensions...');
  
  // Register Speech-to-Text extension
  registerSpeechToTextExtension();

  // Register Context Usage widget
  registerContextUsageExtension();
  
  console.log('[Composer Button SDK] Built-in extensions registered');
}

/**
 * Register the Speech-to-Text extension
 */
function registerSpeechToTextExtension(): void {
  // Check if browser supports Web Speech API
  const win = window as unknown as Record<string, unknown>;
  const SpeechRecognition = (win.SpeechRecognition || win.webkitSpeechRecognition) as typeof window.SpeechRecognition | undefined;
  if (!SpeechRecognition) {
    console.log('[Composer Button SDK] Speech Recognition not available, skipping Speech-to-Text extension');
    return;
  }

  const extension: ComposerButtonExtension = {
    id: '@thibautrey/chatons-extension-speech-to-text',
    name: 'Speech to Text',
    version: '1.0.0',

    async getButtons(): Promise<ComposerButtonAction[]> {
      return [createSpeechToTextButton()];
    },

    onEnable(): void {
      console.log('[Speech-to-Text] Extension enabled');
    },

    onDisable(): void {
      console.log('[Speech-to-Text] Extension disabled');
    },
  };

  composerButtonRegistry.register(extension);
}

/**
 * Create the Speech-to-Text button
 */
function createSpeechToTextButton(): ComposerButtonAction {
  let hasShownRequirementSheet = false;

  return {
    id: 'speech-to-text-button',
    label: 'Speech to Text',
    icon: 'Mic',
    tooltip: 'Click to dictate your message (🎙️)',

    requirements: [
      {
        id: 'speech-to-text-setup',
        title: 'Speech to Text Setup',
        html: generateSpeechToTextRequirementHTML(),
        satisfied: async () => {
          // Show the requirement sheet once per session
          return hasShownRequirementSheet;
        },
      },
    ],

    onAction: async (context: ComposerButtonContext) => {
      hasShownRequirementSheet = true;

      const win = window as unknown as Record<string, unknown>;
      const SpeechRecognition = (win.SpeechRecognition || win.webkitSpeechRecognition) as typeof window.SpeechRecognition | undefined;
      
      if (!SpeechRecognition) {
        context.notify(
          'Speech Recognition Not Available',
          'Your browser does not support the Web Speech API. Please try Chrome, Edge, or Safari.',
          'error'
        );
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;

      return new Promise<void>((resolve) => {
        let finalText = '';

        recognition.onstart = () => {
          context.notify('Listening...', 'Speak now. Your speech will be transcribed.', 'info');
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalText += transcript + ' ';
            }
          }
        };

        recognition.onend = () => {
          if (finalText.trim()) {
            const trimmedText = finalText.trim();
            context.setText(trimmedText + ' ', true);
            context.notify('Speech Recognized', `"${trimmedText}"`, 'success');
            console.log('[Speech-to-Text] Recognized:', trimmedText);
          } else {
            context.notify('No speech detected', 'Please try again', 'warning');
          }
          resolve();
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          let errorMessage = 'Unknown error';
          
          switch (event.error) {
            case 'no-speech':
              errorMessage = 'No speech was detected. Please speak into your microphone and try again.';
              break;
            case 'audio-capture':
              errorMessage = 'No microphone was found. Ensure it is connected and try again.';
              break;
            case 'permission-denied':
              errorMessage = 'Permission to use the microphone was denied.';
              break;
            case 'network':
              errorMessage = 'Network error. Please check your connection.';
              break;
            default:
              errorMessage = `Error: ${event.error}`;
          }
          
          context.notify('Speech Recognition Error', errorMessage, 'error');
          console.error('[Speech-to-Text] Error:', event.error);
          resolve();
        };

        try {
          recognition.start();
        } catch (error) {
          console.error('[Speech-to-Text] Failed to start recognition:', error);
          recognition.stop();
          setTimeout(() => recognition.start(), 100);
        }
      });
    },
  };
}

/**
 * Generate HTML for the Speech-to-Text requirement sheet
 */
function generateSpeechToTextRequirementHTML(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
          margin: 0;
          padding: 0;
          background: transparent;
          color: #222632;
        }
        
        .dark body {
          color: #e6ecfa;
        }
        
        .container {
          width: 100%;
          height: 100%;
          padding: 16px;
          overflow-y: auto;
        }
        
        h1 {
          margin: 0 0 12px 0;
          font-size: 15px;
          font-weight: 600;
          color: #222632;
        }
        
        .dark h1 {
          color: #e6ecfa;
        }
        
        p {
          margin: 0 0 12px 0;
          font-size: 13px;
          line-height: 1.5;
          color: #4a4f5f;
        }
        
        .dark p {
          color: #a8b3cc;
        }
        
        .section {
          margin: 16px 0;
        }
        
        .section-title {
          font-size: 13px;
          font-weight: 600;
          margin: 12px 0 8px 0;
          color: #222632;
        }
        
        .dark .section-title {
          color: #d4dff6;
        }
        
        .status-box {
          background: #f0fdf4;
          border-left: 3px solid #22c55e;
          padding: 12px;
          margin: 12px 0;
          border-radius: 4px;
          font-size: 13px;
          line-height: 1.5;
        }
        
        .dark .status-box {
          background: rgba(34, 197, 94, 0.1);
          border-left-color: #4ade80;
          color: #c6f6d5;
        }
        
        .list {
          list-style: none;
          margin: 8px 0;
          padding: 0;
        }
        
        .list li {
          margin: 6px 0;
          font-size: 13px;
          padding-left: 24px;
          position: relative;
          color: #4a4f5f;
        }
        
        .dark .list li {
          color: #a8b3cc;
        }
        
        .list li::before {
          content: '✓';
          position: absolute;
          left: 0;
          color: #22c55e;
          font-weight: bold;
        }
        
        .list li.unsupported::before {
          content: '✗';
          color: #ef4444;
        }
        
        .dark .list li.unsupported::before {
          color: #f87171;
        }
        
        .list li.unsupported {
          color: #666677;
        }
        
        .dark .list li.unsupported {
          color: #737c8c;
        }
        
        .info-box {
          background: #f0f9ff;
          border-left: 3px solid #0ea5e9;
          padding: 12px;
          margin: 12px 0;
          border-radius: 4px;
          font-size: 13px;
          line-height: 1.5;
          color: #0c4a6e;
        }
        
        .dark .info-box {
          background: rgba(14, 165, 233, 0.1);
          border-left-color: #38bdf8;
          color: #86efac;
        }
        
        .button-group {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }
        
        button {
          flex: 1;
          padding: 8px 12px;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-primary {
          background: #2563eb;
          color: white;
        }
        
        .btn-primary:hover {
          background: #1d4ed8;
        }
        
        .dark .btn-primary {
          background: #3b82f6;
        }
        
        .dark .btn-primary:hover {
          background: #2563eb;
        }
        
        .btn-secondary {
          background: #e7e9ef;
          color: #222632;
          border: 1px solid #d8dae5;
        }
        
        .btn-secondary:hover {
          background: #dfe1eb;
        }
        
        .dark .btn-secondary {
          background: #1e2a3c;
          color: #d4dff6;
          border: 1px solid #273244;
        }
        
        .dark .btn-secondary:hover {
          background: #243447;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎙️ Speech to Text</h1>
        
        <p>This extension uses your browser's native Speech Recognition API to transcribe your voice into text.</p>
        
        <div class="status-box">
          ✅ <strong>Ready to use!</strong><br>
          Your browser supports the Web Speech API. No configuration needed.
        </div>

        <div class="section">
          <div class="section-title">Browser Support</div>
          <ul class="list">
            <li>Chrome/Chromium</li>
            <li>Edge (Chromium)</li>
            <li>Safari 14.1+</li>
            <li class="unsupported">Firefox (use Whisper)</li>
          </ul>
        </div>

        <div class="section">
          <div class="section-title">How it Works</div>
          <p>Click the microphone button and speak. Your speech will be transcribed using your browser's built-in speech recognition and added to the composer.</p>
        </div>

        <div class="section">
          <div class="section-title">Supported Languages</div>
          <p>The speech recognition supports 50+ languages. It will automatically use your browser's language setting.</p>
        </div>

        <div class="info-box">
          💡 <strong>Tip:</strong> For better accuracy with specialized content or rare languages, you can configure an external speech-to-text model like OpenAI's Whisper.
        </div>

        <div class="button-group">
          <button class="btn-primary" onclick="window.parent.postMessage({type:'chaton:requirement-sheet:confirm'},'*')">
            Got it, let's go!
          </button>
          <button class="btn-secondary" onclick="window.parent.postMessage({type:'chaton:requirement-sheet:dismiss'},'*')">
            Cancel
          </button>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ---------------------------------------------------------------------------
// Context Usage Extension
// ---------------------------------------------------------------------------

/**
 * Register the Context Usage widget extension.
 * Displays a circular progress ring showing how much of the active model's
 * context window is currently occupied by the conversation.
 */
function registerContextUsageExtension(): void {
  const extension: ComposerButtonExtension = {
    id: '@chaton/context-usage',
    name: 'Context Usage',
    version: '1.0.0',

    async getButtons(): Promise<ComposerButtonAction[]> {
      return [
        {
          id: 'context-usage-widget',
          label: 'Context usage',
          icon: 'CircleDot', // fallback, not used in widget mode
          tooltip: 'Context usage',
          renderMode: 'widget',
          widgetHtml: generateContextUsageWidgetHTML(),
          widgetSize: { width: 32, height: 32 },
          onAction: async () => {
            // Widget is display-only, no click action needed
          },
        },
      ];
    },
  };

  composerButtonRegistry.register(extension);
}

/**
 * Self-contained HTML for the context usage circular progress widget.
 * Receives data via postMessage from the composer host.
 */
function generateContextUsageWidgetHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 32px;
    height: 32px;
    overflow: hidden;
    background: transparent;
    color-scheme: normal;
  }
  .wrap {
    position: relative;
    display: inline-flex;
    width: 32px;
    height: 32px;
    align-items: center;
    justify-content: center;
  }
  svg {
    width: 24px;
    height: 24px;
    transform: rotate(-90deg);
  }
  .track {
    fill: none;
    stroke: #e5e7eb;
    stroke-width: 3;
  }
  .progress {
    fill: none;
    stroke: #64748b;
    stroke-width: 3;
    stroke-linecap: round;
    transition: stroke-dashoffset 180ms ease-out, stroke 180ms ease-out;
  }
  .progress.warning { stroke: #d97706; }
  .progress.danger  { stroke: #dc2626; }
  .progress.unavailable { stroke: #cbd5e1; }
</style>
</head>
<body>
<div class="wrap">
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle class="track" cx="12" cy="12" r="10" path-length="100"></circle>
    <circle class="progress unavailable" cx="12" cy="12" r="10"
            stroke-dasharray="62.83185307179586"
            stroke-dashoffset="62.83185307179586"></circle>
  </svg>
</div>
<script>
  var CIRC = 2 * Math.PI * 10; // ~62.83
  var progress = document.querySelector('.progress');

  function fmt(v) {
    if (v >= 1e6) { var c = v / 1e6; return (c % 1 === 0 ? c.toFixed(0) : c.toFixed(1)) + 'M'; }
    if (v >= 1e3) { var c = v / 1e3; return (c % 1 === 0 ? c.toFixed(0) : c.toFixed(1)) + 'k'; }
    return '' + v;
  }

  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d) return;
    if (d.type !== 'chaton.composerButton.context') return;

    var cu = d.payload && d.payload.contextUsage;
    var cw = cu ? cu.contextWindow : 0;
    var used = cu ? cu.usedTokens : 0;
    var pct = cu ? cu.percentage : 0;
    var unavailable = !cw || cw <= 0;

    var offset = unavailable ? CIRC : CIRC * (1 - Math.max(0, Math.min(1, pct / 100)));
    progress.setAttribute('stroke-dashoffset', offset);

    // Apply color class
    progress.classList.remove('warning', 'danger', 'unavailable');
    if (unavailable) {
      progress.classList.add('unavailable');
    } else if (pct >= 90) {
      progress.classList.add('danger');
    } else if (pct >= 75) {
      progress.classList.add('warning');
    }

    // Send tooltip text to parent
    var tip = unavailable
      ? 'Model context unavailable'
      : 'Context: ' + fmt(used) + '/' + fmt(cw) + ' (' + pct + '%)';
    window.parent.postMessage({
      type: 'chaton.composerButton.tooltip',
      buttonId: 'context-usage-widget',
      text: tip
    }, '*');
  });
</script>
</body>
</html>`;
}
