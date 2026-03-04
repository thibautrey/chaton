import { useEffect, useMemo, useState } from 'react'
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
  const gridClass = 'grid grid-cols-1 gap-4 md:grid-cols-2'

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
      <section className="chat-section settings-main-wrap">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-4xl font-semibold tracking-[-0.02em] dark:text-[#eef2fb]">{t('Compétences')}</h1>
          </div>
          <p className="mt-1 text-xl dark:text-[#a6b2c9]">{t('Parcourez la bibliothèque de compétences.')}</p>
        </header>

        <div className="mb-6">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Filtrer par nom, package ou description...')}
            className="w-full rounded-2xl border border-[#e6cdc5] bg-white dark:border-[#2a3345] dark:bg-[#0f1520] px-4 py-3 text-xl text-[#4b4d55] dark:text-[#e4eaf8] placeholder:text-[#a4a6ae] dark:placeholder:text-[#9aa5ba]"
          />
        </div>

        <div className="mb-3 text-2xl font-semibold dark:text-[#eaf0fc]">{t('Installées')}</div>

        {!loading && installedSkills.length === 0 ? (
          <div className="settings-card-note">{t('Aucune compétence installée.')}</div>
        ) : null}

        <div className={gridClass}>
          {installedSkills.map((skill) => {
            const pending = busySkill === skill.source
            return (
              <article key={skill.source} className="settings-card">
                <div className="text-2xl font-semibold leading-tight dark:text-[#eaf0fc]">{formatSkillTitle(skill.source)}</div>
                <div className="text-lg dark:text-[#a6b2c9]">{getSkillDescription(skill.source)}</div>
                <div className="settings-card-note">{t('Source')}: {skill.source}</div>
                {skill.path ? <div className="settings-card-note">{t('Chemin')}: {skill.path}</div> : null}
                <div className="settings-actions-row">
                  <button
                    type="button"
                    className="settings-action"
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

        <div className="mt-8 mb-2 text-2xl font-semibold dark:text-[#eaf0fc]">{t('Compétences mises en avant')}</div>
        {highlightedSkills.length === 0 && !loading ? (
          <div className="settings-card-note">{t('Aucune compétence disponible à découvrir.')}</div>
        ) : null}
        <div className={gridClass}>
          {highlightedSkills.map((skill) => {
            const pending = busySkill === skill.source
            return (
              <article key={skill.source} className="settings-card">
                <div className="inline-flex rounded-full bg-[#d7ebe6] dark:bg-[#1a2740] px-3 py-1 text-sm font-semibold text-[#257466] dark:text-[#c8d3ea]">{t('Compétence')}</div>
                <div className="text-2xl font-semibold leading-tight dark:text-[#eaf0fc]">{skill.title || formatSkillTitle(skill.source)}</div>
                <div className="text-lg dark:text-[#a6b2c9]">{skill.description || getSkillDescription(skill.source)}</div>
                <div className="settings-card-note">{t('Source')}: {skill.source}</div>
                {skill.author ? <div className="settings-card-note">{t('Auteur')}: {skill.author}</div> : null}
                <div className="settings-actions-row">
                  <button
                    type="button"
                    className="settings-action"
                    disabled={pending}
                    onClick={() => {
                      if (!pending) void installExternalSkill(skill)
                    }}
                  >
                    {t('Installer')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-8 mb-2 text-2xl font-semibold dark:text-[#eaf0fc]">{t('Découvrir')}</div>
        {!loading && discoverSkills.length === 0 ? (
          <div className="settings-card-note">{t('Aucune compétence disponible à découvrir.')}</div>
        ) : null}
        <div className={gridClass}>
          {(popularSkills.length > 0 ? popularSkills : discoverSkills).map((skill) => {
            const pending = busySkill === skill.source
            return (
              <article key={skill.source} className="settings-card">
                <div className="text-2xl font-semibold leading-tight text-[#1d1e22]">{skill.title || formatSkillTitle(skill.source)}</div>
                <div className="text-lg text-[#646772]">{skill.description || getSkillDescription(skill.source)}</div>
                <div className="settings-card-note">{t('Source')}: {skill.source}</div>
                {skill.author ? <div className="settings-card-note">{t('Auteur')}: {skill.author}</div> : null}
                <div className="settings-actions-row">
                  <button
                    type="button"
                    className="settings-action"
                    disabled={pending}
                    onClick={() => {
                      if (!pending) void installExternalSkill(skill)
                    }}
                  >
                    {t('Installer')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
