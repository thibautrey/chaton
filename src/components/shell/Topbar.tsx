import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/workspace/store";

export function Topbar() {
  const { state, sendPiPrompt } = useWorkspace();
  const [isQueueDialogOpen, setIsQueueDialogOpen] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const { t } = useTranslation();

  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  );
  const runtime = selectedConversation
    ? state.piByConversation[selectedConversation.id]
    : null;
  const shouldShowQueuePill = Boolean(runtime && runtime.pendingCommands > 0);
  const canSendNow = Boolean(
    selectedConversation?.id &&
      runtime?.pendingUserMessage &&
      runtime?.pendingUserMessageText &&
      !isSendingNow,
  );

  useEffect(() => {
    if (!shouldShowQueuePill) {
      setIsQueueDialogOpen(false);
    }
  }, [shouldShowQueuePill]);

  useEffect(() => {
    if (!isQueueDialogOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsQueueDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isQueueDialogOpen]);

  if (state.sidebarMode === "settings") {
    return null;
  }

  const handleSendNow = async () => {
    if (
      !selectedConversation?.id ||
      !runtime?.pendingUserMessage ||
      !runtime.pendingUserMessageText ||
      isSendingNow
    ) {
      return;
    }
    setIsSendingNow(true);
    try {
      await sendPiPrompt({
        conversationId: selectedConversation.id,
        message: runtime.pendingUserMessageText,
        steer: true,
      });
      setIsQueueDialogOpen(false);
    } finally {
      setIsSendingNow(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-title">
        {selectedConversation?.title ?? t("Nouveau fil")}
      </div>

      {isQueueDialogOpen && runtime ? (
        <div
          className="extension-modal-backdrop"
          onClick={() => setIsQueueDialogOpen(false)}
        >
          <div
            className="extension-modal max-w-[560px]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="extension-modal-title">{t("Queue Pi")}</div>
            <div className="queue-panel-content">
              <div className="queue-panel-row">
                <span>{t("Commandes en attente")}</span>
                <strong>{runtime.pendingCommands}</strong>
              </div>
              <div className="queue-panel-row">
                <span>{t("Message utilisateur en attente")}</span>
                <strong>
                  {runtime.pendingUserMessage ? t("Oui") : t("Non")}
                </strong>
              </div>
              <div className="queue-panel-row">
                <span>{t("État runtime")}</span>
                <strong>{runtime.status}</strong>
              </div>
              {runtime.state ? (
                <div className="queue-panel-row">
                  <span>{t("Messages en attente (session Pi)")}</span>
                  <strong>{runtime.state.pendingMessageCount}</strong>
                </div>
              ) : null}
              {runtime.lastError ? (
                <div className="queue-panel-error">{runtime.lastError}</div>
              ) : null}
            </div>
            <div className="extension-modal-actions">
              <button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={handleSendNow}
                disabled={!canSendNow}
              >
                {isSendingNow ? t("Envoi...") : t("Envoyer maintenant (steer)")}
              </button>
              <button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={() => setIsQueueDialogOpen(false)}
              >
                {t("Fermer")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
