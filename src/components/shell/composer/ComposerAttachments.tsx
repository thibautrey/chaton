import type { PendingAttachment } from "./types";

type ComposerAttachmentsProps = {
  attachments: PendingAttachment[];
  formatBytes: (bytes: number) => string;
  onRemove: (attachmentId: string) => void;
};

export function ComposerAttachments({ attachments, formatBytes, onRemove }: ComposerAttachmentsProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="composer-attachments" aria-live="polite">
      {attachments.map((piece) => (
        piece.isImage && piece.image ? (
          <div key={piece.id} className="composer-image-preview">
            <img
              className="composer-image-preview-thumb"
              src={`data:${piece.image.mimeType};base64,${piece.image.data}`}
              alt={piece.name}
            />
            <div className="composer-image-preview-meta">
              <span className="composer-image-preview-name">{piece.name}</span>
              <span className="composer-image-preview-size">{formatBytes(piece.size)}</span>
            </div>
            <button
              type="button"
              className="composer-attachment-chip-remove composer-image-preview-remove"
              onClick={() => onRemove(piece.id)}
              aria-label={`Retirer ${piece.name}`}
            >
              ×
            </button>
          </div>
        ) : (
          <div key={piece.id} className="composer-attachment-chip">
            <span className="composer-attachment-chip-label">
              Fichier: {piece.name} ({formatBytes(piece.size)})
            </span>
            <button
              type="button"
              className="composer-attachment-chip-remove"
              onClick={() => onRemove(piece.id)}
              aria-label={`Retirer ${piece.name}`}
            >
              ×
            </button>
          </div>
        )
      ))}
    </div>
  );
}
