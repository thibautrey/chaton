import { X, Loader } from 'lucide-react'
import { useState } from 'react'

interface NotificationUrlViewerProps {
  url: string
  onClose: () => void
}

export function NotificationUrlViewer({ url, onClose }: NotificationUrlViewerProps) {
  // Validate URL during Render
  const isValidUrl = (() => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  })()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(isValidUrl ? null : 'Invalid URL')

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setIsLoading(false)
    setError('Failed to load the page')
  }

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-start justify-center z-[1100] pt-20 animate-in fade-in duration-200">
      <div className="flex flex-col w-[90%] max-w-[900px] h-[calc(100vh-100px)] bg-white dark:bg-[#3a3c44] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] animate-in slide-in-from-top-2 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e1e6] dark:border-[#4a4d57] shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[13px] text-[#66676f] dark:text-[#a1a2a9] whitespace-nowrap overflow-hidden text-ellipsis font-mono">
              {url}
            </span>
          </div>
          <button
            className="bg-none border-none cursor-pointer p-1.5 flex items-center justify-center text-[#a1a2a9] dark:text-[#696b74] rounded-md transition-all hover:bg-[#f0f0f2] dark:hover:bg-[#4a4d57] hover:text-[#66676f] ml-3 shrink-0"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[#a1a2a9] dark:text-[#696b74]">
              <Loader className="h-5 w-5 animate-spin" />
              <p className="m-0 text-sm">Loading...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-10 text-center">
              <p className="m-0 text-sm text-[#2c2d34] dark:text-[#e4e5ea]">{error}</p>
              <p className="m-0 text-[13px] text-[#a1a2a9] dark:text-[#696b74]">
                Opening this link in your browser instead.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#f0f0f2] dark:bg-[#4a4d57] border border-[#d4d5db] dark:border-[#5a5d67] rounded-lg text-[#3d6b99] dark:text-[#60a5fa] no-underline text-[13px] font-medium transition-all hover:bg-[#e8e9ed] dark:hover:bg-[#5a5d67] hover:border-[#c0c1c8] dark:hover:border-[#6a6d77]"
              >
                Open in browser →
              </a>
            </div>
          )}

          {!error && (
            <iframe
              src={url}
              className="w-full h-full border-0"
              onLoad={handleLoad}
              onError={handleError}
              title="Notification content"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
            />
          )}
        </div>
      </div>
    </div>
  )
}
