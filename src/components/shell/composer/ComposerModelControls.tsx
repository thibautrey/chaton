import { ThreadModelControls } from "@/components/model/ThreadModelControls";
import type { PiModel, ThinkingLevel } from "@/components/model/types";

type ComposerModelControlsProps = {
  models: PiModel[];
  selectedModelKey: string;
  selectedThinking: ThinkingLevel;
  selectedAccessMode: "secure" | "open";
  accessModeTooltip: string;
  isLoadingModels: boolean;
  isUpdatingScope: boolean;
  onApplyModel: (modelKey: string) => Promise<void>;
  onToggleModelScoped: (model: { id: string; provider: string; scoped: boolean }) => Promise<void>;
  onThinkingChange: (level: ThinkingLevel) => Promise<void>;
  onAccessModeChange: (mode: "secure" | "open") => Promise<void>;
  onOpenModelsMenu?: () => void;
  t: (key: string) => string;
};

export function ComposerModelControls({
  ...props
}: ComposerModelControlsProps) {
  return <ThreadModelControls {...props} showScopeToggle={true} showThinking={true} showAccessMode={true} />;
}
