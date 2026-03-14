(function () {
  var STYLE_ID = "chaton-extension-components-style";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ":root {",
      "  --ce-bg: hsl(220 12% 96%);",
      "  --ce-fg: hsl(222 12% 14%);",
      "  --ce-card: hsl(0 0% 100%);",
      "  --ce-card-fg: hsl(222 12% 14%);",
      "  --ce-primary: hsl(220 7% 32%);",
      "  --ce-primary-fg: hsl(0 0% 100%);",
      "  --ce-muted: hsl(220 10% 92%);",
      "  --ce-muted-fg: hsl(220 6% 44%);",
      "  --ce-accent: hsl(220 10% 93%);",
      "  --ce-accent-fg: hsl(222 12% 16%);",
      "  --ce-border: hsl(220 9% 85%);",
      "  --ce-input: hsl(220 9% 85%);",
      "  --ce-ring: hsl(220 9% 70%);",
      "  --ce-danger: hsl(0 48% 43%);",
      "  --ce-danger-soft: hsl(0 100% 97%);",
      "  --ce-success: hsl(144 45% 35%);",
      "  --ce-radius-sm: 6px;",
      "  --ce-radius-md: 10px;",
      "  --ce-radius-lg: 14px;",
      "  --ce-shadow-card: 0 2px 6px rgba(15, 23, 42, 0.05);",
      "  --ce-shadow-dialog: 0 8px 24px rgba(6, 13, 26, 0.14);",
      '  --ce-font: "SF Pro Text", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      "  color-scheme: light;",
      "}",
      ":root.dark {",
      "  --ce-bg: hsl(223 22% 6%);",
      "  --ce-fg: hsl(214 32% 93%);",
      "  --ce-card: hsl(222 21% 9%);",
      "  --ce-card-fg: hsl(214 32% 93%);",
      "  --ce-primary: hsl(214 30% 82%);",
      "  --ce-primary-fg: hsl(220 24% 12%);",
      "  --ce-muted: hsl(222 16% 13%);",
      "  --ce-muted-fg: hsl(214 16% 62%);",
      "  --ce-accent: hsl(222 16% 14%);",
      "  --ce-accent-fg: hsl(214 32% 93%);",
      "  --ce-border: hsl(222 20% 17%);",
      "  --ce-input: hsl(222 22% 16%);",
      "  --ce-ring: hsl(214 40% 50%);",
      "  --ce-danger: hsl(0 52% 68%);",
      "  --ce-danger-soft: hsl(0 30% 16%);",
      "  --ce-success: hsl(145 48% 58%);",
      "  --ce-shadow-card: 0 4px 14px rgba(2, 6, 23, 0.30);",
      "  --ce-shadow-dialog: 0 10px 32px rgba(2, 6, 23, 0.45);",
      "  color-scheme: dark;",
      "}",

      ".ce-root, .ce-root * { box-sizing: border-box; }",
      ".ce-root { color: var(--ce-fg); font-family: var(--ce-font); background: var(--ce-bg); min-height: 100vh; width: 100%; height: 100%; }",
      ".ce-page { max-width: 1020px; margin: 0 auto; padding: 20px 24px; }",
      ".ce-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }",
      ".ce-page-title-group { display: flex; align-items: center; gap: 10px; }",
      ".ce-page-icon { color: var(--ce-muted-fg); flex-shrink: 0; }",
      ".ce-page-title { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }",
      ".ce-page-description { margin: 4px 0 0; color: var(--ce-muted-fg); font-size: 13px; line-height: 1.5; max-width: 700px; }",
      ".ce-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; border-radius: 8px; border: 1px solid transparent; padding: 0 12px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background-color .15s ease, border-color .15s ease, color .15s ease; }",
      ".ce-button:hover { opacity: .88; }",
      ".ce-button:active { opacity: 1; }",
      ".ce-button:focus-visible, .ce-input:focus-visible, .ce-textarea:focus-visible, .ce-select:focus-visible { outline: 2px solid var(--ce-ring); outline-offset: 2px; }",
      ".ce-button:disabled { opacity: .6; cursor: not-allowed; transform: none; }",
      ".ce-button--default { background: var(--ce-primary); color: var(--ce-primary-fg); }",
      ".ce-button--default:hover { background: color-mix(in srgb, var(--ce-primary) 88%, black); }",
      ".ce-button--outline { background: var(--ce-card); color: var(--ce-fg); border-color: var(--ce-border); }",
      ".ce-button--outline:hover { background: var(--ce-accent); }",
      ".ce-button--ghost { background: transparent; color: var(--ce-muted-fg); }",
      ".ce-button--ghost:hover { background: var(--ce-accent); color: var(--ce-accent-fg); }",
      ".ce-badge { display: inline-flex; align-items: center; gap: 4px; min-height: 20px; border-radius: 999px; padding: 0 8px; font-size: 11px; font-weight: 600; border: 1px solid transparent; }",
      ".ce-badge--default { background: var(--ce-primary); color: var(--ce-primary-fg); }",
      ".ce-badge--secondary { background: transparent; color: var(--ce-muted-fg); }",
      ".ce-badge--outline { background: transparent; color: var(--ce-fg); border-color: var(--ce-border); }",
      ".ce-card { background: var(--ce-card); border: 1px solid var(--ce-border); box-shadow: var(--ce-shadow-card); border-radius: var(--ce-radius-md); }",
      ".ce-card__body { padding: 16px; }",
      ".ce-grid { display: grid; gap: 16px; }",
      ".ce-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }",
      ".ce-stack { display: grid; gap: 12px; }",
      ".ce-section-title { margin: 0 0 4px; font-size: 14px; font-weight: 600; }",
      ".ce-section-copy { margin: 0; color: var(--ce-muted-fg); font-size: 12px; line-height: 1.5; }",
      ".ce-list { display: grid; gap: 10px; }",
      ".ce-list-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border: 1px solid var(--ce-border); background: var(--ce-card); border-radius: var(--ce-radius-sm); padding: 10px 12px; transition: background .12s ease; }",
      ".ce-list-row:hover { background: var(--ce-accent); }",
      ".ce-list-row__main { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }",
      ".ce-list-row__content { min-width: 0; }",
      ".ce-list-row__title { margin: 0; font-size: 13px; font-weight: 600; }",
      ".ce-list-row__meta { margin: 3px 0 0; color: var(--ce-muted-fg); font-size: 12px; line-height: 1.45; }",
      ".ce-list-row__aside { color: var(--ce-muted-fg); font-size: 12px; white-space: nowrap; }",

      ".ce-dot { width: 8px; height: 8px; border-radius: 999px; margin-top: 4px; background: var(--ce-muted-fg); flex: 0 0 auto; }",
      ".ce-dot--success { background: var(--ce-success); }",
      ".ce-dot--danger { background: var(--ce-danger); }",
      ".ce-empty { border: 1px dashed var(--ce-border); border-radius: var(--ce-radius-sm); padding: 14px; color: var(--ce-muted-fg); font-size: 12px; background: transparent; }",
      ".ce-field { display: grid; gap: 6px; min-width: 0; }",
      ".ce-label { font-size: 12px; font-weight: 600; color: var(--ce-muted-fg); }",
      ".ce-input, .ce-textarea, .ce-select { width: 100%; border: 1px solid var(--ce-input); background: var(--ce-card); color: var(--ce-fg); border-radius: 8px; padding: 7px 10px; font-size: 13px; font-family: inherit; }",
      ".ce-textarea { min-height: 80px; resize: vertical; }",
      ".ce-help { color: var(--ce-muted-fg); font-size: 12px; line-height: 1.4; }",
      ".ce-checkbox { width: 16px; height: 16px; border: 1px solid var(--ce-input); background: var(--ce-card); border-radius: 4px; cursor: pointer; }",
      ".ce-checkbox:checked { background: var(--ce-primary); border-color: var(--ce-primary); }",
      ".ce-checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--ce-fg); font-size: 13px; }",
      ".ce-inline { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }",
      ".ce-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); backdrop-filter: blur(3px); display: none; align-items: center; justify-content: center; padding: 20px; z-index: 999; }",
      ".ce-modal-backdrop.is-open { display: flex; }",
      ".ce-modal { width: min(860px, 100%); max-height: calc(100vh - 40px); overflow: auto; background: var(--ce-card); border: 1px solid var(--ce-border); box-shadow: var(--ce-shadow-dialog); border-radius: 16px; padding: 20px; }",
      ".ce-modal--compact { width: min(520px, 100%); display: grid; gap: 16px; }",
      ".ce-modal__header { display: grid; gap: 4px; margin-bottom: 0; }",
      ".ce-modal__title { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }",
      ".ce-modal__description { margin: 0; color: var(--ce-muted-fg); font-size: 13px; line-height: 1.5; }",
      ".ce-modal__primary { display: grid; gap: 14px; }",
      ".ce-modal__inline-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }",
      ".ce-modal__advanced-toggle { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--ce-muted-fg); font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; font-family: inherit; }",
      ".ce-modal__advanced-toggle:hover { color: var(--ce-fg); }",
      ".ce-modal__advanced-chevron { font-size: 10px; display: inline-block; width: 12px; }",
      ".ce-modal__advanced-panel { display: none; gap: 12px; }",
      ".ce-modal__footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 4px; border-top: 1px solid var(--ce-border); }",
      ".ce-modal__footer-right { display: flex; align-items: center; gap: 8px; }",
      ".ce-textarea--short { min-height: 60px; }",
      ".ce-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }",
      ".ce-callout { border: 1px solid var(--ce-border); background: transparent; border-radius: var(--ce-radius-sm); padding: 12px; }",
      ".ce-callout__title { margin: 0 0 3px; font-size: 13px; font-weight: 600; }",
      ".ce-callout__description { margin: 0; color: var(--ce-muted-fg); font-size: 12px; line-height: 1.5; }",
      ".ce-divider { height: 1px; background: var(--ce-border); border: 0; margin: 0; }",
      ".ce-model-picker, .chaton-model-picker { width: 100%; }",
      ".chaton-model-picker-row { display: flex; gap: 8px; }",
      ".chaton-model-picker-select, .chaton-model-picker-filter { width: 100%; border: 1px solid var(--ce-input); background: var(--ce-card); color: var(--ce-fg); border-radius: 8px; padding: 7px 10px; font-size: 13px; font-family: inherit; }",
      ".chaton-model-picker-toggle { display: inline-flex; align-items: center; justify-content: center; min-height: 34px; border-radius: 8px; border: 1px solid var(--ce-border); background: var(--ce-card); color: var(--ce-fg); padding: 0 12px; font-size: 13px; font-family: inherit; cursor: pointer; }",
      ".chaton-model-picker-filter-wrap { margin-top: 8px; }",

      ".ce-auto { min-height: 100vh; background: var(--ce-bg); color: var(--ce-fg); width: 100%; height: 100%; }",
      ".ce-auto-layout { display: grid; grid-template-columns: 430px 1fr; min-height: 100vh; }",

      ".ce-auto-inbox { border-right: 1px solid var(--ce-border); background: color-mix(in srgb, var(--ce-bg) 98%, white); padding: 14px 10px 20px; overflow: auto; }",
      ".ce-auto-inbox-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 6px 10px; border-bottom: 1px solid var(--ce-border); margin-bottom: 8px; }",
      ".ce-auto-title-wrap { display: inline-flex; align-items: center; gap: 8px; }",
      ".ce-auto-title { margin: 0; font-size: 27px; letter-spacing: -0.02em; font-weight: 650; }",
      ".ce-auto-new-btn { min-height: 30px; border: 1px solid var(--ce-border); border-radius: 8px; color: var(--ce-muted-fg); background: transparent; font-weight: 500; }",

      ".ce-auto-section { padding: 10px 6px 0; }",
      ".ce-auto-section-title { margin: 0 0 10px; color: var(--ce-muted-fg); font-size: 13px; font-weight: 600; }",
      ".ce-auto-list { display: grid; gap: 3px; }",
      ".ce-auto-row { width: 100%; border: 1px solid transparent; background: transparent; border-radius: 10px; text-align: left; padding: 10px 10px; cursor: pointer; color: inherit; display: grid; gap: 6px; }",
      ".ce-auto-row:hover { background: color-mix(in srgb, var(--ce-muted) 58%, transparent); border-color: color-mix(in srgb, var(--ce-border) 80%, transparent); }",
      ".ce-auto-row--active { background: color-mix(in srgb, var(--ce-muted) 76%, white); border-color: var(--ce-border); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ce-ring) 20%, transparent); }",
      ".ce-auto-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }",
      ".ce-auto-row-main { min-width: 0; display: grid; gap: 4px; }",
      ".ce-auto-row-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }",
      ".ce-auto-row-title { display: inline-block; max-width: 215px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 560; }",
      ".ce-auto-row-time { flex: 0 0 auto; color: var(--ce-muted-fg); font-size: 13px; }",
      ".ce-auto-row-meta { margin: 2px 0 0; color: var(--ce-muted-fg); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
      ".ce-auto-row-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }",
      ".ce-auto-subempty { border: 1px dashed var(--ce-border); border-radius: 8px; padding: 8px 10px; color: var(--ce-muted-fg); font-size: 12px; }",

      ".ce-auto-detail { background: color-mix(in srgb, var(--ce-bg) 99%, white); display: flex; align-items: center; justify-content: center; padding: 28px; position: relative; overflow: auto; min-width: 0; }",
      ".ce-auto-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--ce-muted-fg); }",
      ".ce-auto-empty-icon { color: color-mix(in srgb, var(--ce-fg) 82%, white); }",
      ".ce-auto-empty-title { margin: 0; font-size: 38px; font-weight: 640; letter-spacing: -0.01em; color: color-mix(in srgb, var(--ce-fg) 92%, white); }",
      ".ce-auto-empty-copy { margin: 0; max-width: 460px; text-align: center; color: var(--ce-muted-fg); font-size: 14px; line-height: 1.55; }",
      ".ce-auto-detail-card { display: none; width: 100%; max-width: 740px; min-width: 0; border: 1px solid var(--ce-border); border-radius: 14px; background: var(--ce-card); box-shadow: var(--ce-shadow-card); padding: 18px; }",
      ".ce-auto-detail-title { margin: 0; font-size: 24px; letter-spacing: -0.01em; word-break: break-word; overflow-wrap: break-word; }",
      ".ce-auto-detail-meta { margin: 6px 0 0; color: var(--ce-muted-fg); font-size: 14px; }",
      ".ce-auto-detail-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 14px 0 0; }",
      ".ce-auto-detail-body { margin: 14px 0 0; padding: 0; width: 100%; max-height: 58vh; overflow: auto; min-width: 0; }",
      ".ce-auto-status-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }",
      ".ce-auto-status-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; border: 1px solid var(--ce-border); }",
      ".ce-auto-status-pill--ok { background: color-mix(in srgb, var(--ce-success) 18%, var(--ce-card)); color: color-mix(in srgb, var(--ce-success) 76%, black); }",
      ".ce-auto-status-pill--error { background: color-mix(in srgb, var(--ce-danger) 16%, var(--ce-card)); color: color-mix(in srgb, var(--ce-danger) 78%, black); }",
      ".ce-auto-status-time { color: var(--ce-muted-fg); font-size: 12px; }",
      ".ce-auto-summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }",
      ".ce-auto-highlight-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }",
      ".ce-auto-highlight-card { border: 1px solid var(--ce-border); background: transparent; border-radius: 12px; padding: 12px; min-width: 0; }",
      ".ce-auto-highlight-label { margin: 0 0 6px; color: var(--ce-muted-fg); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }",
      ".ce-auto-highlight-value { margin: 0; color: var(--ce-fg); font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }",
      ".ce-auto-detail-grid { display: grid; gap: 8px; width: 100%; min-width: 0; }",
      ".ce-auto-kv { display: grid; gap: 3px; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--ce-border); background: transparent; min-width: 0; }",
      ".ce-auto-k { color: var(--ce-muted-fg); font-size: 12px; }",
      ".ce-auto-v { color: var(--ce-fg); font-size: 13px; word-break: break-word; overflow-wrap: break-word; min-width: 0; }",
      ".ce-auto-v--mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace; font-size: 12px; word-break: break-all; }",
      ".ce-auto-detail-section-title { margin: 14px 0 7px; color: var(--ce-muted-fg); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }",
      ".ce-auto-detail-code { display: block; margin: 0; padding: 10px; border-radius: 10px; border: 1px solid var(--ce-border); background: transparent; color: var(--ce-fg); font-size: 12px; line-height: 1.45; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace; white-space: pre-wrap; word-break: break-all; max-width: 100%; min-width: 0; }",
      ".ce-auto-request-box { border: 1px solid var(--ce-border); background: transparent; color: var(--ce-fg); border-radius: 12px; padding: 12px; font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }",
      ".ce-auto-danger-btn { color: var(--ce-danger); }",
      ".ce-auto-danger-btn:hover { background: color-mix(in srgb, var(--ce-danger) 10%, transparent); color: var(--ce-danger); }",
      ".ce-auto-error-box { border: 1px solid color-mix(in srgb, var(--ce-danger) 45%, var(--ce-border)); background: color-mix(in srgb, var(--ce-danger-soft) 70%, var(--ce-card)); color: var(--ce-danger); border-radius: 10px; padding: 10px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; max-width: 100%; min-width: 0; }",

      ".dark .ce-auto-title { color: var(--ce-fg); }",
      ".dark .ce-auto-empty-title { color: var(--ce-fg); }",

      "@media (max-width: 840px) { .ce-grid--2 { grid-template-columns: 1fr; } .ce-auto-highlight-grid { grid-template-columns: 1fr; } .ce-page { padding: 12px 16px; } .ce-page-header { flex-direction: column; align-items: stretch; } .ce-list-row { flex-direction: column; } .ce-list-row__aside { white-space: normal; } .ce-modal { padding: 16px; border-radius: 12px; } .ce-modal__inline-row { grid-template-columns: 1fr; } }",
      "@media (max-width: 1280px) { .ce-auto-layout { grid-template-columns: 380px 1fr; } .ce-auto-empty-title { font-size: 30px; } }",
      "@media (max-width: 980px) { .ce-auto-layout { grid-template-columns: 1fr; } .ce-auto-inbox { border-right: 0; border-bottom: 1px solid var(--ce-border); max-height: 52vh; } .ce-auto-detail { min-height: 48vh; } .ce-auto-empty-title { font-size: 24px; text-align: center; } }",
    ].join("\n");
    document.head.appendChild(style);
  }

  function cls() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(" ");
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function createButton(options) {
    var node = el(
      "button",
      cls(
        "ce-button",
        "ce-button--" + ((options && options.variant) || "default"),
      ),
    );
    node.type = (options && options.type) || "button";
    if (options && options.text) node.textContent = options.text;
    if (options && options.className) node.className += " " + options.className;
    if (options && options.title) node.title = options.title;
    return node;
  }

  function createBadge(options) {
    var node = el(
      "span",
      cls(
        "ce-badge",
        "ce-badge--" + ((options && options.variant) || "secondary"),
      ),
    );
    if (options && options.text) node.textContent = options.text;
    if (options && options.className) node.className += " " + options.className;
    return node;
  }

  function createCard(options) {
    var card = el("section", cls("ce-card", options && options.className));
    var body = el("div", "ce-card__body");
    card.appendChild(body);
    return { root: card, body: body };
  }

  function createField(options) {
    var wrap = el("div", cls("ce-field", options && options.className));
    if (options && options.label) {
      var label = el("label", "ce-label", options.label);
      if (options.input && options.input.id) label.htmlFor = options.input.id;
      wrap.appendChild(label);
    }
    if (options && options.input) wrap.appendChild(options.input);
    if (options && options.help)
      wrap.appendChild(el("div", "ce-help", options.help));
    return wrap;
  }

  function createSvgIcon(pathDefs, size) {
    var ns = "http://www.w3.org/2000/svg";
    var s = size || 20;
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", String(s));
    svg.setAttribute("height", String(s));
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.75");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("class", "ce-page-icon");
    pathDefs.forEach(function (d) {
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  window.chatonExtensionComponents = {
    ensureStyles: ensureStyles,
    cls: cls,
    el: el,
    createButton: createButton,
    createBadge: createBadge,
    createCard: createCard,
    createField: createField,
    createSvgIcon: createSvgIcon,
  };
})();
