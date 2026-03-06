import { useEffect, useMemo, useState } from 'react'
import { Compass, Download, Search, Sparkles, Star } from 'lucide-react'
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
  const highlightedSkills = useMemo(
    () => discoverSkills.filter((skill) => skill.highlighted).slice(0, 4),
    [discoverSkills],
  )
  const popularSkills = useMemo(
    () => discoverSkills.filter((skill) => !skill.highlighted),
    [discoverSkills],
  )
  const installedCount = skills.filter((skill) => skill.installed).length
  const gridClass = 'grid grid-cols-1 gap-5 xl:grid-cols-2'

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
    <div className="main-scroll">
      <section className="chat-section settings-main-wrap skills-panel-shell">
        <header className="skills-hero-card">
          <div className="skills-hero-copy">
            <div className="skills-hero-badge">
              <Sparkles className="h-4 w-4" />
              <span>{t('Pi ecosystem')}</span>
            </div>
            <h1 className="skills-hero-title">{t('Compétences')}</h1>
            <p className="skills-hero-subtitle">{t('Installez les bons raccourcis experts pour rendre Pi plus puissant, sans sacrifier le style.')}</p>
          </div>
          <div className="skills-stats-grid">
            <article className="skills-stat-card">
              <div className="skills-stat-value">{installedCount}</div>
              <div className="skills-stat-label">{t('Installées')}</div>
            </article>
            <article className="skills-stat-card">
              <div className="skills-stat-value">{highlightedSkills.length}</div>
              <div className="skills-stat-label">{t('Mises en avant')}</div>
            </article>
            <article className="skills-stat-card">
              <div className="skills-stat-value">{discoverSkills.length}</div>
              <div className="skills-stat-label">{t('A découvrir')}</div>
            </article>
          </div>
        </header>

        <div className="skills-toolbar-shell">
          <div className="extensions-search-shell">
            <Search className="extensions-search-icon h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Filtrer par nom, package ou description...')}
              className="extensions-search-input"
            />
          </div>
        </div>

        <section className="extensions-section-block">
          <div className="extensions-section-header">
            <div>
              <div className="extensions-section-eyebrow">{t('Installed')}</div>
              <h2 className="extensions-section-title">{t('Vos compétences')}</h2>
            </div>
          </div>

          {!loading && installedSkills.length === 0 ? (
            <div className="extensions-empty-state">{t('Aucune compétence installée.')}</div>
          ) : null}

          <div className={gridClass}>
            {installedSkills.map((skill) => {
              const pending = busySkill === skill.source
              const title = formatSkillTitle(skill.source)
              return (
                <article key={skill.source} className="skill-surface-card">
                  <div className="skill-surface-main">
                    <div className="skill-avatar-modern">{getSkillInitials(title)}</div>
                    <div className="skill-surface-copy">
                      <div className="skill-surface-title-row">
                        <h3 className="extensions-card-title">{title}</h3>
                        <span className="extensions-status-pill extensions-status-pill-live">{t('Installée')}</span>
                      </div>
                      <p className="extensions-card-description">{getSkillDescription(skill.source)}</p>
                      <dl className="extensions-meta-grid mt-4">
                        <div>
                          <dt>{t('Source')}</dt>
                          <dd>{skill.source}</dd>
                        </div>
                        {skill.path ? (
                          <div>
                            <dt>{t('Chemin')}</dt>
                            <dd>{skill.path}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  </div>
                  <div className="extensions-actions-row">
                    <button
                      type="button"
                      className="extensions-secondary-action"
                      disabled={pending}
                      onClick={() => {
                        if (!pending) void toggleSkill(skill)
                      }}
                    >
                      {t('Désinstaller')}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="extensions-section-block">
          <div className="extensions-section-header">
            <div>
              <div className="extensions-section-eyebrow">{t('Featured')}</div>
              <h2 className="extensions-section-title">{t('Compétences mises en avant')}</h2>
            </div>
          </div>
          {highlightedSkills.length === 0 && !loading ? (
            <div className="extensions-empty-state">{t('Aucune compétence disponible à découvrir.')}</div>
          ) : null}
          <div className={gridClass}>
            {highlightedSkills.map((skill) => {
              const pending = busySkill === skill.source
              return (
                <article key={skill.source} className="extensions-surface-card extensions-surface-card-highlighted">
                  <div className="extensions-card-topline">
                    <span className="extensions-feature-pill"><Star className="h-3.5 w-3.5" />{t('Compétence')}</span>
                    {typeof skill.stars === 'number' ? <span className="extensions-subtle-pill">{skill.stars}★</span> : null}
                  </div>
                  <h3 className="extensions-card-title">{skill.title || formatSkillTitle(skill.source)}</h3>
                  <p className="extensions-card-description">{skill.description || getSkillDescription(skill.source)}</p>
                  <dl className="extensions-meta-grid">
                    <div>
                      <dt>{t('Source')}</dt>
                      <dd>{skill.source}</dd>
                    </div>
                    {skill.author ? (
                      <div>
                        <dt>{t('Auteur')}</dt>
                        <dd>{skill.author}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="extensions-actions-row">
                    <button
                      type="button"
                      className="extensions-primary-inline-action"
                      disabled={pending}
                      onClick={() => {
                        if (!pending) void installExternalSkill(skill)
                      }}
                    >
                      <Download className="h-4 w-4" />
                      <span>{t('Installer')}</span>
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="extensions-section-block">
          <div className="extensions-section-header">
            <div>
              <div className="extensions-section-eyebrow">{t('Discover')}</div>
              <h2 className="extensions-section-title">{t('Explorer le catalogue')}</h2>
            </div>
          </div>
          {!loading && discoverSkills.length === 0 ? (
            <div className="extensions-empty-state">{t('Aucune compétence disponible à découvrir.')}</div>
          ) : null}
          <div className={gridClass}>
            {(popularSkills.length > 0 ? popularSkills : discoverSkills).map((skill) => {
              const pending = busySkill === skill.source
              return (
                <article key={skill.source} className="extensions-surface-card">
                  <div className="extensions-card-topline">
                    <span className="extensions-subtle-pill"><Compass className="h-3.5 w-3.5" />{t('Catalogue')}</span>
                    {typeof skill.installs === 'number' ? <span className="extensions-subtle-pill">{skill.installs}+ installs</span> : null}
                  </div>
                  <h3 className="extensions-card-title">{skill.title || formatSkillTitle(skill.source)}</h3>
                  <p className="extensions-card-description">{skill.description || getSkillDescription(skill.source)}</p>
                  <dl className="extensions-meta-grid">
                    <div>
                      <dt>{t('Source')}</dt>
                      <dd>{skill.source}</dd>
                    </div>
                    {skill.author ? (
                      <div>
                        <dt>{t('Auteur')}</dt>
                        <dd>{skill.author}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="extensions-actions-row">
                    <button
                      type="button"
                      className="extensions-primary-inline-action"
                      disabled={pending}
                      onClick={() => {
                        if (!pending) void installExternalSkill(skill)
                      }}
                    >
                      <Download className="h-4 w-4" />
                      <span>{t('Installer')}</span>
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </section>
    </div>
  )
}
