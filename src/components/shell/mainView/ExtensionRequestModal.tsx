import type { PiConversationRuntime, RpcExtensionUiResponse } from '@/features/workspace/rpc'

type ExtensionRequestModalProps = {
  selectedConversationId: string
  runtime: PiConversationRuntime | null
  onRespond: (conversationId: string, response: RpcExtensionUiResponse) => Promise<void>
}

export function ExtensionRequestModal({ selectedConversationId, runtime, onRespond }: ExtensionRequestModalProps) {
  const request = runtime?.extensionRequests?.[0]
  if (!request) {
    return null
  }

  return (
    <div className="extension-modal-backdrop">
      <div className="extension-modal" role="dialog" aria-modal="true">
        <div className="extension-modal-title">{request.method}</div>
        <pre className="extension-modal-content">{JSON.stringify(request.payload, null, 2)}</pre>
        <div className="extension-modal-actions">
          <button
            type="button"
            className="extension-modal-btn"
            onClick={() =>
              void onRespond(selectedConversationId, {
                type: 'extension_ui_response',
                id: request.id,
                cancelled: true,
              })
            }
          >
            Annuler
          </button>
          <button
            type="button"
            className="extension-modal-btn extension-modal-btn-primary"
            onClick={() =>
              void onRespond(selectedConversationId, {
                type: 'extension_ui_response',
                id: request.id,
                confirmed: true,
              })
            }
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}
