export const SETTINGS_SECTIONS = [
  'general',
  'behavior',
  'sidebar',
  'audio',
  'language',
  'providersModels',
  'memory',
  'autocomplete',
  'title',
  'sessions',
  'shortcuts',
  'commands',
  'diagnostics',
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'Général',
  behavior: 'Comportements',
  sidebar: 'Barre latérale',
  audio: 'Audio',
  language: 'Langue',
  providersModels: 'Providers & Modèles',
  memory: 'Mémoire',
  autocomplete: 'Auto-complete',
  title: 'Titres',
  sessions: 'Sessions & Export',
  shortcuts: 'Raccourcis clavier',
  commands: 'Pi',
  diagnostics: 'Diagnostic',
}
