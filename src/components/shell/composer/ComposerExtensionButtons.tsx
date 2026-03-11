import { memo, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { ComposerButtonAction } from '@/extensions/composer-button-sdk';
import * as LucideIcons from 'lucide-react';

interface ComposerExtensionButtonsProps {
  buttons: Array<{
    extensionId: string;
    button: ComposerButtonAction;
  }>;
  onClickButton: (extensionId: string, button: ComposerButtonAction) => void;
  disabled?: boolean;
}

/**
 * Renders extension buttons in the composer
 */
export const ComposerExtensionButtons = memo(function ComposerExtensionButtons({
  buttons,
  onClickButton,
  disabled = false,
}: ComposerExtensionButtonsProps) {
  const iconMap = useMemo(() => {
    // Create a map of icon names to components
    return LucideIcons as Record<string, any>;
  }, []);

  if (buttons.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {buttons.map(({ extensionId, button }) => {
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
