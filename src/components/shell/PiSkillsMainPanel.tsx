import { useCallback, useEffect, useMemo, useState } from 'react'

import { useWorkspace } from '@/features/workspace/store'
import { workspaceIpc } from '@/services/ipc/workspace'

type PiPackage = {
  source: string
  path: string
  installed: boolean
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
  const { setNotice } = useWorkspace()
  const [skills, setSkills] = useState<PiPackage[]>([])
  const [loading, setLoading] = useState(false)
  const [busySkill, setBusySkill] = useState<string | null>(null)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    const result = await workspaceIpc.runPiCommand('list')
    if (!result.ok) {
      setNotice(result.message ?? result.stderr ?? 'Impossible de lister les skills Pi.')
      setLoading(false)
      return
    }
    const parsed = parsePiListOutput(result.stdout)
    setSkills(parsed)
    setLoading(false)
  }, [setNotice])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const installedSkills = useMemo(() => skills.filter((skill) => skill.installed), [skills])

  const toggleSkill = async (skill: PiPackage) => {
    setBusySkill(skill.source)
    const action = skill.installed ? 'remove' : 'install'
    const result = await workspaceIpc.runPiCommand(action, { source: skill.source })

    if (!result.ok) {
      setNotice(result.message ?? result.stderr ?? `Commande pi ${action} échouée.`)
      setBusySkill(null)
      return
    }

    setNotice(skill.installed ? `${skill.source} désinstallé.` : `${skill.source} installé.`)
    await loadSkills()
    setBusySkill(null)
  }

  return (
    <div className="main-scroll">
      <section className="chat-section skills-main-wrap">
        <header className="skills-header">
          <p className="skills-subtitle">
            Donnez des superpouvoirs à Pi.
          </p>
        </header>

        <div className="skills-section-head">Installé</div>

        {loading ? <div className="settings-card-note">Chargement des skills...</div> : null}

        {!loading && installedSkills.length === 0 ? (
          <div className="settings-card-note">Aucun skill installé.</div>
        ) : null}

        <div className="skills-grid">
          {installedSkills.map((skill) => {
            const checked = skill.installed
            const pending = busySkill === skill.source
            return (
              <article key={skill.source} className="skill-card">
                <div className="skill-card-main">
                  <div className="skill-avatar" aria-hidden="true">
                    {formatSkillTitle(skill.source).slice(0, 1)}
                  </div>
                  <div className="skill-copy">
                    <div className="skill-name">{formatSkillTitle(skill.source)}</div>
                    <div className="skill-desc">{getSkillDescription(skill.source)}</div>
                    {skill.path ? <div className="skill-path">{skill.path}</div> : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={`skill-toggle ${checked ? 'skill-toggle-on' : ''} ${pending ? 'skill-toggle-busy' : ''}`}
                  aria-label={checked ? `Désactiver ${skill.source}` : `Activer ${skill.source}`}
                  onClick={() => {
                    if (!pending) {
                      void toggleSkill(skill)
                    }
                  }}
                >
                  <span className="skill-toggle-thumb" />
                </button>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
