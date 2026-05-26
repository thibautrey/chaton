(function () {
  var EXTENSION_ID = "@chaton/projects";

  function callHost(method, payload) {
    return window.chaton.extensionHostCall(EXTENSION_ID, method, payload);
  }

  function normalizeLimit(value) {
    if (value === undefined || value === null) return { ok: true, value: null };
    if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, error: "limit must be a finite number" };
    if (!Number.isInteger(value)) return { ok: false, error: "limit must be an integer" };
    if (value < 1) return { ok: false, error: "limit must be at least 1" };
    if (value > 500) return { ok: false, error: "limit must be at most 500" };
    return { ok: true, value: value };
  }

  function handleToolCall(toolName, params) {
    switch (toolName) {
      case "chatons_list_projects": {
        var includeArchived = params && params.includeArchived === true;
        var normalizedLimit = normalizeLimit(params && params.limit);
        if (!normalizedLimit.ok) return { error: normalizedLimit.error };
        var limit = normalizedLimit.value;
        var result = callHost("projects.list", {});
        if (!result.ok) {
          return { error: result.error && result.error.message ? result.error.message : "Failed to list projects" };
        }
        var projects = (result.data && Array.isArray(result.data) ? result.data : []).filter(function (p) {
          return includeArchived || !p.isArchived;
        });
        if (limit && limit > 0) {
          projects = projects.slice(0, limit);
        }
        return { data: projects };
      }

      case "chatons_get_project": {
        var projectId = params && params.projectId;
        if (!projectId) {
          return { error: "projectId is required" };
        }
        var result = callHost("projects.get", { projectId: projectId });
        if (!result.ok) {
          return { error: result.error && result.error.message ? result.error.message : "Failed to get project" };
        }
        return { data: result.data };
      }

      case "chatons_get_project_conversations": {
        var pid = params && params.projectId;
        if (!pid) {
          return { error: "projectId is required" };
        }
        var result = callHost("conversations.list", {});
        if (!result.ok) {
          return { error: result.error && result.error.message ? result.error.message : "Failed to list conversations" };
        }
        var conversations = (result.data && Array.isArray(result.data) ? result.data : []).filter(function (c) {
          return c.projectId === pid;
        });
        return { data: conversations };
      }

      case "chatons_get_hidden_projects": {
        var result = callHost("projects.list", {});
        if (!result.ok) {
          return { error: result.error && result.error.message ? result.error.message : "Failed to list projects" };
        }
        var hidden = (result.data && Array.isArray(result.data) ? result.data : []).filter(function (p) {
          return p.isHidden === true || p.hidden === true;
        });
        return { data: hidden };
      }

      case "chatons_get_visible_projects": {
        var result = callHost("projects.list", {});
        if (!result.ok) {
          return { error: result.error && result.error.message ? result.error.message : "Failed to list projects" };
        }
        var visible = (result.data && Array.isArray(result.data) ? result.data : []).filter(function (p) {
          return p.isHidden !== true && p.hidden !== true;
        });
        return { data: visible };
      }

      default:
        return { error: "Unknown tool: " + toolName };
    }
  }

  if (typeof window !== "undefined") {
    window.__chatonsProjectsToolHandler = handleToolCall;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { handleToolCall: handleToolCall };
  }
})();
