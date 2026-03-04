export const SETTINGS_SECTIONS = [
  'general',
  'behavior',
  'language',
  'providersModels',
  'packages',
  'tools',
  'sessions',
  'commands',
  'diagnostics',
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'Général',
  behavior: 'Comportements',
  language: 'Langue',
  providersModels: 'Providers & Modèles',
  packages: 'Packages & Extensions',
  tools: 'Outils & Exécution',
  sessions: 'Sessions & Export',
  commands: 'Commandes Pi',
  diagnostics: 'Diagnostic',
}
