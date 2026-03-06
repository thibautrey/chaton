(function () {
  var STYLE_ID = 'chaton-extension-components-style';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      ':root {',
      '  --ce-bg: hsl(220 12% 96%);',
      '  --ce-fg: hsl(222 12% 14%);',
      '  --ce-card: hsl(0 0% 100%);',
      '  --ce-card-fg: hsl(222 12% 14%);',
      '  --ce-primary: hsl(220 7% 32%);',
      '  --ce-primary-fg: hsl(0 0% 100%);',
      '  --ce-muted: hsl(220 10% 92%);',
      '  --ce-muted-fg: hsl(220 6% 44%);',
      '  --ce-accent: hsl(220 10% 93%);',
      '  --ce-accent-fg: hsl(222 12% 16%);',
      '  --ce-border: hsl(220 9% 85%);',
      '  --ce-input: hsl(220 9% 85%);',
      '  --ce-ring: hsl(220 9% 70%);',
      '  --ce-danger: hsl(0 48% 43%);',
      '  --ce-danger-soft: hsl(0 100% 97%);',
      '  --ce-success: hsl(144 45% 35%);',
      '  --ce-radius-sm: 10px;',
      '  --ce-radius-md: 14px;',
      '  --ce-radius-lg: 20px;',
      '  --ce-shadow-card: 0 16px 40px rgba(15, 23, 42, 0.08);',
      '  --ce-shadow-dialog: 0 24px 54px rgba(6, 13, 26, 0.20);',
      '  --ce-font: "SF Pro Text", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      '  color-scheme: light;',
      '}',
      ':root.dark {',
      '  --ce-bg: hsl(220 24% 10%);',
      '  --ce-fg: hsl(214 32% 93%);',
      '  --ce-card: hsl(220 22% 14%);',
      '  --ce-card-fg: hsl(214 32% 93%);',
      '  --ce-primary: hsl(214 30% 82%);',
      '  --ce-primary-fg: hsl(220 24% 12%);',
      '  --ce-muted: hsl(220 18% 18%);',
      '  --ce-muted-fg: hsl(216 18% 72%);',
      '  --ce-accent: hsl(220 18% 20%);',
      '  --ce-accent-fg: hsl(214 32% 93%);',
      '  --ce-border: hsl(220 18% 24%);',
      '  --ce-input: hsl(220 18% 24%);',
      '  --ce-ring: hsl(214 42% 70%);',
      '  --ce-danger: hsl(0 72% 70%);',
      '  --ce-danger-soft: hsl(0 30% 18%);',
      '  --ce-success: hsl(145 48% 58%);',
      '  --ce-shadow-card: 0 18px 42px rgba(2, 6, 23, 0.34);',
      '  --ce-shadow-dialog: 0 30px 64px rgba(2, 6, 23, 0.52);',
      '  color-scheme: dark;',
      '}',
      '.ce-root, .ce-root * { box-sizing: border-box; }',
      '.ce-root { color: var(--ce-fg); font-family: var(--ce-font); background: var(--ce-bg); min-height: 100vh; }',
      '.ce-page { max-width: 1040px; margin: 0 auto; padding: 24px; }',
      '.ce-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }',
      '.ce-page-title { margin: 0; font-size: clamp(32px, 5vw, 44px); font-weight: 680; letter-spacing: -0.03em; }',
      '.ce-page-description { margin: 6px 0 0; color: var(--ce-muted-fg); font-size: 15px; line-height: 1.5; max-width: 760px; }',
      '.ce-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; border-radius: 12px; border: 1px solid transparent; padding: 0 16px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background-color .15s ease, border-color .15s ease, color .15s ease, transform .15s ease; }',
      '.ce-button:hover { transform: translateY(-1px); }',
      '.ce-button:active { transform: translateY(0); }',
      '.ce-button:focus-visible, .ce-input:focus-visible, .ce-textarea:focus-visible, .ce-select:focus-visible { outline: 2px solid var(--ce-ring); outline-offset: 2px; }',
      '.ce-button:disabled { opacity: .6; cursor: not-allowed; transform: none; }',
      '.ce-button--default { background: var(--ce-primary); color: var(--ce-primary-fg); }',
      '.ce-button--default:hover { background: color-mix(in srgb, var(--ce-primary) 88%, black); }',
      '.ce-button--outline { background: var(--ce-card); color: var(--ce-fg); border-color: var(--ce-border); }',
      '.ce-button--outline:hover { background: var(--ce-accent); }',
      '.ce-button--ghost { background: transparent; color: var(--ce-muted-fg); }',
      '.ce-button--ghost:hover { background: var(--ce-accent); color: var(--ce-accent-fg); }',
      '.ce-badge { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; border-radius: 999px; padding: 0 10px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }',
      '.ce-badge--default { background: var(--ce-primary); color: var(--ce-primary-fg); }',
      '.ce-badge--secondary { background: var(--ce-muted); color: var(--ce-muted-fg); }',
      '.ce-badge--outline { background: transparent; color: var(--ce-fg); border-color: var(--ce-border); }',
      '.ce-card { background: color-mix(in srgb, var(--ce-card) 82%, transparent); border: 1px solid color-mix(in srgb, var(--ce-border) 70%, transparent); box-shadow: var(--ce-shadow-card); backdrop-filter: blur(18px); border-radius: var(--ce-radius-lg); }',
      '.ce-card__body { padding: 20px; }',
      '.ce-grid { display: grid; gap: 16px; }',
      '.ce-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
      '.ce-stack { display: grid; gap: 12px; }',
      '.ce-section-title { margin: 0 0 6px; font-size: 18px; font-weight: 650; letter-spacing: -0.02em; }',
      '.ce-section-copy { margin: 0; color: var(--ce-muted-fg); font-size: 14px; line-height: 1.5; }',
      '.ce-list { display: grid; gap: 10px; }',
      '.ce-list-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border: 1px solid var(--ce-border); background: color-mix(in srgb, var(--ce-card) 70%, transparent); border-radius: 16px; padding: 14px 16px; }',
      '.ce-list-row__main { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }',
      '.ce-list-row__content { min-width: 0; }',
      '.ce-list-row__title { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.01em; }',
      '.ce-list-row__meta { margin: 4px 0 0; color: var(--ce-muted-fg); font-size: 13px; line-height: 1.45; }',
      '.ce-list-row__aside { color: var(--ce-muted-fg); font-size: 13px; white-space: nowrap; }',
      '.ce-dot { width: 10px; height: 10px; border-radius: 999px; margin-top: 5px; background: var(--ce-muted-fg); flex: 0 0 auto; }',
      '.ce-dot--success { background: var(--ce-success); }',
      '.ce-dot--danger { background: var(--ce-danger); }',
      '.ce-empty { border: 1px dashed var(--ce-border); border-radius: 16px; padding: 18px; color: var(--ce-muted-fg); background: color-mix(in srgb, var(--ce-card) 50%, transparent); }',
      '.ce-field { display: grid; gap: 6px; min-width: 0; }',
      '.ce-label { font-size: 13px; font-weight: 650; color: var(--ce-fg); }',
      '.ce-input, .ce-textarea, .ce-select { width: 100%; border: 1px solid var(--ce-input); background: var(--ce-card); color: var(--ce-fg); border-radius: 12px; padding: 10px 12px; font: inherit; }',
      '.ce-textarea { min-height: 96px; resize: vertical; }',
      '.ce-help { color: var(--ce-muted-fg); font-size: 12px; line-height: 1.4; }',
      '.ce-inline { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
      '.ce-modal-backdrop { position: fixed; inset: 0; background: color-mix(in srgb, var(--ce-bg) 40%, black 30%); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; padding: 24px; z-index: 999; }',
      '.ce-modal-backdrop.is-open { display: flex; }',
      '.ce-modal { width: min(1040px, 100%); max-height: calc(100vh - 48px); overflow: auto; background: linear-gradient(180deg, color-mix(in srgb, var(--ce-card) 96%, transparent), color-mix(in srgb, var(--ce-bg) 96%, transparent)); border: 1px solid color-mix(in srgb, var(--ce-border) 72%, transparent); box-shadow: var(--ce-shadow-dialog); border-radius: 24px; padding: 22px; }',
      '.ce-modal__header { display: grid; gap: 6px; margin-bottom: 16px; }',
      '.ce-modal__title { margin: 0; font-size: clamp(28px, 5vw, 40px); font-weight: 680; letter-spacing: -0.03em; }',
      '.ce-modal__description { margin: 0; color: var(--ce-muted-fg); font-size: 15px; line-height: 1.5; }',
      '.ce-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }',
      '.ce-callout { border: 1px solid color-mix(in srgb, var(--ce-ring) 55%, var(--ce-border)); background: color-mix(in srgb, var(--ce-accent) 72%, var(--ce-card)); border-radius: 16px; padding: 14px; }',
      '.ce-callout__title { margin: 0 0 4px; font-size: 14px; font-weight: 650; }',
      '.ce-callout__description { margin: 0; color: var(--ce-muted-fg); font-size: 13px; line-height: 1.5; }',
      '.ce-divider { height: 1px; background: var(--ce-border); border: 0; margin: 0; }',
      '.ce-model-picker, .chaton-model-picker { width: 100%; }',
      '.chaton-model-picker-row { display: flex; gap: 8px; }',
      '.chaton-model-picker-select, .chaton-model-picker-filter { width: 100%; border: 1px solid var(--ce-input); background: var(--ce-card); color: var(--ce-fg); border-radius: 12px; padding: 10px 12px; font: inherit; }',
      '.chaton-model-picker-toggle { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; border-radius: 12px; border: 1px solid var(--ce-border); background: var(--ce-card); color: var(--ce-fg); padding: 0 14px; font: inherit; cursor: pointer; }',
      '.chaton-model-picker-filter-wrap { margin-top: 8px; }',
      '@media (max-width: 840px) { .ce-grid--2 { grid-template-columns: 1fr; } .ce-page { padding: 16px; } .ce-page-header { flex-direction: column; align-items: stretch; } .ce-list-row { flex-direction: column; } .ce-list-row__aside { white-space: normal; } .ce-modal { padding: 16px; border-radius: 18px; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function cls() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function createButton(options) {
    var node = el('button', cls('ce-button', 'ce-button--' + (options && options.variant || 'default')));
    node.type = options && options.type || 'button';
    if (options && options.text) node.textContent = options.text;
    if (options && options.className) node.className += ' ' + options.className;
    if (options && options.title) node.title = options.title;
    return node;
  }

  function createBadge(options) {
    var node = el('span', cls('ce-badge', 'ce-badge--' + (options && options.variant || 'secondary')));
    if (options && options.text) node.textContent = options.text;
    if (options && options.className) node.className += ' ' + options.className;
    return node;
  }

  function createCard(options) {
    var card = el('section', cls('ce-card', options && options.className));
    var body = el('div', 'ce-card__body');
    card.appendChild(body);
    return { root: card, body: body };
  }

  function createField(options) {
    var wrap = el('div', cls('ce-field', options && options.className));
    if (options && options.label) {
      var label = el('label', 'ce-label', options.label);
      if (options.input && options.input.id) label.htmlFor = options.input.id;
      wrap.appendChild(label);
    }
    if (options && options.input) wrap.appendChild(options.input);
    if (options && options.help) wrap.appendChild(el('div', 'ce-help', options.help));
    return wrap;
  }

  window.chatonExtensionComponents = {
    ensureStyles: ensureStyles,
    cls: cls,
    el: el,
    createButton: createButton,
    createBadge: createBadge,
    createCard: createCard,
    createField: createField,
  };
})();
