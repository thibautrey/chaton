#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const target = path.resolve(
  process.cwd(),
  "node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js",
);

const marker = 'const isCopilot = provider === "github-copilot"';

if (!fs.existsSync(target)) {
  console.error(`[patch-copilot] Target not found: ${target}`);
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");

if (source.includes(marker)) {
  console.log("[patch-copilot] Copilot compatibility patch already applied.");
  process.exit(0);
}

// Find the detectCompat function and patch it to handle Copilot
// The new structure uses isNonStandard and other flags

const isNonStandardOriginal = `    const isNonStandard = provider === "cerebras" ||
        baseUrl.includes("cerebras.ai") ||
        provider === "xai" ||
        baseUrl.includes("api.x.ai") ||
        baseUrl.includes("chutes.ai") ||
        baseUrl.includes("deepseek.com") ||
        isZai ||
        provider === "opencode" ||
        baseUrl.includes("opencode.ai");`;

const isNonStandardPatched = `    const isCopilot = provider === "github-copilot" || baseUrl.includes("githubcopilot.com");
    const isNonStandard = provider === "cerebras" ||
        baseUrl.includes("cerebras.ai") ||
        provider === "xai" ||
        baseUrl.includes("api.x.ai") ||
        baseUrl.includes("chutes.ai") ||
        baseUrl.includes("deepseek.com") ||
        isZai ||
        provider === "opencode" ||
        baseUrl.includes("opencode.ai") ||
        isCopilot;`;

if (!source.includes(isNonStandardOriginal)) {
  console.error("[patch-copilot] Expected isNonStandard source block not found. Upstream pi-ai may have changed.");
  process.exit(1);
}

source = source.replace(isNonStandardOriginal, isNonStandardPatched);

// Also need to patch supportsReasoningEffort and supportsUsageInStreaming and supportsStrictMode for Copilot
const supportsReasoningOriginal = `supportsReasoningEffort: !isGrok && !isZai,`;
const supportsReasoningPatched = `supportsReasoningEffort: !isGrok && !isZai && !isCopilot,`;

if (source.includes(supportsReasoningOriginal)) {
  source = source.replace(supportsReasoningOriginal, supportsReasoningPatched);
}

const supportsUsageOriginal = `supportsUsageInStreaming: true,`;
const supportsUsagePatched = `supportsUsageInStreaming: !isCopilot,`;

if (source.includes(supportsUsageOriginal)) {
  source = source.replace(supportsUsageOriginal, supportsUsagePatched);
}

const supportsStrictModeOriginal = `supportsStrictMode: true,`;
const supportsStrictModePatched = `supportsStrictMode: !isCopilot,`;

if (source.includes(supportsStrictModeOriginal)) {
  source = source.replace(supportsStrictModeOriginal, supportsStrictModePatched);
}

fs.writeFileSync(target, source, "utf8");
console.log("[patch-copilot] Applied Copilot compatibility patch to pi-ai openai-completions provider.");
