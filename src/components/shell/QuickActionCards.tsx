import type {
  ChatonsExtension,
  ChatonsExtensionQuickAction,
} from "@/features/workspace/types";
import { FolderPlus, Plus, Sparkles, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

type QuickCard = {
  id: string;
  title: string;
  description?: string;
  scope: "always" | "global-thread" | "project-thread" | "global-or-no-thread";
  icon: "plus" | "workflow" | "folder" | "sparkles";
  onClick: () => Promise<void> | void;
};

type QuickActionUsageRow = {
  action_id: string;
  uses_count: number;
  decayed_score: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 14;

function getDecayedScore(row: QuickActionUsageRow, nowMs: number): number {
  const lastMs = row.last_used_at
    ? Date.parse(row.last_used_at)
    : Date.parse(row.updated_at);
  const safeLastMs = Number.isFinite(lastMs) ? lastMs : nowMs;
  const elapsed = Math.max(0, nowMs - safeLastMs);
  const factor = Math.exp((-Math.log(2) * elapsed) / HALF_LIFE_MS);
  return row.decayed_score * factor;
}

function isValidQuickAction(
  value: unknown,
): value is ChatonsExtensionQuickAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  return (
    typeof action.id === "string" &&
    action.id.length > 0 &&
    typeof action.title === "string" &&
    action.title.length > 0
  );
}

function getExtensionQuickActions(
  extension: ChatonsExtension,
): ChatonsExtensionQuickAction[] {
  if (!extension.enabled) return [];
  const declared = extension.config?.quickActions;
  if (!Array.isArray(declared)) return [];
  return declared.filter(isValidQuickAction).slice(0, 2);
}

function shouldRenderCard(
  scope: "always" | "global-thread" | "project-thread" | "global-or-no-thread",
  selectedProjectId: string | null,
  hasSelectedConversation: boolean,
): boolean {
  if (scope === "always") return true;
  if (scope === "global-thread") return selectedProjectId === null;
  if (scope === "global-or-no-thread")
    return selectedProjectId === null
      ? true
      : hasSelectedConversation
        ? false
        : true;
  return selectedProjectId !== null;
}

function emitExtensionDeeplink(
  viewId: string,
  target: string,
  params?: Record<string, unknown>,
) {
  window.dispatchEvent(
    new CustomEvent("chaton:extension:deeplink", {
      detail: { viewId, target, params: params ?? {} },
    }),
  );
}

function emitComposerPrefill(conversationId: string, message: string) {
  window.dispatchEvent(
    new CustomEvent("chaton:composer-prefill", {
      detail: { conversationId, message },
    }),
  );
}

export function QuickActionCards() {
  const { t } = useTranslation();
  const {
    createConversationGlobal,
    importProject,
    openExtensionMainView,
    state,
  } = useWorkspace();
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([]);
  const [usageById, setUsageById] = useState<
    Record<string, QuickActionUsageRow>
  >({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      workspaceIpc.listExtensions(),
      workspaceIpc.quickActionsListUsage(),
    ]).then(([extResult, usageResult]) => {
      if (cancelled) return;
      setExtensions(extResult.extensions ?? []);
      const nextUsage: Record<string, QuickActionUsageRow> = {};
      for (const row of usageResult.rows ?? []) {
        nextUsage[row.action_id] = row;
      }
      setUsageById(nextUsage);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startConversationWithPrompt = async (prompt: string) => {
    const conversation = await createConversationGlobal({});
    if (conversation) {
      emitComposerPrefill(conversation.id, prompt);
    }
  };

  const builtinCards: QuickCard[] = [
    {
      id: "builtin.create-extension",
      title: t("Créer une extension"),
      scope: "global-or-no-thread",
      icon: "plus",
      onClick: () =>
        startConversationWithPrompt(
          [
            "Je veux créer une nouvelle extension Chatons.",
            "Aide-moi à la concevoir et à l'implémenter étape par étape.",
            "",
            "Objectif:",
            "- Proposer une extension utile et concrète.",
            "- Générer un squelette d'extension prêt à intégrer dans le projet.",
            "",
            "Attendus:",
            "1. Clarifie rapidement le besoin si nécessaire (questions minimales).",
            "2. Propose la structure des fichiers.",
            "3. Fournis le manifeste `chaton.extension.json` complet.",
            "4. Implémente les handlers principaux et le wiring runtime.",
            "5. Ajoute les quick actions/deeplinks utiles si pertinent.",
            "6. Donne un plan de tests manuel + points de validation.",
            "",
            "Contraintes:",
            "- Code propre, modulaire, lisible.",
            "- Pas de régression sur les fonctionnalités existantes.",
            "- Explique brièvement les choix techniques.",
          ].join("\n"),
        ),
    },
    {
      id: "builtin.create-competence",
      title: t("Créer une compétence"),
      scope: "global-or-no-thread",
      icon: "workflow",
      onClick: () =>
        startConversationWithPrompt(
          [
            "Je veux créer une nouvelle compétence (skill) pour Chatons.",
            "Aide-moi à la définir et à l'implémenter proprement.",
            "",
            "Objectif:",
            "- Produire une skill utile, claire et réutilisable.",
            "",
            "Attendus:",
            "1. Définis le périmètre exact de la skill (quand l'utiliser / ne pas l'utiliser).",
            "2. Propose la structure minimale du dossier skill.",
            "3. Rédige un `SKILL.md` complet avec workflow opérationnel.",
            "4. Ajoute des exemples d'inputs/outputs.",
            "5. Donne une checklist de validation.",
            "",
            "Contraintes:",
            "- Instructions courtes, actionnables, sans ambiguïté.",
            "- Compatible avec les autres skills existantes.",
            "- Favoriser la robustesse et la simplicité d'usage.",
          ].join("\n"),
        ),
    },
    {
      id: "builtin.add-project",
      title: t("Ajouter un projet"),
      scope: "always",
      icon: "folder",
      onClick: () => importProject(),
    },
  ];

  const extensionCards = useMemo<QuickCard[]>(() => {
    const cards: QuickCard[] = [];
    for (const extension of extensions) {
      const actions = getExtensionQuickActions(extension);
      for (const action of actions) {
        cards.push({
          id: `ext.${extension.id}.${action.id}`,
          title: action.title,
          description: action.description,
          scope: action.scope ?? "always",
          icon: "sparkles",
          onClick: async () => {
            if (action.deeplink?.viewId && action.deeplink?.target) {
              if (action.deeplink.createConversation) {
                const conversation = await createConversationGlobal({});
                if (conversation && action.deeplink.prefillPrompt) {
                  emitComposerPrefill(
                    conversation.id,
                    action.deeplink.prefillPrompt,
                  );
                }
              }
              openExtensionMainView(action.deeplink.viewId);
              window.setTimeout(() => {
                emitExtensionDeeplink(
                  action.deeplink!.viewId,
                  action.deeplink!.target,
                  action.deeplink!.params,
                );
              }, 50);
              return;
            }
            if (action.extensionViewId) {
              openExtensionMainView(action.extensionViewId);
              return;
            }
            if (action.prompt) {
              await startConversationWithPrompt(action.prompt);
            }
          },
        });
      }
    }
    return cards;
  }, [createConversationGlobal, extensions, openExtensionMainView, t]);

  const cards = useMemo(() => {
    const all = [...builtinCards, ...extensionCards].filter((card) =>
      shouldRenderCard(
        card.scope,
        state.selectedProjectId,
        Boolean(state.selectedConversationId),
      ),
    );
    const nowMs = Date.now();
    return all
      .map((card) => {
        const usage = usageById[card.id];
        const score = usage ? getDecayedScore(usage, nowMs) : 0;
        return { card, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.card);
  }, [
    builtinCards,
    extensionCards,
    state.selectedConversationId,
    state.selectedProjectId,
    usageById,
  ]);

  const handleActionClick = async (card: QuickCard) => {
    const result = await workspaceIpc.quickActionsRecordUse(card.id);
    if (result.ok) {
      setUsageById((prev) => ({ ...prev, [card.id]: result.row }));
    }
    await card.onClick();
  };

  return (
    <div className="quick-action-cards">
      <div className="quick-action-cards-track" role="list">
        {cards.map((card) => {
          const icon =
            card.icon === "plus" ? (
              <Plus size={28} />
            ) : card.icon === "workflow" ? (
              <Workflow size={28} />
            ) : card.icon === "folder" ? (
              <FolderPlus size={28} />
            ) : (
              <Sparkles size={28} />
            );
          return (
            <button
              key={card.id}
              type="button"
              className="quick-action-card"
              onClick={() => void handleActionClick(card)}
              role="listitem"
            >
              <div className="quick-action-card-icon">{icon}</div>
              <div className="quick-action-card-title">{card.title}</div>
              {card.description ? (
                <div className="quick-action-card-description">
                  {card.description}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
