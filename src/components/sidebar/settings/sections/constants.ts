export const SETTINGS_SECTIONS = [
  'general',
  'behavior',
  'sidebar',
  'language',
  'providersModels',
  'sessions',
  'commands',
  'diagnostics',
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'Général',
  behavior: 'Comportements',
  sidebar: 'Barre latérale',
  language: 'Langue',
  providersModels: 'Providers & Modèles',
  sessions: 'Sessions & Export',
  commands: 'Pi',
  diagnostics: 'Diagnostic',
}
