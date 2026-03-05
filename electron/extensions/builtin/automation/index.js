(function () {
  var EXTENSION_ID = '@chaton/automation';
  var MODEL_KEY = 'dashboard:automation-model';

  var modalBg = document.getElementById('modalBg');
  var rulesEl = document.getElementById('rules');
  var runsEl = document.getElementById('runs');

  var nameInput = document.getElementById('name');
  var projectSelect = document.getElementById('project');
  var modelSelect = document.getElementById('model');
  var triggerSelect = document.getElementById('trigger');
  var actionTypeSelect = document.getElementById('actionType');
  var cooldownInput = document.getElementById('cooldown');
  var requestInput = document.getElementById('request');
  var instructionInput = document.getElementById('instruction');

  var allModels = [];
  var showAllModels = false;

  function nowRel(iso) {
    var ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return 'Date inconnue';
    var h = Math.floor((Date.now() - ts) / 3600000);
    if (h < 1) return 'À l\'instant';
    if (h < 24) return h + ' h';
    return Math.floor(h / 24) + ' j';
  }

  function call(api, payload) {
    return window.chaton.extensionCall('chatons-ui', EXTENSION_ID, api, '^1.0.0', payload);
  }

  function mapPlan(text, projects) {
    var t = String(text || '').trim();
    var low = t.toLowerCase();

    var trigger = 'conversation.created';
    if (low.includes('message')) trigger = 'conversation.message.received';
    if (low.includes('projet')) trigger = 'project.created';
    if (low.includes('fin') || low.includes('termin')) trigger = 'conversation.agent.ended';

    var action = 'notify';
    if (low.includes('enqueue') || low.includes('queue') || low.includes('event')) action = 'enqueueEvent';
    if (low.includes('ouvrir') || low.includes('open')) action = 'runHostCommand';

    var cooldown = 0;
    var m = low.match(/(\d+)\s*(min|minute|minutes)/);
    if (m) cooldown = Number(m[1]) * 60000;
    m = low.match(/(\d+)\s*(h|heure|heures)/);
    if (m) cooldown = Number(m[1]) * 3600000;

    var projectId = '';
    (projects || []).some(function (p) {
      var hit = low.includes(String(p.name || '').toLowerCase()) || low.includes(String(p.repoName || '').toLowerCase());
      if (hit) projectId = p.id;
      return hit;
    });

    return {
      name: t || 'Nouvelle automatisation',
      trigger: trigger,
      action: action,
      cooldown: cooldown,
      projectId: projectId,
    };
  }

  function notify(message) {
    if (!message) return;
    if (window.chaton && typeof window.chaton.extensionHostCall === 'function') {
      void window.chaton.extensionHostCall(EXTENSION_ID, 'notifications.notify', {
        title: 'Automatisations',
        body: message,
      });
    }
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function appendEmpty(node, text) {
    clearChildren(node);
    node.appendChild(el('div', 'empty', text));
  }

  function refreshModelSelect() {
    var scoped = allModels.filter(function (m) { return m.scoped; });
    var list = showAllModels ? allModels : scoped;
    clearChildren(modelSelect);

    if (!list.length) {
      var none = document.createElement('option');
      none.value = '';
      none.textContent = showAllModels ? 'Aucun modèle disponible' : 'Aucun modèle scoped';
      modelSelect.appendChild(none);
      return;
    }

    list.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m.key;
      opt.textContent = m.id + ' (' + m.provider + ')' + (showAllModels ? (m.scoped ? ' ★' : '') : '');
      modelSelect.appendChild(opt);
    });

    var saved = localStorage.getItem(MODEL_KEY);
    var fallback = list[0].key;
    var picked = saved && list.some(function (m) { return m.key === saved; }) ? saved : fallback;
    modelSelect.value = picked;
    localStorage.setItem(MODEL_KEY, picked);
  }

  async function loadModels() {
    var res = await window.chaton.listPiModels();
    if (!res.ok) return;
    allModels = res.models || [];
    refreshModelSelect();
  }

  function renderRule(rule) {
    var row = el('article', 'row');
    var left = el('div', 'left');
    var dot = el('span', 'dot');
    var copy = el('div', 'copy');
    var title = el('p', 'title', rule.name || 'Sans nom');
    var sub = el('p', 'sub', rule.trigger || 'Trigger inconnu');
    var when = el('div', 'when', 'Mis à jour ' + nowRel(rule.updatedAt));

    copy.appendChild(title);
    copy.appendChild(sub);
    left.appendChild(dot);
    left.appendChild(copy);

    row.appendChild(left);
    row.appendChild(when);

    row.title = 'Double-clic pour supprimer cette automatisation';
    row.addEventListener('dblclick', async function () {
      await call('automation.rules.delete', { id: rule.id });
      await load();
    });

    return row;
  }

  function renderRun(run, rulesById) {
    var row = el('article', 'row');
    var left = el('div', 'left');
    var dot = el('span', run.status === 'error' ? 'dot dot-error' : 'dot dot-ok');
    var copy = el('div', 'copy');
    var rule = rulesById[run.ruleId];

    var title = el('p', 'title title-run', rule ? rule.name : 'Automatisation inconnue');
    var sub = el('p', 'sub', run.eventTopic || 'Event inconnu');

    copy.appendChild(title);
    copy.appendChild(sub);
    if (run.errorMessage) {
      copy.appendChild(el('p', 'sub sub-error', run.errorMessage));
    }

    left.appendChild(dot);
    left.appendChild(copy);
    row.appendChild(left);
    row.appendChild(el('div', 'when', nowRel(run.createdAt)));

    return row;
  }

  async function load() {
    var rulesRes = await call('automation.rules.list', {});
    var runsRes = await call('automation.runs.list', { limit: 80 });
    var state = await window.chaton.getInitialState();

    clearChildren(projectSelect);
    projectSelect.appendChild(el('option', '', 'Tous les projets'));
    projectSelect.firstChild.value = '';
    (state.projects || []).forEach(function (p) {
      var o = el('option', '', p.name || p.repoName || 'Projet');
      o.value = p.id;
      projectSelect.appendChild(o);
    });

    var rules = rulesRes.ok ? (rulesRes.data || []) : [];
    var runs = runsRes.ok ? (runsRes.data || []) : [];

    if (!rules.length) {
      appendEmpty(rulesEl, 'Aucune automatisation programmée.');
    } else {
      clearChildren(rulesEl);
      rules.forEach(function (rule) { rulesEl.appendChild(renderRule(rule)); });
    }

    var byId = {};
    rules.forEach(function (r) { byId[r.id] = r; });

    if (!runs.length) {
      appendEmpty(runsEl, 'Aucune exécution récente.');
    } else {
      clearChildren(runsEl);
      runs.forEach(function (run) { runsEl.appendChild(renderRun(run, byId)); });
    }
  }

  function openModal() {
    modalBg.classList.add('open');
    nameInput.focus();
  }

  function closeModal() {
    modalBg.classList.remove('open');
  }

  document.getElementById('newBtn').addEventListener('click', openModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  modalBg.addEventListener('click', function (event) {
    if (event.target === modalBg) closeModal();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && modalBg.classList.contains('open')) {
      closeModal();
    }
  });

  document.getElementById('moreModels').addEventListener('click', function () {
    showAllModels = !showAllModels;
    this.textContent = showAllModels ? 'scoped only' : 'more';
    refreshModelSelect();
  });

  modelSelect.addEventListener('change', function () {
    if (modelSelect.value) localStorage.setItem(MODEL_KEY, modelSelect.value);
  });

  document.getElementById('fillBtn').addEventListener('click', async function () {
    var state = await window.chaton.getInitialState();
    var plan = mapPlan(instructionInput.value, state.projects || []);
    nameInput.value = plan.name;
    triggerSelect.value = plan.trigger;
    actionTypeSelect.value = plan.action;
    cooldownInput.value = String(plan.cooldown);
    if (plan.projectId) projectSelect.value = plan.projectId;
    if (!requestInput.value.trim()) requestInput.value = instructionInput.value.trim();
    notify('Pré-remplissage IA appliqué.');
  });

  document.getElementById('createBtn').addEventListener('click', async function () {
    var name = nameInput.value.trim();
    if (!name) {
      notify('Nom d\'automatisation requis');
      nameInput.focus();
      return;
    }

    var trigger = triggerSelect.value;
    var actionType = actionTypeSelect.value;
    var action;

    if (actionType === 'notify') {
      action = {
        type: 'notify',
        title: 'Automation: ' + name,
        body: requestInput.value.trim() || ('Trigger ' + trigger),
      };
    } else if (actionType === 'enqueueEvent') {
      action = { type: 'enqueueEvent', topic: 'automation.' + trigger };
    } else {
      action = { type: 'runHostCommand', method: 'open.mainView', params: { viewId: 'automation.main' } };
    }

    action.model = modelSelect.value || null;
    if (projectSelect.value) action.projectId = projectSelect.value;

    var res = await call('automation.rules.save', {
      name: name,
      trigger: trigger,
      enabled: true,
      conditions: [],
      actions: [action],
      cooldown: Math.max(0, Number(cooldownInput.value) || 0),
    });

    if (!res.ok) {
      notify((res.error && res.error.message) || 'Impossible de créer la règle');
      return;
    }

    closeModal();
    nameInput.value = '';
    requestInput.value = '';
    instructionInput.value = '';
    cooldownInput.value = '0';
    await load();
  });

  loadModels().then(load);
})();
