(function () {
  var EXTENSION_ID = '@chaton/automation';
  var MODEL_KEY = 'dashboard:automation-model';
  var ui = window.chatonExtensionComponents;

  if (!ui) {
    throw new Error('chatonExtensionComponents is required');
  }

  ui.ensureStyles();

  function syncThemeClass() {
    var root = document.documentElement;
    if (!root) return;
    root.classList.toggle('dark', !!(window.parent && window.parent.document && window.parent.document.documentElement && window.parent.document.documentElement.classList.contains('dark')));
  }

  syncThemeClass();
  if (window.matchMedia) {
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', syncThemeClass);
    } else if (typeof media.addListener === 'function') {
      media.addListener(syncThemeClass);
    }
  }

  var app = document.getElementById('app');
  var state = {
    rules: [],
    runs: [],
    projects: [],
    allModels: [],
    modelPicker: null,
  };

  function nowRel(iso) {
    var ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return 'Date inconnue';
    var h = Math.floor((Date.now() - ts) / 3600000);
    if (h < 1) return 'A l\'instant';
    if (h < 24) return h + ' h';
    return Math.floor(h / 24) + ' j';
  }

  function call(api, payload) {
    return window.chaton.extensionCall('chatons-ui', EXTENSION_ID, api, '^1.0.0', payload);
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

  function buildShell() {
    clearChildren(app);

    var page = ui.el('div', 'ce-page');
    var header = ui.el('header', 'ce-page-header');
    var titleWrap = ui.el('div', '');
    var title = ui.el('h1', 'ce-page-title', 'Automatisations');
    var desc = ui.el('p', 'ce-page-description', 'Bibliotheque UI comprise: cette vue utilise maintenant les composants communs d\'extension pour rester coherente avec Chatons tout en laissant aux extensions leur liberte de composition.');
    titleWrap.appendChild(title);
    titleWrap.appendChild(desc);

    var createButton = ui.createButton({ text: 'Nouvelle automatisation', variant: 'default' });
    createButton.id = 'newBtn';

    header.appendChild(titleWrap);
    header.appendChild(createButton);
    page.appendChild(header);

    var topGrid = ui.el('div', 'ce-grid ce-grid--2');

    var rulesCard = ui.createCard();
    var rulesHead = ui.el('div', 'ce-stack');
    rulesHead.appendChild(ui.createBadge({ text: 'Programmees', variant: 'secondary' }));
    rulesHead.appendChild(ui.el('h2', 'ce-section-title', 'Regles actives'));
    rulesHead.appendChild(ui.el('p', 'ce-section-copy', 'Double-cliquez sur une regle pour la supprimer. Les cartes utilisent le meme langage visuel que l\'application.'));
    var rulesList = ui.el('div', 'ce-list');
    rulesList.id = 'rules';
    rulesCard.body.appendChild(rulesHead);
    rulesCard.body.appendChild(ui.el('div', 'ce-stack'));
    rulesCard.body.appendChild(rulesList);

    var runsCard = ui.createCard();
    var runsHead = ui.el('div', 'ce-stack');
    runsHead.appendChild(ui.createBadge({ text: 'Historique', variant: 'outline' }));
    runsHead.appendChild(ui.el('h2', 'ce-section-title', 'Dernieres executions'));
    runsHead.appendChild(ui.el('p', 'ce-section-copy', 'Suivez les executions recentes de vos automatisations et detectez rapidement les erreurs.'));
    var runsList = ui.el('div', 'ce-list');
    runsList.id = 'runs';
    runsCard.body.appendChild(runsHead);
    runsCard.body.appendChild(ui.el('div', 'ce-stack'));
    runsCard.body.appendChild(runsList);

    topGrid.appendChild(rulesCard.root);
    topGrid.appendChild(runsCard.root);
    page.appendChild(topGrid);

    var modalBg = ui.el('div', 'ce-modal-backdrop');
    modalBg.id = 'modalBg';
    modalBg.setAttribute('role', 'dialog');
    modalBg.setAttribute('aria-modal', 'true');
    modalBg.setAttribute('aria-labelledby', 'modalTitle');

    var modal = ui.el('div', 'ce-modal');
    var modalHeader = ui.el('div', 'ce-modal__header');
    var modalTitle = ui.el('h3', 'ce-modal__title', 'Creer une automatisation');
    modalTitle.id = 'modalTitle';
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(ui.el('p', 'ce-modal__description', 'Decrivez le besoin, laissez l\'assistant pre-remplir les champs, puis ajustez les reglages avant validation.'));

    var assist = ui.el('section', 'ce-callout ce-stack');
    assist.appendChild(ui.el('p', 'ce-callout__title', 'Assistant de pre-remplissage'));
    assist.appendChild(ui.el('p', 'ce-callout__description', 'Le formulaire utilise vos instructions pour proposer un declencheur, une action et un cooldown initial.'));

    var instructionInput = ui.el('textarea', 'ce-textarea');
    instructionInput.id = 'instruction';
    instructionInput.placeholder = 'Ex: Chaque lundi verifier les conversations Pixatwin et me notifier';
    assist.appendChild(ui.createField({ label: 'Instructions', input: instructionInput }));
    var assistActions = ui.el('div', 'ce-toolbar');
    var fillBtn = ui.createButton({ text: 'Pre-remplir via IA', variant: 'outline' });
    fillBtn.id = 'fillBtn';
    assistActions.appendChild(fillBtn);
    assist.appendChild(assistActions);

    var grid = ui.el('div', 'ce-grid ce-grid--2');

    var nameInput = ui.el('input', 'ce-input');
    nameInput.id = 'name';
    nameInput.placeholder = 'Verifier les alertes';
    grid.appendChild(ui.createField({ label: 'Nom', input: nameInput }));

    var projectSelect = ui.el('select', 'ce-select');
    projectSelect.id = 'project';
    grid.appendChild(ui.createField({ label: 'Projet', input: projectSelect, help: 'Optionnel. Laissez vide pour une automatisation globale.' }));

    var modelPickerHost = ui.el('div', 'ce-model-picker');
    modelPickerHost.id = 'modelPickerHost';
    grid.appendChild(ui.createField({ label: 'Modele', input: modelPickerHost, help: 'Utilise le picker de modeles coherent avec Chatons.' }));

    var triggerSelect = ui.el('select', 'ce-select');
    triggerSelect.id = 'trigger';
    ;[
      ['conversation.created', 'Nouvelle conversation'],
      ['conversation.message.received', 'Nouveau message'],
      ['conversation.agent.ended', 'Fin d\'agent'],
      ['project.created', 'Nouveau projet']
    ].forEach(function (entry) {
      var option = ui.el('option', '', entry[1]);
      option.value = entry[0];
      triggerSelect.appendChild(option);
    });
    grid.appendChild(ui.createField({ label: 'Declencheur', input: triggerSelect }));

    var actionTypeSelect = ui.el('select', 'ce-select');
    actionTypeSelect.id = 'actionType';
    ;[
      ['notify', 'Notification'],
      ['enqueueEvent', 'Enqueue event'],
      ['runHostCommand', 'Commande host']
    ].forEach(function (entry) {
      var option = ui.el('option', '', entry[1]);
      option.value = entry[0];
      actionTypeSelect.appendChild(option);
    });
    grid.appendChild(ui.createField({ label: 'Action', input: actionTypeSelect }));

    var cooldownInput = ui.el('input', 'ce-input');
    cooldownInput.id = 'cooldown';
    cooldownInput.type = 'number';
    cooldownInput.min = '0';
    cooldownInput.value = '0';
    grid.appendChild(ui.createField({ label: 'Cooldown (ms)', input: cooldownInput }));

    var requestInput = ui.el('textarea', 'ce-textarea');
    requestInput.id = 'request';
    requestInput.placeholder = 'Decrivez precisement l\'action a executer';
    var requestField = ui.createField({ label: 'Requete', input: requestInput, help: 'Cette description est stockee dans l\'action de la regle.' });

    var footerActions = ui.el('div', 'ce-toolbar');
    var cancelBtn = ui.createButton({ text: 'Annuler', variant: 'ghost' });
    cancelBtn.id = 'cancelBtn';
    var createBtn = ui.createButton({ text: 'Creer', variant: 'default' });
    createBtn.id = 'createBtn';
    footerActions.appendChild(cancelBtn);
    footerActions.appendChild(createBtn);

    modal.appendChild(modalHeader);
    modal.appendChild(assist);
    modal.appendChild(ui.el('div', 'ce-stack'));
    modal.appendChild(grid);
    modal.appendChild(ui.el('hr', 'ce-divider'));
    modal.appendChild(requestField);
    modal.appendChild(footerActions);
    modalBg.appendChild(modal);

    page.appendChild(modalBg);
    app.appendChild(page);

    return {
      rulesEl: rulesList,
      runsEl: runsList,
      modalBg: modalBg,
      nameInput: nameInput,
      projectSelect: projectSelect,
      modelPickerHost: modelPickerHost,
      triggerSelect: triggerSelect,
      actionTypeSelect: actionTypeSelect,
      cooldownInput: cooldownInput,
      requestInput: requestInput,
      instructionInput: instructionInput,
      newBtn: createButton,
      cancelBtn: cancelBtn,
      fillBtn: fillBtn,
      createBtn: createBtn,
    };
  }

  var refs = buildShell();

  function appendEmpty(node, text) {
    clearChildren(node);
    node.appendChild(ui.el('div', 'ce-empty', text));
  }

  function renderRule(rule) {
    var row = ui.el('article', 'ce-list-row');
    var main = ui.el('div', 'ce-list-row__main');
    var dot = ui.el('span', 'ce-dot');
    var content = ui.el('div', 'ce-list-row__content');
    var title = ui.el('p', 'ce-list-row__title', rule.name || 'Sans nom');
    var meta = ui.el('p', 'ce-list-row__meta', (rule.trigger || 'Trigger inconnu') + ' · cooldown ' + String(rule.cooldown || 0) + ' ms');
    content.appendChild(title);
    content.appendChild(meta);
    main.appendChild(dot);
    main.appendChild(content);

    var aside = ui.el('div', 'ce-list-row__aside', 'Mis a jour ' + nowRel(rule.updatedAt));
    row.appendChild(main);
    row.appendChild(aside);
    row.title = 'Double-clic pour supprimer cette automatisation';
    row.addEventListener('dblclick', async function () {
      await call('automation.rules.delete', { id: rule.id });
      await load();
    });
    return row;
  }

  function renderRun(run, rulesById) {
    var row = ui.el('article', 'ce-list-row');
    var main = ui.el('div', 'ce-list-row__main');
    var dot = ui.el('span', run.status === 'error' ? 'ce-dot ce-dot--danger' : 'ce-dot ce-dot--success');
    var content = ui.el('div', 'ce-list-row__content');
    var rule = rulesById[run.ruleId];
    var title = ui.el('p', 'ce-list-row__title', rule ? rule.name : 'Automatisation inconnue');
    var meta = ui.el('p', 'ce-list-row__meta', run.eventTopic || 'Event inconnu');
    content.appendChild(title);
    content.appendChild(meta);
    if (run.errorMessage) {
      var error = ui.el('p', 'ce-list-row__meta', run.errorMessage);
      error.style.color = 'var(--ce-danger)';
      content.appendChild(error);
    }
    main.appendChild(dot);
    main.appendChild(content);
    row.appendChild(main);
    row.appendChild(ui.el('div', 'ce-list-row__aside', nowRel(run.createdAt)));
    return row;
  }

  async function loadModels() {
    var res = await window.chaton.listPiModels();
    if (!res.ok) return;
    state.allModels = res.models || [];
    if (state.modelPicker) {
      state.modelPicker.setModels(state.allModels);
      var saved = localStorage.getItem(MODEL_KEY);
      state.modelPicker.setSelected(saved || null);
      var selected = state.modelPicker.getSelected();
      if (selected) localStorage.setItem(MODEL_KEY, selected);
    }
  }

  async function load() {
    var rulesRes = await call('automation.rules.list', {});
    var runsRes = await call('automation.runs.list', { limit: 80 });
    var initialState = await window.chaton.getInitialState();

    state.projects = initialState.projects || [];
    state.rules = rulesRes.ok ? (rulesRes.data || []) : [];
    state.runs = runsRes.ok ? (runsRes.data || []) : [];

    clearChildren(refs.projectSelect);
    var emptyProject = ui.el('option', '', 'Tous les projets');
    emptyProject.value = '';
    refs.projectSelect.appendChild(emptyProject);
    state.projects.forEach(function (project) {
      var option = ui.el('option', '', project.name || project.repoName || 'Projet');
      option.value = project.id;
      refs.projectSelect.appendChild(option);
    });

    if (!state.rules.length) {
      appendEmpty(refs.rulesEl, 'Aucune automatisation programmee.');
    } else {
      clearChildren(refs.rulesEl);
      state.rules.forEach(function (rule) {
        refs.rulesEl.appendChild(renderRule(rule));
      });
    }

    var byId = {};
    state.rules.forEach(function (rule) { byId[rule.id] = rule; });

    if (!state.runs.length) {
      appendEmpty(refs.runsEl, 'Aucune execution recente.');
    } else {
      clearChildren(refs.runsEl);
      state.runs.forEach(function (run) {
        refs.runsEl.appendChild(renderRun(run, byId));
      });
    }
  }

  function openModal() {
    refs.modalBg.classList.add('is-open');
    refs.nameInput.focus();
  }

  function closeModal() {
    refs.modalBg.classList.remove('is-open');
  }

  refs.newBtn.addEventListener('click', openModal);
  refs.cancelBtn.addEventListener('click', closeModal);

  refs.modalBg.addEventListener('click', function (event) {
    if (event.target === refs.modalBg) closeModal();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && refs.modalBg.classList.contains('is-open')) closeModal();
  });

  refs.fillBtn.addEventListener('click', async function () {
    var initialState = await window.chaton.getInitialState();
    var plan = mapPlan(refs.instructionInput.value, initialState.projects || []);
    refs.nameInput.value = plan.name;
    refs.triggerSelect.value = plan.trigger;
    refs.actionTypeSelect.value = plan.action;
    refs.cooldownInput.value = String(plan.cooldown);
    if (plan.projectId) refs.projectSelect.value = plan.projectId;
    if (!refs.requestInput.value.trim()) refs.requestInput.value = refs.instructionInput.value.trim();
    notify('Pre-remplissage IA applique.');
  });

  refs.createBtn.addEventListener('click', async function () {
    var name = refs.nameInput.value.trim();
    if (!name) {
      notify('Nom d\'automatisation requis');
      refs.nameInput.focus();
      return;
    }

    var trigger = refs.triggerSelect.value;
    var actionType = refs.actionTypeSelect.value;
    var action;

    if (actionType === 'notify') {
      action = {
        type: 'notify',
        title: 'Automation: ' + name,
        body: refs.requestInput.value.trim() || ('Trigger ' + trigger),
      };
    } else if (actionType === 'enqueueEvent') {
      action = { type: 'enqueueEvent', topic: 'automation.' + trigger };
    } else {
      action = { type: 'runHostCommand', method: 'open.mainView', params: { viewId: 'automation.main' } };
    }

    action.model = state.modelPicker ? state.modelPicker.getSelected() : null;
    if (refs.projectSelect.value) action.projectId = refs.projectSelect.value;

    var res = await call('automation.rules.save', {
      name: name,
      trigger: trigger,
      enabled: true,
      conditions: [],
      actions: [action],
      cooldown: Math.max(0, Number(refs.cooldownInput.value) || 0),
    });

    if (!res.ok) {
      notify((res.error && res.error.message) || 'Impossible de creer la regle');
      return;
    }

    closeModal();
    refs.nameInput.value = '';
    refs.requestInput.value = '';
    refs.instructionInput.value = '';
    refs.cooldownInput.value = '0';
    await load();
  });

  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || data.type !== 'chaton.extension.deeplink') return;
    var payload = data.payload || {};
    if (payload.viewId !== 'automation.main') return;
    if (payload.target === 'open-create-automation') openModal();
  });

  if (window.chatonUi && typeof window.chatonUi.createModelPicker === 'function') {
    state.modelPicker = window.chatonUi.createModelPicker({
      host: refs.modelPickerHost,
      onChange: function (modelKey) {
        if (modelKey) localStorage.setItem(MODEL_KEY, modelKey);
      },
      labels: {
        filterPlaceholder: 'Filtrer les modeles...',
        more: 'plus',
        scopedOnly: 'scoped uniquement',
        noScoped: 'Aucun modele scoped',
        noModels: 'Aucun modele disponible'
      }
    });
  }

  loadModels().then(load);
})();
