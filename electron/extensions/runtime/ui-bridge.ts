export const EXTENSION_UI_BRIDGE_SCRIPT = `
(function () {
  function normalize(value) { return String(value || '').trim().toLowerCase(); }

  function ensureExtensionUiStyles() {
    if (document.getElementById('chaton-extension-ui-style')) return;
    var style = document.createElement('style');
    style.id = 'chaton-extension-ui-style';
    style.textContent = [
      ':root {',
      '  --chaton-ui-background: hsl(220 12% 96%);',
      '  --chaton-ui-foreground: hsl(222 12% 14%);',
      '  --chaton-ui-card: hsl(0 0% 100%);',
      '  --chaton-ui-primary: hsl(220 7% 32%);',
      '  --chaton-ui-primary-foreground: hsl(0 0% 100%);',
      '  --chaton-ui-muted: hsl(220 10% 92%);',
      '  --chaton-ui-muted-foreground: hsl(220 6% 44%);',
      '  --chaton-ui-accent: hsl(220 10% 93%);',
      '  --chaton-ui-accent-foreground: hsl(222 12% 16%);',
      '  --chaton-ui-border: hsl(220 9% 85%);',
      '  --chaton-ui-input: hsl(220 9% 85%);',
      '  --chaton-ui-ring: hsl(220 9% 70%);',
      '  --ce-fg: hsl(222 12% 14%);',
      '  --ce-muted: hsl(220 6% 44%);',
      '  --ce-border: hsl(220 9% 85%);',
      '  --ce-card-bg: hsl(0 0% 100%);',
      '  --ce-input-bg: hsl(0 0% 100%);',
      '}',
      /* Page layout */
      'body { margin: 0; font-family: inherit; background: var(--chaton-ui-background); color: var(--ce-fg); font-size: 14px; }',
      '.ce-page { padding: 24px; max-width: 720px; margin: 0 auto; }',
      '.ce-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 24px; }',
      '.ce-page-title-group { flex: 1; }',
      '.ce-page-title { margin: 0 0 4px; font-size: 20px; font-weight: 600; }',
      '.ce-page-description { margin: 0; color: var(--ce-muted); font-size: 13px; }',
      /* Card */
      '.ce-card { background: var(--ce-card-bg); border: 1px solid var(--ce-border); border-radius: 12px; margin-bottom: 16px; overflow: hidden; }',
      '.ce-card__body { padding: 16px 20px; }',
      /* Section headings */
      '.ce-section-title { margin: 0 0 12px; font-size: 15px; font-weight: 600; }',
      '.ce-section-copy { font-size: 12px; color: var(--ce-muted); text-transform: uppercase; letter-spacing: .04em; }',
      /* Grid */
      '.ce-grid { display: grid; gap: 12px; margin-bottom: 16px; }',
      '.ce-grid--2 { grid-template-columns: repeat(2, 1fr); }',
      '.ce-grid--3 { grid-template-columns: repeat(3, 1fr); }',
      /* Form fields */
      '.ce-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }',
      '.ce-label { font-size: 13px; font-weight: 500; color: var(--ce-fg); }',
      '.ce-help { font-size: 12px; color: var(--ce-muted); }',
      '.ce-field input, .ce-field textarea, .ce-field select { width: 100%; box-sizing: border-box; border: 1px solid var(--ce-border); background: var(--ce-input-bg); color: var(--ce-fg); border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px; }',
      '.ce-field input:focus, .ce-field textarea:focus, .ce-field select:focus { outline: 2px solid var(--chaton-ui-ring); outline-offset: 2px; }',
      /* Toolbar */
      '.ce-toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }',
      /* List rows */
      '.ce-list { display: flex; flex-direction: column; gap: 2px; }',
      '.ce-list-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--ce-border); }',
      '.ce-list-row:last-child { border-bottom: none; }',
      '.ce-list-row__main { flex: 1; min-width: 0; }',
      '.ce-list-row__content { display: flex; flex-direction: column; gap: 2px; }',
      '.ce-list-row__title { font-weight: 500; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.ce-list-row__meta { font-size: 12px; color: var(--ce-muted); }',
      /* Empty state */
      '.ce-empty { padding: 24px; text-align: center; color: var(--ce-muted); font-size: 13px; }',
      /* Badge */
      '.chaton-ui-badge { display: inline-flex; align-items: center; border-radius: 9999px; padding: 2px 10px; font-size: 12px; font-weight: 500; }',
      '.chaton-ui-badge--default { background: var(--chaton-ui-primary); color: var(--chaton-ui-primary-foreground); }',
      '.chaton-ui-badge--secondary { background: var(--chaton-ui-muted); color: var(--chaton-ui-muted-foreground); }',
      '.chaton-ui-badge--destructive { background: hsl(0 72% 51%); color: #fff; }',
      /* Buttons */
      '.chaton-ui-button { display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--ce-border); background: var(--ce-card-bg); color: var(--ce-fg); padding: 7px 14px; font: inherit; font-size: 13px; cursor: pointer; }',
      '.chaton-ui-button:hover { background: var(--chaton-ui-accent); }',
      '.chaton-ui-button--primary { background: var(--chaton-ui-primary); color: var(--chaton-ui-primary-foreground); border-color: var(--chaton-ui-primary); }',
      '.chaton-ui-button--primary:hover { opacity: .9; }',
      '.chaton-ui-button--destructive { background: hsl(0 72% 51%); color: #fff; border-color: hsl(0 72% 51%); }',
      '.chaton-ui-button--destructive:hover { opacity: .9; }',
      /* Dark mode overrides — mirrors the OS colour scheme the host app also follows */
      '@media (prefers-color-scheme: dark) {',
      '  :root {',
      '    --chaton-ui-background: hsl(222 14% 12%);',
      '    --chaton-ui-foreground: hsl(210 20% 90%);',
      '    --chaton-ui-card: hsl(222 13% 17%);',
      '    --chaton-ui-primary: hsl(210 15% 60%);',
      '    --chaton-ui-primary-foreground: hsl(222 14% 10%);',
      '    --chaton-ui-muted: hsl(222 12% 22%);',
      '    --chaton-ui-muted-foreground: hsl(215 10% 55%);',
      '    --chaton-ui-accent: hsl(222 12% 22%);',
      '    --chaton-ui-accent-foreground: hsl(210 20% 90%);',
      '    --chaton-ui-border: hsl(222 10% 24%);',
      '    --chaton-ui-input: hsl(222 10% 24%);',
      '    --chaton-ui-ring: hsl(215 10% 40%);',
      '    --ce-fg: hsl(210 20% 90%);',
      '    --ce-muted: hsl(215 10% 55%);',
      '    --ce-border: hsl(222 10% 24%);',
      '    --ce-card-bg: hsl(222 13% 17%);',
      '    --ce-input-bg: hsl(222 12% 20%);',
      '  }',
      '  body { background: hsl(222 14% 12%); }',
      '}',
      '.chaton-model-picker-row { display: flex; gap: 8px; }',
      '.chaton-model-picker-select, .chaton-model-picker-filter { width: 100%; border: 1px solid var(--chaton-ui-input); background: var(--chaton-ui-card); color: var(--chaton-ui-foreground); border-radius: 12px; padding: 10px 12px; font: inherit; }',
      '.chaton-model-picker-toggle { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; border-radius: 12px; border: 1px solid var(--chaton-ui-border); background: var(--chaton-ui-card); color: var(--chaton-ui-foreground); padding: 0 14px; font: inherit; cursor: pointer; }',
      '.chaton-model-picker-toggle:hover { background: var(--chaton-ui-accent); color: var(--chaton-ui-accent-foreground); }',
      '.chaton-model-picker-filter-wrap { margin-top: 8px; }',
      '.chaton-model-picker-select:focus-visible, .chaton-model-picker-filter:focus-visible, .chaton-model-picker-toggle:focus-visible { outline: 2px solid var(--chaton-ui-ring); outline-offset: 2px; }'
    ].join('\\n');
    document.head.appendChild(style);
  }

  function createButton(options) {
    ensureExtensionUiStyles();
    var button = document.createElement('button');
    button.type = options && options.type || 'button';
    button.className = 'chaton-ui-button chaton-ui-button--' + ((options && options.variant) || 'default');
    button.textContent = options && options.text || '';
    return button;
  }

  function createModelPicker(options) {
    ensureExtensionUiStyles();
    var host = options && options.host;
    if (!host || !host.appendChild) throw new Error('createModelPicker requires a host HTMLElement');
    var labels = Object.assign({
      filterPlaceholder: 'Filter models...',
      more: 'more',
      scopedOnly: 'scoped only',
      noScoped: 'No scoped models',
      noModels: 'No models'
    }, (options && options.labels) || {});
    var root = document.createElement('div');
    root.className = 'chaton-model-picker';
    var row = document.createElement('div');
    row.className = 'chaton-model-picker-row';
    var select = document.createElement('select');
    select.className = 'chaton-model-picker-select';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'chaton-model-picker-toggle';
    toggle.textContent = labels.more;
    row.appendChild(select);
    row.appendChild(toggle);
    var filterWrap = document.createElement('div');
    filterWrap.className = 'chaton-model-picker-filter-wrap';
    filterWrap.style.display = 'none';
    var filter = document.createElement('input');
    filter.className = 'chaton-model-picker-filter';
    filter.type = 'text';
    filter.placeholder = labels.filterPlaceholder;
    filterWrap.appendChild(filter);
    root.appendChild(row);
    root.appendChild(filterWrap);
    host.appendChild(root);
    var models = [];
    var selectedKey = null;
    var showAll = false;
    function render() {
      var needle = normalize(filter.value);
      var base = showAll ? models : models.filter(function (m) { return Boolean(m && m.scoped); });
      var visible = needle ? base.filter(function (m) {
        return normalize((m.id || '') + ' ' + (m.provider || '') + ' ' + (m.key || '')).includes(needle);
      }) : base;
      select.innerHTML = '';
      if (!visible.length) {
        var none = document.createElement('option');
        none.value = '';
        none.textContent = showAll ? labels.noModels : labels.noScoped;
        select.appendChild(none);
        select.disabled = true;
        selectedKey = null;
        return;
      }
      visible.forEach(function (model) {
        var opt = document.createElement('option');
        opt.value = model.key;
        opt.textContent = model.id + ' (' + model.provider + ')';
        select.appendChild(opt);
      });
      select.disabled = false;
      var fallback = visible[0] ? visible[0].key : null;
      var nextSelected = selectedKey && visible.some(function (m) { return m.key === selectedKey; })
        ? selectedKey
        : fallback;
      if (nextSelected) {
        selectedKey = nextSelected;
        select.value = nextSelected;
      }
    }
    toggle.addEventListener('click', function () {
      showAll = !showAll;
      filterWrap.style.display = showAll ? 'block' : 'none';
      toggle.textContent = showAll ? labels.scopedOnly : labels.more;
      render();
    });
    filter.addEventListener('input', render);
    select.addEventListener('change', function () {
      if (!select.value) return;
      selectedKey = select.value;
      if (options && typeof options.onChange === 'function') options.onChange(select.value);
    });
    return {
      setModels: function (nextModels) {
        models = Array.isArray(nextModels) ? nextModels.slice() : [];
        render();
      },
      setSelected: function (modelKey) {
        selectedKey = modelKey || null;
        render();
      },
      getSelected: function () { return selectedKey; },
      destroy: function () { root.remove(); }
    };
  }

  function createExtensionComponents() {
    ensureExtensionUiStyles();
    function cls() {
      return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
    }
    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (typeof text === 'string') node.textContent = text;
      return node;
    }
    function createBadge(options) {
      var node = el('span', cls('chaton-ui-badge', 'chaton-ui-badge--' + ((options && options.variant) || 'secondary')));
      node.textContent = options && options.text || '';
      return node;
    }
    // Returns { root, body } — a styled card container
    function createCard() {
      var root = el('div', 'ce-card');
      var body = el('div', 'ce-card__body');
      root.appendChild(body);
      return { root: root, body: body };
    }
    // Returns a labelled form field wrapper containing the provided input element
    function createField(options) {
      var wrap = el('div', 'ce-field');
      if (options && options.label) wrap.appendChild(el('label', 'ce-label', options.label));
      if (options && options.input) wrap.appendChild(options.input);
      if (options && options.help) wrap.appendChild(el('div', 'ce-help', options.help));
      return wrap;
    }
    return { cls: cls, el: el, createButton: createButton, createBadge: createBadge, createCard: createCard, createField: createField, ensureStyles: ensureExtensionUiStyles };
  }

  window.chatonUi = Object.assign({}, window.chatonUi || {}, {
    ensureStyles: ensureExtensionUiStyles,
    createButton: createButton,
    createModelPicker: createModelPicker,
    createComponents: createExtensionComponents,
  });

  // Pre-initialize the component library as a global so extensions can use
  // window.chatonExtensionComponents directly without calling createComponents().
  window.chatonExtensionComponents = createExtensionComponents();

  function registerExtensionServer(payload) {
    try {
      if (!payload || typeof payload !== 'object') return { ok: false, message: 'invalid payload' };
      var id = typeof payload.extensionId === 'string' ? payload.extensionId.trim() : '';
      if (!id) return { ok: false, message: 'extensionId is required' };
      if (!payload.command || typeof payload.command !== 'string') return { ok: false, message: 'command is required' };
      var hostBridge = typeof window.__chatonRegisterExtensionServer === 'function'
        ? window.__chatonRegisterExtensionServer
        : null;
      if (!hostBridge) return { ok: false, message: 'host bridge not available' };
      return hostBridge({
        extensionId: id,
        command: payload.command,
        args: Array.isArray(payload.args) ? payload.args : undefined,
        cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
        env: typeof payload.env === 'object' && payload.env !== null ? payload.env : undefined,
        readyUrl: typeof payload.readyUrl === 'string' ? payload.readyUrl : undefined,
        healthUrl: typeof payload.healthUrl === 'string' ? payload.healthUrl : undefined,
        expectExit: payload.expectExit === true,
        startTimeoutMs: typeof payload.startTimeoutMs === 'number' ? payload.startTimeoutMs : undefined,
        readyTimeoutMs: typeof payload.readyTimeoutMs === 'number' ? payload.readyTimeoutMs : undefined,
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  var parentChaton = null;
  try {
    if (window.parent && window.parent !== window && window.parent.chaton) {
      parentChaton = window.parent.chaton;
    }
  } catch (_error) {
    parentChaton = null;
  }

  window.chaton = Object.assign({}, parentChaton || {}, window.chaton || {}, {
    registerExtensionServerFromUi: registerExtensionServer,
    requirementSheet: {
      // Confirm: signals that the user completed all required actions
      confirm: function() {
        window.parent.postMessage({ type: 'chaton:requirement-sheet:confirm' }, '*');
      },
      // Dismiss: signals that the user cancelled
      dismiss: function() {
        window.parent.postMessage({ type: 'chaton:requirement-sheet:dismiss' }, '*');
      },
      // Open settings: navigates to settings and dismisses the sheet
      openSettings: function() {
        window.parent.postMessage({ type: 'chaton:requirement-sheet:open-settings' }, '*');
      },
    },
  });

  // Initialize window.chatonExtension with SDK APIs
  if (!window.chatonExtension) {
    window.chatonExtension = {};
  }
  if (!window.chatonExtension.api) {
    window.chatonExtension.api = {};
  }
  if (!window.chatonExtension.api.host) {
    window.chatonExtension.api.host = {};
  }
  if (!window.chatonExtension.api.host.channels) {
    window.chatonExtension.api.host.channels = {};
  }

  // Provide channels.reportStatus to extensions
  window.chatonExtension.api.host.channels.reportStatus = function(status) {
    if (!window.chaton || typeof window.chaton.extensionHostCall !== 'function') {
      return Promise.reject(new Error('host bridge not available'));
    }
    return window.chaton.extensionHostCall('channels.reportStatus', {
      configured: status && status.configured === true,
      connected: status && status.connected === true,
      lastActivity: status && typeof status.lastActivity === 'string' ? status.lastActivity : null,
      issues: status && Array.isArray(status.issues) ? status.issues : undefined,
      info: status && typeof status.info === 'string' ? status.info : null,
    });
  };
})();
`