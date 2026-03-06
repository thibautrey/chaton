(function () {
  var EXTENSION_ID = '@chaton/memory';
  var ui = window.chatonExtensionComponents;

  if (!ui) throw new Error('chatonExtensionComponents is required');
  ui.ensureStyles();

  function syncThemeClass() {
    var root = document.documentElement;
    if (!root) return;
    root.classList.toggle('dark', !!(window.parent && window.parent.document && window.parent.document.documentElement && window.parent.document.documentElement.classList.contains('dark')));
  }

  syncThemeClass();

  var app = document.getElementById('app');
  var state = { entries: [], projects: [] };

  function call(api, payload) {
    return window.chaton.extensionCall('chatons-ui', EXTENSION_ID, api, '^1.0.0', payload);
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function nowRel(iso) {
    var ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return 'Date inconnue';
    var h = Math.floor((Date.now() - ts) / 3600000);
    if (h < 1) return 'A l\'instant';
    if (h < 24) return h + ' h';
    return Math.floor(h / 24) + ' j';
  }

  function buildShell() {
    clearChildren(app);
    var page = ui.el('div', 'ce-page');
    var header = ui.el('header', 'ce-page-header');
    var titleWrap = ui.el('div', '');
    titleWrap.appendChild(ui.el('h1', 'ce-page-title', 'Memoire'));
    titleWrap.appendChild(ui.el('p', 'ce-page-description', 'Memoire interne Chatons avec stockage global et par projet. Recherche semantique locale sans service externe.'));

    var toolbar = ui.el('div', 'ce-toolbar');
    var refreshBtn = ui.createButton({ text: 'Rafraichir', variant: 'outline' });
    refreshBtn.id = 'refreshBtn';
    toolbar.appendChild(refreshBtn);
    header.appendChild(titleWrap);
    header.appendChild(toolbar);
    page.appendChild(header);

    var top = ui.el('div', 'ce-grid ce-grid--2');

    var searchCard = ui.createCard();
    searchCard.body.appendChild(ui.el('h2', 'ce-section-title', 'Recherche'));
    var query = ui.el('textarea', 'ce-textarea');
    query.id = 'query';
    query.placeholder = 'Rechercher un souvenir, une preference, une decision...';
    searchCard.body.appendChild(ui.createField({ label: 'Requete', input: query }));

    var scope = ui.el('select', 'ce-select');
    scope.id = 'scope';
    [['all', 'Tout'], ['global', 'Global'], ['project', 'Projet']].forEach(function (entry) {
      var option = ui.el('option', '', entry[1]);
      option.value = entry[0];
      scope.appendChild(option);
    });
    searchCard.body.appendChild(ui.createField({ label: 'Scope', input: scope }));

    var project = ui.el('select', 'ce-select');
    project.id = 'project';
    searchCard.body.appendChild(ui.createField({ label: 'Projet', input: project, help: 'Optionnel pour les recherches mixtes ou scope=project.' }));

    var searchBtn = ui.createButton({ text: 'Chercher', variant: 'default' });
    searchBtn.id = 'searchBtn';
    searchCard.body.appendChild(searchBtn);

    var createCard = ui.createCard();
    createCard.body.appendChild(ui.el('h2', 'ce-section-title', 'Ajouter une memoire'));

    var createScope = ui.el('select', 'ce-select');
    createScope.id = 'createScope';
    [['global', 'Globale'], ['project', 'Projet']].forEach(function (entry) {
      var option = ui.el('option', '', entry[1]);
      option.value = entry[0];
      createScope.appendChild(option);
    });
    createCard.body.appendChild(ui.createField({ label: 'Scope', input: createScope }));

    var createProject = ui.el('select', 'ce-select');
    createProject.id = 'createProject';
    createCard.body.appendChild(ui.createField({ label: 'Projet', input: createProject }));

    var createKind = ui.el('input', 'ce-input');
    createKind.id = 'createKind';
    createKind.placeholder = 'preference';
    createCard.body.appendChild(ui.createField({ label: 'Type', input: createKind }));

    var createTitle = ui.el('input', 'ce-input');
    createTitle.id = 'createTitle';
    createTitle.placeholder = 'Preference de ton';
    createCard.body.appendChild(ui.createField({ label: 'Titre', input: createTitle }));

    var createTags = ui.el('input', 'ce-input');
    createTags.id = 'createTags';
    createTags.placeholder = 'style, utilisateur';
    createCard.body.appendChild(ui.createField({ label: 'Tags', input: createTags }));

    var createContent = ui.el('textarea', 'ce-textarea');
    createContent.id = 'createContent';
    createContent.placeholder = 'L\'utilisateur prefere des reponses concises en francais.';
    createCard.body.appendChild(ui.createField({ label: 'Contenu', input: createContent }));

    var createBtn = ui.createButton({ text: 'Enregistrer', variant: 'default' });
    createBtn.id = 'createBtn';
    createCard.body.appendChild(createBtn);

    top.appendChild(searchCard.root);
    top.appendChild(createCard.root);
    page.appendChild(top);

    var resultsCard = ui.createCard();
    resultsCard.body.appendChild(ui.el('h2', 'ce-section-title', 'Memoires'));
    var results = ui.el('div', 'ce-list');
    results.id = 'results';
    resultsCard.body.appendChild(results);
    page.appendChild(resultsCard.root);
    app.appendChild(page);

    return {
      refreshBtn: refreshBtn,
      searchBtn: searchBtn,
      createBtn: createBtn,
      query: query,
      scope: scope,
      project: project,
      createScope: createScope,
      createProject: createProject,
      createKind: createKind,
      createTitle: createTitle,
      createTags: createTags,
      createContent: createContent,
      results: results,
    };
  }

  var refs = buildShell();

  function renderEntries(entries) {
    clearChildren(refs.results);
    if (!entries || !entries.length) {
      refs.results.appendChild(ui.el('div', 'ce-empty', 'Aucune memoire.'));
      return;
    }

    entries.forEach(function (entry) {
      var row = ui.el('article', 'ce-list-row');
      var main = ui.el('div', 'ce-list-row__main');
      var dot = ui.el('span', entry.scope === 'global' ? 'ce-dot ce-dot--success' : 'ce-dot');
      var content = ui.el('div', 'ce-list-row__content');
      var title = ui.el('p', 'ce-list-row__title', (entry.title || 'Sans titre') + ' [' + entry.scope + ']');
      var meta = ui.el('p', 'ce-list-row__meta', (entry.kind || 'fact') + ' · ' + (entry.tags || []).join(', '));
      var text = ui.el('p', 'ce-list-row__meta', entry.content || '');
      content.appendChild(title);
      content.appendChild(meta);
      content.appendChild(text);
      main.appendChild(dot);
      main.appendChild(content);
      row.appendChild(main);
      row.appendChild(ui.el('div', 'ce-list-row__aside', nowRel(entry.updatedAt)));
      refs.results.appendChild(row);
    });
  }

  async function loadProjects() {
    var res = await window.chaton.extensionHostCall(EXTENSION_ID, 'projects.list', {});
    state.projects = res.ok ? (res.data || []) : [];
    [refs.project, refs.createProject].forEach(function (select) {
      clearChildren(select);
      var empty = ui.el('option', '', 'Aucun');
      empty.value = '';
      select.appendChild(empty);
      state.projects.forEach(function (project) {
        var option = ui.el('option', '', project.name || 'Projet');
        option.value = project.id;
        select.appendChild(option);
      });
    });
  }

  async function loadAll() {
    var res = await call('memory.list', { scope: 'all', limit: 100 });
    state.entries = res.ok ? (res.data || []) : [];
    renderEntries(state.entries);
  }

  refs.refreshBtn.addEventListener('click', function () { void loadAll(); });

  refs.searchBtn.addEventListener('click', async function () {
    var payload = {
      query: refs.query.value.trim(),
      scope: refs.scope.value,
      projectId: refs.project.value || undefined,
      limit: 50,
    };
    var res = await call('memory.search', payload);
    if (res.ok) renderEntries(res.data || []);
  });

  refs.createBtn.addEventListener('click', async function () {
    var content = refs.createContent.value.trim();
    if (!content) return;
    await call('memory.upsert', {
      scope: refs.createScope.value,
      projectId: refs.createProject.value || undefined,
      kind: refs.createKind.value.trim() || 'fact',
      title: refs.createTitle.value.trim() || undefined,
      content: content,
      tags: refs.createTags.value.split(',').map(function (v) { return v.trim(); }).filter(Boolean),
      source: 'memory-ui'
    });
    refs.createContent.value = '';
    refs.createTitle.value = '';
    refs.createTags.value = '';
    void loadAll();
  });

  loadProjects().then(loadAll);
})();
