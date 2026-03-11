const launchButton = document.getElementById('launchButton')
const toggleButton = document.getElementById('toggleButton')
const dropdown = document.getElementById('dropdown')

const IDES = [
  { id: 'vs-code', label: 'VS Code', command: 'code', icon: 'image', image: '/src/assets/vscode.webp' },
  { id: 'cursor', label: 'Cursor', command: 'cursor', icon: 'text', text: 'C' },
  { id: 'windsurf', label: 'Windsurf', command: 'windsurf', icon: 'text', text: 'W' },
  { id: 'jetbrains', label: 'JetBrains IDE', commands: ['idea', 'webstorm', 'pycharm', 'goland', 'phpstorm', 'rubymine', 'clion'], icon: 'text', text: 'J' },
  { id: 'zed', label: 'Zed', command: 'zed', icon: 'text', text: 'Z' },
]

let available = []
let selected = null
let targetPath = null
let projectId = null
let menuOpen = false

function storageKey() {
  return projectId ? `preferred-ide:${projectId}` : null
}

function getIconHtml(ide) {
  if (!ide) return '...'
  if (ide.icon === 'image') return `<img class="icon-image" src="${ide.image}" alt="${ide.label}" />`
  return `<span class="icon">${ide.text || '?'}</span>`
}

function render() {
  launchButton.innerHTML = selected ? getIconHtml(selected) : '...'
  launchButton.disabled = !selected || !targetPath
  toggleButton.disabled = available.length <= 1
  dropdown.className = menuOpen ? 'dropdown open' : 'dropdown'
  dropdown.innerHTML = available
    .map(
      (ide) => `
        <button class="option ${selected?.id === ide.id ? 'active' : ''}" data-ide-id="${ide.id}" type="button">
          ${getIconHtml(ide)}
          <span>${ide.label}</span>
        </button>
      `,
    )
    .join('')
}

async function detectIde(ide) {
  if (Array.isArray(ide.commands)) {
    for (const command of ide.commands) {
      try {
        const result = await window.chatons?.workspace?.detectExternalCommand?.(command)
        if (result?.detected) return { ...ide, resolvedCommand: command }
      } catch {}
    }
    return null
  }
  try {
    const result = await window.chatons?.workspace?.detectExternalCommand?.(ide.command)
    if (result?.detected) return { ...ide, resolvedCommand: ide.command }
  } catch {}
  return null
}

async function refresh() {
  const results = await Promise.all(IDES.map(detectIde))
  available = results.filter(Boolean)
  const stored = storageKey() ? window.localStorage.getItem(storageKey()) : null
  selected = available.find((ide) => ide.id === stored) || available[0] || null
  render()
}

async function launchSelected() {
  if (!selected?.resolvedCommand || !targetPath) return
  try {
    const result = await window.chatons?.workspace?.openExternalApplication?.(selected.resolvedCommand, [targetPath])
    if (!result?.success) {
      console.warn(result?.error || `Failed to open ${selected.label}`)
    }
  } catch (error) {
    console.warn('Failed to launch IDE', error)
  }
}

launchButton.addEventListener('click', () => {
  void launchSelected()
})

toggleButton.addEventListener('click', () => {
  menuOpen = !menuOpen
  render()
})

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const option = target.closest('[data-ide-id]')
  if (option) {
    const ideId = option.getAttribute('data-ide-id')
    const next = available.find((ide) => ide.id === ideId)
    if (next) {
      selected = next
      if (storageKey()) window.localStorage.setItem(storageKey(), next.id)
      menuOpen = false
      render()
    }
    return
  }
  if (!target.closest('.widget') && !target.closest('.dropdown')) {
    menuOpen = false
    render()
  }
})

window.addEventListener('message', (event) => {
  const message = event.data
  if (message?.type === 'chaton.extension.topbarContext') {
    const context = message.payload
    const worktreePath = typeof context?.conversation?.worktreePath === 'string' ? context.conversation.worktreePath : null
    const repoPath = typeof context?.project?.repoPath === 'string' ? context.project.repoPath : null
    targetPath = worktreePath || repoPath
    projectId = typeof context?.project?.id === 'string' ? context.project.id : null
    void refresh()
    return
  }
  if (message?.type !== 'chaton.extension.deeplink') return
  const payload = message.payload
  if (!payload) return
  if (payload.target === 'open-selected-ide') {
    void launchSelected()
  }
})

render()
