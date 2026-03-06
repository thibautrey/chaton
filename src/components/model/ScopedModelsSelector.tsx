import { ModelScopePicker } from "@/components/model/ModelScopePicker";

import type { PiModel } from "@/components/model/types";

type ScopedModelsSelectorProps = {
  models: Array<Pick<PiModel, "id" | "provider" | "key" | "scoped">>;
  onToggleScope: (model: Pick<PiModel, "id" | "provider" | "key" | "scoped">) => void;
  emptyText?: string;
};

export function ScopedModelsSelector({
  models,
  onToggleScope,
  emptyText,
}: ScopedModelsSelectorProps) {
  return (
    <ModelScopePicker
      models={models.map((model) => ({
        ...model,
        supportsThinking: false,
        thinkingLevels: [],
      }))}
      onToggleScope={onToggleScope}
      emptyText={emptyText}
    />
  );
}
