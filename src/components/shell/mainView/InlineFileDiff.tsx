import { useMemo } from 'react'

import { parseDiffLines } from '@/components/shell/composer/diff'
import type { FileDiffDetails } from '@/components/shell/composer/types'

type InlineFileDiffProps = {
  details: FileDiffDetails
}

export function InlineFileDiff({ details }: InlineFileDiffProps) {
  const parsedLines = useMemo(
    () => parseDiffLines(details.lines, details.firstChangedLine),
    [details.firstChangedLine, details.lines],
  )

  return (
    <div className="overflow-hidden rounded-xl border border-[#1d2635] bg-[#0a101b]">
      <div className="flex items-center justify-between gap-2 border-b border-[#1b2331] px-3 py-2 text-xs">
        <code className="overflow-hidden text-ellipsis whitespace-nowrap text-[#c8d1e3]">{details.path}</code>
      </div>
      <div className="overflow-auto bg-[#0d1420] p-0 font-mono text-[11px] leading-4 text-[#d6dfef]" style={{ maxHeight: '200px' }}>
        {details.isBinary ? (
          <div className="grid px-2 py-0.5 [grid-template-columns:44px_44px_minmax(0,1fr)]">Fichier binaire: aperçu texte indisponible.</div>
        ) : (
          parsedLines.map((line, index) => (
            <div key={`${details.path}:${index}`} className={line.className}>
              <span className="select-none pr-2 text-right text-[11px] text-[#7d8aa2]">{line.oldLine !== null ? line.oldLine : ''}</span>
              <span className="select-none pr-2 text-right text-[11px] text-[#7d8aa2]">{line.newLine !== null ? line.newLine : ''}</span>
              <span className="min-w-0 whitespace-pre">{line.raw.length > 0 ? line.raw : ' '}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
