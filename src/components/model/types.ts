export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type PiModel = {
  id: string;
  provider: string;
  key: string;
  scoped: boolean;
  supportsThinking: boolean;
  thinkingLevels: ThinkingLevel[];
};
