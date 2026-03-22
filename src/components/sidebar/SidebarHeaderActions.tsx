import {
  Cloud,
  FolderPlus,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { SortFilterPopover } from "./SortFilterPopover";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/workspace/store";

export function SidebarHeaderActions() {
  const { t } = useTranslation();
  const {
    importProject,
    openSettingsToCloud,
    createCloudProject,
    createConversationGlobal,
    toggleSidebarSearch,
    state,
  } = useWorkspace();
  const cloudProjects = state.projects.filter(
    (project) =>
      project.location === "cloud" && !project.isArchived && !project.isHidden,
  );
  const hasCloudConnection = state.cloudInstances.length > 0;
  const cloudStatus =
    state.cloudInstances.find(
      (instance) => instance.connectionStatus === "error",
    )?.connectionStatus ??
    state.cloudInstances.find(
      (instance) => instance.connectionStatus === "connecting",
    )?.connectionStatus ??
    state.cloudInstances.find(
      (instance) => instance.connectionStatus === "disconnected",
    )?.connectionStatus ??
    state.cloudInstances[0]?.connectionStatus ??
    null;

  const cloudActionLabel = !hasCloudConnection
    ? t("Connecter Cloud")
    : cloudProjects.length === 0
      ? t("Créer le premier projet cloud")
      : t("Nouveau projet cloud");

  const cloudActionTitle = !hasCloudConnection
    ? t("Connecter Chatons Cloud")
    : cloudProjects.length === 0
      ? t("Créer votre premier projet cloud")
      : t("Créer un nouveau projet cloud");

  return (
    <div className="flex w-full shrink-0 items-center justify-center gap-2 px-3 pb-3">
      <button
        type="button"
        className={`sidebar-icon-button ${state.settings.isSearchVisible ? "bg-black text-white hover:bg-black/90" : ""}`}
        aria-label={t("Afficher ou masquer la recherche")}
        title={t("Afficher ou masquer la recherche")}
        onClick={() => {
          void toggleSidebarSearch();
        }}
      >
        <Search className="h-4 w-4" />
      </button>

      <button
        type="button"
        className="sidebar-icon-button"
        aria-label={t("Ajouter un nouveau projet")}
        title={t("Ajouter un nouveau projet")}
        onClick={() => {
          void importProject();
        }}
      >
        <FolderPlus className="h-4 w-4" />
      </button>

      <button
        type="button"
        className={`sidebar-icon-button sidebar-cloud-action ${cloudStatus ? `sidebar-cloud-action-${cloudStatus}` : ""}`}
        aria-label={cloudActionLabel}
        title={cloudActionTitle}
        onClick={() => {
          if (!hasCloudConnection) {
            openSettingsToCloud();
            return;
          }
          void createCloudProject();
        }}
      >
        <Cloud className="h-4 w-4" />
        {cloudStatus ? (
          <span
            className={`sidebar-cloud-dot sidebar-cloud-dot-${cloudStatus}`}
            aria-hidden="true"
          />
        ) : null}
      </button>

      <SortFilterPopover>
        <button
          type="button"
          className="sidebar-icon-button"
          aria-label="Filtrer, trier et organiser les fils"
          title="Filtrer, trier et organiser les fils"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </SortFilterPopover>
    </div>
  );
}
