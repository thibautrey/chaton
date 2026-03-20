export const SETTINGS_SECTIONS = [
  'appearance',
  'behavior',
  'models',
  'cloud',
  'audio',
  'sessions',
  'advanced',
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SECTION_LABELS: Record<SettingsSection, string> = {
  appearance: 'Apparence',
  behavior: 'Comportement',
  models: 'Modèles',
  cloud: 'Cloud',
  audio: 'Audio',
  sessions: 'Sessions',
  advanced: 'Avancé',
}
