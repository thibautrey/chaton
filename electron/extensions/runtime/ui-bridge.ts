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
      '}',
      '.chaton-model-picker { width: 100%; }',
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
    return { cls: cls, el: el, createButton: createButton, createBadge: createBadge, ensureStyles: ensureExtensionUiStyles };
  }

  window.chatonUi = Object.assign({}, window.chatonUi || {}, {
    ensureStyles: ensureExtensionUiStyles,
    createButton: createButton,
    createModelPicker: createModelPicker,
    createComponents: createExtensionComponents,
  });

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
  });
})();
`
