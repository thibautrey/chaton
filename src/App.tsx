import {
  ChevronDown,
  Circle,
  CircleDashed,
  Command,
  Folder,
  FolderPlus,
  Gauge,
  MessageSquarePlus,
  Minus,
  PanelRightOpen,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  SquarePen,
  Workflow,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const folders = ['.rho', 'multicodex-proxy', 'price-tracker', 'thibaut', 'even-travel-companion', 'even-stars', 'pixatwin']

const threads = [
  'Ajouter upload icône projet',
  'Uniformiser transparence ...',
  'Ajuster largeur panneau e...',
  'Animer fermeture détails f...',
  'Changer fond panneaux vi...',
  'Créer composant menu sk...',
  'Corriger disparition dessi...',
  'Utiliser icône édition parc...',
  'Restructurer donnees ong...',
  'Rendre fond loader viewe...',
]

const suggestions = [
  { icon: '🎮', text: 'Build a classic Snake game in this repo.' },
  { icon: '🧾', text: 'Create a one-page $pdf that summarizes this app.' },
  { icon: '✏️', text: 'Create a plan to...' },
]

function App() {
  return (
    <div className="app-shell">
      <div className="app-layout">
        <aside className="sidebar-panel">
          <div className="window-controls-wrap">
            <div className="window-controls">
              <Circle className="h-4 w-4 fill-current" />
              <Circle className="h-4 w-4 fill-current" />
              <Circle className="h-4 w-4 fill-current" />
              <div className="window-control-key">⌃</div>
            </div>
          </div>

          <div className="sidebar-nav">
            <SidebarItem icon={SquarePen} label="Nouveau fil" />
            <SidebarItem icon={Gauge} label="Automatisations" />
            <SidebarItem icon={Workflow} label="Compétences" />
          </div>

          <div className="sidebar-section-head">
            <span className="sidebar-section-title">Fils</span>
            <div className="flex items-center gap-3">
              <FolderPlus className="h-4 w-4" />
              <Minus className="h-4 w-4" />
            </div>
          </div>

          <div className="space-y-0.5 px-2">
            {folders.map((folder) => (
              <button key={folder} className="folder-row">
                <Folder className="h-4 w-4 text-[#6f7076]" />
                <span className="truncate">{folder}</span>
              </button>
            ))}
          </div>

          <div className="mt-2 flex-1 overflow-hidden px-2">
            <div className="space-y-1 pr-1">
              {threads.map((thread) => (
                <ThreadRow key={thread} title={thread} />
              ))}
              <button className="show-more-row">Afficher plus</button>
            </div>
          </div>

          <div className="border-t border-[#dcdddf] px-3 py-3">
            <button className="sidebar-item text-[#45464d]">
              <Settings className="h-4 w-4" />
              Paramètres
            </button>
          </div>
        </aside>

        <main className="main-panel">
          <header className="flex h-14 items-center justify-between px-6">
            <div className="topbar-title">Nouveau fil</div>

            <div className="flex items-center gap-2">
              <TopPill icon={Command} label="Ouvrir" />
              <TopPill icon={CircleDashed} label="Validation" muted />
              <IconBtn icon={PanelRightOpen} />
              <IconBtn icon={MessageSquarePlus} />
              <IconBtn icon={Pencil} />
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col px-10 pb-4 pt-2">
            <section className="flex flex-1 items-center justify-center">
              <div className="hero-group">
                <div className="hero-icon-wrap">
                  <Sparkles className="h-5 w-5 text-[#17181d]" />
                </div>
                <h1 className="hero-title">Créons ensemble</h1>
                <button className="hero-subtitle">
                  pixatwin <ChevronDown className="h-5 w-5" />
                </button>
              </div>
            </section>

            <section className="content-wrap">
              <div className="explore-label">Explore more</div>
              <div className="grid grid-cols-3 gap-3">
                {suggestions.map((suggestion) => (
                  <article key={suggestion.text} className="suggestion-card">
                    <div className="mb-2.5 text-lg">{suggestion.icon}</div>
                    <p className="suggestion-copy">{suggestion.text}</p>
                  </article>
                ))}
              </div>
            </section>

            <footer className="content-wrap mt-4">
              <div className="composer-shell">
                <Input
                  readOnly
                  value="Demandez n’importe quoi à Codex, utilisez @ pour ajouter des fichiers, / pour les commandes"
                  className="composer-input"
                />

                <div className="composer-meta">
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-[#696b73]">
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Badge variant="secondary" className="meta-chip">
                      GPT-5.3-Codex <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </Badge>
                    <Badge variant="secondary" className="meta-chip">
                      Élevé <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </Badge>
                  </div>

                  <Button size="icon" className="send-button">
                    <ChevronDown className="h-4 w-4 rotate-180" />
                  </Button>
                </div>
              </div>

              <div className="status-row">
                <div className="flex items-center gap-1.5">
                  <span>▭ Local</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1 text-[#e46b1f]">
                  <span>◌</span>
                  <span>Accès complet</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span>⌘ main</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </div>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}

function SidebarItem({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button className="sidebar-item">
      <Icon className="h-4 w-4 text-[#66676f]" />
      {label}
    </button>
  )
}

function ThreadRow({ title }: { title: string }) {
  return (
    <button className="thread-row">
      <span className="thread-row-title">{title}</span>
      <span className="thread-row-meta">1 h</span>
    </button>
  )
}

function TopPill({
  icon: Icon,
  label,
  muted = false,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  muted?: boolean
}) {
  return (
    <Button
      variant="outline"
      className={`top-pill ${muted ? 'top-pill-muted' : 'top-pill-default'}`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <ChevronDown className="h-3.5 w-3.5" />
    </Button>
  )
}

function IconBtn({ icon: Icon }: { icon: ComponentType<{ className?: string }> }) {
  return (
    <Button variant="ghost" size="icon" className="icon-button">
      <Icon className="h-4 w-4" />
    </Button>
  )
}

export default App
