import type { ThinkingLevel, PiModel } from "@/components/model/types";
import type { ImageContent, FileContent } from "@/features/workspace/rpc";

export type PendingAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  image?: ImageContent;
  file?: FileContent;
  textForPrompt: string;
};

export type ModifiedFileStat = {
  path: string;
  added: number;
  removed: number;
};

export type ModifiedFileStatByPath = Record<string, { added: number; removed: number }>;

export type FileDiffDetails = {
  path: string;
  lines: string[];
  firstChangedLine: number | null;
  isBinary: boolean;
};

export type ParsedDiffLine = {
  raw: string;
  className: string;
  oldLine: number | null;
  newLine: number | null;
  isChangeContent: boolean;
};

export type { ThinkingLevel, PiModel };
