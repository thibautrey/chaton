import { Pencil, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type ComposerQueueProps = {
  messages: { id?: string; text: string }[] | string[];
  onEdit: (message: string, index: number) => void;
  onRemove: (index: number) => void;
  onSteer: (message: string, index: number) => void;
  isStreaming?: boolean;
};

export function ComposerQueue({ messages, onEdit, onRemove, onSteer = () => {}, isStreaming = false }: ComposerQueueProps) {
  if (messages.length === 0) {
    return null;
  }

  const getMessageText = (item: any): string => typeof item === 'string' ? item : item.text;
  const getItemKey = (item: any, index: number): string => {
    if (typeof item === 'object' && item.id) {
      return item.id;
    }
    return `composer-queue-${index}`;
  };

  return (
    <div className="composer-file-attente" role="status" aria-live="polite">
      <div className="composer-file-attente-liste">
        {messages.map((item, index) => {
          const text = getMessageText(item);
          return (
          <div key={getItemKey(item, index)} className="composer-file-attente-item">
            <div className="composer-file-attente-item-number">{index + 1}</div>
            <div className="composer-file-attente-texte">{text}</div>
            <div className="composer-file-attente-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="composer-file-attente-bouton"
                onClick={() => onEdit(text, index)}
                title="Edit message"
              >
                <Pencil className="h-5 w-5" />
              </Button>
              {isStreaming && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="composer-file-attente-bouton composer-file-attente-bouton-steer"
                  onClick={() => onSteer(text, index)}
                  title="Diriger"
                >
                  <ArrowRight className="h-5 w-5" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="composer-file-attente-bouton composer-file-attente-bouton-danger"
                onClick={() => onRemove(index)}
                title="Remove message"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
