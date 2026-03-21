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
      "cron": "Date et heure (cron)",
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
    var triggerData = "";

    // Check for cron/time-based patterns first
    var timePatterns = [
      /(?:chaque|tous les|toutes les|every|quotidien|daily|hebdomadaire|weekly)/i,
      /\d+\s*(?:min|minute|minutes|h|heure|heures|jour|jours|day|days|semaine|semaines|week|weeks)/i,
      /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /(?:\d{1,2})[:h](?:\d{2})?\s*(?:am|pm|h)?/i,
    ];
    var hasTimePattern = timePatterns.some(function (pattern) {
      return pattern.test(t);
    });

    if (hasTimePattern || low.includes("cron") || low.includes("planif") || low.includes("schedule")) {
      trigger = "cron";
      // Use the full text as triggerData for natural language parsing
      triggerData = t;
    } else if (low.includes("message")) {
      trigger = "conversation.message.received";
    } else if (low.includes("projet")) {
      trigger = "project.created";
    } else if (low.includes("fin") || low.includes("termin")) {
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
      low.includes("recuper") ||
      low.includes("verif") ||
      low.includes("check") ||
      low.includes("resume") ||
      low.includes("report")
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

    var result = {
      name: t || "Nouvelle automatisation",
      trigger: trigger,
      action: action,
      cooldown: cooldown,
      projectId: projectId,
    };

    if (triggerData) {
      result.triggerData = triggerData;
    }

    return result;
  }

  function buildShell() {
    clearChildren(app);

    var page = ui.el("div", "ce-shell");
    var layout = ui.el("div", "ce-shell-layout");

    var inbox = ui.el("section", "ce-shell-inbox");
    var inboxHeader = ui.el("div", "ce-shell-inbox-header");
    var titleWrap = ui.el("div", "ce-shell-title-wrap");
    titleWrap.appendChild(ui.el("h1", "ce-shell-title", "Automatisations"));
    inboxHeader.appendChild(titleWrap);

    var newBtn = ui.createButton({ text: "+ Nouveau", variant: "ghost" });
    newBtn.id = "newBtn";
    newBtn.classList.add("ce-shell-new-btn");
    inboxHeader.appendChild(newBtn);
    inbox.appendChild(inboxHeader);

    var scheduledSection = ui.el("section", "ce-shell-section");
    scheduledSection.appendChild(ui.el("h2", "ce-shell-section-title", "Actives"));
    var scheduledList = ui.el("div", "ce-shell-list");
    scheduledList.id = "scheduledList";
    scheduledSection.appendChild(scheduledList);

    var finishedSection = ui.el("section", "ce-shell-section");
    finishedSection.appendChild(ui.el("h2", "ce-shell-section-title", "Executions recentes"));
    var finishedList = ui.el("div", "ce-shell-list");
    finishedList.id = "finishedList";
    finishedSection.appendChild(finishedList);

    var archivedSection = ui.el("section", "ce-shell-section");
    archivedSection.appendChild(
      ui.el("h2", "ce-shell-section-title", "Historique archive"),
    );
    var archivedList = ui.el("div", "ce-shell-list");
    archivedList.id = "archivedList";
    archivedSection.appendChild(archivedList);

    inbox.appendChild(scheduledSection);
    inbox.appendChild(finishedSection);
    inbox.appendChild(archivedSection);

    var detail = ui.el("section", "ce-shell-detail");
    var detailEmpty = ui.el("div", "ce-shell-empty");
    detailEmpty.id = "detailEmpty";
    var emptyIcon = ui.createSvgIcon([
      "M12 3a9 9 0 1 0 9 9",
      "M12 7v5l-3 3",
    ], 42);
    emptyIcon.classList.add("ce-shell-empty-icon");
    detailEmpty.appendChild(emptyIcon);
    detailEmpty.appendChild(
      ui.el("p", "ce-shell-empty-title", "Selectionnez une automatisation"),
    );
    detailEmpty.appendChild(
      ui.el("p", "ce-shell-empty-copy", "Choisissez une regle ou une execution pour voir les details et le contexte."),
    );

    var detailCard = ui.el("article", "ce-shell-detail-card");
    detailCard.id = "detailCard";
    var detailTitle = ui.el("h3", "ce-shell-detail-title", "");
    detailTitle.id = "detailTitle";
    var detailMeta = ui.el("p", "ce-shell-detail-meta", "");
    detailMeta.id = "detailMeta";
    var detailToolbar = ui.el("div", "ce-shell-detail-actions");
    detailToolbar.id = "detailToolbar";
    var detailBody = ui.el("div", "ce-shell-detail-body");
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
      ["cron", "Date et heure (cron)"],
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

    // Cron scheduler UI (shown only when cron is selected)
    var cronField = ui.el("div", "ce-modal__primary ce-cron-field", "");
    cronField.style.display = "none";

    // Day of week selector
    var daysLabel = ui.el("label", "ce-field-label", "Jours de la semaine");
    daysLabel.style.cssText = "display:block;font-size:12px;font-weight:500;margin-bottom:8px;color:var(--ce-fg);";
    cronField.appendChild(daysLabel);

    var daysRow = ui.el("div", "ce-cron-days-row");
    var dayButtons = [];
    var dayNames = [
      { key: "0", label: "Dim" },
      { key: "1", label: "Lun" },
      { key: "2", label: "Mar" },
      { key: "3", label: "Mer" },
      { key: "4", label: "Jeu" },
      { key: "5", label: "Ven" },
      { key: "6", label: "Sam" },
    ];
    dayNames.forEach(function (day) {
      var btn = ui.el("button", "ce-cron-day-btn");
      btn.type = "button";
      btn.dataset.day = day.key;
      btn.textContent = day.label;
      btn.addEventListener("click", function () {
        btn.classList.toggle("ce-cron-day-btn--selected");
        updateCronPreview();
      });
      dayButtons.push(btn);
      daysRow.appendChild(btn);
    });
    cronField.appendChild(daysRow);

    // Time selector
    var timeRow = ui.el("div", "ce-cron-time-row");
    
    var hourSelect = ui.el("select", "ce-select ce-cron-time-select");
    hourSelect.id = "cronHour";
    for (var h = 0; h < 24; h++) {
      var hourOpt = ui.el("option", "", (h < 10 ? "0" : "") + h + " h");
      hourOpt.value = String(h);
      hourSelect.appendChild(hourOpt);
    }
    hourSelect.value = "9";
    hourSelect.addEventListener("change", updateCronPreview);

    var minuteSelect = ui.el("select", "ce-select ce-cron-time-select");
    minuteSelect.id = "cronMinute";
    for (var m = 0; m < 60; m += 5) {
      var minOpt = ui.el("option", "", (m < 10 ? "0" : "") + m + " min");
      minOpt.value = String(m);
      minuteSelect.appendChild(minOpt);
    }
    minuteSelect.value = "0";
    minuteSelect.addEventListener("change", updateCronPreview);

    timeRow.appendChild(ui.el("span", "ce-cron-time-label", "à"));
    timeRow.appendChild(hourSelect);
    timeRow.appendChild(ui.el("span", "ce-cron-time-separator", ":"));
    timeRow.appendChild(minuteSelect);
    cronField.appendChild(timeRow);

    // Quick presets
    var presetsRow = ui.el("div", "ce-cron-presets");
    var presets = [
      { label: "Tous les jours", days: ["0", "1", "2", "3", "4", "5", "6"] },
      { label: "Lun-Ven", days: ["1", "2", "3", "4", "5"] },
      { label: "Week-end", days: ["0", "6"] },
    ];
    presets.forEach(function (preset) {
      var presetBtn = ui.el("button", "ce-cron-preset-btn");
      presetBtn.type = "button";
      presetBtn.textContent = preset.label;
      presetBtn.addEventListener("click", function () {
        dayButtons.forEach(function (btn) {
          btn.classList.toggle("ce-cron-day-btn--selected", preset.days.includes(btn.dataset.day));
        });
        updateCronPreview();
      });
      presetsRow.appendChild(presetBtn);
    });
    cronField.appendChild(presetsRow);

    // Advanced mode toggle
    var advancedToggle = ui.el("button", "ce-cron-advanced-toggle");
    advancedToggle.type = "button";
    advancedToggle.innerHTML = "<span class='ce-cron-chevron'>\u25B8</span> Mode avancé";
    cronField.appendChild(advancedToggle);

    // Advanced cron input (hidden by default)
    var advancedPanel = ui.el("div", "ce-cron-advanced-panel");
    advancedPanel.style.display = "none";

    var cronInput = ui.el("input", "ce-input");
    cronInput.id = "cronExpression";
    cronInput.type = "text";
    cronInput.placeholder = "0 9 * * 1,3,5";
    var cronInputWrapper = ui.createField({ label: "Expression cron", input: cronInput });
    
    var cronHelp = ui.el("p", "", "min heure jour_mois mois jour_semaine");
    cronHelp.style.cssText = "font-size:11px;color:var(--ce-muted);margin-top:4px;margin-bottom:0;";
    cronInputWrapper.appendChild(cronHelp);
    advancedPanel.appendChild(cronInputWrapper);
    cronField.appendChild(advancedPanel);

    // Preview of generated expression
    var previewRow = ui.el("div", "ce-cron-preview");
    var previewLabel = ui.el("span", "ce-cron-preview-label", "Expression: ");
    var previewValue = ui.el("span", "ce-cron-preview-value", "0 9 * * *");
    previewValue.id = "cronPreview";
    previewRow.appendChild(previewLabel);
    previewRow.appendChild(previewValue);
    cronField.appendChild(previewRow);

    // Toggle advanced mode
    advancedToggle.addEventListener("click", function () {
      var isOpen = advancedPanel.style.display !== "none";
      advancedPanel.style.display = isOpen ? "none" : "block";
      advancedToggle.querySelector(".ce-cron-chevron").textContent = isOpen ? "\u25B8" : "\u25BE";
    });

    modal.appendChild(cronField);

    // Helper function to update cron preview
    function updateCronPreview() {
      var selectedDays = [];
      dayButtons.forEach(function (btn) {
        if (btn.classList.contains("ce-cron-day-btn--selected")) {
          selectedDays.push(btn.dataset.day);
        }
      });
      
      var hour = hourSelect.value || "9";
      var minute = minuteSelect.value || "0";
      
      var cronExpr;
      if (selectedDays.length === 0) {
        cronExpr = minute + " " + hour + " * * *";
      } else if (selectedDays.length === 7) {
        cronExpr = minute + " " + hour + " * * *";
      } else {
        cronExpr = minute + " " + hour + " * * " + selectedDays.join(",");
      }
      
      previewValue.textContent = cronExpr;
      cronInput.value = cronExpr;
    }

    // Show/hide conditional fields based on trigger selection
    triggerSelect.addEventListener("change", function() {
      extensionEventField.style.display = triggerSelect.value === "extension.event" ? "grid" : "none";
      cronField.style.display = triggerSelect.value === "cron" ? "grid" : "none";
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

    // Error message container (hidden by default)
    var errorContainer = ui.el("div", "ce-modal__error");
    errorContainer.id = "errorContainer";
    errorContainer.style.cssText = "display:none;color:#ef4444;font-size:13px;margin-bottom:12px;padding:10px 12px;background:rgba(239,68,68,0.1);border-radius:6px;border:1px solid rgba(239,68,68,0.2);";
    modal.appendChild(errorContainer);

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
      cronInput: cronInput,
      runOnceCheckbox: runOnceCheckbox,
      newBtn: newBtn,
      cancelBtn: cancelBtn,
      fillBtn: fillBtn,
      saveBtn: saveBtn,
      modalTitle: modalTitle,
      errorContainer: errorContainer,
    };
  }

  var refs = buildShell();

  function appendEmpty(node, text) {
    clearChildren(node);
    node.appendChild(ui.el("div", "ce-shell-subempty", text));
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
    return active ? "ce-shell-row ce-shell-row--active" : "ce-shell-row";
  }

  function renderRuleRow(rule) {
    var key = "rule:" + rule.id;
    var row = ui.el("button", rowClass(state.selected === key));
    row.type = "button";

    var top = ui.el("div", "ce-shell-row-top");
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
    top.appendChild(ui.el("span", "ce-shell-row-time", nowRel(rule.updatedAt)));
    row.appendChild(top);

    var main = ui.el("div", "ce-shell-row-main");
    var line = ui.el("div", "ce-shell-row-line");
    line.appendChild(ui.el("span", "ce-shell-row-title", rule.name || "Sans nom"));
    main.appendChild(line);

    var chips = ui.el("div", "ce-shell-row-chips");
    chips.appendChild(
      ui.createBadge({ text: triggerLabel(rule.trigger), variant: "outline" }),
    );
    chips.appendChild(
      ui.createBadge({ text: formatDuration(rule.cooldown), variant: "secondary" }),
    );
    main.appendChild(chips);
    main.appendChild(
      ui.el("p", "ce-shell-row-meta", clamp(summarizeAction(rule), 110)),
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

    var top = ui.el("div", "ce-shell-row-top");
    top.appendChild(
      ui.createBadge({
        text: statusLabel(run),
        variant: run.status === "error" ? "outline" : "secondary",
      }),
    );
    top.appendChild(ui.el("span", "ce-shell-row-time", nowRel(run.createdAt)));
    row.appendChild(top);

    var main = ui.el("div", "ce-shell-row-main");
    var line = ui.el("div", "ce-shell-row-line");
    line.appendChild(ui.el("span", "ce-shell-row-title", titleText));
    main.appendChild(line);

    var metaText = run.status === "error"
      ? (run.errorMessage || run.eventTopic || "Erreur")
      : triggerLabel(run.eventTopic || "");
    main.appendChild(ui.el("p", "ce-shell-row-meta", clamp(metaText, 90)));

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
    var row = ui.el("div", "ce-shell-kv");
    row.appendChild(ui.el("span", "ce-shell-k", label));
    var val = ui.el("span", mono ? "ce-shell-v ce-shell-v--mono" : "ce-shell-v", value || "-");
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
    deleteBtn.classList.add("ce-shell-danger-btn");
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
      // Notification désactivée - événement technique
      // notify("Automatisation supprimee.");
    });

    refs.detailToolbar.appendChild(editBtn);
    refs.detailToolbar.appendChild(toggleBtn);
    refs.detailToolbar.appendChild(deleteBtn);

    var summary = ui.el("div", "ce-shell-summary");
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

    var overview = ui.el("div", "ce-shell-highlight-grid");
    var instructionCard = ui.el("div", "ce-shell-highlight-card");
    instructionCard.appendChild(ui.el("p", "ce-shell-highlight-label", "Instruction"));
    instructionCard.appendChild(
      ui.el("p", "ce-shell-highlight-value", summarizeAction(rule)),
    );
    overview.appendChild(instructionCard);

    var scopeCard = ui.el("div", "ce-shell-highlight-card");
    scopeCard.appendChild(ui.el("p", "ce-shell-highlight-label", "Portee"));
    scopeCard.appendChild(
      ui.el(
        "p",
        "ce-shell-highlight-value",
        findProjectName(action.projectId || rule.projectId || ""),
      ),
    );
    overview.appendChild(scopeCard);
    refs.detailBody.appendChild(overview);

    var grid = ui.el("div", "ce-shell-kv-grid");
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
      var requestTitle = ui.el("p", "ce-shell-detail-section-title", "Contenu principal");
      var requestBox = ui.el(
        "div",
        "ce-shell-request-box",
        String(action.instruction || action.body || "-"),
      );
      refs.detailBody.appendChild(requestTitle);
      refs.detailBody.appendChild(requestBox);
    }

    var actionsTitle = ui.el("p", "ce-shell-detail-section-title", "Configuration complete");
    var actionsCode = ui.el("pre", "ce-shell-detail-code", toPretty(rule.actions || []));
    refs.detailBody.appendChild(actionsTitle);
    refs.detailBody.appendChild(actionsCode);
  }

  function renderRunDetail(run) {
    clearChildren(refs.detailBody);
    clearChildren(refs.detailToolbar);

    var statusRow = ui.el("div", "ce-shell-status-row");
    var statusClass = run.status === "error"
      ? "ce-shell-status-pill ce-shell-status-pill--error"
      : "ce-shell-status-pill ce-shell-status-pill--ok";
    statusRow.appendChild(ui.el("span", statusClass, statusLabel(run)));
    statusRow.appendChild(ui.el("span", "ce-shell-status-time", fmtDate(run.createdAt)));
    refs.detailBody.appendChild(statusRow);

    var summary = ui.el("div", "ce-shell-summary");
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

    var grid = ui.el("div", "ce-shell-kv-grid");
    appendKv(grid, "Execution ID", run.id, true);
    appendKv(grid, "Regle ID", run.ruleId, true);
    appendKv(grid, "Declencheur", triggerLabel(run.eventTopic || ""), false);
    refs.detailBody.appendChild(grid);

    var payload = run.eventPayload && typeof run.eventPayload === "object"
      ? run.eventPayload
      : null;
    if (payload) {
      var payloadTitle = ui.el("p", "ce-shell-detail-section-title", "Contexte");
      refs.detailBody.appendChild(payloadTitle);
      var payloadGrid = ui.el("div", "ce-shell-kv-grid");
      appendKv(payloadGrid, "Conversation", String(payload.conversationId || "-"), true);
      appendKv(payloadGrid, "Projet", String(payload.projectId || "-"), true);
      refs.detailBody.appendChild(payloadGrid);
    }

    if (run.errorMessage) {
      var errorTitle = ui.el("p", "ce-shell-detail-section-title", "Erreur");
      var errorBox = ui.el("div", "ce-shell-error-box", run.errorMessage);
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
    try {
      console.log('[Automation UI] Loading automations...');
      
      var rulesRes = await call("automation.rules.list", {});
      console.log('[Automation UI] Rules response:', { ok: rulesRes.ok, dataLength: rulesRes.data ? rulesRes.data.length : 0, error: rulesRes.error });
      
      var runsRes = await call("automation.runs.list", { limit: 80 });
      console.log('[Automation UI] Runs response:', { ok: runsRes.ok, dataLength: runsRes.data ? runsRes.data.length : 0, error: runsRes.error });
      
      var initialState = await window.chaton.getInitialState();

      state.projects = initialState.projects || [];
      state.rules = rulesRes.ok ? rulesRes.data || [] : [];
      state.runs = runsRes.ok ? runsRes.data || [] : [];

      if (!rulesRes.ok) {
        console.error('[Automation UI] Failed to load rules:', rulesRes.error);
        notify("Erreur de chargement des automatisations: " + (rulesRes.error && rulesRes.error.message ? rulesRes.error.message : 'Erreur inconnue'));
      }
      
      if (!runsRes.ok) {
        console.error('[Automation UI] Failed to load runs:', runsRes.error);
      }

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
    } catch (err) {
      console.error('[Automation UI] Load failed with exception:', err);
      notify("Erreur critique lors du chargement: " + String(err && err.message ? err.message : err));
    }
  }

  function resetForm() {
    state.editingRuleId = null;
    refs.modalTitle.textContent = "Creer une automatisation";
    refs.saveBtn.textContent = "Creer";
    refs.nameInput.value = "";
    // Hide error message
    if (refs.errorContainer) {
      refs.errorContainer.style.display = "none";
      refs.errorContainer.textContent = "";
    }
    refs.projectSelect.value = "";
    refs.triggerSelect.value = "conversation.created";
    refs.actionTypeSelect.value = "notify";
    refs.cooldownInput.value = "0";
    refs.requestInput.value = "";
    refs.instructionInput.value = "";
    if (refs.cronInput) {
      refs.cronInput.value = "";
    }
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
    // Hide conditional fields
    var cronField = document.querySelector(".ce-cron-field");
    if (cronField) cronField.style.display = "none";
    // Reset cron UI elements
    var dayButtons = document.querySelectorAll(".ce-cron-day-btn");
    dayButtons.forEach(function (btn) {
      btn.classList.remove("ce-cron-day-btn--selected");
    });
    var hourSelect = document.getElementById("cronHour");
    var minuteSelect = document.getElementById("cronMinute");
    if (hourSelect) hourSelect.value = "9";
    if (minuteSelect) minuteSelect.value = "0";
    var preview = document.getElementById("cronPreview");
    if (preview) preview.textContent = "0 9 * * *";
    // Hide advanced cron panel
    var cronAdvancedPanel = document.querySelector(".ce-cron-advanced-panel");
    var cronAdvancedToggle = document.querySelector(".ce-cron-advanced-toggle");
    if (cronAdvancedPanel) cronAdvancedPanel.style.display = "none";
    if (cronAdvancedToggle) {
      var chevron = cronAdvancedToggle.querySelector(".ce-cron-chevron");
      if (chevron) chevron.textContent = "\u25B8";
    }
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

    // Handle cron expression - stored in trigger_data from backend
    var cronExpr = rule.triggerData || "";
    if (refs.cronInput) {
      refs.cronInput.value = cronExpr;
    }

    // Parse cron expression and set UI elements
    if (rule.trigger === "cron" && cronExpr) {
      var parsed = parseCronExpression(cronExpr);
      if (parsed) {
        // Set day buttons
        var dayButtons = document.querySelectorAll(".ce-cron-day-btn");
        dayButtons.forEach(function (btn) {
          var day = btn.dataset.day;
          var isSelected = parsed.days.length === 0 || parsed.days.includes(day);
          btn.classList.toggle("ce-cron-day-btn--selected", isSelected);
        });

        // Set time selectors
        var hourSelect = document.getElementById("cronHour");
        var minuteSelect = document.getElementById("cronMinute");
        if (hourSelect) hourSelect.value = parsed.hour;
        if (minuteSelect) minuteSelect.value = parsed.minute;

        // Update preview
        var preview = document.getElementById("cronPreview");
        if (preview) preview.textContent = cronExpr;
      }
    }

    // Show/hide conditional fields based on trigger
    var cronField = document.querySelector(".ce-cron-field");
    if (cronField) {
      cronField.style.display = rule.trigger === "cron" ? "grid" : "none";
    }

    // Open advanced panel if any advanced field is set
    var hasAdvanced = cd > 0 || action.projectId || action.model || rule.runOnce;
    var panel = document.querySelector(".ce-modal__advanced-panel");
    var chevron = document.querySelector(".ce-modal__advanced-chevron");
    if (hasAdvanced && panel) {
      panel.style.display = "grid";
      if (chevron) chevron.textContent = "\u25BE";
    }
  }

  // Helper function to parse cron expression into components
  function parseCronExpression(expr) {
    var parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    var minute = parts[0];
    var hour = parts[1];
    var dayOfMonth = parts[2];
    var month = parts[3];
    var dayOfWeek = parts[4];

    var days = [];
    if (dayOfWeek !== "*") {
      // Parse day of week (can be comma-separated like "1,3,5" or ranges like "1-5")
      var dayParts = dayOfWeek.split(",");
      dayParts.forEach(function (part) {
        if (part.includes("-")) {
          var range = part.split("-");
          var start = parseInt(range[0], 10);
          var end = parseInt(range[1], 10);
          for (var i = start; i <= end; i++) {
            days.push(String(i));
          }
        } else {
          days.push(part);
        }
      });
    }

    return {
      minute: minute,
      hour: hour,
      days: days,
      dayOfMonth: dayOfMonth,
      month: month,
    };
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
    // Handle triggerData for cron expressions
    var triggerValue = String(data.trigger || "cron");
    if (triggerValue === "cron" && data.triggerData && refs.cronInput) {
      refs.cronInput.value = String(data.triggerData);
    }
    // Show/hide conditional fields based on trigger
    var cronField = document.getElementById("cronExpression")?.closest(".ce-modal__primary");
    if (cronField) {
      cronField.style.display = triggerValue === "cron" ? "grid" : "none";
    }
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
    // Handle cron expression from AI prefill
    if (plan.triggerData) {
      if (refs.cronInput) refs.cronInput.value = plan.triggerData;
      // Parse and update UI elements
      var parsed = parseCronExpression(plan.triggerData);
      if (parsed) {
        var dayButtons = document.querySelectorAll(".ce-cron-day-btn");
        dayButtons.forEach(function (btn) {
          var day = btn.dataset.day;
          var isSelected = parsed.days.length === 0 || parsed.days.includes(day);
          btn.classList.toggle("ce-cron-day-btn--selected", isSelected);
        });
        var hourSelect = document.getElementById("cronHour");
        var minuteSelect = document.getElementById("cronMinute");
        if (hourSelect) hourSelect.value = parsed.hour;
        if (minuteSelect) minuteSelect.value = parsed.minute;
        var preview = document.getElementById("cronPreview");
        if (preview) preview.textContent = plan.triggerData;
      }
    }
    // Show/hide conditional fields based on trigger
    var cronField = document.querySelector(".ce-cron-field");
    if (cronField) {
      cronField.style.display = plan.trigger === "cron" ? "grid" : "none";
    }
    notify("Pre-remplissage IA applique.");
  });

  refs.saveBtn.addEventListener("click", async function () {
    // Clear previous error
    if (refs.errorContainer) {
      refs.errorContainer.style.display = "none";
      refs.errorContainer.textContent = "";
    }

    var name = refs.nameInput.value.trim();
    if (!name) {
      var nameError = "Nom d'automatisation requis";
      if (refs.errorContainer) {
        refs.errorContainer.textContent = nameError;
        refs.errorContainer.style.display = "block";
      }
      notify(nameError);
      refs.nameInput.focus();
      return;
    }

    var trigger = refs.triggerSelect.value;
    var actionType = refs.actionTypeSelect.value;
    var instruction = refs.instructionInput.value.trim();
    var runOnce = refs.runOnceCheckbox.checked;
    var extensionEventName = refs.extensionEventName ? refs.extensionEventName.value.trim() : "";
    var cronExpression = refs.cronInput ? refs.cronInput.value.trim() : "";
    var action;

    // For extension events, use the custom event name
    var finalTrigger = trigger;
    if (trigger === "extension.event" && extensionEventName) {
      finalTrigger = "extension." + extensionEventName;
    }

    // Validate cron expression when cron trigger is selected
    if (trigger === "cron" && !cronExpression) {
      var cronError = "Expression cron requise pour le declencheur Date et heure";
      if (refs.errorContainer) {
        refs.errorContainer.textContent = cronError;
        refs.errorContainer.style.display = "block";
      }
      notify(cronError);
      if (refs.cronInput) refs.cronInput.focus();
      return;
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

    // Include cron expression in payload when trigger is cron
    if (trigger === "cron" && cronExpression) {
      payload.triggerData = cronExpression;
    }

    if (state.editingRuleId) {
      var currentRule = state.rules.find(function (rule) {
        return rule.id === state.editingRuleId;
      });
      if (currentRule) payload.enabled = currentRule.enabled;
    }

    var wasEditing = !!state.editingRuleId;
    var res = await call("automation.rules.save", payload);

    if (!res.ok) {
      var errorMsg = (res.error && res.error.message) ||
          (state.editingRuleId
            ? "Impossible de modifier la regle"
            : "Impossible de creer la regle");
      // Display error in modal
      if (refs.errorContainer) {
        refs.errorContainer.textContent = errorMsg;
        refs.errorContainer.style.display = "block";
      }
      notify(errorMsg);
      return;
    }

    closeModal();
    resetForm();
    await load();
    // Notification désactivée - événement technique
    // notify(wasEditing ? "Automatisation mise a jour." : "Automatisation creee.");
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
