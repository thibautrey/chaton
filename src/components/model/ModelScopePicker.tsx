import { Star } from "lucide-react";

import type { PiModel } from "@/components/model/types";

type ModelScopePickerProps = {
  models: PiModel[];
  onToggleScope: (model: PiModel) => void;
  emptyText?: string;
};

export function ModelScopePicker({
  models,
  onToggleScope,
  emptyText = "Aucun modèle détecté via `pi --list-models`.",
}: ModelScopePickerProps) {
  if (models.length === 0) {
    return <div className="settings-card-note text-[#5c5e67] dark:text-[#d3dcef]">{emptyText}</div>;
  }

  return (
    <div className="settings-list settings-pm-models">
      {models.map((model) => (
        <div
          key={model.key}
          className="settings-list-row settings-pm-model-row text-[#2d2f35] dark:text-[#e7edfa]"
        >
          <span className="settings-mono text-[#3b3d45] dark:text-[#e7edfa]">{model.id}</span>
          <button
            type="button"
            className={`settings-icon-action ${model.scoped ? "settings-pm-star-active" : ""}`}
            onClick={() => onToggleScope(model)}
            aria-label={
              model.scoped ? "Retirer du scope" : "Ajouter au scope"
            }
          >
            <Star className={`h-4 w-4 ${model.scoped ? "fill-current" : ""}`} />
          </button>
        </div>
      ))}
    </div>
  );
}
