#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const target = path.resolve(
  process.cwd(),
  "node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js",
);

const marker = "const isCopilot = provider === \"github-copilot\" || baseUrl.includes(\"githubcopilot.com\");";

if (!fs.existsSync(target)) {
  console.error(`[patch-copilot] Target not found: ${target}`);
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");
if (source.includes(marker)) {
  console.log("[patch-copilot] Copilot compatibility patch already applied.");
  process.exit(0);
}

const original = `function detectCompat(model) {
    const provider = model.provider;
    const baseUrl = model.baseUrl;
    const isZai = provider === "zai" || baseUrl.includes("api.z.ai");
    const isNonStandard = provider === "cerebras" ||
        baseUrl.includes("cerebras.ai") ||
        provider === "xai" ||
        baseUrl.includes("api.x.ai") ||
        provider === "mistral" ||
        baseUrl.includes("mistral.ai") ||
        baseUrl.includes("chutes.ai") ||
        baseUrl.includes("deepseek.com") ||
        isZai ||
        provider === "opencode" ||
        baseUrl.includes("opencode.ai");
    const useMaxTokens = provider === "mistral" || baseUrl.includes("mistral.ai") || baseUrl.includes("chutes.ai");
    const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");
    const isMistral = provider === "mistral" || baseUrl.includes("mistral.ai");
    return {
        supportsStore: !isNonStandard,
        supportsDeveloperRole: !isNonStandard,
        supportsReasoningEffort: !isGrok && !isZai,
        supportsUsageInStreaming: true,
        maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",
        requiresToolResultName: isMistral,
        requiresAssistantAfterToolResult: false, // Mistral no longer requires this as of Dec 2024
        requiresThinkingAsText: isMistral,
        requiresMistralToolIds: isMistral,
        thinkingFormat: isZai ? "zai" : "openai",
        openRouterRouting: {},
        vercelGatewayRouting: {},
        supportsStrictMode: true,
    };
}`;

const replacement = `function detectCompat(model) {
    const provider = model.provider;
    const baseUrl = model.baseUrl;
    const isCopilot = provider === "github-copilot" || baseUrl.includes("githubcopilot.com");
    const isZai = provider === "zai" || baseUrl.includes("api.z.ai");
    const isNonStandard = provider === "cerebras" ||
        baseUrl.includes("cerebras.ai") ||
        provider === "xai" ||
        baseUrl.includes("api.x.ai") ||
        provider === "mistral" ||
        baseUrl.includes("mistral.ai") ||
        baseUrl.includes("chutes.ai") ||
        baseUrl.includes("deepseek.com") ||
        isZai ||
        provider === "opencode" ||
        baseUrl.includes("opencode.ai") ||
        isCopilot;
    const useMaxTokens = provider === "mistral" || baseUrl.includes("mistral.ai") || baseUrl.includes("chutes.ai");
    const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");
    const isMistral = provider === "mistral" || baseUrl.includes("mistral.ai");
    return {
        supportsStore: !isNonStandard,
        supportsDeveloperRole: !isNonStandard,
        supportsReasoningEffort: !isGrok && !isZai && !isCopilot,
        supportsUsageInStreaming: !isCopilot,
        maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",
        requiresToolResultName: isMistral,
        requiresAssistantAfterToolResult: false, // Mistral no longer requires this as of Dec 2024
        requiresThinkingAsText: isMistral,
        requiresMistralToolIds: isMistral,
        thinkingFormat: isZai ? "zai" : "openai",
        openRouterRouting: {},
        vercelGatewayRouting: {},
        supportsStrictMode: !isCopilot,
    };
}`;

if (!source.includes(original)) {
  console.error("[patch-copilot] Expected detectCompat() source block not found. Upstream pi-ai may have changed.");
  process.exit(1);
}

source = source.replace(original, replacement);
fs.writeFileSync(target, source, "utf8");
console.log("[patch-copilot] Applied Copilot compatibility patch to pi-ai openai-completions provider.");
