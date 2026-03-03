import { Check } from 'lucide-react'
import { type PropsWithChildren, useEffect, useRef, useState } from 'react'

import { useWorkspace } from '@/features/workspace/store'

type Option<T extends string> = {
  value: T
  label: string
}

function OptionRow<T extends string>({
  value,
  current,
  label,
  onSelect,
}: {
  value: T
  current: T
  label: string
  onSelect: (value: T) => void
}) {
  const active = value === current
  return (
    <button type="button" className={`filter-option ${active ? 'filter-option-active' : ''}`} onClick={() => onSelect(value)}>
      <span>{label}</span>
      {active ? <Check className="h-4 w-4" /> : null}
    </button>
  )
}

export function SortFilterPopover({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const { state, updateSettings } = useWorkspace()

  useEffect(() => {
    if (!open) {
      return
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [open])

  const update = <K extends keyof typeof state.settings>(key: K, value: (typeof state.settings)[K]) => {
    void updateSettings({ ...state.settings, [key]: value })
  }

  const organizeOptions: Array<Option<'project' | 'chronological'>> = [
    { value: 'project', label: 'Par projet' },
    { value: 'chronological', label: 'Liste chronologique' },
  ]

  const sortOptions: Array<Option<'created' | 'updated'>> = [
    { value: 'created', label: 'Créé' },
    { value: 'updated', label: 'Mis à jour' },
  ]

  const showOptions: Array<Option<'all' | 'relevant'>> = [
    { value: 'all', label: 'Tous les fils' },
    { value: 'relevant', label: 'Pertinente' },
  ]

  return (
    <div className="relative" ref={rootRef}>
      <span onClick={() => setOpen((prev) => !prev)}>{children}</span>
      {open ? (
        <div className="filter-popover" role="dialog" aria-label="Filtrer trier et organiser les fils">
          <div className="filter-group">
            <h3 className="filter-heading">Organiser</h3>
            {organizeOptions.map((option) => (
              <OptionRow
                key={option.value}
                value={option.value}
                current={state.settings.organizeBy}
                label={option.label}
                onSelect={(value) => update('organizeBy', value)}
              />
            ))}
          </div>

          <div className="filter-divider" />
          <div className="filter-group">
            <h3 className="filter-heading">Trier par</h3>
            {sortOptions.map((option) => (
              <OptionRow
                key={option.value}
                value={option.value}
                current={state.settings.sortBy}
                label={option.label}
                onSelect={(value) => update('sortBy', value)}
              />
            ))}
          </div>

          <div className="filter-divider" />
          <div className="filter-group">
            <h3 className="filter-heading">Afficher</h3>
            {showOptions.map((option) => (
              <OptionRow
                key={option.value}
                value={option.value}
                current={state.settings.show}
                label={option.label}
                onSelect={(value) => update('show', value)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
