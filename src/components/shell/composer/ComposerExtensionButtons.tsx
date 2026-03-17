import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ComposerButtonAction, ComposerContextUsageData } from '@/extensions/composer-button-sdk';
import * as LucideIcons from 'lucide-react';

interface ComposerExtensionButtonsProps {
  buttons: Array<{
    extensionId: string;
    button: ComposerButtonAction;
  }>;
  onClickButton: (extensionId: string, button: ComposerButtonAction) => void;
  disabled?: boolean;
  /** Live context usage stats pushed to widget-mode buttons */
  contextUsage?: ComposerContextUsageData | null;
  conversationId?: string | null;
  projectId?: string | null;
}

/**
 * Iframe host for a widget-mode composer button.
 * Mirrors the TopbarWidgetHost pattern: renders srcDoc HTML and
 * pushes context updates via postMessage.
 */
function ComposerWidgetButton({
  button,
  contextUsage,
  conversationId,
  projectId,
}: {
  button: ComposerButtonAction;
  contextUsage?: ComposerContextUsageData | null;
  conversationId?: string | null;
  projectId?: string | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const frameOriginRef = useRef<string>(window.location.origin);
  const pendingContextRef = useRef<{
    buttonId: string;
    conversationId: string | null;
    projectId: string | null;
    contextUsage: ComposerContextUsageData | null;
  } | null>(null);
  const flushHandleRef = useRef<number | null>(null);
  const [dynamicTooltip, setDynamicTooltip] = useState<string | null>(null);
  const width = button.widgetSize?.width ?? 32;
  const height = button.widgetSize?.height ?? 32;

  const flushContext = () => {
    flushHandleRef.current = null;
    const iframe = iframeRef.current;
    const payload = pendingContextRef.current;
    if (!iframe?.contentWindow || !payload) return;
    pendingContextRef.current = null;
    iframe.contentWindow.postMessage(
      {
        type: 'chaton.composerButton.context',
        payload,
      },
      frameOriginRef.current,
    );
  };

  // Push context updates to widget iframe whenever data changes.
  // Coalesce multiple changes in the same frame to avoid postMessage bursts.
  useEffect(() => {
    pendingContextRef.current = {
      buttonId: button.id,
      conversationId: conversationId ?? null,
      projectId: projectId ?? null,
      contextUsage: contextUsage ?? null,
    };
    if (flushHandleRef.current !== null) return;
    flushHandleRef.current = window.requestAnimationFrame(flushContext);
  }, [button.id, contextUsage, conversationId, projectId]);

  // Listen for tooltip updates from the widget.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (iframeWindow && event.source !== iframeWindow) return;
      const data = event.data;
      if (!data || data.type !== 'chaton.composerButton.tooltip') return;
      if (data.buttonId !== button.id) return;
      if (typeof data.text === 'string') {
        setDynamicTooltip((current) => (current === data.text ? current : data.text));
      }
    };
    window.addEventListener('message', handler);
    return () => {
      if (flushHandleRef.current !== null) {
        window.cancelAnimationFrame(flushHandleRef.current);
        flushHandleRef.current = null;
      }
      window.removeEventListener('message', handler);
    };
  }, [button.id]);

  const tooltipText = dynamicTooltip ?? button.tooltip ?? button.label;

  return (
    <div
      className="composer-widget-host"
      style={{ width, height, position: 'relative' }}
      aria-label={tooltipText}
    >
      <iframe
        ref={iframeRef}
        className="composer-widget-iframe"
        title={button.label}
        srcDoc={button.widgetHtml}
        // @ts-expect-error -- legacy attribute needed for transparent iframe bg
        allowtransparency="true"
        style={{
          width,
          height,
          border: 'none',
          overflow: 'hidden',
          display: 'block',
          background: 'transparent',
          pointerEvents: 'none',
        }}
        sandbox="allow-scripts"
        onLoad={() => {
          pendingContextRef.current = {
            buttonId: button.id,
            conversationId: conversationId ?? null,
            projectId: projectId ?? null,
            contextUsage: contextUsage ?? null,
          };
          if (flushHandleRef.current !== null) {
            window.cancelAnimationFrame(flushHandleRef.current);
          }
          flushContext();
        }}
      />
      {/* Styled floating tooltip, shown on hover */}
      <div className="composer-widget-tooltip" role="tooltip">
        {tooltipText}
      </div>
    </div>
  );
}

/**
 * Renders extension buttons in the composer.
 * Supports both icon-mode (Lucide icon) and widget-mode (iframe HTML) buttons.
 */
export const ComposerExtensionButtons = memo(function ComposerExtensionButtons({
  buttons,
  onClickButton,
  disabled = false,
  contextUsage,
  conversationId,
  projectId,
}: ComposerExtensionButtonsProps) {
  const iconMap = useMemo(() => {
    return LucideIcons as Record<string, any>;
  }, []);

  if (buttons.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {buttons.map(({ extensionId, button }) => {
        // Widget-mode: render custom HTML in an iframe
        if (button.renderMode === 'widget' && button.widgetHtml) {
          return (
            <ComposerWidgetButton
              key={`${extensionId}-${button.id}`}
              button={button}
              contextUsage={contextUsage}
              conversationId={conversationId}
              projectId={projectId}
            />
          );
        }

        // Icon-mode (default): render a Lucide icon button
        const IconComponent = iconMap[button.icon];

        return (
          <Button
            key={`${extensionId}-${button.id}`}
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-[#696b73]"
            onClick={() => onClickButton(extensionId, button)}
            disabled={disabled || button.disabled}
            title={button.tooltip || button.label}
            aria-label={button.label}
          >
            {button.isLoading ? (
              <div className="animate-spin">
                <LucideIcons.Loader2 className="h-5 w-5" />
              </div>
            ) : IconComponent ? (
              <IconComponent className="h-5 w-5" />
            ) : (
              <span className="text-xs">{button.icon}</span>
            )}
          </Button>
        );
      })}
    </div>
  );
});
