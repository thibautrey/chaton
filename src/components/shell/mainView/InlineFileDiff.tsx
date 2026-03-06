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
    <div className="chat-diff-file">
      <div className="chat-diff-file-header">
        <code>{details.path}</code>
      </div>
      <div className="chat-diff-lines">
        {details.isBinary ? (
          <div className="chat-diff-line-neutral">Fichier binaire: aperçu texte indisponible.</div>
        ) : (
          parsedLines.map((line, index) => (
            <div key={`${details.path}:${index}`} className={line.className}>
              <span className="chat-diff-line-number-old">{line.oldLine !== null ? line.oldLine : ''}</span>
              <span className="chat-diff-line-number-new">{line.newLine !== null ? line.newLine : ''}</span>
              <span className="chat-diff-line-content">{line.raw.length > 0 ? line.raw : ' '}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
