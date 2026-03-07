import { useEffect, useMemo, useState } from "react";
import { MessageSquareShare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { workspaceIpc } from "@/services/ipc/workspace";
import type { ChatonsExtension } from "@/features/workspace/types";
import { useWorkspace } from "@/features/workspace/store";
import { getExtensionIcon } from "@/components/extensions/extension-icons";

function isChannelExtension(extension: ChatonsExtension): boolean {
  return extension.config?.kind === "channel";
}

type ExtensionMainView = {
  viewId: string;
  title: string;
  icon?: string;
  webviewUrl: string;
  initialRoute?: string;
};

type ExtensionUiEntry = {
  extensionId: string;
  icon?: string;
  iconUrl?: string;
  mainViews?: ExtensionMainView[];
  serverStatus?: {
    ready?: boolean;
    lastError?: string;
  } | null;
};

export function ChannelsMainPanel() {
  const { t } = useTranslation();
  const { openExtensionMainView } = useWorkspace();
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([]);
  const [entries, setEntries] = useState<ExtensionUiEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [installedResult, uiResult] = await Promise.all([
        workspaceIpc.listExtensions(),
        workspaceIpc.registerExtensionUi(),
      ]);
      if (cancelled) return;
      setExtensions(installedResult.extensions ?? []);
      setEntries((uiResult.entries ?? []) as ExtensionUiEntry[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const channelExtensions = useMemo(() => {
    return extensions.filter(
      (extension) => extension.enabled && isChannelExtension(extension),
    );
  }, [extensions]);

  const mainViewByExtensionId = useMemo(() => {
    const map = new Map<string, ExtensionMainView>();
    for (const entry of entries) {
      const firstMainView = entry.mainViews?.[0];
      if (firstMainView) {
        map.set(entry.extensionId, firstMainView);
      }
    }
    return map;
  }, [entries]);

  const entryByExtensionId = useMemo(() => {
    return new Map(entries.map((entry) => [entry.extensionId, entry]));
  }, [entries]);

  return (
    <div className="main-scroll">
      <section className="chat-section settings-main-wrap">
        <div className="flex items-start justify-between gap-4 pb-2">
          <div className="flex items-center gap-2.5">
            <MessageSquareShare className="h-5 w-5 shrink-0 text-[#8d8e95] dark:text-[#8c96ab]" />
            <h1 className="settings-main-title mb-0">{t("Channels")}</h1>
          </div>
        </div>
        <p className="settings-card-note mb-4">
          {t(
            "Configurez vos passerelles de messagerie externes comme Telegram ou WhatsApp.",
          )}
        </p>

        {loading ? (
          <div className="settings-card settings-muted">
            {t("Chargement...")}
          </div>
        ) : channelExtensions.length === 0 ? (
          <div className="settings-card">
            <div className="flex items-start gap-3">
              <div className="settings-provider-fallback">
                <MessageSquareShare className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="settings-card-title">
                  {t("Aucun channel installé")}
                </div>
                <p className="settings-card-note mt-1">
                  {t(
                    "Installez une extension de type channel pour connecter Chatons à Telegram, WhatsApp ou d'autres messageries externes.",
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {channelExtensions.map((extension) => {
              const mainView = mainViewByExtensionId.get(extension.id);
              const entry = entryByExtensionId.get(extension.id);
              const iconValue = getExtensionIcon(
                typeof entry?.iconUrl === "string"
                  ? entry.iconUrl
                  : entry?.icon,
              );
              const needsServer =
                entry?.serverStatus && entry.serverStatus.ready === false;
              return (
                <section key={extension.id} className="settings-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="settings-provider-favicon flex items-center justify-center text-[#45464d] dark:text-[#d6def2]">
                        {iconValue.kind === "image" ? (
                          <img
                            src={iconValue.src}
                            alt=""
                            className="h-4 w-4 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <iconValue.Component className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="settings-card-title">
                          {extension.name}
                        </div>
                        {extension.description ? (
                          <div className="settings-card-note mt-0.5">
                            {extension.description}
                          </div>
                        ) : null}
                        <div className="settings-mono settings-muted mt-1">
                          {extension.id}
                        </div>
                        {needsServer ? (
                          <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            {t(
                              "Serveur de configuration en cours de démarrage...",
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="settings-action shrink-0"
                      onClick={() => {
                        if (mainView?.viewId) {
                          openExtensionMainView(mainView.viewId);
                        }
                      }}
                      disabled={!mainView?.viewId}
                    >
                      {t("Configurer")}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
