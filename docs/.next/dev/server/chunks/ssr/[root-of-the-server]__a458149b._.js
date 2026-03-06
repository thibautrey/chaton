module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/gitRepo/dashboard/docs/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/gitRepo/dashboard/docs/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/gitRepo/dashboard/docs/app/docs/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/gitRepo/dashboard/docs/app/docs/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/gitRepo/dashboard/docs/content/user-guide.mdx.js?collection=docs [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MDXContent,
    "frontmatter",
    ()=>frontmatter,
    "structuredData",
    ()=>structuredData,
    "toc",
    ()=>toc
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-runtime.js [app-rsc] (ecmascript)");
;
let frontmatter = {
    "title": "User Guide",
    "description": "Practical guide for everyday Chatons users."
};
let structuredData = {
    "contents": [
        {
            "heading": "user-guide",
            "content": "This page is migrated from the previous canonical Markdown guide."
        },
        {
            "heading": "source",
            "content": "Original file: `docs/CHATONS_USER_GUIDE.md`"
        },
        {
            "heading": "audience-and-scope",
            "content": "This guide is for everyday Chatons users."
        },
        {
            "heading": "audience-and-scope",
            "content": "It explains what you can do in the app today, in practical terms, without internal implementation details."
        },
        {
            "heading": "audience-and-scope",
            "content": "Scope baseline: current behavior observed in the codebase on **March 5, 2026**."
        },
        {
            "heading": "11-startup-loading-screen",
            "content": "During app boot (before workspace/settings hydration completes), Chatons shows a full-window loading screen instead of a white/blank screen."
        },
        {
            "heading": "11-startup-loading-screen",
            "content": "It includes:"
        },
        {
            "heading": "11-startup-loading-screen",
            "content": "centered Chatons mascot video (`chaton-hero.webm`)"
        },
        {
            "heading": "11-startup-loading-screen",
            "content": "a funny cat-themed loading message"
        },
        {
            "heading": "11-startup-loading-screen",
            "content": "the same fade-in/fade-out message transition style used by onboarding intro copy"
        },
        {
            "heading": "1-what-chatons-does",
            "content": "Chatons is a desktop AI workspace that combines:"
        },
        {
            "heading": "1-what-chatons-does",
            "content": "threaded conversations"
        },
        {
            "heading": "1-what-chatons-does",
            "content": "project-linked conversations"
        },
        {
            "heading": "1-what-chatons-does",
            "content": "model selection and provider setup"
        },
        {
            "heading": "1-what-chatons-does",
            "content": "automations, skills, and extensions"
        },
        {
            "heading": "1-what-chatons-does",
            "content": "code-oriented workflows (diffs, worktrees, commit/merge helpers)"
        },
        {
            "heading": "2-first-launch-onboarding",
            "content": "On first launch, Chatons now starts with a short full-window intro screen, then opens a separate 3-step setup flow."
        },
        {
            "heading": "intro-step-new",
            "content": "Before provider setup, Chatons shows a dedicated intro screen (not mixed with setup steps) with:"
        },
        {
            "heading": "intro-step-new",
            "content": "smooth transitions between slides"
        },
        {
            "heading": "intro-step-new",
            "content": "persistent Chatons mascot video (`chaton-hero.webm`) visible throughout"
        },
        {
            "heading": "intro-step-new",
            "content": "progress indicator + dots navigation"
        },
        {
            "heading": "intro-step-new",
            "content": "`Skip intro` and `Next` controls"
        },
        {
            "heading": "intro-step-new",
            "content": "The intro is designed to stay short (well under a minute) and move quickly to setup."
        },
        {
            "heading": "force-open-onboarding-shortcut",
            "content": "You can force-open onboarding at any time with:"
        },
        {
            "heading": "force-open-onboarding-shortcut",
            "content": "`Cmd + Shift + O` (macOS)"
        },
        {
            "heading": "force-open-onboarding-shortcut",
            "content": "`Ctrl + Shift + O` (Windows/Linux)"
        },
        {
            "heading": "step-1-provider-setup",
            "content": "You choose a provider preset (for example OpenAI, Mistral, Ollama, LM Studio, etc.), then set:"
        },
        {
            "heading": "step-1-provider-setup",
            "content": "API type"
        },
        {
            "heading": "step-1-provider-setup",
            "content": "Base URL"
        },
        {
            "heading": "step-1-provider-setup",
            "content": "API key (optional for local providers when detected locally, and optional for `Custom`)"
        },
        {
            "heading": "step-1-provider-setup",
            "content": "Provider preset cards use a transparent surface (no dark card fill) to keep labels and logos easier to read on onboarding backgrounds.\nThe Mistral card displays a gold star badge to indicate it as a preferred preset.\nClicking a provider card automatically scrolls to the provider form/API key area so you can continue setup immediately.\nWhen selecting `Custom`, the form stays in custom mode while you type the provider name (typing no longer exits/hides the custom fields).\nWhen saving provider settings, Chatons now auto-corrects common base URL variants in the background for OpenAI-compatible endpoints (for example `http://host:port`, `http://host:port/`, `http://host:port/v1`, `http://host:port/v1/`) and stores the first reachable one."
        },
        {
            "heading": "step-2-model-scope",
            "content": "Chatons loads models and asks which ones should be available in your everyday model picker."
        },
        {
            "heading": "step-3-quick-validation",
            "content": "Chatons runs a basic setup check before enabling the main app."
        },
        {
            "heading": "3-main-interface-overview",
            "content": "The app has three main areas."
        },
        {
            "heading": "left-sidebar",
            "content": "Main navigation:"
        },
        {
            "heading": "left-sidebar",
            "content": "`New thread`"
        },
        {
            "heading": "left-sidebar",
            "content": "`Automations`"
        },
        {
            "heading": "left-sidebar",
            "content": "`Skills`"
        },
        {
            "heading": "left-sidebar",
            "content": "`Extensions`"
        },
        {
            "heading": "left-sidebar",
            "content": "`Settings`"
        },
        {
            "heading": "left-sidebar",
            "content": "You also get:"
        },
        {
            "heading": "left-sidebar",
            "content": "a search toggle button next to the `+` action to show/hide thread search"
        },
        {
            "heading": "left-sidebar",
            "content": "thread/project organization options"
        },
        {
            "heading": "left-sidebar",
            "content": "update and changelog cards (outside dev mode)"
        },
        {
            "heading": "main-panel",
            "content": "Shows either:"
        },
        {
            "heading": "main-panel",
            "content": "conversation timeline"
        },
        {
            "heading": "main-panel",
            "content": "settings panel"
        },
        {
            "heading": "main-panel",
            "content": "skills panel"
        },
        {
            "heading": "main-panel",
            "content": "extensions panel"
        },
        {
            "heading": "main-panel",
            "content": "an extension main view (for example Automation)"
        },
        {
            "heading": "main-panel",
            "content": "extension main views use the full available content width and height of the main panel rather than the narrower conversation/settings column and viewport-estimated height"
        },
        {
            "heading": "main-panel",
            "content": "on empty-thread states, quick action cards are aligned to the conversation column width and centered within that column (not the full window), while still staying visually above the composer area"
        },
        {
            "heading": "main-panel",
            "content": "quick actions and the \"Start the conversation\" empty-state banner are shown only for truly empty threads; once a first exchange exists, they are hidden"
        },
        {
            "heading": "composer-bottom",
            "content": "Used to send prompts, attach files/images, pick model, pick thinking level, and choose agent access mode.\nThe composer bar and inner composer surface use translucent backgrounds with blur so conversation content remains subtly visible behind them."
        },
        {
            "heading": "create-a-global-thread",
            "content": "Use `New thread` in the sidebar (or the topbar `+` button)."
        },
        {
            "heading": "import-a-project",
            "content": "Use `Add project` in the sidebar."
        },
        {
            "heading": "import-a-project",
            "content": "If the folder is not already a Git repository, Chatons initializes it automatically."
        },
        {
            "heading": "create-a-project-thread",
            "content": "Inside a project group, click the compose icon to create a new thread linked to that project."
        },
        {
            "heading": "delete-threads-and-projects",
            "content": "Deletion uses a two-click confirmation pattern for safety."
        },
        {
            "heading": "model-picker",
            "content": "The model chip in the composer lets you:"
        },
        {
            "heading": "model-picker",
            "content": "use scoped models by default"
        },
        {
            "heading": "model-picker",
            "content": "click `more` to show all models"
        },
        {
            "heading": "model-picker",
            "content": "star/unstar models to add/remove them from scoped models"
        },
        {
            "heading": "model-picker",
            "content": "The same scoped-model picker behavior is now reused in onboarding and provider/model settings, so model scope toggling is consistent across setup and daily usage."
        },
        {
            "heading": "thinking-level",
            "content": "If the selected model supports reasoning levels, a thinking-level chip appears."
        },
        {
            "heading": "agent-access-mode",
            "content": "You can switch per conversation:"
        },
        {
            "heading": "agent-access-mode",
            "content": "`secure`: constrained behavior"
        },
        {
            "heading": "agent-access-mode",
            "content": "`open`: broader file/command access behavior"
        },
        {
            "heading": "agent-access-mode",
            "content": "a friendly comparison popup is shown above the `secure` / `open` buttons in the composer, with short non-technical guidance for when to use each mode"
        },
        {
            "heading": "agent-access-mode",
            "content": "If you change mode on an existing thread, Chatons restarts that conversation runtime."
        },
        {
            "heading": "sending-while-ai-is-busy",
            "content": "If the agent is already processing or still starting up, pressing send queues your message instead of dropping it.\nThis also applies while Chatons is still tracking pending runtime commands for that conversation.\nIn that state, the send button shows a queue icon (instead of text) to keep the composer compact."
        },
        {
            "heading": "stop-current-execution",
            "content": "A stop button appears while the agent is processing."
        },
        {
            "heading": "6-attachments-in-composer",
            "content": "You can add files using `+` or drag-and-drop."
        },
        {
            "heading": "6-attachments-in-composer",
            "content": "Current behavior:"
        },
        {
            "heading": "6-attachments-in-composer",
            "content": "images: sent as image payloads"
        },
        {
            "heading": "6-attachments-in-composer",
            "content": "small text-like files: included as readable text"
        },
        {
            "heading": "6-attachments-in-composer",
            "content": "other/binary files: included as base64 preview text"
        },
        {
            "heading": "6-attachments-in-composer",
            "content": "Attachments can be removed before sending."
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "When a conversation has activity and thread-scoped changes are detected, Chatons shows a modifications panel above the composer with:"
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "changed files count"
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "added/removed lines"
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "inline per-file diffs"
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "change-to-change navigation"
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "This gives you a continuous view of what changed during the thread."
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "Chatons also records compact file-change summaries directly in the conversation timeline after tool executions. Each row shows:"
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "`Modifié <path> +<added> -<removed>`"
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "Click a timeline row to expand the inline diff for that file directly in the thread."
        },
        {
            "heading": "7-live-change-tracking-code-workflows",
            "content": "These timeline rows are thread-scoped deltas (changes relative to thread start baseline), so they track what changed during the current conversation rather than whole-repository totals.\nTimeline summaries are incremental: each row shows only files that changed since the previous tool execution snapshot. Pure Git state transitions that do not introduce new content changes (for example stage/commit cleanup effects) are not surfaced as new \"Modifié\" rows. To reduce false positives from concurrent work in other threads, Chatons only surfaces these timeline file-change rows when the change is associated with a recent `edit` tool execution in the same thread."
        },
        {
            "heading": "8-worktree-tools",
            "content": "For project threads, worktree is **disabled by default**."
        },
        {
            "heading": "8-worktree-tools",
            "content": "Use the topbar worktree icon (`branch` icon) to toggle it for the current thread."
        },
        {
            "heading": "8-worktree-tools",
            "content": "When enabled, the icon changes color (green) to indicate active worktree mode.\nClick the icon again to disable worktree for that thread."
        },
        {
            "heading": "8-worktree-tools",
            "content": "After activation, `Manage worktree` actions are available."
        },
        {
            "heading": "8-worktree-tools",
            "content": "From this dialog you can:"
        },
        {
            "heading": "8-worktree-tools",
            "content": "inspect worktree status fields"
        },
        {
            "heading": "8-worktree-tools",
            "content": "generate a commit message suggestion"
        },
        {
            "heading": "8-worktree-tools",
            "content": "commit"
        },
        {
            "heading": "8-worktree-tools",
            "content": "merge to main"
        },
        {
            "heading": "8-worktree-tools",
            "content": "push"
        },
        {
            "heading": "8-worktree-tools",
            "content": "You can also open the worktree in VS Code if VS Code is detected."
        },
        {
            "heading": "9-automations-user-view",
            "content": "The `Automations` sidebar entry opens a dedicated automation screen."
        },
        {
            "heading": "9-automations-user-view",
            "content": "You can:"
        },
        {
            "heading": "9-automations-user-view",
            "content": "list automation rules"
        },
        {
            "heading": "9-automations-user-view",
            "content": "create a new rule in a modal"
        },
        {
            "heading": "9-automations-user-view",
            "content": "set trigger, action type, cooldown, and request text"
        },
        {
            "heading": "9-automations-user-view",
            "content": "view recent execution history"
        },
        {
            "heading": "9-automations-user-view",
            "content": "delete a rule by double-clicking it"
        },
        {
            "heading": "9-automations-user-view",
            "content": "ask the model in a thread to program an automation task when the Automation extension tools are available in that thread"
        },
        {
            "heading": "9-automations-user-view",
            "content": "use the Automation screen in both light and dark app themes with matching surfaces, cards, and modal styling"
        },
        {
            "heading": "10-skills-user-view",
            "content": "The `Skills` panel supports:"
        },
        {
            "heading": "10-skills-user-view",
            "content": "listing installed skills"
        },
        {
            "heading": "10-skills-user-view",
            "content": "searching/filtering skills"
        },
        {
            "heading": "10-skills-user-view",
            "content": "installing skills from catalog"
        },
        {
            "heading": "10-skills-user-view",
            "content": "uninstalling installed skills"
        },
        {
            "heading": "10-skills-user-view",
            "content": "a redesigned premium library UI with hero summary cards, richer catalog cards, and clearer install/discovery sections aligned with the rest of Chatons visual language"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "The `Extensions` panel supports:"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "listing installed extensions"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "browsing extension catalog"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "install / enable / disable / remove actions"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "health check action"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "viewing extension logs"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "opening the user extensions folder from the app"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "builtin extensions such as `@chaton/automation` are bundled with the application and do not appear in that user folder"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "the old builtin example and Qwen helper extensions are no longer part of the bundled codebase"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "restarting the app when needed"
        },
        {
            "heading": "11-extensions-user-view",
            "content": "a redesigned premium management UI with summary stats, elevated cards, clearer status pills, and a more polished discovery/install flow consistent with the rest of the app"
        },
        {
            "heading": "channel-extensions",
            "content": "Some extensions can act as external messaging bridges, for example Telegram or WhatsApp-style integrations."
        },
        {
            "heading": "channel-extensions",
            "content": "Their role is to import messages received outside Chatons into Chatons conversations.\nCurrent product rule: these imported messages are handled as **global threads** only, not project threads."
        },
        {
            "heading": "channel-extensions",
            "content": "If at least one Channel extension is installed and enabled, Chatons shows a dedicated `Channels` entry in the sidebar, below `Extensions`.\nThis screen lists your installed channel integrations and lets you open each integration's configuration view."
        },
        {
            "heading": "channel-extensions",
            "content": "A Telegram Channel extension can be installed as a user extension and configured from this screen.\nIt currently supports bot configuration, model selection through the Chatons model selector, status inspection, polling diagnostics, and test sends."
        },
        {
            "heading": "channel-extensions",
            "content": "Channel extensions do not appear individually as their own sidebar entries."
        },
        {
            "heading": "channel-extensions",
            "content": "Depending on the extension, a Channel integration can also mirror Chatons replies back to the external platform.\nFor example, the Telegram Channel extension can now create or reuse a Chatons global thread, apply the selected model to that thread, import inbound messages, and send Chatons replies back to Telegram.\nConnection, authentication, and sync status are extension-specific and usually exposed in the extension's own screen."
        },
        {
            "heading": "111-memory-extension",
            "content": "Chatons now includes a built-in `Memory` extension."
        },
        {
            "heading": "111-memory-extension",
            "content": "What it does:"
        },
        {
            "heading": "111-memory-extension",
            "content": "stores memories internally in Chatons local SQLite database"
        },
        {
            "heading": "111-memory-extension",
            "content": "supports two memory scopes:"
        },
        {
            "heading": "111-memory-extension",
            "content": "`global`: personal facts, preferences, and long-lived user context"
        },
        {
            "heading": "111-memory-extension",
            "content": "`project`: project-specific context, decisions, conventions, and useful facts"
        },
        {
            "heading": "111-memory-extension",
            "content": "exposes internal tools so the model can store, retrieve, update, and delete memories during normal conversations"
        },
        {
            "heading": "111-memory-extension",
            "content": "includes a lightweight local semantic search engine embedded directly in Chatons, so no external embedding service is required"
        },
        {
            "heading": "111-memory-extension",
            "content": "Practical use cases:"
        },
        {
            "heading": "111-memory-extension",
            "content": "remember user language/tone preferences globally"
        },
        {
            "heading": "111-memory-extension",
            "content": "remember personal profile/context that helps personalize replies"
        },
        {
            "heading": "111-memory-extension",
            "content": "remember project conventions, architecture decisions, or recurring instructions per project"
        },
        {
            "heading": "111-memory-extension",
            "content": "Current note:"
        },
        {
            "heading": "111-memory-extension",
            "content": "the current local semantic search is intentionally lightweight and fully offline; it is designed to be small and functional rather than state-of-the-art"
        },
        {
            "heading": "12-settings-user-view",
            "content": "Settings sections currently available:"
        },
        {
            "heading": "12-settings-user-view",
            "content": "`General`: app-level Pi settings fields (theme etc.)"
        },
        {
            "heading": "12-settings-user-view",
            "content": "`Behaviors`: default behavior prompt automatically prepended"
        },
        {
            "heading": "12-settings-user-view",
            "content": "`Sidebar`: sidebar display options"
        },
        {
            "heading": "12-settings-user-view",
            "content": "`Sidebar`: also includes `Allow anonymous crash/error details` toggle (can be changed anytime)"
        },
        {
            "heading": "12-settings-user-view",
            "content": "`Language`: French / English"
        },
        {
            "heading": "12-settings-user-view",
            "content": "`Providers & Models`: provider config and model scoping"
        },
        {
            "heading": "12-settings-user-view",
            "content": "`Sessions`: open sessions folder"
        },
        {
            "heading": "12-settings-user-view",
            "content": "`Pi`: command output panel"
        },
        {
            "heading": "12-settings-user-view",
            "content": "`Diagnostics`: runtime checks and paths"
        },
        {
            "heading": "121-crashlog-consent-card",
            "content": "After onboarding, Chatons can show a small bottom-right consent card asking whether you authorize anonymous crash/error details to improve Chatons."
        },
        {
            "heading": "121-crashlog-consent-card",
            "content": "`Allow`: enables anonymous telemetry"
        },
        {
            "heading": "121-crashlog-consent-card",
            "content": "`No thanks`: keeps telemetry disabled"
        },
        {
            "heading": "13-macos-window-close-vs-quit",
            "content": "On macOS, closing the Chatons window does not quit the app. The app keeps running in the background (menu bar/tray behavior)."
        },
        {
            "heading": "13-macos-window-close-vs-quit",
            "content": "Close window (`red dot`): hides the window, app stays running"
        },
        {
            "heading": "13-macos-window-close-vs-quit",
            "content": "`Quitter` (menu bar/tray) or `Cmd + Q`: actually quits the app"
        },
        {
            "heading": "13-macos-window-close-vs-quit",
            "content": "This prompt is shown once per user choice, and the setting remains editable later in `Settings > Sidebar`."
        },
        {
            "heading": "13-updates-and-changelog",
            "content": "Outside development mode:"
        },
        {
            "heading": "13-updates-and-changelog",
            "content": "update availability is shown in sidebar"
        },
        {
            "heading": "13-updates-and-changelog",
            "content": "download progress is displayed"
        },
        {
            "heading": "13-updates-and-changelog",
            "content": "changelog card appears for unseen version"
        },
        {
            "heading": "13-updates-and-changelog",
            "content": "if local changelog files are unavailable (or Electron bridge is unavailable), a built-in fallback changelog is shown"
        },
        {
            "heading": "13-updates-and-changelog",
            "content": "if no downloaded installer exists yet, update apply shows an actionable message instead of crashing"
        },
        {
            "heading": "14-notifications",
            "content": "If the app window is not focused, Chatons can show a desktop notification when a conversation action completes."
        },
        {
            "heading": "15-current-product-notes",
            "content": "Important practical notes for users today:"
        },
        {
            "heading": "15-current-product-notes",
            "content": "Some advanced worktree actions are still evolving and may show partial/limited behavior depending on environment."
        },
        {
            "heading": "15-current-product-notes",
            "content": "Extensions in the catalog can require restart and/or extra setup to become fully usable."
        },
        {
            "heading": "15-current-product-notes",
            "content": "Model/skills/settings Pi commands use Chatons internal Pi runtime and config directory under Chatons data. They do not require a user-global `~/.pi` Node setup."
        },
        {
            "heading": "15-current-product-notes",
            "content": "Provider model lists are refreshed from the internal Pi `--list-models` command and synced into Chatons `models.json` when model sync runs."
        },
        {
            "heading": "15-current-product-notes",
            "content": "On API authorization failures (for example `401`), Chatons logs a safe auth diagnostic trail (provider + masked key fingerprint) in runtime error details to help troubleshooting without exposing raw API keys."
        },
        {
            "heading": "15-current-product-notes",
            "content": "The log console now includes Pi runtime events (`source = pi`) such as runtime status changes and runtime errors, in addition to Electron/frontend logs."
        },
        {
            "heading": "15-current-product-notes",
            "content": "When a message send fails (for example model request returning `401`), Chatons now shows an in-app notice in the composer area so the failure is visible immediately; auth failures explicitly ask you to verify provider API keys."
        },
        {
            "heading": "15-current-product-notes",
            "content": "For technical details and extension authoring, use the developer guide."
        }
    ],
    "headings": [
        {
            "id": "user-guide",
            "content": "User Guide"
        },
        {
            "id": "source",
            "content": "Source"
        },
        {
            "id": "content",
            "content": "Content"
        },
        {
            "id": "chatons-user-guide",
            "content": "Chatons User Guide"
        },
        {
            "id": "audience-and-scope",
            "content": "Audience and Scope"
        },
        {
            "id": "11-startup-loading-screen",
            "content": "1.1 Startup Loading Screen"
        },
        {
            "id": "1-what-chatons-does",
            "content": "1\\. What Chatons Does"
        },
        {
            "id": "2-first-launch-onboarding",
            "content": "2\\. First Launch (Onboarding)"
        },
        {
            "id": "intro-step-new",
            "content": "Intro step (new)"
        },
        {
            "id": "force-open-onboarding-shortcut",
            "content": "Force-open onboarding shortcut"
        },
        {
            "id": "step-1-provider-setup",
            "content": "Step 1: Provider setup"
        },
        {
            "id": "step-2-model-scope",
            "content": "Step 2: Model scope"
        },
        {
            "id": "step-3-quick-validation",
            "content": "Step 3: Quick validation"
        },
        {
            "id": "3-main-interface-overview",
            "content": "3\\. Main Interface Overview"
        },
        {
            "id": "left-sidebar",
            "content": "Left sidebar"
        },
        {
            "id": "main-panel",
            "content": "Main panel"
        },
        {
            "id": "composer-bottom",
            "content": "Composer (bottom)"
        },
        {
            "id": "4-core-daily-workflows",
            "content": "4\\. Core Daily Workflows"
        },
        {
            "id": "create-a-global-thread",
            "content": "Create a global thread"
        },
        {
            "id": "import-a-project",
            "content": "Import a project"
        },
        {
            "id": "create-a-project-thread",
            "content": "Create a project thread"
        },
        {
            "id": "delete-threads-and-projects",
            "content": "Delete threads and projects"
        },
        {
            "id": "5-conversation-experience",
            "content": "5\\. Conversation Experience"
        },
        {
            "id": "model-picker",
            "content": "Model picker"
        },
        {
            "id": "thinking-level",
            "content": "Thinking level"
        },
        {
            "id": "agent-access-mode",
            "content": "Agent access mode"
        },
        {
            "id": "sending-while-ai-is-busy",
            "content": "Sending while AI is busy"
        },
        {
            "id": "stop-current-execution",
            "content": "Stop current execution"
        },
        {
            "id": "6-attachments-in-composer",
            "content": "6\\. Attachments in Composer"
        },
        {
            "id": "7-live-change-tracking-code-workflows",
            "content": "7\\. Live Change Tracking (Code Workflows)"
        },
        {
            "id": "8-worktree-tools",
            "content": "8\\. Worktree Tools"
        },
        {
            "id": "9-automations-user-view",
            "content": "9\\. Automations (User View)"
        },
        {
            "id": "10-skills-user-view",
            "content": "10\\. Skills (User View)"
        },
        {
            "id": "11-extensions-user-view",
            "content": "11\\. Extensions (User View)"
        },
        {
            "id": "channel-extensions",
            "content": "Channel extensions"
        },
        {
            "id": "111-memory-extension",
            "content": "11.1 Memory extension"
        },
        {
            "id": "12-settings-user-view",
            "content": "12\\. Settings (User View)"
        },
        {
            "id": "121-crashlog-consent-card",
            "content": "12.1 Crash/Log Consent Card"
        },
        {
            "id": "13-macos-window-close-vs-quit",
            "content": "13\\. macOS Window Close vs Quit"
        },
        {
            "id": "13-updates-and-changelog",
            "content": "13\\. Updates and Changelog"
        },
        {
            "id": "14-notifications",
            "content": "14\\. Notifications"
        },
        {
            "id": "15-current-product-notes",
            "content": "15\\. Current Product Notes"
        }
    ]
};
let toc = [
    {
        depth: 1,
        url: "#user-guide",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "User Guide"
        })
    },
    {
        depth: 2,
        url: "#source",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Source"
        })
    },
    {
        depth: 2,
        url: "#content",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Content"
        })
    },
    {
        depth: 1,
        url: "#chatons-user-guide",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Chatons User Guide"
        })
    },
    {
        depth: 2,
        url: "#audience-and-scope",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Audience and Scope"
        })
    },
    {
        depth: 2,
        url: "#11-startup-loading-screen",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "1.1 Startup Loading Screen"
        })
    },
    {
        depth: 2,
        url: "#1-what-chatons-does",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "1. What Chatons Does"
        })
    },
    {
        depth: 2,
        url: "#2-first-launch-onboarding",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "2. First Launch (Onboarding)"
        })
    },
    {
        depth: 3,
        url: "#intro-step-new",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Intro step (new)"
        })
    },
    {
        depth: 3,
        url: "#force-open-onboarding-shortcut",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Force-open onboarding shortcut"
        })
    },
    {
        depth: 3,
        url: "#step-1-provider-setup",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Step 1: Provider setup"
        })
    },
    {
        depth: 3,
        url: "#step-2-model-scope",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Step 2: Model scope"
        })
    },
    {
        depth: 3,
        url: "#step-3-quick-validation",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Step 3: Quick validation"
        })
    },
    {
        depth: 2,
        url: "#3-main-interface-overview",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "3. Main Interface Overview"
        })
    },
    {
        depth: 3,
        url: "#left-sidebar",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Left sidebar"
        })
    },
    {
        depth: 3,
        url: "#main-panel",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Main panel"
        })
    },
    {
        depth: 3,
        url: "#composer-bottom",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Composer (bottom)"
        })
    },
    {
        depth: 2,
        url: "#4-core-daily-workflows",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "4. Core Daily Workflows"
        })
    },
    {
        depth: 3,
        url: "#create-a-global-thread",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Create a global thread"
        })
    },
    {
        depth: 3,
        url: "#import-a-project",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Import a project"
        })
    },
    {
        depth: 3,
        url: "#create-a-project-thread",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Create a project thread"
        })
    },
    {
        depth: 3,
        url: "#delete-threads-and-projects",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Delete threads and projects"
        })
    },
    {
        depth: 2,
        url: "#5-conversation-experience",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "5. Conversation Experience"
        })
    },
    {
        depth: 3,
        url: "#model-picker",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Model picker"
        })
    },
    {
        depth: 3,
        url: "#thinking-level",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Thinking level"
        })
    },
    {
        depth: 3,
        url: "#agent-access-mode",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Agent access mode"
        })
    },
    {
        depth: 3,
        url: "#sending-while-ai-is-busy",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Sending while AI is busy"
        })
    },
    {
        depth: 3,
        url: "#stop-current-execution",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Stop current execution"
        })
    },
    {
        depth: 2,
        url: "#6-attachments-in-composer",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "6. Attachments in Composer"
        })
    },
    {
        depth: 2,
        url: "#7-live-change-tracking-code-workflows",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "7. Live Change Tracking (Code Workflows)"
        })
    },
    {
        depth: 2,
        url: "#8-worktree-tools",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "8. Worktree Tools"
        })
    },
    {
        depth: 2,
        url: "#9-automations-user-view",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "9. Automations (User View)"
        })
    },
    {
        depth: 2,
        url: "#10-skills-user-view",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "10. Skills (User View)"
        })
    },
    {
        depth: 2,
        url: "#11-extensions-user-view",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "11. Extensions (User View)"
        })
    },
    {
        depth: 3,
        url: "#channel-extensions",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Channel extensions"
        })
    },
    {
        depth: 2,
        url: "#111-memory-extension",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "11.1 Memory extension"
        })
    },
    {
        depth: 2,
        url: "#12-settings-user-view",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "12. Settings (User View)"
        })
    },
    {
        depth: 2,
        url: "#121-crashlog-consent-card",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "12.1 Crash/Log Consent Card"
        })
    },
    {
        depth: 2,
        url: "#13-macos-window-close-vs-quit",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "13. macOS Window Close vs Quit"
        })
    },
    {
        depth: 2,
        url: "#13-updates-and-changelog",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "13. Updates and Changelog"
        })
    },
    {
        depth: 2,
        url: "#14-notifications",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "14. Notifications"
        })
    },
    {
        depth: 2,
        url: "#15-current-product-notes",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "15. Current Product Notes"
        })
    }
];
function _createMdxContent(props) {
    const _components = {
        code: "code",
        h1: "h1",
        h2: "h2",
        h3: "h3",
        li: "li",
        p: "p",
        strong: "strong",
        ul: "ul",
        ...props.components
    }, { Note } = _components;
    if (!Note) _missingMdxReference("Note", true);
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h1, {
                id: "user-guide",
                children: "User Guide"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(Note, {
                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                    children: "This page is migrated from the previous canonical Markdown guide."
                })
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "source",
                children: "Source"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "Original file: ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "docs/CHATONS_USER_GUIDE.md"
                            })
                        ]
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "content",
                children: "Content"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h1, {
                id: "chatons-user-guide",
                children: "Chatons User Guide"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "audience-and-scope",
                children: "Audience and Scope"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "This guide is for everyday Chatons users."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "It explains what you can do in the app today, in practical terms, without internal implementation details."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "Scope baseline: current behavior observed in the codebase on ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.strong, {
                        children: "March 5, 2026"
                    }),
                    "."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "11-startup-loading-screen",
                children: "1.1 Startup Loading Screen"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "During app boot (before workspace/settings hydration completes), Chatons shows a full-window loading screen instead of a white/blank screen."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "It includes:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "centered Chatons mascot video (",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "chaton-hero.webm"
                            }),
                            ")"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "a funny cat-themed loading message"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "the same fade-in/fade-out message transition style used by onboarding intro copy"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "1-what-chatons-does",
                children: "1. What Chatons Does"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Chatons is a desktop AI workspace that combines:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "threaded conversations"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "project-linked conversations"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "model selection and provider setup"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "automations, skills, and extensions"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "code-oriented workflows (diffs, worktrees, commit/merge helpers)"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "2-first-launch-onboarding",
                children: "2. First Launch (Onboarding)"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "On first launch, Chatons now starts with a short full-window intro screen, then opens a separate 3-step setup flow."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "intro-step-new",
                children: "Intro step (new)"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Before provider setup, Chatons shows a dedicated intro screen (not mixed with setup steps) with:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "smooth transitions between slides"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "persistent Chatons mascot video (",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "chaton-hero.webm"
                            }),
                            ") visible throughout"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "progress indicator + dots navigation"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Skip intro"
                            }),
                            " and ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Next"
                            }),
                            " controls"
                        ]
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "The intro is designed to stay short (well under a minute) and move quickly to setup."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "force-open-onboarding-shortcut",
                children: "Force-open onboarding shortcut"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "You can force-open onboarding at any time with:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Cmd + Shift + O"
                            }),
                            " (macOS)"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Ctrl + Shift + O"
                            }),
                            " (Windows/Linux)"
                        ]
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "step-1-provider-setup",
                children: "Step 1: Provider setup"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "You choose a provider preset (for example OpenAI, Mistral, Ollama, LM Studio, etc.), then set:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "API type"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "Base URL"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "API key (optional for local providers when detected locally, and optional for ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Custom"
                            }),
                            ")"
                        ]
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "Provider preset cards use a transparent surface (no dark card fill) to keep labels and logos easier to read on onboarding backgrounds.\nThe Mistral card displays a gold star badge to indicate it as a preferred preset.\nClicking a provider card automatically scrolls to the provider form/API key area so you can continue setup immediately.\nWhen selecting ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Custom"
                    }),
                    ", the form stays in custom mode while you type the provider name (typing no longer exits/hides the custom fields).\nWhen saving provider settings, Chatons now auto-corrects common base URL variants in the background for OpenAI-compatible endpoints (for example ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "http://host:port"
                    }),
                    ", ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "http://host:port/"
                    }),
                    ", ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "http://host:port/v1"
                    }),
                    ", ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "http://host:port/v1/"
                    }),
                    ") and stores the first reachable one."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "step-2-model-scope",
                children: "Step 2: Model scope"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Chatons loads models and asks which ones should be available in your everyday model picker."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "step-3-quick-validation",
                children: "Step 3: Quick validation"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Chatons runs a basic setup check before enabling the main app."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "3-main-interface-overview",
                children: "3. Main Interface Overview"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "The app has three main areas."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "left-sidebar",
                children: "Left sidebar"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Main navigation:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                            children: "New thread"
                        })
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                            children: "Automations"
                        })
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                            children: "Skills"
                        })
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                            children: "Extensions"
                        })
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                            children: "Settings"
                        })
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "You also get:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "a search toggle button next to the ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "+"
                            }),
                            " action to show/hide thread search"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "thread/project organization options"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "update and changelog cards (outside dev mode)"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "main-panel",
                children: "Main panel"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Shows either:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "conversation timeline"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "settings panel"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "skills panel"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "extensions panel"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "an extension main view (for example Automation)"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "extension main views use the full available content width and height of the main panel rather than the narrower conversation/settings column and viewport-estimated height"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "on empty-thread states, quick action cards are aligned to the conversation column width and centered within that column (not the full window), while still staying visually above the composer area"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "quick actions and the \"Start the conversation\" empty-state banner are shown only for truly empty threads; once a first exchange exists, they are hidden"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "composer-bottom",
                children: "Composer (bottom)"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Used to send prompts, attach files/images, pick model, pick thinking level, and choose agent access mode.\nThe composer bar and inner composer surface use translucent backgrounds with blur so conversation content remains subtly visible behind them."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "4-core-daily-workflows",
                children: "4. Core Daily Workflows"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "create-a-global-thread",
                children: "Create a global thread"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "Use ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "New thread"
                    }),
                    " in the sidebar (or the topbar ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "+"
                    }),
                    " button)."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "import-a-project",
                children: "Import a project"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "Use ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Add project"
                    }),
                    " in the sidebar."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "If the folder is not already a Git repository, Chatons initializes it automatically."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "create-a-project-thread",
                children: "Create a project thread"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Inside a project group, click the compose icon to create a new thread linked to that project."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "delete-threads-and-projects",
                children: "Delete threads and projects"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Deletion uses a two-click confirmation pattern for safety."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "5-conversation-experience",
                children: "5. Conversation Experience"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "model-picker",
                children: "Model picker"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "The model chip in the composer lets you:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "use scoped models by default"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "click ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "more"
                            }),
                            " to show all models"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "star/unstar models to add/remove them from scoped models"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "The same scoped-model picker behavior is now reused in onboarding and provider/model settings, so model scope toggling is consistent across setup and daily usage."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "thinking-level",
                children: "Thinking level"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "If the selected model supports reasoning levels, a thinking-level chip appears."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "agent-access-mode",
                children: "Agent access mode"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "You can switch per conversation:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "secure"
                            }),
                            ": constrained behavior"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "open"
                            }),
                            ": broader file/command access behavior"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "a friendly comparison popup is shown above the ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "secure"
                            }),
                            " / ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "open"
                            }),
                            " buttons in the composer, with short non-technical guidance for when to use each mode"
                        ]
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "If you change mode on an existing thread, Chatons restarts that conversation runtime."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "sending-while-ai-is-busy",
                children: "Sending while AI is busy"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "If the agent is already processing or still starting up, pressing send queues your message instead of dropping it.\nThis also applies while Chatons is still tracking pending runtime commands for that conversation.\nIn that state, the send button shows a queue icon (instead of text) to keep the composer compact."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "stop-current-execution",
                children: "Stop current execution"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "A stop button appears while the agent is processing."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "6-attachments-in-composer",
                children: "6. Attachments in Composer"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "You can add files using ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "+"
                    }),
                    " or drag-and-drop."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Current behavior:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "images: sent as image payloads"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "small text-like files: included as readable text"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "other/binary files: included as base64 preview text"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Attachments can be removed before sending."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "7-live-change-tracking-code-workflows",
                children: "7. Live Change Tracking (Code Workflows)"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "When a conversation has activity and thread-scoped changes are detected, Chatons shows a modifications panel above the composer with:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "changed files count"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "added/removed lines"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "inline per-file diffs"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "change-to-change navigation"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "This gives you a continuous view of what changed during the thread."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Chatons also records compact file-change summaries directly in the conversation timeline after tool executions. Each row shows:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                            children: "Modifié <path> +<added> -<removed>"
                        })
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Click a timeline row to expand the inline diff for that file directly in the thread."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "These timeline rows are thread-scoped deltas (changes relative to thread start baseline), so they track what changed during the current conversation rather than whole-repository totals.\nTimeline summaries are incremental: each row shows only files that changed since the previous tool execution snapshot. Pure Git state transitions that do not introduce new content changes (for example stage/commit cleanup effects) are not surfaced as new \"Modifié\" rows. To reduce false positives from concurrent work in other threads, Chatons only surfaces these timeline file-change rows when the change is associated with a recent ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "edit"
                    }),
                    " tool execution in the same thread."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "8-worktree-tools",
                children: "8. Worktree Tools"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "For project threads, worktree is ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.strong, {
                        children: "disabled by default"
                    }),
                    "."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "Use the topbar worktree icon (",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "branch"
                    }),
                    " icon) to toggle it for the current thread."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "When enabled, the icon changes color (green) to indicate active worktree mode.\nClick the icon again to disable worktree for that thread."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "After activation, ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Manage worktree"
                    }),
                    " actions are available."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "From this dialog you can:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "inspect worktree status fields"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "generate a commit message suggestion"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "commit"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "merge to main"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "push"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "You can also open the worktree in VS Code if VS Code is detected."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "9-automations-user-view",
                children: "9. Automations (User View)"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "The ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Automations"
                    }),
                    " sidebar entry opens a dedicated automation screen."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "You can:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "list automation rules"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "create a new rule in a modal"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "set trigger, action type, cooldown, and request text"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "view recent execution history"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "delete a rule by double-clicking it"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "ask the model in a thread to program an automation task when the Automation extension tools are available in that thread"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "use the Automation screen in both light and dark app themes with matching surfaces, cards, and modal styling"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "10-skills-user-view",
                children: "10. Skills (User View)"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "The ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Skills"
                    }),
                    " panel supports:"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "listing installed skills"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "searching/filtering skills"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "installing skills from catalog"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "uninstalling installed skills"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "a redesigned premium library UI with hero summary cards, richer catalog cards, and clearer install/discovery sections aligned with the rest of Chatons visual language"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "11-extensions-user-view",
                children: "11. Extensions (User View)"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "The ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Extensions"
                    }),
                    " panel supports:"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "listing installed extensions"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "browsing extension catalog"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "install / enable / disable / remove actions"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "health check action"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "viewing extension logs"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "opening the user extensions folder from the app"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "builtin extensions such as ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "@chaton/automation"
                            }),
                            " are bundled with the application and do not appear in that user folder"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "the old builtin example and Qwen helper extensions are no longer part of the bundled codebase"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "restarting the app when needed"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "a redesigned premium management UI with summary stats, elevated cards, clearer status pills, and a more polished discovery/install flow consistent with the rest of the app"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h3, {
                id: "channel-extensions",
                children: "Channel extensions"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Some extensions can act as external messaging bridges, for example Telegram or WhatsApp-style integrations."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "Their role is to import messages received outside Chatons into Chatons conversations.\nCurrent product rule: these imported messages are handled as ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.strong, {
                        children: "global threads"
                    }),
                    " only, not project threads."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "If at least one Channel extension is installed and enabled, Chatons shows a dedicated ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Channels"
                    }),
                    " entry in the sidebar, below ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Extensions"
                    }),
                    ".\nThis screen lists your installed channel integrations and lets you open each integration's configuration view."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "A Telegram Channel extension can be installed as a user extension and configured from this screen.\nIt currently supports bot configuration, model selection through the Chatons model selector, status inspection, polling diagnostics, and test sends."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Channel extensions do not appear individually as their own sidebar entries."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Depending on the extension, a Channel integration can also mirror Chatons replies back to the external platform.\nFor example, the Telegram Channel extension can now create or reuse a Chatons global thread, apply the selected model to that thread, import inbound messages, and send Chatons replies back to Telegram.\nConnection, authentication, and sync status are extension-specific and usually exposed in the extension's own screen."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "111-memory-extension",
                children: "11.1 Memory extension"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "Chatons now includes a built-in ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Memory"
                    }),
                    " extension."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "What it does:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "stores memories internally in Chatons local SQLite database"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "supports two memory scopes:",
                            "\n",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                                children: [
                                    "\n",
                                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                                        children: [
                                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                                children: "global"
                                            }),
                                            ": personal facts, preferences, and long-lived user context"
                                        ]
                                    }),
                                    "\n",
                                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                                        children: [
                                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                                children: "project"
                                            }),
                                            ": project-specific context, decisions, conventions, and useful facts"
                                        ]
                                    }),
                                    "\n"
                                ]
                            }),
                            "\n"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "exposes internal tools so the model can store, retrieve, update, and delete memories during normal conversations"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "includes a lightweight local semantic search engine embedded directly in Chatons, so no external embedding service is required"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Practical use cases:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "remember user language/tone preferences globally"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "remember personal profile/context that helps personalize replies"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "remember project conventions, architecture decisions, or recurring instructions per project"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Current note:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "the current local semantic search is intentionally lightweight and fully offline; it is designed to be small and functional rather than state-of-the-art"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "12-settings-user-view",
                children: "12. Settings (User View)"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Settings sections currently available:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "General"
                            }),
                            ": app-level Pi settings fields (theme etc.)"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Behaviors"
                            }),
                            ": default behavior prompt automatically prepended"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Sidebar"
                            }),
                            ": sidebar display options"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Sidebar"
                            }),
                            ": also includes ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Allow anonymous crash/error details"
                            }),
                            " toggle (can be changed anytime)"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Language"
                            }),
                            ": French / English"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Providers & Models"
                            }),
                            ": provider config and model scoping"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Sessions"
                            }),
                            ": open sessions folder"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Pi"
                            }),
                            ": command output panel"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Diagnostics"
                            }),
                            ": runtime checks and paths"
                        ]
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "121-crashlog-consent-card",
                children: "12.1 Crash/Log Consent Card"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "After onboarding, Chatons can show a small bottom-right consent card asking whether you authorize anonymous crash/error details to improve Chatons."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Allow"
                            }),
                            ": enables anonymous telemetry"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "No thanks"
                            }),
                            ": keeps telemetry disabled"
                        ]
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "13-macos-window-close-vs-quit",
                children: "13. macOS Window Close vs Quit"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "On macOS, closing the Chatons window does not quit the app. The app keeps running in the background (menu bar/tray behavior)."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "Close window (",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "red dot"
                            }),
                            "): hides the window, app stays running"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Quitter"
                            }),
                            " (menu bar/tray) or ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "Cmd + Q"
                            }),
                            ": actually quits the app"
                        ]
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.p, {
                children: [
                    "This prompt is shown once per user choice, and the setting remains editable later in ",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                        children: "Settings > Sidebar"
                    }),
                    "."
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "13-updates-and-changelog",
                children: "13. Updates and Changelog"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Outside development mode:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "update availability is shown in sidebar"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "download progress is displayed"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "changelog card appears for unseen version"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "if local changelog files are unavailable (or Electron bridge is unavailable), a built-in fallback changelog is shown"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "if no downloaded installer exists yet, update apply shows an actionable message instead of crashing"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "14-notifications",
                children: "14. Notifications"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "If the app window is not focused, Chatons can show a desktop notification when a conversation action completes."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "15-current-product-notes",
                children: "15. Current Product Notes"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Important practical notes for users today:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "Some advanced worktree actions are still evolving and may show partial/limited behavior depending on environment."
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "Extensions in the catalog can require restart and/or extra setup to become fully usable."
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "Model/skills/settings Pi commands use Chatons internal Pi runtime and config directory under Chatons data. They do not require a user-global ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "~/.pi"
                            }),
                            " Node setup."
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "Provider model lists are refreshed from the internal Pi ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "--list-models"
                            }),
                            " command and synced into Chatons ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "models.json"
                            }),
                            " when model sync runs."
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "On API authorization failures (for example ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "401"
                            }),
                            "), Chatons logs a safe auth diagnostic trail (provider + masked key fingerprint) in runtime error details to help troubleshooting without exposing raw API keys."
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "The log console now includes Pi runtime events (",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "source = pi"
                            }),
                            ") such as runtime status changes and runtime errors, in addition to Electron/frontend logs."
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "When a message send fails (for example model request returning ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.code, {
                                children: "401"
                            }),
                            "), Chatons now shows an in-app notice in the composer area so the failure is visible immediately; auth failures explicitly ask you to verify provider API keys."
                        ]
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "For technical details and extension authoring, use the developer guide."
            })
        ]
    });
}
function MDXContent(props = {}) {
    const { wrapper: MDXLayout } = props.components || {};
    return MDXLayout ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(MDXLayout, {
        ...props,
        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_createMdxContent, {
            ...props
        })
    }) : _createMdxContent(props);
}
function _missingMdxReference(id, component) {
    throw new Error("Expected " + (component ? "component" : "object") + " `" + id + "` to be defined: you likely forgot to import, pass, or provide it.");
}
}),
"[project]/gitRepo/dashboard/docs/content/index.mdx.js?collection=docs [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MDXContent,
    "frontmatter",
    ()=>frontmatter,
    "structuredData",
    ()=>structuredData,
    "toc",
    ()=>toc
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-runtime.js [app-rsc] (ecmascript)");
;
let frontmatter = {
    "title": "Introduction",
    "description": "Overview of the Chatons documentation portal."
};
let structuredData = {
    "contents": [
        {
            "heading": "chatons-documentation",
            "content": "This documentation has been reorganized into a Fumadocs-style structure."
        },
        {
            "heading": "chatons-documentation",
            "content": "Use this portal to navigate:"
        },
        {
            "heading": "chatons-documentation",
            "content": "user documentation"
        },
        {
            "heading": "chatons-documentation",
            "content": "developer documentation"
        },
        {
            "heading": "chatons-documentation",
            "content": "Pi integration details"
        },
        {
            "heading": "chatons-documentation",
            "content": "extension authoring references"
        },
        {
            "heading": "chatons-documentation",
            "content": "release and signing notes"
        },
        {
            "heading": "main-sections",
            "content": "Getting Started"
        },
        {
            "heading": "main-sections",
            "content": "User Guide"
        },
        {
            "heading": "main-sections",
            "content": "Developer Guide"
        },
        {
            "heading": "main-sections",
            "content": "Pi Integration"
        },
        {
            "heading": "main-sections",
            "content": "Extensions"
        }
    ],
    "headings": [
        {
            "id": "chatons-documentation",
            "content": "Chatons Documentation"
        },
        {
            "id": "main-sections",
            "content": "Main sections"
        }
    ]
};
let toc = [
    {
        depth: 1,
        url: "#chatons-documentation",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Chatons Documentation"
        })
    },
    {
        depth: 2,
        url: "#main-sections",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Main sections"
        })
    }
];
function _createMdxContent(props) {
    const _components = {
        a: "a",
        h1: "h1",
        h2: "h2",
        li: "li",
        p: "p",
        ul: "ul",
        ...props.components
    };
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h1, {
                id: "chatons-documentation",
                children: "Chatons Documentation"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "This documentation has been reorganized into a Fumadocs-style structure."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Use this portal to navigate:"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "user documentation"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "developer documentation"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "Pi integration details"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "extension authoring references"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "release and signing notes"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "main-sections",
                children: "Main sections"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.a, {
                            href: "/docs/getting-started",
                            children: "Getting Started"
                        })
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.a, {
                            href: "/docs/user-guide",
                            children: "User Guide"
                        })
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.a, {
                            href: "/docs/developer-guide",
                            children: "Developer Guide"
                        })
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.a, {
                            href: "/docs/pi-integration",
                            children: "Pi Integration"
                        })
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.a, {
                            href: "/docs/extensions",
                            children: "Extensions"
                        })
                    }),
                    "\n"
                ]
            })
        ]
    });
}
function MDXContent(props = {}) {
    const { wrapper: MDXLayout } = props.components || {};
    return MDXLayout ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(MDXLayout, {
        ...props,
        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_createMdxContent, {
            ...props
        })
    }) : _createMdxContent(props);
}
}),
"[project]/gitRepo/dashboard/docs/content/getting-started.mdx.js?collection=docs [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MDXContent,
    "frontmatter",
    ()=>frontmatter,
    "structuredData",
    ()=>structuredData,
    "toc",
    ()=>toc
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-runtime.js [app-rsc] (ecmascript)");
;
let frontmatter = {
    "title": "Getting Started",
    "description": "Quick orientation for Chatons users and contributors."
};
let structuredData = {
    "contents": [
        {
            "heading": "getting-started",
            "content": "Chatons is a desktop AI workspace built with Electron, React, TypeScript, SQLite, and Pi Coding Agent."
        },
        {
            "heading": "who-this-documentation-is-for",
            "content": "End users who want to use Chatons daily"
        },
        {
            "heading": "who-this-documentation-is-for",
            "content": "Contributors who want to understand the architecture"
        },
        {
            "heading": "who-this-documentation-is-for",
            "content": "Extension authors integrating custom capabilities"
        },
        {
            "heading": "start-here",
            "content": "Read the User Guide for product behavior"
        },
        {
            "heading": "start-here",
            "content": "Read the Developer Guide for implementation details"
        },
        {
            "heading": "start-here",
            "content": "Read the Pi Integration page for runtime specifics"
        }
    ],
    "headings": [
        {
            "id": "getting-started",
            "content": "Getting Started"
        },
        {
            "id": "who-this-documentation-is-for",
            "content": "Who this documentation is for"
        },
        {
            "id": "start-here",
            "content": "Start here"
        }
    ]
};
let toc = [
    {
        depth: 1,
        url: "#getting-started",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Getting Started"
        })
    },
    {
        depth: 2,
        url: "#who-this-documentation-is-for",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Who this documentation is for"
        })
    },
    {
        depth: 2,
        url: "#start-here",
        title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "Start here"
        })
    }
];
function _createMdxContent(props) {
    const _components = {
        a: "a",
        h1: "h1",
        h2: "h2",
        li: "li",
        p: "p",
        ul: "ul",
        ...props.components
    };
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h1, {
                id: "getting-started",
                children: "Getting Started"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.p, {
                children: "Chatons is a desktop AI workspace built with Electron, React, TypeScript, SQLite, and Pi Coding Agent."
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "who-this-documentation-is-for",
                children: "Who this documentation is for"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "End users who want to use Chatons daily"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "Contributors who want to understand the architecture"
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.li, {
                        children: "Extension authors integrating custom capabilities"
                    }),
                    "\n"
                ]
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.h2, {
                id: "start-here",
                children: "Start here"
            }),
            "\n",
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.ul, {
                children: [
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "Read the ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.a, {
                                href: "/docs/user-guide",
                                children: "User Guide"
                            }),
                            " for product behavior"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "Read the ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.a, {
                                href: "/docs/developer-guide",
                                children: "Developer Guide"
                            }),
                            " for implementation details"
                        ]
                    }),
                    "\n",
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxs"])(_components.li, {
                        children: [
                            "Read the ",
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_components.a, {
                                href: "/docs/pi-integration",
                                children: "Pi Integration"
                            }),
                            " page for runtime specifics"
                        ]
                    }),
                    "\n"
                ]
            })
        ]
    });
}
function MDXContent(props = {}) {
    const { wrapper: MDXLayout } = props.components || {};
    return MDXLayout ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(MDXLayout, {
        ...props,
        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsx"])(_createMdxContent, {
            ...props
        })
    }) : _createMdxContent(props);
}
}),
"[project]/gitRepo/dashboard/docs/content/meta.json.json?collection=docs (json)", ((__turbopack_context__) => {

__turbopack_context__.v({"title":"Chatons Documentation","pages":["index","getting-started","user-guide","developer-guide","pi-integration","extensions/index","extensions/api","extensions/channels","extensions/ui-library","automation-extension","signing-guide","manual-signing-instructions","semantic-versioning","versioning-implementation","implementation-summary","documentation-audit","vers"],"description":"User, developer, extension, and integration docs for Chatons"});}),
"[project]/gitRepo/dashboard/docs/.source/server.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "docs",
    ()=>docs
]);
// @ts-nocheck
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$content$2f$user$2d$guide$2e$mdx$2e$js$3f$collection$3d$docs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/content/user-guide.mdx.js?collection=docs [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$content$2f$index$2e$mdx$2e$js$3f$collection$3d$docs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/content/index.mdx.js?collection=docs [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$content$2f$getting$2d$started$2e$mdx$2e$js$3f$collection$3d$docs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/content/getting-started.mdx.js?collection=docs [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$content$2f$meta$2e$json$2e$json$3f$collection$3d$docs__$28$json$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/content/meta.json.json?collection=docs (json)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$mdx$2f$dist$2f$runtime$2f$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-mdx/dist/runtime/server.js [app-rsc] (ecmascript)");
;
;
;
;
;
const create = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$mdx$2f$dist$2f$runtime$2f$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["server"])({
    "doc": {
        "passthroughs": [
            "extractedReferences"
        ]
    }
});
const docs = await create.docs("docs", "content", {
    "meta.json": __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$content$2f$meta$2e$json$2e$json$3f$collection$3d$docs__$28$json$29$__["default"]
}, {
    "getting-started.mdx": __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$content$2f$getting$2d$started$2e$mdx$2e$js$3f$collection$3d$docs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__,
    "index.mdx": __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$content$2f$index$2e$mdx$2e$js$3f$collection$3d$docs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__,
    "user-guide.mdx": __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$content$2f$user$2d$guide$2e$mdx$2e$js$3f$collection$3d$docs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__
});
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),
"[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "default",
    ()=>DocPage,
    "generateMetadata",
    ()=>generateMetadata,
    "generateStaticParams",
    ()=>generateStaticParams
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$page$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/page.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f2e$source$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/.source/server.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/lib/source.ts [app-rsc] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f2e$source$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__,
    __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f2e$source$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
;
;
async function DocPage(props) {
    const params = await props.params;
    const page = __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["source"].getPage(params.slug);
    if (!page) (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["notFound"])();
    const doc = __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f2e$source$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["docs"].docs.find((entry)=>entry.info.path.replace(/\.mdx?$/, '') === page.slugs.join('/'));
    if (!doc) (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["notFound"])();
    const MDX = doc.body;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$page$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DocsPage"], {
        toc: doc.toc,
        full: doc.full,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$page$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DocsBody"], {
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(MDX, {}, void 0, false, {
                fileName: "[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx",
                lineNumber: 19,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx",
            lineNumber: 18,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx",
        lineNumber: 17,
        columnNumber: 5
    }, this);
}
async function generateStaticParams() {
    return __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["source"].generateParams();
}
async function generateMetadata(props) {
    const params = await props.params;
    const page = __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["source"].getPage(params.slug);
    if (!page) (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["notFound"])();
    return {
        title: page.data.title,
        description: page.data.description
    };
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__a458149b._.js.map