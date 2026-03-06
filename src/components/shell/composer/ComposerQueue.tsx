import { Pencil, Trash2 } from "lucide-react";
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
      <div className="composer-file-attente-titre">File d’attente ({messages.length})</div>
      <div className="composer-file-attente-liste">
        {messages.map((item, index) => (
          <div key={`${index}-${item}`} className="composer-file-attente-item">
            <div className="composer-file-attente-texte">{item}</div>
            <div className="composer-file-attente-actions">
              <Button
                type="button"
                variant="ghost"
                className="composer-file-attente-bouton"
                onClick={() => onEdit(item, index)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="composer-file-attente-bouton"
                onClick={() => onRemove(index)}
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
