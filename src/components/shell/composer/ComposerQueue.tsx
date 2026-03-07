import { Pencil, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

type ComposerQueueProps = {
  messages: string[];
  onEdit: (message: string, index: number) => void;
  onRemove: (index: number) => void;
};

export function ComposerQueue({ messages, onEdit, onRemove }: ComposerQueueProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="composer-file-attente" role="status" aria-live="polite">
      <div className="composer-file-attente-header">
        <div className="composer-file-attente-header-left">
          <Zap className="composer-file-attente-header-icon" />
          <div>
            <h3 className="composer-file-attente-titre">Queue</h3>
            <p className="composer-file-attente-subtitle">{messages.length} message{messages.length !== 1 ? 's' : ''} pending</p>
          </div>
        </div>
        <div className="composer-file-attente-badge">{messages.length}</div>
      </div>
      <div className="composer-file-attente-liste">
        {messages.map((item, index) => (
          <div key={`${index}-${item}`} className="composer-file-attente-item">
            <div className="composer-file-attente-item-number">{index + 1}</div>
            <div className="composer-file-attente-texte">{item}</div>
            <div className="composer-file-attente-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="composer-file-attente-bouton"
                onClick={() => onEdit(item, index)}
                title="Edit message"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="composer-file-attente-bouton composer-file-attente-bouton-danger"
                onClick={() => onRemove(index)}
                title="Remove message"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
