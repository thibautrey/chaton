(function () {
  var EXTENSION_ID = "@chaton/memory";
  var ui = window.chatonExtensionComponents;

  if (!ui) throw new Error("chatonExtensionComponents is required");
  ui.ensureStyles();

  function createSvgIcon(pathDefs, size) {
    if (typeof ui.createSvgIcon === "function") {
      return ui.createSvgIcon(pathDefs, size);
    }

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

  // Sync dark mode class from parent frame
  function syncThemeClass() {
    var root = document.documentElement;
    if (!root) return;
    root.classList.toggle(
      "dark",
      !!(
        window.parent &&
        window.parent.document &&
        window.parent.document.documentElement &&
        window.parent.document.documentElement.classList.contains("dark")
      ),
    );
  }

  syncThemeClass();
  if (window.matchMedia) {
    var media = window.matchMedia("(prefers-color-scheme: dark)");
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncThemeClass);
    } else if (typeof media.addListener === "function") {
      media.addListener(syncThemeClass);
    }
  }

  // Memory-specific styles
  var STYLE_ID = "chaton-memory-style";
  function ensureMemoryStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      // Layout: split pane like automation
      ".ce-mem { min-height: 100vh; background: var(--ce-bg); color: var(--ce-fg); }",
      ".ce-mem-layout { display: grid; grid-template-columns: 420px 1fr; min-height: 100vh; }",

      // Sidebar / inbox
      ".ce-mem-inbox { border-right: 1px solid var(--ce-border); background: color-mix(in srgb, var(--ce-bg) 98%, white); padding: 14px 10px 20px; overflow: auto; }",
      ".ce-mem-inbox-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 6px 10px; border-bottom: 1px solid var(--ce-border); margin-bottom: 8px; }",
      ".ce-mem-title-wrap { display: inline-flex; align-items: center; gap: 8px; }",
      ".ce-mem-title { margin: 0; font-size: 27px; letter-spacing: -0.02em; font-weight: 650; }",

      // Search bar in the inbox
      ".ce-mem-search-wrap { padding: 4px 6px 12px; }",
      ".ce-mem-search { display: flex; gap: 6px; }",
      ".ce-mem-search-input { flex: 1; border: 1px solid var(--ce-input); background: var(--ce-card); color: var(--ce-fg); border-radius: 8px; padding: 7px 10px; font-size: 13px; font-family: inherit; }",
      ".ce-mem-search-input:focus { outline: 2px solid var(--ce-ring); outline-offset: 2px; }",
      ".ce-mem-search-input::placeholder { color: var(--ce-muted-fg); }",

      // Filter row
      ".ce-mem-filters { display: flex; align-items: center; gap: 6px; padding: 0 6px 10px; flex-wrap: wrap; }",
      ".ce-mem-filter-select { border: 1px solid var(--ce-input); background: var(--ce-card); color: var(--ce-fg); border-radius: 8px; padding: 5px 8px; font-size: 12px; font-family: inherit; }",
      ".ce-mem-filter-select:focus { outline: 2px solid var(--ce-ring); outline-offset: 2px; }",
      ".ce-mem-count { color: var(--ce-muted-fg); font-size: 12px; margin-left: auto; }",

      // Sections in inbox
      ".ce-mem-section { padding: 6px 6px 0; }",
      ".ce-mem-section-title { margin: 0 0 8px; color: var(--ce-muted-fg); font-size: 13px; font-weight: 600; }",
      ".ce-mem-list { display: grid; gap: 3px; }",

      // Row items in the list
      ".ce-mem-row { width: 100%; border: 1px solid transparent; background: transparent; border-radius: 10px; text-align: left; padding: 10px 10px; cursor: pointer; color: inherit; display: grid; gap: 4px; }",
      ".ce-mem-row:hover { background: color-mix(in srgb, var(--ce-muted) 58%, transparent); border-color: color-mix(in srgb, var(--ce-border) 80%, transparent); }",
      ".ce-mem-row--active { background: color-mix(in srgb, var(--ce-muted) 76%, white); border-color: var(--ce-border); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ce-ring) 20%, transparent); }",
      ".ce-mem-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }",
      ".ce-mem-row-main { min-width: 0; display: grid; gap: 3px; }",
      ".ce-mem-row-title { display: inline-block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 560; }",
      ".ce-mem-row-time { flex: 0 0 auto; color: var(--ce-muted-fg); font-size: 12px; }",
      ".ce-mem-row-preview { margin: 0; color: var(--ce-muted-fg); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; }",
      ".ce-mem-row-badges { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }",
      ".ce-mem-subempty { border: 1px dashed var(--ce-border); border-radius: 8px; padding: 8px 10px; color: var(--ce-muted-fg); font-size: 12px; }",

      // Detail pane (right side)
      ".ce-mem-detail { background: color-mix(in srgb, var(--ce-bg) 99%, white); display: flex; align-items: center; justify-content: center; padding: 28px; position: relative; }",

      // Empty state
      ".ce-mem-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--ce-muted-fg); }",
      ".ce-mem-empty-icon { color: color-mix(in srgb, var(--ce-fg) 82%, white); }",
      ".ce-mem-empty-title { margin: 0; font-size: 38px; font-weight: 640; letter-spacing: -0.01em; color: color-mix(in srgb, var(--ce-fg) 92%, white); }",
      ".ce-mem-empty-copy { margin: 0; max-width: 460px; text-align: center; color: var(--ce-muted-fg); font-size: 14px; line-height: 1.55; }",

      // Detail card
      ".ce-mem-detail-card { display: none; width: min(680px, 100%); border: 1px solid var(--ce-border); border-radius: 14px; background: var(--ce-card); box-shadow: var(--ce-shadow-card); padding: 18px; }",
      ".ce-mem-detail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 6px; }",
      ".ce-mem-detail-title { margin: 0; font-size: 22px; letter-spacing: -0.01em; font-weight: 640; }",
      ".ce-mem-detail-meta { margin: 6px 0 0; color: var(--ce-muted-fg); font-size: 13px; }",
      ".ce-mem-detail-body { margin: 14px 0 0; padding: 0; max-height: 58vh; overflow: auto; }",
      ".ce-mem-detail-actions { display: flex; gap: 6px; flex-shrink: 0; }",

      // Summary badges
      ".ce-mem-summary { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }",

      // Key-value grid
      ".ce-mem-kv-grid { display: grid; gap: 8px; }",
      ".ce-mem-kv { display: grid; gap: 3px; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--ce-border); background: color-mix(in srgb, var(--ce-card) 90%, var(--ce-muted)); }",
      ".ce-mem-kv-label { color: var(--ce-muted-fg); font-size: 12px; }",
      ".ce-mem-kv-value { color: var(--ce-fg); font-size: 13px; word-break: break-word; }",
      ".ce-mem-kv-value--mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace; font-size: 12px; }",

      // Content block
      ".ce-mem-detail-section-title { margin: 14px 0 7px; color: var(--ce-muted-fg); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }",
      ".ce-mem-content-block { margin: 0; padding: 12px; border-radius: 10px; border: 1px solid var(--ce-border); background: var(--ce-muted); color: var(--ce-fg); font-size: 13px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }",

      // Tags display
      ".ce-mem-tags { display: flex; gap: 4px; flex-wrap: wrap; }",

      // Create modal
      ".ce-mem-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }",

      // Dark mode overrides
      ".dark .ce-mem-title { color: var(--ce-fg); }",
      ".dark .ce-mem-empty-title { color: var(--ce-fg); }",

      // Responsive
      "@media (max-width: 1280px) { .ce-mem-layout { grid-template-columns: 380px 1fr; } .ce-mem-empty-title { font-size: 30px; } }",
      "@media (max-width: 980px) { .ce-mem-layout { grid-template-columns: 1fr; } .ce-mem-inbox { border-right: 0; border-bottom: 1px solid var(--ce-border); max-height: 52vh; } .ce-mem-detail { min-height: 48vh; } .ce-mem-empty-title { font-size: 24px; text-align: center; } }",
    ].join("\n");
    document.head.appendChild(style);
  }

  ensureMemoryStyles();

  var app = document.getElementById("app");
  if (!app) {
    throw new Error("memory root #app not found");
  }

  function showFatalError(message) {
    document.body.innerHTML = "";
    var wrapper = ui.el("div", "ce-mem");
    wrapper.style.minHeight = "100vh";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.padding = "24px";

    var card = ui.el("div", "ce-mem-detail-card");
    card.style.display = "block";
    card.style.maxWidth = "720px";

    var title = ui.el("h2", "ce-mem-detail-title", "Impossible de charger la vue Memoire");
    var body = ui.el(
      "p",
      "ce-mem-detail-meta",
      String(message || "Une erreur inconnue est survenue."),
    );

    card.appendChild(title);
    card.appendChild(body);
    wrapper.appendChild(card);
    document.body.appendChild(wrapper);
  }

  var state = {
    entries: [],
    projects: [],
    selected: null,
    searchQuery: "",
    filterScope: "all",
    filterKind: "",
  };

  function call(api, payload) {
    return window.chaton.extensionCall(
      "chatons-ui",
      EXTENSION_ID,
      api,
      "^1.0.0",
      payload,
    );
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function clamp(text, n) {
    var s = String(text || "");
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "\u2026";
  }

  function nowRel(iso) {
    var ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return "Date inconnue";
    var diff = Date.now() - ts;
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "A l'instant";
    if (minutes < 60) return minutes + " min";
    var hours = Math.floor(diff / 3600000);
    if (hours < 24) return hours + " h";
    var days = Math.floor(diff / 86400000);
    if (days < 30) return days + " j";
    return Math.floor(days / 30) + " mois";
  }

  function fmtDate(iso) {
    var ts = Date.parse(iso || "");
    if (!Number.isFinite(ts)) return "Date inconnue";
    return new Date(ts).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function kindLabel(kind) {
    var map = {
      preference: "Preference",
      fact: "Fait",
      profile: "Profil",
      decision: "Decision",
      context: "Contexte",
    };
    return map[kind] || kind || "fact";
  }

  function scopeLabel(scope) {
    return scope === "global" ? "Globale" : "Projet";
  }

  // Build the shell layout
  function buildShell() {
    clearChildren(app);

    var page = ui.el("div", "ce-mem");
    var layout = ui.el("div", "ce-mem-layout");

    // --- LEFT: Inbox / list pane ---
    var inbox = ui.el("section", "ce-mem-inbox");

    // Header
    var inboxHeader = ui.el("div", "ce-mem-inbox-header");
    var titleWrap = ui.el("div", "ce-mem-title-wrap");
    var brainIcon = createSvgIcon([
      "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
      "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
      "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4",
      "M17.599 6.5a3 3 0 0 0 .399-1.375",
      "M6.003 5.125A3 3 0 0 0 6.401 6.5",
      "M3.477 10.896a4 4 0 0 1 .585-.396",
      "M19.938 10.5a4 4 0 0 1 .585.396",
      "M6 18a4 4 0 0 1-1.967-.516",
      "M19.967 17.484A4 4 0 0 1 18 18",
    ], 24);
    titleWrap.appendChild(brainIcon);
    titleWrap.appendChild(ui.el("h1", "ce-mem-title", "Memoire"));
    inboxHeader.appendChild(titleWrap);

    var newBtn = ui.createButton({ text: "+ Nouveau", variant: "ghost" });
    newBtn.id = "newBtn";
    newBtn.classList.add("ce-auto-new-btn");
    inboxHeader.appendChild(newBtn);
    inbox.appendChild(inboxHeader);

    // Search bar
    var searchWrap = ui.el("div", "ce-mem-search-wrap");
    var searchRow = ui.el("div", "ce-mem-search");
    var searchInput = ui.el("input", "ce-mem-search-input");
    searchInput.id = "searchInput";
    searchInput.type = "text";
    searchInput.placeholder = "Rechercher dans la memoire\u2026";
    searchRow.appendChild(searchInput);
    var searchBtn = ui.createButton({ text: "Chercher", variant: "outline" });
    searchBtn.id = "searchBtn";
    searchRow.appendChild(searchBtn);
    searchWrap.appendChild(searchRow);
    inbox.appendChild(searchWrap);

    // Filters
    var filters = ui.el("div", "ce-mem-filters");

    var scopeSelect = ui.el("select", "ce-mem-filter-select");
    scopeSelect.id = "scopeFilter";
    [
      ["all", "Toutes"],
      ["global", "Globales"],
      ["project", "Projet"],
    ].forEach(function (entry) {
      var opt = ui.el("option", "", entry[1]);
      opt.value = entry[0];
      scopeSelect.appendChild(opt);
    });
    filters.appendChild(scopeSelect);

    var kindSelect = ui.el("select", "ce-mem-filter-select");
    kindSelect.id = "kindFilter";
    [
      ["", "Tous les types"],
      ["preference", "Preferences"],
      ["fact", "Faits"],
      ["profile", "Profils"],
      ["decision", "Decisions"],
      ["context", "Contexte"],
    ].forEach(function (entry) {
      var opt = ui.el("option", "", entry[1]);
      opt.value = entry[0];
      kindSelect.appendChild(opt);
    });
    filters.appendChild(kindSelect);

    var countLabel = ui.el("span", "ce-mem-count");
    countLabel.id = "entryCount";
    filters.appendChild(countLabel);

    inbox.appendChild(filters);

    // Memory list
    var listSection = ui.el("section", "ce-mem-section");
    var memList = ui.el("div", "ce-mem-list");
    memList.id = "memList";
    listSection.appendChild(memList);
    inbox.appendChild(listSection);

    // --- RIGHT: Detail pane ---
    var detail = ui.el("section", "ce-mem-detail");

    // Empty state
    var detailEmpty = ui.el("div", "ce-mem-empty");
    detailEmpty.id = "detailEmpty";
    var emptyIcon = createSvgIcon([
      "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
      "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
      "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4",
    ], 42);
    emptyIcon.classList.add("ce-mem-empty-icon");
    detailEmpty.appendChild(emptyIcon);
    detailEmpty.appendChild(
      ui.el("p", "ce-mem-empty-title", "Selectionnez une memoire"),
    );
    detailEmpty.appendChild(
      ui.el(
        "p",
        "ce-mem-empty-copy",
        "Choisissez une entree dans la liste pour voir ses details, ou creez une nouvelle memoire.",
      ),
    );

    // Detail card
    var detailCard = ui.el("article", "ce-mem-detail-card");
    detailCard.id = "detailCard";

    var detailHeader = ui.el("div", "ce-mem-detail-header");
    var detailTitleWrap = ui.el("div", "");
    var detailTitle = ui.el("h3", "ce-mem-detail-title", "");
    detailTitle.id = "detailTitle";
    var detailMeta = ui.el("p", "ce-mem-detail-meta", "");
    detailMeta.id = "detailMeta";
    detailTitleWrap.appendChild(detailTitle);
    detailTitleWrap.appendChild(detailMeta);

    var detailActions = ui.el("div", "ce-mem-detail-actions");
    var archiveBtn = ui.createButton({ text: "Archiver", variant: "outline" });
    archiveBtn.id = "archiveBtn";
    var deleteBtn = ui.createButton({ text: "Supprimer", variant: "ghost" });
    deleteBtn.id = "deleteBtn";
    deleteBtn.style.color = "var(--ce-danger)";
    detailActions.appendChild(archiveBtn);
    detailActions.appendChild(deleteBtn);

    detailHeader.appendChild(detailTitleWrap);
    detailHeader.appendChild(detailActions);
    detailCard.appendChild(detailHeader);

    var detailBody = ui.el("div", "ce-mem-detail-body");
    detailBody.id = "detailBody";
    detailCard.appendChild(detailBody);

    detail.appendChild(detailEmpty);
    detail.appendChild(detailCard);

    layout.appendChild(inbox);
    layout.appendChild(detail);
    page.appendChild(layout);

    // --- CREATE MODAL ---
    var modalBg = ui.el("div", "ce-modal-backdrop");
    modalBg.id = "modalBg";
    modalBg.setAttribute("role", "dialog");
    modalBg.setAttribute("aria-modal", "true");
    modalBg.setAttribute("aria-labelledby", "modalTitle");

    var modal = ui.el("div", "ce-modal");
    var modalHeader = ui.el("div", "ce-modal__header");
    var modalTitle = ui.el("h3", "ce-modal__title", "Ajouter une memoire");
    modalTitle.id = "modalTitle";
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(
      ui.el(
        "p",
        "ce-modal__description",
        "Enregistrez une preference, un fait, une decision ou tout autre contexte que Chatons devra retenir.",
      ),
    );
    modal.appendChild(modalHeader);

    var modalGrid = ui.el("div", "ce-mem-modal-grid");

    var createScope = ui.el("select", "ce-select");
    createScope.id = "createScope";
    [
      ["global", "Globale"],
      ["project", "Projet"],
    ].forEach(function (entry) {
      var opt = ui.el("option", "", entry[1]);
      opt.value = entry[0];
      createScope.appendChild(opt);
    });
    modalGrid.appendChild(
      ui.createField({ label: "Scope", input: createScope }),
    );

    var createProject = ui.el("select", "ce-select");
    createProject.id = "createProject";
    modalGrid.appendChild(
      ui.createField({
        label: "Projet",
        input: createProject,
        help: "Requis pour scope projet.",
      }),
    );

    var createKind = ui.el("select", "ce-select");
    createKind.id = "createKind";
    [
      ["fact", "Fait"],
      ["preference", "Preference"],
      ["profile", "Profil"],
      ["decision", "Decision"],
      ["context", "Contexte"],
    ].forEach(function (entry) {
      var opt = ui.el("option", "", entry[1]);
      opt.value = entry[0];
      createKind.appendChild(opt);
    });
    modalGrid.appendChild(
      ui.createField({ label: "Type", input: createKind }),
    );

    var createTitle = ui.el("input", "ce-input");
    createTitle.id = "createTitle";
    createTitle.placeholder = "Titre court et descriptif";
    modalGrid.appendChild(
      ui.createField({ label: "Titre", input: createTitle }),
    );

    modal.appendChild(modalGrid);

    var createTags = ui.el("input", "ce-input");
    createTags.id = "createTags";
    createTags.placeholder = "style, utilisateur, workflow";
    modal.appendChild(
      ui.createField({
        label: "Tags",
        input: createTags,
        help: "Separez les tags par des virgules.",
      }),
    );

    var spacer = ui.el("div", "");
    spacer.style.height = "4px";
    modal.appendChild(spacer);

    var createContent = ui.el("textarea", "ce-textarea");
    createContent.id = "createContent";
    createContent.placeholder =
      "L'utilisateur prefere des reponses concises en francais avec des exemples de code.";
    modal.appendChild(
      ui.createField({ label: "Contenu", input: createContent }),
    );

    var modalFooter = ui.el("div", "ce-toolbar");
    modalFooter.style.marginTop = "12px";
    var cancelBtn = ui.createButton({ text: "Annuler", variant: "ghost" });
    cancelBtn.id = "cancelBtn";
    var createBtn = ui.createButton({ text: "Enregistrer", variant: "default" });
    createBtn.id = "createBtn";
    modalFooter.appendChild(cancelBtn);
    modalFooter.appendChild(createBtn);
    modal.appendChild(modalFooter);

    modalBg.appendChild(modal);
    page.appendChild(modalBg);

    app.appendChild(page);

    return {
      searchInput: searchInput,
      searchBtn: searchBtn,
      scopeFilter: scopeSelect,
      kindFilter: kindSelect,
      entryCount: countLabel,
      memList: memList,
      detailEmpty: detailEmpty,
      detailCard: detailCard,
      detailTitle: detailTitle,
      detailMeta: detailMeta,
      detailBody: detailBody,
      detailActions: detailActions,
      archiveBtn: archiveBtn,
      deleteBtn: deleteBtn,
      newBtn: newBtn,
      modalBg: modalBg,
      createScope: createScope,
      createProject: createProject,
      createKind: createKind,
      createTitle: createTitle,
      createTags: createTags,
      createContent: createContent,
      cancelBtn: cancelBtn,
      createBtn: createBtn,
    };
  }

  var refs;
  try {
    refs = buildShell();
  } catch (error) {
    console.error("[memory] failed to build shell", error);
    showFatalError(error && error.message ? error.message : String(error));
    return;
  }

  // --- Render functions ---

  function renderRow(entry) {
    var key = entry.id;
    var isActive = state.selected === key;
    var row = ui.el(
      "button",
      isActive ? "ce-mem-row ce-mem-row--active" : "ce-mem-row",
    );
    row.type = "button";

    var top = ui.el("div", "ce-mem-row-top");
    var badges = ui.el("div", "ce-mem-row-badges");
    badges.appendChild(
      ui.createBadge({
        text: scopeLabel(entry.scope),
        variant: entry.scope === "global" ? "default" : "secondary",
      }),
    );
    badges.appendChild(
      ui.createBadge({ text: kindLabel(entry.kind), variant: "outline" }),
    );
    top.appendChild(badges);
    top.appendChild(ui.el("span", "ce-mem-row-time", nowRel(entry.updatedAt)));
    row.appendChild(top);

    var main = ui.el("div", "ce-mem-row-main");
    main.appendChild(
      ui.el("span", "ce-mem-row-title", entry.title || "Sans titre"),
    );
    main.appendChild(
      ui.el("p", "ce-mem-row-preview", clamp(entry.content || "", 100)),
    );
    row.appendChild(main);

    row.addEventListener("click", function () {
      state.selected = key;
      renderList();
      renderDetail();
    });

    return row;
  }

  function renderList() {
    clearChildren(refs.memList);

    if (!state.entries || !state.entries.length) {
      refs.memList.appendChild(
        ui.el("div", "ce-mem-subempty", "Aucune memoire trouvee."),
      );
      refs.entryCount.textContent = "";
      return;
    }

    refs.entryCount.textContent = state.entries.length + " entree" + (state.entries.length > 1 ? "s" : "");

    state.entries.forEach(function (entry) {
      refs.memList.appendChild(renderRow(entry));
    });
  }

  function appendKv(parent, label, value, mono) {
    var row = ui.el("div", "ce-mem-kv");
    row.appendChild(ui.el("span", "ce-mem-kv-label", label));
    var val = ui.el(
      "span",
      mono ? "ce-mem-kv-value ce-mem-kv-value--mono" : "ce-mem-kv-value",
      value || "-",
    );
    row.appendChild(val);
    parent.appendChild(row);
  }

  function renderDetail() {
    if (!state.selected) {
      refs.detailEmpty.style.display = "flex";
      refs.detailCard.style.display = "none";
      return;
    }

    var entry = state.entries.find(function (e) {
      return e.id === state.selected;
    });

    if (!entry) {
      state.selected = null;
      refs.detailEmpty.style.display = "flex";
      refs.detailCard.style.display = "none";
      return;
    }

    refs.detailEmpty.style.display = "none";
    refs.detailCard.style.display = "block";

    refs.detailTitle.textContent = entry.title || "Sans titre";
    refs.detailMeta.textContent =
      scopeLabel(entry.scope) +
      " \u00B7 " +
      kindLabel(entry.kind) +
      " \u00B7 mis a jour " +
      nowRel(entry.updatedAt);

    // Update archive button text
    refs.archiveBtn.textContent = entry.archived ? "Desarchiver" : "Archiver";

    clearChildren(refs.detailBody);

    // Summary badges
    var summary = ui.el("div", "ce-mem-summary");
    summary.appendChild(
      ui.createBadge({
        text: scopeLabel(entry.scope),
        variant: entry.scope === "global" ? "default" : "secondary",
      }),
    );
    summary.appendChild(
      ui.createBadge({ text: kindLabel(entry.kind), variant: "outline" }),
    );
    if (entry.archived) {
      summary.appendChild(
        ui.createBadge({ text: "Archive", variant: "secondary" }),
      );
    }
    if (entry.source) {
      summary.appendChild(
        ui.createBadge({ text: entry.source, variant: "secondary" }),
      );
    }
    refs.detailBody.appendChild(summary);

    // Content block
    var contentTitle = ui.el("p", "ce-mem-detail-section-title", "Contenu");
    refs.detailBody.appendChild(contentTitle);
    var contentBlock = ui.el(
      "div",
      "ce-mem-content-block",
      entry.content || "",
    );
    refs.detailBody.appendChild(contentBlock);

    // Tags
    if (entry.tags && entry.tags.length > 0) {
      var tagsTitle = ui.el("p", "ce-mem-detail-section-title", "Tags");
      refs.detailBody.appendChild(tagsTitle);
      var tagsWrap = ui.el("div", "ce-mem-tags");
      entry.tags.forEach(function (tag) {
        tagsWrap.appendChild(
          ui.createBadge({ text: tag, variant: "secondary" }),
        );
      });
      refs.detailBody.appendChild(tagsWrap);
    }

    // Metadata grid
    var metaTitle = ui.el("p", "ce-mem-detail-section-title", "Metadonnees");
    refs.detailBody.appendChild(metaTitle);

    var grid = ui.el("div", "ce-mem-kv-grid");
    appendKv(grid, "ID", entry.id, true);
    appendKv(grid, "Scope", scopeLabel(entry.scope), false);
    appendKv(grid, "Type", kindLabel(entry.kind), false);
    if (entry.projectId) {
      var projectName = "";
      state.projects.forEach(function (p) {
        if (p.id === entry.projectId) projectName = p.name || p.repoName || "";
      });
      appendKv(grid, "Projet", projectName || entry.projectId, false);
    }
    appendKv(grid, "Source", entry.source || "manual", false);
    appendKv(grid, "Cree le", fmtDate(entry.createdAt), false);
    appendKv(grid, "Mis a jour", fmtDate(entry.updatedAt), false);
    if (entry.lastAccessedAt) {
      appendKv(grid, "Dernier acces", fmtDate(entry.lastAccessedAt), false);
    }
    if (typeof entry.accessCount === "number" && entry.accessCount > 0) {
      appendKv(grid, "Nombre d'acces", String(entry.accessCount), false);
    }
    refs.detailBody.appendChild(grid);
  }

  // --- Data loading ---

  async function loadProjects() {
    var res = await window.chaton.extensionHostCall(
      EXTENSION_ID,
      "projects.list",
      {},
    );
    if (!res || !res.ok) {
      throw new Error(
        (res && res.error && res.error.message) ||
          "Impossible de charger la liste des projets.",
      );
    }
    state.projects = res.data || [];
    clearChildren(refs.createProject);
    var empty = ui.el("option", "", "Aucun");
    empty.value = "";
    refs.createProject.appendChild(empty);
    state.projects.forEach(function (project) {
      var opt = ui.el("option", "", project.name || project.repoName || "Projet");
      opt.value = project.id;
      refs.createProject.appendChild(opt);
    });
  }

  async function loadAll() {
    var payload = {
      scope: state.filterScope,
      limit: 200,
    };
    if (state.filterKind) payload.kind = state.filterKind;

    var res;
    if (state.searchQuery) {
      res = await call("memory.search", {
        query: state.searchQuery,
        scope: state.filterScope,
        limit: 100,
        kind: state.filterKind || undefined,
      });
    } else {
      res = await call("memory.list", payload);
    }

    if (!res || !res.ok) {
      throw new Error(
        (res && res.error && res.error.message) ||
          "Impossible de charger les entrees memoire.",
      );
    }

    state.entries = res.data || [];

    // If selected entry no longer exists, deselect
    if (state.selected) {
      var found = state.entries.some(function (e) {
        return e.id === state.selected;
      });
      if (!found) state.selected = null;
    }

    renderList();
    renderDetail();
  }

  // --- Event handlers ---

  // Search (via button or Enter)
  function doSearch() {
    state.searchQuery = refs.searchInput.value.trim();
    void loadAll();
  }

  refs.searchBtn.addEventListener("click", doSearch);
  refs.searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      doSearch();
    }
  });

  // Clear search on empty input
  refs.searchInput.addEventListener("input", function () {
    if (!refs.searchInput.value.trim() && state.searchQuery) {
      state.searchQuery = "";
      void loadAll();
    }
  });

  // Filters
  refs.scopeFilter.addEventListener("change", function () {
    state.filterScope = refs.scopeFilter.value;
    void loadAll();
  });

  refs.kindFilter.addEventListener("change", function () {
    state.filterKind = refs.kindFilter.value;
    void loadAll();
  });

  // Archive / Delete from detail pane
  refs.archiveBtn.addEventListener("click", async function () {
    if (!state.selected) return;
    var entry = state.entries.find(function (e) {
      return e.id === state.selected;
    });
    if (!entry) return;
    await call("memory.update", {
      id: entry.id,
      archived: !entry.archived,
    });
    void loadAll();
  });

  refs.deleteBtn.addEventListener("click", async function () {
    if (!state.selected) return;
    await call("memory.delete", { id: state.selected });
    state.selected = null;
    void loadAll();
  });

  // Create modal
  function openModal() {
    refs.modalBg.classList.add("is-open");
    refs.createTitle.focus();
  }

  function closeModal() {
    refs.modalBg.classList.remove("is-open");
  }

  refs.newBtn.addEventListener("click", openModal);
  refs.cancelBtn.addEventListener("click", closeModal);

  refs.modalBg.addEventListener("click", function (event) {
    if (event.target === refs.modalBg) closeModal();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && refs.modalBg.classList.contains("is-open")) {
      closeModal();
    }
  });

  refs.createBtn.addEventListener("click", async function () {
    var content = refs.createContent.value.trim();
    if (!content) {
      refs.createContent.focus();
      return;
    }

    var scope = refs.createScope.value;
    var projectId = refs.createProject.value || undefined;

    if (scope === "project" && !projectId) {
      refs.createProject.focus();
      return;
    }

    await call("memory.upsert", {
      scope: scope,
      projectId: projectId,
      kind: refs.createKind.value || "fact",
      title: refs.createTitle.value.trim() || undefined,
      content: content,
      tags: refs.createTags.value
        .split(",")
        .map(function (v) {
          return v.trim();
        })
        .filter(Boolean),
      source: "memory-ui",
    });

    // Reset form
    refs.createContent.value = "";
    refs.createTitle.value = "";
    refs.createTags.value = "";
    refs.createKind.value = "fact";
    refs.createScope.value = "global";
    refs.createProject.value = "";

    closeModal();
    void loadAll();
  });

  // Initial load
  loadProjects().then(loadAll).catch(function (error) {
    console.error("[memory] initial load failed", error);
    showFatalError(error && error.message ? error.message : String(error));
  });
})();
