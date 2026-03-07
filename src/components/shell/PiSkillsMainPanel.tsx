import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useWorkspace } from '@/features/workspace/store'
import { workspaceIpc } from '@/services/ipc/workspace'

type PiPackage = {
  source: string
  path: string
  installed: boolean
}

type ExternalSkill = {
  source: string
  title: string
  description: string
  author?: string
  installs?: number
  stars?: number
  highlighted?: boolean
}

function parsePiListOutput(stdout: string): PiPackage[] {
  const lines = stdout.split(/\r?\n/)
  const out: PiPackage[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const sourceMatch = lines[i].match(/^\s{2}([^\s].*?)\s*(\(filtered\))?\s*$/)
    if (!sourceMatch) continue

    const source = sourceMatch[1].trim()
    const installed = !sourceMatch[2]
    const next = lines[i + 1] ?? ''
    const pathMatch = next.match(/^\s{4}(.+)$/)
    const path = pathMatch ? pathMatch[1].trim() : ''

    out.push({ source, path, installed })
  }

  return out
}

function formatSkillTitle(source: string): string {
  const raw = source.split(':').slice(1).join(':') || source
  const leaf = raw.split('/').pop() || raw
  return leaf
    .replace(/^pi-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function getSkillDescription(source: string): string {
  if (source.includes('gh-address-comments')) return 'Address comments in a GitHub pull request'
  if (source.includes('gh-fix-ci')) return 'Debug failing GitHub Actions CI checks'
  if (source.includes('linear')) return 'Manage Linear issues and project workflows'
  if (source.includes('openai-docs')) return 'Reference official OpenAI documentation'
  if (source.includes('playwright')) return 'Automate browser flows from the CLI'
  if (source.includes('screenshot')) return 'Capture screenshots'
  if (source.includes('pdf')) return 'Create, edit, and review PDF files'
  if (source.includes('security')) return 'Security reviews and secure-by-default guidance'
  return 'Pi extension package'
}

function getSkillInitials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'PI'
}

export function PiSkillsMainPanel() {
  const { t } = useTranslation()
  const { setNotice } = useWorkspace()
  const [skills, setSkills] = useState<PiPackage[]>([])
  const [catalog, setCatalog] = useState<ExternalSkill[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [busySkill, setBusySkill] = useState<string | null>(null)

  const loadSkills = async () => {
    setLoading(true)
    const result = await workspaceIpc.runPiCommand('list')
    if (!result.ok) {
      setNotice(result.message ?? result.stderr ?? t('Impossible de lister les compétences Pi.'))
      setLoading(false)
      return
    }
    const parsed = parsePiListOutput(result.stdout)
    setSkills(parsed)
    const catalogResult = await workspaceIpc.listSkillsCatalog()
    setCatalog(catalogResult.entries ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void loadSkills()
    // Chargement unique au montage pour éviter les boucles de re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const installedSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return skills.filter((skill) => {
      if (!skill.installed) return false
      if (!normalized) return true
      const haystack = `${skill.source} ${formatSkillTitle(skill.source)} ${getSkillDescription(skill.source)}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [query, skills])

  const discoverSkills = useMemo(() => {
    const installedSources = new Set(skills.filter((skill) => skill.installed).map((skill) => skill.source))
    const normalized = query.trim().toLowerCase()
    return catalog.filter((skill) => {
      if (installedSources.has(skill.source)) return false
      if (!normalized) return true
      const haystack = `${skill.source} ${skill.title} ${skill.description} ${skill.author ?? ''}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [catalog, query, skills])

  const toggleSkill = async (skill: PiPackage) => {
    setBusySkill(skill.source)
    const action = skill.installed ? 'remove' : 'install'
    const result = await workspaceIpc.runPiCommand(action, { source: skill.source })

    if (!result.ok) {
      setNotice(result.message ?? result.stderr ?? `Commande pi ${action} échouée.`)
      setBusySkill(null)
      return
    }

    setNotice(skill.installed ? t('{{name}} désinstallée.', { name: skill.source }) : t('{{name}} installée.', { name: skill.source }))
    await loadSkills()
    setBusySkill(null)
  }

  const installExternalSkill = async (skill: ExternalSkill) => {
    setBusySkill(skill.source)
    const result = await workspaceIpc.runPiCommand('install', { source: skill.source })
    if (!result.ok) {
      setNotice(result.message ?? result.stderr ?? t('Installation impossible.'))
      setBusySkill(null)
      return
    }
    setNotice(t('{{name}} installée.', { name: skill.source }))
    await loadSkills()
    setBusySkill(null)
  }

  return (
    <div className="ep-page">
      <div className="ep-topbar">
        <div className="ep-topbar-actions">
          <button
            type="button"
            className="ep-btn-ghost"
            onClick={() => void loadSkills()}
            disabled={loading}
            title={t('Actualiser')}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>{t('Actualiser')}</span>
          </button>
          <div className="ep-search-bar">
            <Search className="h-4 w-4 ep-search-icon" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Rechercher des compétences...')}
              className="ep-search-input"
            />
          </div>
        </div>
      </div>

      <div className="ep-body">
        <div className="ep-page-header">
          <h1 className="ep-page-title">{t('Compétences')}</h1>
          <p className="ep-page-subtitle">{t('Donnez des superpouvoirs à votre agent.')}</p>
        </div>

        {installedSkills.length > 0 && (
          <section className="ep-section">
            <div className="ep-section-label">{t('Installé')}</div>
            <div className="ep-card-grid">
              {installedSkills.map((skill) => {
                const pending = busySkill === skill.source
                const title = formatSkillTitle(skill.source)
                return (
                  <div key={skill.source} className="ep-card-row">
                    <div className="ep-card-icon ep-card-icon-initials">
                      <span>{getSkillInitials(title)}</span>
                    </div>
                    <div className="ep-card-body">
                      <div className="ep-card-name">{title}</div>
                      <div className="ep-card-desc">{getSkillDescription(skill.source)}</div>
                    </div>
                    <button
                      type="button"
                      className={`ep-toggle ep-toggle-on${pending ? ' ep-toggle-busy' : ''}`}
                      disabled={pending}
                      onClick={() => { if (!pending) void toggleSkill(skill) }}
                      aria-label={t('Désinstaller {{name}}', { name: title })}
                    >
                      <span className="ep-toggle-thumb" />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {!loading && installedSkills.length === 0 && discoverSkills.length === 0 && (
          <div className="ep-empty">{t('Aucune compétence trouvée.')}</div>
        )}

        {discoverSkills.length > 0 && (
          <section className="ep-section">
            <div className="ep-section-label">{t('Catalogue')}</div>
            <div className="ep-card-grid">
              {discoverSkills.map((skill) => {
                const pending = busySkill === skill.source
                const title = skill.title || formatSkillTitle(skill.source)
                return (
                  <div key={skill.source} className="ep-card-row">
                    <div className="ep-card-icon ep-card-icon-initials ep-card-icon-dim">
                      <span>{getSkillInitials(title)}</span>
                    </div>
                    <div className="ep-card-body">
                      <div className="ep-card-name">{title}</div>
                      <div className="ep-card-desc">{skill.description || getSkillDescription(skill.source)}</div>
                    </div>
                    <button
                      type="button"
                      className={`ep-toggle${pending ? ' ep-toggle-busy' : ''}`}
                      disabled={pending}
                      onClick={() => { if (!pending) void installExternalSkill(skill) }}
                      aria-label={t('Installer {{name}}', { name: title })}
                    >
                      <span className="ep-toggle-thumb" />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
