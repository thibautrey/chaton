const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

export function sanitizeTerminalText(text: string): string {
  if (!text) return ''

  // Strip common ANSI CSI + OSC escape sequences to keep logs readable in cards.
  const withoutAnsi = text
    .replace(new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g'), '')
    .replace(new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, 'g'), '')
  return withoutAnsi.replace(/\r\n?/g, '\n')
}
