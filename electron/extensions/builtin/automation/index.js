(function () {
  var EXTENSION_ID = "@chaton/automation";
  var MODEL_KEY = "dashboard:automation-model";
  var ui = window.chatonExtensionComponents;

  if (!ui) {
    throw new Error("chatonExtensionComponents is required");
  }

  ui.ensureStyles();

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

  var app = document.getElementById("app");
  var state = {
    rules: [],
    runs: [],
    projects: [],
    allModels: [],
    modelPicker: null,
    selected: null,
  };

  function nowRel(iso) {
    var ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return "Date inconnue";
    var h = Math.floor((Date.now() - ts) / 3600000);
    if (h < 1) return "A l'instant";
    if (h < 24) return "il y a " + h + " h";
    return "il y a " + Math.floor(h / 24) + " j";
  }

  function formatDuration(ms) {
    var value = Math.max(0, Number(ms) || 0);
    if (value === 0) return "Aucun cooldown";
    if (value < 60000) return value + " ms";
    var minutes = Math.round(value / 60000);
    if (minutes < 60) return minutes + " min";
    var hours = Math.round(value / 3600000);
    if (hours < 24) return hours + " h";
    var days = Math.round(value / 86400000);
    return days + " j";
  }

  function triggerLabel(trigger) {
    var map = {
      "conversation.created": "Nouvelle conversation",
      "conversation.message.received": "Nouveau message",
      "conversation.agent.ended": "Fin d'execution",
      "project.created": "Nouveau projet",
    };
    return map[trigger] || trigger || "Declencheur inconnu";
  }

  function statusLabel(run) {
    return run.status === "error" ? "Echec" : "Succes";
  }

  function call(api, payload) {
    return window.chaton.extensionCall(
      "chatons-ui",
      EXTENSION_ID,
      api,
      "^1.0.0",
      payload,
    );
  }

  function notify(message) {
    if (!message) return;
    if (
      window.chaton &&
      typeof window.chaton.extensionHostCall === "function"
    ) {
      void window.chaton.extensionHostCall(
        EXTENSION_ID,
        "notifications.notify",
        {
          title: "Automatisations",
          body: message,
        },
      );
    }
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function mapPlan(text, projects) {
    var t = String(text || "").trim();
    var low = t.toLowerCase();

    var trigger = "conversation.created";
    if (low.includes("message")) trigger = "conversation.message.received";
    if (low.includes("projet")) trigger = "project.created";
    if (low.includes("fin") || low.includes("termin")) {
      trigger = "conversation.agent.ended";
    }

    var action = "notify";
    if (
      low.includes("enqueue") ||
      low.includes("queue") ||
      low.includes("event")
    ) {
      action = "enqueueEvent";
    }
    if (low.includes("ouvrir") || low.includes("open")) {
      action = "runHostCommand";
    }
    if (
      low.includes("meteo") ||
      low.includes("weather") ||
      low.includes("api") ||
      low.includes("fetch") ||
      low.includes("data") ||
      low.includes("query") ||
      low.includes("recuper")
    ) {
      action = "executeAndNotify";
    }

    var cooldown = 0;
    var m = low.match(/(\d+)\s*(min|minute|minutes)/);
    if (m) cooldown = Number(m[1]) * 60000;
    m = low.match(/(\d+)\s*(h|heure|heures)/);
    if (m) cooldown = Number(m[1]) * 3600000;

    var projectId = "";
    (projects || []).some(function (p) {
      var hit =
        low.includes(String(p.name || "").toLowerCase()) ||
        low.includes(String(p.repoName || "").toLowerCase());
      if (hit) projectId = p.id;
      return hit;
    });

    return {
      name: t || "Nouvelle automatisation",
      trigger: trigger,
      action: action,
      cooldown: cooldown,
      projectId: projectId,
    };
  }

  function buildShell() {
    clearChildren(app);

    var page = ui.el("div", "ce-auto");
    var layout = ui.el("div", "ce-auto-layout");

    var inbox = ui.el("section", "ce-auto-inbox");
    var inboxHeader = ui.el("div", "ce-auto-inbox-header");
    var titleWrap = ui.el("div", "ce-auto-title-wrap");
    titleWrap.appendChild(ui.el("h1", "ce-auto-title", "Automatisations"));
    inboxHeader.appendChild(titleWrap);

    var newBtn = ui.createButton({ text: "+ Nouveau", variant: "ghost" });
    newBtn.id = "newBtn";
    newBtn.classList.add("ce-auto-new-btn");
    inboxHeader.appendChild(newBtn);
    inbox.appendChild(inboxHeader);

    var scheduledSection = ui.el("section", "ce-auto-section");
    scheduledSection.appendChild(ui.el("h2", "ce-auto-section-title", "Actives"));
    var scheduledList = ui.el("div", "ce-auto-list");
    scheduledList.id = "scheduledList";
    scheduledSection.appendChild(scheduledList);

    var finishedSection = ui.el("section", "ce-auto-section");
    finishedSection.appendChild(ui.el("h2", "ce-auto-section-title", "Executions recentes"));
    var finishedList = ui.el("div", "ce-auto-list");
    finishedList.id = "finishedList";
    finishedSection.appendChild(finishedList);

    var archivedSection = ui.el("section", "ce-auto-section");
    archivedSection.appendChild(
      ui.el("h2", "ce-auto-section-title", "Historique archive"),
    );
    var archivedList = ui.el("div", "ce-auto-list");
    archivedList.id = "archivedList";
    archivedSection.appendChild(archivedList);

    inbox.appendChild(scheduledSection);
    inbox.appendChild(finishedSection);
    inbox.appendChild(archivedSection);

    var detail = ui.el("section", "ce-auto-detail");
    var detailEmpty = ui.el("div", "ce-auto-empty");
    detailEmpty.id = "detailEmpty";
    var emptyIcon = ui.createSvgIcon([
      "M12 3a9 9 0 1 0 9 9",
      "M12 7v5l-3 3",
    ], 42);
    emptyIcon.classList.add("ce-auto-empty-icon");
    detailEmpty.appendChild(emptyIcon);
    detailEmpty.appendChild(
      ui.el("p", "ce-auto-empty-title", "Selectionnez une automatisation"),
    );
    detailEmpty.appendChild(
      ui.el("p", "ce-auto-empty-copy", "Choisissez une regle ou une execution pour voir les details et le contexte."),
    );

    var detailCard = ui.el("article", "ce-auto-detail-card");
    detailCard.id = "detailCard";
    var detailTitle = ui.el("h3", "ce-auto-detail-title", "");
    detailTitle.id = "detailTitle";
    var detailMeta = ui.el("p", "ce-auto-detail-meta", "");
    detailMeta.id = "detailMeta";
    var detailBody = ui.el("div", "ce-auto-detail-body");
    detailBody.id = "detailBody";
    detailCard.appendChild(detailTitle);
    detailCard.appendChild(detailMeta);
    detailCard.appendChild(detailBody);

    detail.appendChild(detailEmpty);
    detail.appendChild(detailCard);

    layout.appendChild(inbox);
    layout.appendChild(detail);
    page.appendChild(layout);

    var modalBg = ui.el("div", "ce-modal-backdrop");
    modalBg.id = "modalBg";
    modalBg.setAttribute("role", "dialog");
    modalBg.setAttribute("aria-modal", "true");
    modalBg.setAttribute("aria-labelledby", "modalTitle");

    var modal = ui.el("div", "ce-modal");
    var modalHeader = ui.el("div", "ce-modal__header");
    var modalTitle = ui.el("h3", "ce-modal__title", "Creer une automatisation");
    modalTitle.id = "modalTitle";
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(
      ui.el(
        "p",
        "ce-modal__description",
        "Decrivez le besoin, laissez l'assistant pre-remplir les champs, puis ajustez les reglages avant validation.",
      ),
    );

    var assist = ui.el("section", "ce-callout ce-stack");
    assist.appendChild(ui.el("p", "ce-callout__title", "Assistant de pre-remplissage"));
    assist.appendChild(
      ui.el(
        "p",
        "ce-callout__description",
        "Le formulaire propose un declencheur, une action et un cooldown initial.",
      ),
    );

    var instructionInput = ui.el("textarea", "ce-textarea");
    instructionInput.id = "instruction";
    instructionInput.placeholder =
      "Ex: Chaque lundi verifier les conversations Pixatwin et me notifier";
    assist.appendChild(
      ui.createField({ label: "Instructions", input: instructionInput }),
    );
    var assistActions = ui.el("div", "ce-toolbar");
    var fillBtn = ui.createButton({
      text: "Pre-remplir via IA",
      variant: "outline",
    });
    fillBtn.id = "fillBtn";
    assistActions.appendChild(fillBtn);
    assist.appendChild(assistActions);

    var grid = ui.el("div", "ce-grid ce-grid--2");

    var nameInput = ui.el("input", "ce-input");
    nameInput.id = "name";
    nameInput.placeholder = "Verifier les alertes";
    grid.appendChild(ui.createField({ label: "Nom", input: nameInput }));

    var projectSelect = ui.el("select", "ce-select");
    projectSelect.id = "project";
    grid.appendChild(
      ui.createField({
        label: "Projet",
        input: projectSelect,
        help: "Optionnel. Laissez vide pour une automatisation globale.",
      }),
    );

    var modelPickerHost = ui.el("div", "ce-model-picker");
    modelPickerHost.id = "modelPickerHost";
    grid.appendChild(
      ui.createField({
        label: "Modele",
        input: modelPickerHost,
        help: "Utilise le picker de modeles coherent avec Chatons.",
      }),
    );

    var triggerSelect = ui.el("select", "ce-select");
    triggerSelect.id = "trigger";
    [
      ["conversation.created", "Nouvelle conversation"],
      ["conversation.message.received", "Nouveau message"],
      ["conversation.agent.ended", "Fin d'agent"],
      ["project.created", "Nouveau projet"],
    ].forEach(function (entry) {
      var option = ui.el("option", "", entry[1]);
      option.value = entry[0];
      triggerSelect.appendChild(option);
    });
    grid.appendChild(ui.createField({ label: "Declencheur", input: triggerSelect }));

    var actionTypeSelect = ui.el("select", "ce-select");
    actionTypeSelect.id = "actionType";
    [
      ["notify", "Notification"],
      ["executeAndNotify", "Executer et notifier"],
      ["enqueueEvent", "Enqueue event"],
      ["runHostCommand", "Commande host"],
    ].forEach(function (entry) {
      var option = ui.el("option", "", entry[1]);
      option.value = entry[0];
      actionTypeSelect.appendChild(option);
    });
    grid.appendChild(ui.createField({ label: "Action", input: actionTypeSelect }));

    var cooldownInput = ui.el("input", "ce-input");
    cooldownInput.id = "cooldown";
    cooldownInput.type = "number";
    cooldownInput.min = "0";
    cooldownInput.value = "0";
    grid.appendChild(
      ui.createField({
        label: "Cooldown",
        input: cooldownInput,
        help: "Temps minimum entre deux executions. Saisissez une valeur en millisecondes.",
      }),
    );

    var requestInput = ui.el("textarea", "ce-textarea");
    requestInput.id = "request";
    requestInput.placeholder = "Decrivez precisement l'action a executer";
    var requestField = ui.createField({
      label: "Requete",
      input: requestInput,
      help: "Instruction envoyee a l'IA pour 'Executer et notifier'.",
    });

    var footerActions = ui.el("div", "ce-toolbar");
    var cancelBtn = ui.createButton({ text: "Annuler", variant: "ghost" });
    cancelBtn.id = "cancelBtn";
    var createBtn = ui.createButton({ text: "Creer", variant: "default" });
    createBtn.id = "createBtn";
    footerActions.appendChild(cancelBtn);
    footerActions.appendChild(createBtn);

    modal.appendChild(modalHeader);
    modal.appendChild(assist);
    modal.appendChild(ui.el("div", "ce-stack"));
    modal.appendChild(grid);
    modal.appendChild(ui.el("hr", "ce-divider"));
    modal.appendChild(requestField);
    modal.appendChild(footerActions);
    modalBg.appendChild(modal);

    page.appendChild(modalBg);
    app.appendChild(page);

    return {
      scheduledEl: scheduledList,
      finishedEl: finishedList,
      archivedEl: archivedList,
      detailEmpty: detailEmpty,
      detailCard: detailCard,
      detailTitle: detailTitle,
      detailMeta: detailMeta,
      detailBody: detailBody,
      modalBg: modalBg,
      nameInput: nameInput,
      projectSelect: projectSelect,
      modelPickerHost: modelPickerHost,
      triggerSelect: triggerSelect,
      actionTypeSelect: actionTypeSelect,
      cooldownInput: cooldownInput,
      requestInput: requestInput,
      instructionInput: instructionInput,
      newBtn: newBtn,
      cancelBtn: cancelBtn,
      fillBtn: fillBtn,
      createBtn: createBtn,
    };
  }

  var refs = buildShell();

  function appendEmpty(node, text) {
    clearChildren(node);
    node.appendChild(ui.el("div", "ce-auto-subempty", text));
  }

  function clamp(text, n) {
    var s = String(text || "");
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "...";
  }

  function classifyRuns() {
    var now = Date.now();
    var finished = [];
    var archived = [];

    state.runs.forEach(function (run) {
      var ts = Date.parse(run.createdAt || "");
      var old = Number.isFinite(ts) ? now - ts > 3 * 24 * 3600000 : false;
      if (run.status === "error" || old) archived.push(run);
      else finished.push(run);
    });

    return { finished: finished, archived: archived };
  }

  function rowClass(active) {
    return active ? "ce-auto-row ce-auto-row--active" : "ce-auto-row";
  }

  function renderRuleRow(rule) {
    var key = "rule:" + rule.id;
    var row = ui.el("button", rowClass(state.selected === key));
    row.type = "button";

    var top = ui.el("div", "ce-auto-row-top");
    top.appendChild(
      ui.createBadge({
        text: rule.enabled ? "Active" : "Pause",
        variant: rule.enabled ? "default" : "secondary",
      }),
    );
    top.appendChild(ui.el("span", "ce-auto-row-time", nowRel(rule.updatedAt)));
    row.appendChild(top);

    var main = ui.el("div", "ce-auto-row-main");
    var line = ui.el("div", "ce-auto-row-line");
    line.appendChild(ui.el("span", "ce-auto-row-title", rule.name || "Sans nom"));
    main.appendChild(line);
    main.appendChild(
      ui.el(
        "p",
        "ce-auto-row-meta",
        clamp(triggerLabel(rule.trigger) + " - " + formatDuration(rule.cooldown), 90),
      ),
    );

    row.appendChild(main);
    row.addEventListener("click", function () {
      state.selected = key;
      renderLists();
      renderDetail();
    });

    row.title = "Double-clic pour supprimer cette automatisation";
    row.addEventListener("dblclick", async function () {
      await call("automation.rules.delete", { id: rule.id });
      await load();
    });

    return row;
  }

  function renderRunRow(run, rulesById) {
    var key = "run:" + run.id;
    var row = ui.el("button", rowClass(state.selected === key));
    row.type = "button";

    var rule = rulesById[run.ruleId];
    var titleText = rule ? rule.name : "Automatisation inconnue";

    var top = ui.el("div", "ce-auto-row-top");
    top.appendChild(
      ui.createBadge({
        text: statusLabel(run),
        variant: run.status === "error" ? "outline" : "secondary",
      }),
    );
    top.appendChild(ui.el("span", "ce-auto-row-time", nowRel(run.createdAt)));
    row.appendChild(top);

    var main = ui.el("div", "ce-auto-row-main");
    var line = ui.el("div", "ce-auto-row-line");
    line.appendChild(ui.el("span", "ce-auto-row-title", titleText));
    main.appendChild(line);

    var metaText = run.status === "error"
      ? (run.errorMessage || run.eventTopic || "Erreur")
      : triggerLabel(run.eventTopic || "");
    main.appendChild(ui.el("p", "ce-auto-row-meta", clamp(metaText, 90)));

    row.appendChild(main);
    row.addEventListener("click", function () {
      state.selected = key;
      renderLists();
      renderDetail();
    });

    return row;
  }

  function renderLists() {
    if (!state.rules.length) {
      appendEmpty(refs.scheduledEl, "Aucune automatisation active.");
    } else {
      clearChildren(refs.scheduledEl);
      state.rules.forEach(function (rule) {
        refs.scheduledEl.appendChild(renderRuleRow(rule));
      });
    }

    var byId = {};
    state.rules.forEach(function (rule) {
      byId[rule.id] = rule;
    });

    var buckets = classifyRuns();

    if (!buckets.finished.length) {
      appendEmpty(refs.finishedEl, "Aucune execution recente.");
    } else {
      clearChildren(refs.finishedEl);
      buckets.finished.forEach(function (run) {
        refs.finishedEl.appendChild(renderRunRow(run, byId));
      });
    }

    if (!buckets.archived.length) {
      appendEmpty(refs.archivedEl, "Aucune entree archivee.");
    } else {
      clearChildren(refs.archivedEl);
      buckets.archived.forEach(function (run) {
        refs.archivedEl.appendChild(renderRunRow(run, byId));
      });
    }
  }

  function toPretty(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (_err) {
      return String(obj || "");
    }
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

  function appendKv(parent, label, value, mono) {
    var row = ui.el("div", "ce-auto-kv");
    row.appendChild(ui.el("span", "ce-auto-k", label));
    var val = ui.el("span", mono ? "ce-auto-v ce-auto-v--mono" : "ce-auto-v", value || "-");
    row.appendChild(val);
    parent.appendChild(row);
  }

  function renderRuleDetail(rule) {
    clearChildren(refs.detailBody);

    var summary = ui.el("div", "ce-auto-summary");
    summary.appendChild(
      ui.createBadge({
        text: rule.enabled ? "Active" : "Pause",
        variant: rule.enabled ? "default" : "secondary",
      }),
    );
    summary.appendChild(ui.createBadge({ text: triggerLabel(rule.trigger), variant: "outline" }));
    summary.appendChild(ui.createBadge({ text: formatDuration(rule.cooldown), variant: "secondary" }));
    refs.detailBody.appendChild(summary);

    var grid = ui.el("div", "ce-auto-detail-grid");
    appendKv(grid, "ID", rule.id, true);
    appendKv(grid, "Statut", rule.enabled ? "Active" : "Desactivee", false);
    appendKv(grid, "Cooldown", formatDuration(rule.cooldown), false);
    appendKv(grid, "Declencheur", triggerLabel(rule.trigger), false);
    appendKv(grid, "Mise a jour", fmtDate(rule.updatedAt), false);
    refs.detailBody.appendChild(grid);

    var actionsTitle = ui.el("p", "ce-auto-detail-section-title", "Actions configurees");
    var actionsCode = ui.el("pre", "ce-auto-detail-code", toPretty(rule.actions || []));
    refs.detailBody.appendChild(actionsTitle);
    refs.detailBody.appendChild(actionsCode);
  }

  function renderRunDetail(run) {
    clearChildren(refs.detailBody);

    var statusRow = ui.el("div", "ce-auto-status-row");
    var statusClass = run.status === "error"
      ? "ce-auto-status-pill ce-auto-status-pill--error"
      : "ce-auto-status-pill ce-auto-status-pill--ok";
    statusRow.appendChild(ui.el("span", statusClass, statusLabel(run)));
    statusRow.appendChild(ui.el("span", "ce-auto-status-time", fmtDate(run.createdAt)));
    refs.detailBody.appendChild(statusRow);

    var summary = ui.el("div", "ce-auto-summary");
    summary.appendChild(
      ui.createBadge({
        text: triggerLabel(run.eventTopic || ""),
        variant: "outline",
      }),
    );
    if (run.status === "error") {
      summary.appendChild(ui.createBadge({ text: "Attention requise", variant: "secondary" }));
    }
    refs.detailBody.appendChild(summary);

    var grid = ui.el("div", "ce-auto-detail-grid");
    appendKv(grid, "Execution ID", run.id, true);
    appendKv(grid, "Regle ID", run.ruleId, true);
    appendKv(grid, "Declencheur", triggerLabel(run.eventTopic || ""), false);
    refs.detailBody.appendChild(grid);

    var payload = run.eventPayload && typeof run.eventPayload === "object"
      ? run.eventPayload
      : null;
    if (payload) {
      var payloadTitle = ui.el("p", "ce-auto-detail-section-title", "Contexte");
      refs.detailBody.appendChild(payloadTitle);
      var payloadGrid = ui.el("div", "ce-auto-detail-grid");
      appendKv(payloadGrid, "Conversation", String(payload.conversationId || "-"), true);
      appendKv(payloadGrid, "Projet", String(payload.projectId || "-"), true);
      refs.detailBody.appendChild(payloadGrid);
    }

    if (run.errorMessage) {
      var errorTitle = ui.el("p", "ce-auto-detail-section-title", "Erreur");
      var errorBox = ui.el("div", "ce-auto-error-box", run.errorMessage);
      refs.detailBody.appendChild(errorTitle);
      refs.detailBody.appendChild(errorBox);
    }
  }

  function renderDetail() {
    if (!state.selected) {
      refs.detailEmpty.style.display = "flex";
      refs.detailCard.style.display = "none";
      return;
    }

    var parts = state.selected.split(":");
    var kind = parts[0];
    var id = parts.slice(1).join(":");

    if (kind === "rule") {
      var rule = state.rules.find(function (r) {
        return r.id === id;
      });
      if (!rule) {
        state.selected = null;
        renderDetail();
        return;
      }

      refs.detailEmpty.style.display = "none";
      refs.detailCard.style.display = "block";
      refs.detailTitle.textContent = rule.name || "Automatisation";
      refs.detailMeta.textContent =
        triggerLabel(rule.trigger) + " - mise a jour " + nowRel(rule.updatedAt);
      renderRuleDetail(rule);
      return;
    }

    var run = state.runs.find(function (r) {
      return r.id === id;
    });
    if (!run) {
      state.selected = null;
      renderDetail();
      return;
    }

    refs.detailEmpty.style.display = "none";
    refs.detailCard.style.display = "block";
    refs.detailTitle.textContent = run.status === "error" ? "Execution en erreur" : "Execution terminee";
    refs.detailMeta.textContent =
      triggerLabel(run.eventTopic || "") + " - " + nowRel(run.createdAt);
    renderRunDetail(run);
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
    var rulesRes = await call("automation.rules.list", {});
    var runsRes = await call("automation.runs.list", { limit: 80 });
    var initialState = await window.chaton.getInitialState();

    state.projects = initialState.projects || [];
    state.rules = rulesRes.ok ? rulesRes.data || [] : [];
    state.runs = runsRes.ok ? runsRes.data || [] : [];

    clearChildren(refs.projectSelect);
    var emptyProject = ui.el("option", "", "Tous les projets");
    emptyProject.value = "";
    refs.projectSelect.appendChild(emptyProject);
    state.projects.forEach(function (project) {
      var option = ui.el("option", "", project.name || project.repoName || "Projet");
      option.value = project.id;
      refs.projectSelect.appendChild(option);
    });

    if (state.selected) {
      var found = state.rules.some(function (r) {
        return state.selected === "rule:" + r.id;
      }) || state.runs.some(function (r) {
        return state.selected === "run:" + r.id;
      });
      if (!found) state.selected = null;
    }

    renderLists();
    renderDetail();
  }

  function openModal() {
    refs.modalBg.classList.add("is-open");
    refs.nameInput.focus();
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

  refs.fillBtn.addEventListener("click", async function () {
    var initialState = await window.chaton.getInitialState();
    var plan = mapPlan(refs.instructionInput.value, initialState.projects || []);
    refs.nameInput.value = plan.name;
    refs.triggerSelect.value = plan.trigger;
    refs.actionTypeSelect.value = plan.action;
    refs.cooldownInput.value = String(plan.cooldown);
    if (plan.projectId) refs.projectSelect.value = plan.projectId;
    if (!refs.requestInput.value.trim()) {
      refs.requestInput.value = refs.instructionInput.value.trim();
    }
    notify("Pre-remplissage IA applique.");
  });

  refs.createBtn.addEventListener("click", async function () {
    var name = refs.nameInput.value.trim();
    if (!name) {
      notify("Nom d'automatisation requis");
      refs.nameInput.focus();
      return;
    }

    var trigger = refs.triggerSelect.value;
    var actionType = refs.actionTypeSelect.value;
    var action;

    if (actionType === "notify") {
      action = {
        type: "notify",
        title: "Automation: " + name,
        body: refs.requestInput.value.trim() || "Trigger " + trigger,
      };
    } else if (actionType === "executeAndNotify") {
      action = {
        type: "executeAndNotify",
        title: "Automation: " + name,
        instruction:
          refs.requestInput.value.trim() || refs.instructionInput.value.trim(),
      };
    } else if (actionType === "enqueueEvent") {
      action = { type: "enqueueEvent", topic: "automation." + trigger };
    } else {
      action = {
        type: "runHostCommand",
        method: "open.mainView",
        params: { viewId: "automation.main" },
      };
    }

    action.model = state.modelPicker ? state.modelPicker.getSelected() : null;
    if (refs.projectSelect.value) action.projectId = refs.projectSelect.value;

    var res = await call("automation.rules.save", {
      name: name,
      trigger: trigger,
      enabled: true,
      conditions: [],
      actions: [action],
      cooldown: Math.max(0, Number(refs.cooldownInput.value) || 0),
    });

    if (!res.ok) {
      notify((res.error && res.error.message) || "Impossible de creer la regle");
      return;
    }

    closeModal();
    refs.nameInput.value = "";
    refs.requestInput.value = "";
    refs.instructionInput.value = "";
    refs.cooldownInput.value = "0";
    await load();
  });

  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data || data.type !== "chaton.extension.deeplink") return;
    var payload = data.payload || {};
    if (payload.viewId !== "automation.main") return;
    if (payload.target === "open-create-automation") openModal();
  });

  if (
    window.chatonUi &&
    typeof window.chatonUi.createModelPicker === "function"
  ) {
    state.modelPicker = window.chatonUi.createModelPicker({
      host: refs.modelPickerHost,
      onChange: function (modelKey) {
        if (modelKey) localStorage.setItem(MODEL_KEY, modelKey);
      },
      labels: {
        filterPlaceholder: "Filtrer les modeles...",
        more: "plus",
        scopedOnly: "scoped uniquement",
        noScoped: "Aucun modele scoped",
        noModels: "Aucun modele disponible",
      },
    });
  }

  loadModels().then(load);
})();
