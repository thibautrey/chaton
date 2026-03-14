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
    editingRuleId: null,
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
      "extension.event": "Evenement d'extension",
    };
    if (trigger && trigger.startsWith("extension.")) {
      return "Evenement: " + trigger.substring(10);
    }
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
    var detailToolbar = ui.el("div", "ce-auto-detail-toolbar");
    detailToolbar.id = "detailToolbar";
    var detailBody = ui.el("div", "ce-auto-detail-body");
    detailBody.id = "detailBody";
    detailCard.appendChild(detailTitle);
    detailCard.appendChild(detailMeta);
    detailCard.appendChild(detailToolbar);
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

    var modal = ui.el("div", "ce-modal ce-modal--compact");
    var modalHeader = ui.el("div", "ce-modal__header");
    var modalTitle = ui.el("h3", "ce-modal__title", "Creer une automatisation");
    modalTitle.id = "modalTitle";
    modalHeader.appendChild(modalTitle);
    modal.appendChild(modalHeader);

    // Primary fields: name + instruction
    var primaryFields = ui.el("div", "ce-modal__primary");

    var nameInput = ui.el("input", "ce-input");
    nameInput.id = "name";
    nameInput.placeholder = "Ex: Verifier les alertes";
    primaryFields.appendChild(ui.createField({ label: "Nom", input: nameInput }));

    var instructionInput = ui.el("textarea", "ce-textarea ce-textarea--short");
    instructionInput.id = "instruction";
    instructionInput.placeholder =
      "Ex: Chaque lundi verifier les conversations et me notifier un resume";
    primaryFields.appendChild(
      ui.createField({ label: "Instruction", input: instructionInput }),
    );

    // Hidden request field keeps compatibility -- synced from instruction
    var requestInput = ui.el("textarea", "ce-textarea");
    requestInput.id = "request";
    requestInput.style.display = "none";

    modal.appendChild(primaryFields);

    // Inline row: trigger + action
    var inlineRow = ui.el("div", "ce-modal__inline-row");

    var triggerSelect = ui.el("select", "ce-select");
    triggerSelect.id = "trigger";
    [
      ["conversation.created", "Nouvelle conversation"],
      ["conversation.message.received", "Nouveau message"],
      ["conversation.agent.ended", "Fin d'agent"],
      ["project.created", "Nouveau projet"],
      ["extension.event", "Evenement d'extension"],
    ].forEach(function (entry) {
      var option = ui.el("option", "", entry[1]);
      option.value = entry[0];
      triggerSelect.appendChild(option);
    });
    inlineRow.appendChild(ui.createField({ label: "Declencheur", input: triggerSelect }));

    // Extension event name field (shown only when extension.event is selected)
    var extensionEventField = ui.el("div", "ce-modal__inline-row", "");
    extensionEventField.style.display = "none";
    
    var eventNameInput = ui.el("input", "ce-input");
    eventNameInput.id = "extensionEventName";
    eventNameInput.type = "text";
    eventNameInput.placeholder = "Nom de l'evenement (ex: myevent)";
    extensionEventField.appendChild(
      ui.createField({ label: "Nom de l'evenement", input: eventNameInput })
    );
    modal.appendChild(extensionEventField);

    // Show/hide extension event field based on trigger selection
    triggerSelect.addEventListener("change", function() {
      extensionEventField.style.display = triggerSelect.value === "extension.event" ? "grid" : "none";
    });

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
    inlineRow.appendChild(ui.createField({ label: "Action", input: actionTypeSelect }));

    modal.appendChild(inlineRow);

    // Collapsible advanced section
    var advancedToggle = ui.el("button", "ce-modal__advanced-toggle");
    advancedToggle.type = "button";
    var advancedChevron = ui.el("span", "ce-modal__advanced-chevron", "\u25B8");
    advancedToggle.appendChild(advancedChevron);
    advancedToggle.appendChild(document.createTextNode(" Options avancees"));
    modal.appendChild(advancedToggle);

    var advancedPanel = ui.el("div", "ce-modal__advanced-panel");
    advancedPanel.style.display = "none";

    var advancedGrid = ui.el("div", "ce-modal__inline-row");

    var cooldownSelect = ui.el("select", "ce-select");
    cooldownSelect.id = "cooldown";
    var cooldownInput = cooldownSelect;
    [
      ["0", "Aucun"],
      ["60000", "1 minute"],
      ["300000", "5 minutes"],
      ["900000", "15 minutes"],
      ["3600000", "1 heure"],
      ["86400000", "1 jour"],
    ].forEach(function (entry) {
      var option = ui.el("option", "", entry[1]);
      option.value = entry[0];
      cooldownSelect.appendChild(option);
    });
    advancedGrid.appendChild(
      ui.createField({ label: "Cooldown", input: cooldownSelect }),
    );

    var runOnceCheckbox = ui.el("input", "ce-checkbox");
    runOnceCheckbox.id = "runOnce";
    runOnceCheckbox.type = "checkbox";
    var runOnceLabel = ui.el("label", "ce-checkbox-label");
    runOnceLabel.appendChild(runOnceCheckbox);
    runOnceLabel.appendChild(document.createTextNode(" Executer une seule fois"));
    advancedGrid.appendChild(
      ui.createField({ label: "", input: runOnceLabel }),
    );

    var projectSelect = ui.el("select", "ce-select");
    projectSelect.id = "project";
    advancedGrid.appendChild(
      ui.createField({ label: "Projet", input: projectSelect }),
    );

    advancedPanel.appendChild(advancedGrid);

    var modelPickerHost = ui.el("div", "ce-model-picker");
    modelPickerHost.id = "modelPickerHost";
    advancedPanel.appendChild(
      ui.createField({ label: "Modele", input: modelPickerHost }),
    );

    modal.appendChild(advancedPanel);

    advancedToggle.addEventListener("click", function () {
      var open = advancedPanel.style.display !== "none";
      advancedPanel.style.display = open ? "none" : "grid";
      advancedChevron.textContent = open ? "\u25B8" : "\u25BE";
    });

    // AI pre-fill button sits inline with footer
    var fillBtn = ui.createButton({
      text: "Pre-remplir via IA",
      variant: "outline",
    });
    fillBtn.id = "fillBtn";

    var footerActions = ui.el("div", "ce-modal__footer");
    footerActions.appendChild(fillBtn);
    var footerRight = ui.el("div", "ce-modal__footer-right");
    var cancelBtn = ui.createButton({ text: "Annuler", variant: "ghost" });
    cancelBtn.id = "cancelBtn";
    var saveBtn = ui.createButton({ text: "Creer", variant: "default" });
    saveBtn.id = "saveBtn";
    footerRight.appendChild(cancelBtn);
    footerRight.appendChild(saveBtn);
    footerActions.appendChild(footerRight);

    modal.appendChild(requestInput);
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
      detailToolbar: detailToolbar,
      modalBg: modalBg,
      nameInput: nameInput,
      projectSelect: projectSelect,
      modelPickerHost: modelPickerHost,
      triggerSelect: triggerSelect,
      actionTypeSelect: actionTypeSelect,
      cooldownInput: cooldownInput,
      requestInput: requestInput,
      instructionInput: instructionInput,
      extensionEventName: extensionEventName,
      newBtn: newBtn,
      cancelBtn: cancelBtn,
      fillBtn: fillBtn,
      saveBtn: saveBtn,
      modalTitle: modalTitle,
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

  function getPrimaryAction(rule) {
    if (!rule || !Array.isArray(rule.actions) || !rule.actions.length) return null;
    var action = rule.actions[0];
    return action && typeof action === "object" ? action : null;
  }

  function actionTypeLabel(type) {
    var map = {
      notify: "Notification",
      executeAndNotify: "Executer et notifier",
      enqueueEvent: "Enqueue event",
      runHostCommand: "Commande host",
    };
    return map[type] || type || "Action inconnue";
  }

  function summarizeAction(rule) {
    var action = getPrimaryAction(rule);
    if (!action) return "Aucune action";
    if (action.type === "notify") return action.body || action.title || "Notification";
    if (action.type === "executeAndNotify") return action.instruction || "Execution IA";
    if (action.type === "enqueueEvent") return action.topic || "Evenement automatise";
    if (action.type === "runHostCommand") return action.method || "Commande host";
    return actionTypeLabel(action.type);
  }

  function findProjectName(projectId) {
    if (!projectId) return "Globale";
    var project = state.projects.find(function (item) {
      return item.id === projectId;
    });
    return (project && (project.name || project.repoName)) || projectId;
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
    if (rule.runOnce) {
      top.appendChild(
        ui.createBadge({
          text: rule.enabled ? "Une fois" : "Complete",
          variant: rule.enabled ? "default" : "secondary",
        }),
      );
    } else {
      top.appendChild(
        ui.createBadge({
          text: rule.enabled ? "Active" : "Pause",
          variant: rule.enabled ? "default" : "secondary",
        }),
      );
    }
    top.appendChild(ui.el("span", "ce-auto-row-time", nowRel(rule.updatedAt)));
    row.appendChild(top);

    var main = ui.el("div", "ce-auto-row-main");
    var line = ui.el("div", "ce-auto-row-line");
    line.appendChild(ui.el("span", "ce-auto-row-title", rule.name || "Sans nom"));
    main.appendChild(line);

    var chips = ui.el("div", "ce-auto-row-chips");
    chips.appendChild(
      ui.createBadge({ text: triggerLabel(rule.trigger), variant: "outline" }),
    );
    chips.appendChild(
      ui.createBadge({ text: formatDuration(rule.cooldown), variant: "secondary" }),
    );
    main.appendChild(chips);
    main.appendChild(
      ui.el("p", "ce-auto-row-meta", clamp(summarizeAction(rule), 110)),
    );

    row.appendChild(main);
    row.addEventListener("click", function () {
      state.selected = key;
      renderLists();
      renderDetail();
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
    clearChildren(refs.detailToolbar);

    var action = getPrimaryAction(rule) || {};
    var editBtn = ui.createButton({ text: "Modifier", variant: "outline" });
    editBtn.addEventListener("click", function () {
      openModal(rule);
    });

    var toggleBtn = ui.createButton({
      text: rule.enabled ? "Desactiver" : "Activer",
      variant: "ghost",
    });
    toggleBtn.addEventListener("click", async function () {
      await saveRuleFromDraft(rule, { enabled: !rule.enabled });
    });

    var deleteBtn = ui.createButton({ text: "Supprimer", variant: "ghost" });
    deleteBtn.classList.add("ce-auto-danger-btn");
    deleteBtn.addEventListener("click", async function () {
      var ok = window.confirm(
        "Supprimer l'automatisation \"" + (rule.name || "Sans nom") + "\" ?",
      );
      if (!ok) return;
      var res = await call("automation.rules.delete", { id: rule.id });
      if (!res.ok) {
        notify((res.error && res.error.message) || "Impossible de supprimer la regle");
        return;
      }
      if (state.selected === "rule:" + rule.id) state.selected = null;
      await load();
      notify("Automatisation supprimee.");
    });

    refs.detailToolbar.appendChild(editBtn);
    refs.detailToolbar.appendChild(toggleBtn);
    refs.detailToolbar.appendChild(deleteBtn);

    var summary = ui.el("div", "ce-auto-summary");
    if (rule.runOnce) {
      summary.appendChild(
        ui.createBadge({
          text: rule.enabled ? "Une fois" : "Complete",
          variant: rule.enabled ? "default" : "secondary",
        }),
      );
    } else {
      summary.appendChild(
        ui.createBadge({
          text: rule.enabled ? "Active" : "Pause",
          variant: rule.enabled ? "default" : "secondary",
        }),
      );
    }
    summary.appendChild(ui.createBadge({ text: triggerLabel(rule.trigger), variant: "outline" }));
    summary.appendChild(ui.createBadge({ text: formatDuration(rule.cooldown), variant: "secondary" }));
    summary.appendChild(
      ui.createBadge({ text: actionTypeLabel(action.type), variant: "secondary" }),
    );
    refs.detailBody.appendChild(summary);

    var overview = ui.el("div", "ce-auto-highlight-grid");
    var instructionCard = ui.el("div", "ce-auto-highlight-card");
    instructionCard.appendChild(ui.el("p", "ce-auto-highlight-label", "Instruction"));
    instructionCard.appendChild(
      ui.el("p", "ce-auto-highlight-value", summarizeAction(rule)),
    );
    overview.appendChild(instructionCard);

    var scopeCard = ui.el("div", "ce-auto-highlight-card");
    scopeCard.appendChild(ui.el("p", "ce-auto-highlight-label", "Portee"));
    scopeCard.appendChild(
      ui.el(
        "p",
        "ce-auto-highlight-value",
        findProjectName(action.projectId || rule.projectId || ""),
      ),
    );
    overview.appendChild(scopeCard);
    refs.detailBody.appendChild(overview);

    var grid = ui.el("div", "ce-auto-detail-grid");
    appendKv(grid, "ID", rule.id, true);
    appendKv(grid, "Statut", rule.runOnce ? (rule.enabled ? "Une execution" : "Complete") : (rule.enabled ? "Active" : "Desactivee"), false);
    appendKv(grid, "Cooldown", formatDuration(rule.cooldown), false);
    appendKv(grid, "Declencheur", triggerLabel(rule.trigger), false);
    appendKv(grid, "Modele", String(action.model || "Modele par defaut"), true);
    appendKv(grid, "Projet", findProjectName(action.projectId || ""), false);
    appendKv(grid, "Execution unique", rule.runOnce ? "Oui" : "Non", false);
    appendKv(grid, "Mise a jour", fmtDate(rule.updatedAt), false);
    refs.detailBody.appendChild(grid);

    if (action.type === "executeAndNotify" || action.type === "notify") {
      var requestTitle = ui.el("p", "ce-auto-detail-section-title", "Contenu principal");
      var requestBox = ui.el(
        "div",
        "ce-auto-request-box",
        String(action.instruction || action.body || "-"),
      );
      refs.detailBody.appendChild(requestTitle);
      refs.detailBody.appendChild(requestBox);
    }

    var actionsTitle = ui.el("p", "ce-auto-detail-section-title", "Configuration complete");
    var actionsCode = ui.el("pre", "ce-auto-detail-code", toPretty(rule.actions || []));
    refs.detailBody.appendChild(actionsTitle);
    refs.detailBody.appendChild(actionsCode);
  }

  function renderRunDetail(run) {
    clearChildren(refs.detailBody);
    clearChildren(refs.detailToolbar);

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

  function resetForm() {
    state.editingRuleId = null;
    refs.modalTitle.textContent = "Creer une automatisation";
    refs.saveBtn.textContent = "Creer";
    refs.nameInput.value = "";
    refs.projectSelect.value = "";
    refs.triggerSelect.value = "conversation.created";
    refs.actionTypeSelect.value = "notify";
    refs.cooldownInput.value = "0";
    refs.requestInput.value = "";
    refs.instructionInput.value = "";
    if (refs.runOnceCheckbox) {
      refs.runOnceCheckbox.checked = false;
    }
    if (state.modelPicker) {
      var saved = localStorage.getItem(MODEL_KEY);
      state.modelPicker.setSelected(saved || null);
    }
    // Collapse advanced panel on reset
    var panel = document.querySelector(".ce-modal__advanced-panel");
    var chevron = document.querySelector(".ce-modal__advanced-chevron");
    if (panel) panel.style.display = "none";
    if (chevron) chevron.textContent = "\u25B8";
  }

  function populateForm(rule) {
    resetForm();
    state.editingRuleId = rule.id;
    refs.modalTitle.textContent = "Modifier une automatisation";
    refs.saveBtn.textContent = "Enregistrer";
    refs.nameInput.value = rule.name || "";
    refs.triggerSelect.value = rule.trigger || "conversation.created";

    // Map cooldown value to nearest select option
    var cd = Number(rule.cooldown) || 0;
    var opts = [0, 60000, 300000, 900000, 3600000, 86400000];
    var best = "0";
    opts.forEach(function (v) { if (v <= cd) best = String(v); });
    refs.cooldownInput.value = best;

    var action = getPrimaryAction(rule) || {};
    refs.actionTypeSelect.value = action.type || "notify";
    refs.requestInput.value = String(action.instruction || action.body || "");
    refs.instructionInput.value = String(action.instruction || action.body || "");
    refs.projectSelect.value = String(action.projectId || "");
    if (state.modelPicker) {
      state.modelPicker.setSelected(action.model || localStorage.getItem(MODEL_KEY) || null);
    }

    // Set runOnce checkbox
    refs.runOnceCheckbox.checked = rule.runOnce || false;

    // Open advanced panel if any advanced field is set
    var hasAdvanced = cd > 0 || action.projectId || action.model || rule.runOnce;
    var panel = document.querySelector(".ce-modal__advanced-panel");
    var chevron = document.querySelector(".ce-modal__advanced-chevron");
    if (hasAdvanced && panel) {
      panel.style.display = "grid";
      if (chevron) chevron.textContent = "\u25BE";
    }
  }

  function openModal(rule) {
    if (rule) populateForm(rule);
    else resetForm();
    refs.modalBg.classList.add("is-open");
    refs.nameInput.focus();
  }

  function prefillSuggestion(params) {
    resetForm();
    var data = params && typeof params === "object" ? params : {};
    refs.modalTitle.textContent = "Review automation suggestion";
    refs.saveBtn.textContent = "Create";
    refs.nameInput.value = String(data.name || "");
    refs.instructionInput.value = String(data.instruction || "");
    refs.requestInput.value = String(data.instruction || "");
    refs.triggerSelect.value = String(data.trigger || "cron");
    refs.actionTypeSelect.value = String(data.actionType || "executeAndNotify");
    var suggestionCooldown = Math.max(0, Number(data.cooldown) || 0);
    var opts = [0, 60000, 300000, 900000, 3600000, 86400000];
    var best = "0";
    opts.forEach(function (v) { if (v <= suggestionCooldown) best = String(v); });
    refs.cooldownInput.value = best;
    if (data.runOnce) refs.runOnceCheckbox.checked = true;
    refs.modalBg.classList.add("is-open");
    refs.nameInput.focus();
  }

  function closeModal() {
    refs.modalBg.classList.remove("is-open");
    resetForm();
  }

  async function saveRuleFromDraft(rule, overrides) {
    var action = getPrimaryAction(rule) || {};
    var payload = {
      id: rule.id,
      name: (overrides && overrides.name) || rule.name,
      trigger: (overrides && overrides.trigger) || rule.trigger,
      enabled:
        overrides && Object.prototype.hasOwnProperty.call(overrides, "enabled")
          ? overrides.enabled
          : rule.enabled,
      conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
      actions: [
        {
          type: action.type,
          title: action.title,
          body: action.body,
          instruction: action.instruction,
          topic: action.topic,
          method: action.method,
          params: action.params,
          model:
            overrides && Object.prototype.hasOwnProperty.call(overrides, "model")
              ? overrides.model
              : action.model,
          projectId:
            overrides && Object.prototype.hasOwnProperty.call(overrides, "projectId")
              ? overrides.projectId
              : action.projectId,
        },
      ],
      cooldown:
        overrides && Object.prototype.hasOwnProperty.call(overrides, "cooldown")
          ? overrides.cooldown
          : rule.cooldown,
    };

    var cleanedAction = payload.actions[0];
    Object.keys(cleanedAction).forEach(function (key) {
      if (
        cleanedAction[key] === undefined ||
        cleanedAction[key] === null ||
        cleanedAction[key] === ""
      ) {
        delete cleanedAction[key];
      }
    });

    var res = await call("automation.rules.save", payload);
    if (!res.ok) {
      notify((res.error && res.error.message) || "Impossible de sauvegarder la regle");
      return false;
    }
    await load();
    return true;
  }

  refs.newBtn.addEventListener("click", function () {
    openModal();
  });
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
    // Map cooldown to nearest select value
    var cd = plan.cooldown;
    var opts = [0, 60000, 300000, 900000, 3600000, 86400000];
    var best = "0";
    opts.forEach(function (v) { if (v <= cd) best = String(v); });
    refs.cooldownInput.value = best;
    if (plan.projectId) refs.projectSelect.value = plan.projectId;
    notify("Pre-remplissage IA applique.");
  });

  refs.saveBtn.addEventListener("click", async function () {
    var name = refs.nameInput.value.trim();
    if (!name) {
      notify("Nom d'automatisation requis");
      refs.nameInput.focus();
      return;
    }

    var trigger = refs.triggerSelect.value;
    var actionType = refs.actionTypeSelect.value;
    var instruction = refs.instructionInput.value.trim();
    var runOnce = refs.runOnceCheckbox.checked;
    var extensionEventName = refs.extensionEventName ? refs.extensionEventName.value.trim() : "";
    var action;

    // For extension events, use the custom event name
    var finalTrigger = trigger;
    if (trigger === "extension.event" && extensionEventName) {
      finalTrigger = "extension." + extensionEventName;
    }

    if (actionType === "notify") {
      action = {
        type: "notify",
        title: "Automation: " + name,
        body: instruction || "Trigger " + finalTrigger,
      };
    } else if (actionType === "executeAndNotify") {
      action = {
        type: "executeAndNotify",
        title: "Automation: " + name,
        instruction: instruction,
      };
    } else if (actionType === "enqueueEvent") {
      action = { type: "enqueueEvent", topic: "automation." + finalTrigger };
    } else {
      action = {
        type: "runHostCommand",
        method: "open.mainView",
        params: { viewId: "automation.main" },
      };
    }

    action.model = state.modelPicker ? state.modelPicker.getSelected() : null;
    if (refs.projectSelect.value) action.projectId = refs.projectSelect.value;

    var payload = {
      id: state.editingRuleId || undefined,
      name: name,
      trigger: finalTrigger,
      enabled: true,
      conditions: [],
      actions: [action],
      cooldown: Math.max(0, Number(refs.cooldownInput.value) || 0),
      runOnce: runOnce,
    };

    if (state.editingRuleId) {
      var currentRule = state.rules.find(function (rule) {
        return rule.id === state.editingRuleId;
      });
      if (currentRule) payload.enabled = currentRule.enabled;
    }

    var wasEditing = !!state.editingRuleId;
    var res = await call("automation.rules.save", payload);

    if (!res.ok) {
      notify(
        (res.error && res.error.message) ||
          (state.editingRuleId
            ? "Impossible de modifier la regle"
            : "Impossible de creer la regle"),
      );
      return;
    }

    closeModal();
    resetForm();
    await load();
    notify(wasEditing ? "Automatisation mise a jour." : "Automatisation creee.");
  });

  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data || data.type !== "chaton.extension.deeplink") return;
    var payload = data.payload || {};
    if (payload.viewId !== "automation.main") return;
    if (payload.target === "open-create-automation") openModal();
    if (payload.target === "open-create-automation-suggestion") {
      prefillSuggestion(payload.params || {});
    }
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
