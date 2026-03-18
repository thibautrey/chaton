import { ChevronRight, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

export interface MenuItem {
  id: string
  label: string
  icon: React.ReactNode
  onClick: () => void
  isActive?: boolean
  badge?: number
  isPinned?: boolean
}

interface MenuRowProps {
  items: MenuItem[]
  maxVisibleIcons?: number
}

export const MenuRow = memo(function MenuRow({
  items,
  maxVisibleIcons = 6,
}: MenuRowProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Separate pinned and regular items
  const pinnedItems = items.filter((item) => item.isPinned)
  const regularItems = items.filter((item) => !item.isPinned)

  // Calculate visible items: pinned always shown, then fill up to maxVisibleIcons
  const availableSlots = maxVisibleIcons - pinnedItems.length
  const visibleRegularItems = regularItems.slice(0, Math.max(availableSlots, 0))
  const hiddenRegularItems = regularItems.slice(Math.max(availableSlots, 0))

  const displayedItems = [...pinnedItems, ...visibleRegularItems]
  const totalHidden = hiddenRegularItems.length
  const hasHiddenItems = totalHidden > 0

  // Update popover position when opened
  useEffect(() => {
    if (!isOpen || !containerRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPopoverPosition(null)
      return
    }

    const rect = containerRef.current.getBoundingClientRect()
    setPopoverPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    })
  }, [isOpen])

  // Close popover when item is clicked
  const handleItemClick = useCallback((item: MenuItem) => {
    item.onClick()
    setIsOpen(false)
  }, [])

  if (items.length === 0) {
    return null
  }

  return (
    <>
      <div ref={containerRef} className="menu-row-container">
        <motion.button
          type="button"
          className="menu-row"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          whileTap={{ scale: 0.98 }}
        >
          <span className="menu-row-icons">
            {displayedItems.map((item, i) => (
              <motion.button
                key={item.id}
                type="button"
                className={`menu-row-icon-slot ${item.isActive ? 'menu-row-icon-slot-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleItemClick(item)
                }}
                title={item.label}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04, duration: 0.2, ease: 'easeOut' }}
              >
                {item.icon}
                {item.badge && item.badge > 0 && (
                  <span className="menu-row-icon-badge">{item.badge}</span>
                )}
              </motion.button>
            ))}
            {hasHiddenItems && (
              <motion.button
                type="button"
                className="menu-row-more-button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsOpen((prev) => !prev)
                }}
                title={`${totalHidden} ${totalHidden === 1 ? 'menu' : 'menus'} supplémentaires`}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: displayedItems.length * 0.04, duration: 0.2, ease: 'easeOut' }}
              >
                <ChevronRight className="h-3.5 w-3.5" />
                {totalHidden > 1 && <span className="menu-row-more-count">{totalHidden}</span>}
              </motion.button>
            )}
          </span>
        </motion.button>
      </div>

      {/* Popover with all items and hidden items */}
      {isOpen && popoverPosition && createPortal(
        <AnimatePresence>
          <motion.div
            ref={popoverRef}
            className="menu-row-popover"
            style={{
              position: 'fixed',
              top: `${popoverPosition.top}px`,
              left: `${popoverPosition.left}px`,
              width: `${popoverPosition.width}px`,
            }}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Header */}
            <div className="menu-row-popover-header">
              <span className="menu-row-popover-title">{t('Menus')}</span>
              <button
                type="button"
                className="menu-row-popover-close"
                onClick={() => setIsOpen(false)}
                aria-label={t('Fermer')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="menu-row-popover-list">
              {displayedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`menu-row-popover-item ${item.isActive ? 'menu-row-popover-item-active' : ''}`}
                  onClick={() => handleItemClick(item)}
                >
                  <span className="menu-row-popover-icon">{item.icon}</span>
                  <span className="menu-row-popover-label">{item.label}</span>
                  {item.badge && item.badge > 0 && (
                    <span className="menu-row-popover-badge">{item.badge}</span>
                  )}
                </button>
              ))}
              {hiddenRegularItems.length > 0 && (
                <>
                  <div className="menu-row-popover-divider" />
                  {hiddenRegularItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`menu-row-popover-item ${item.isActive ? 'menu-row-popover-item-active' : ''}`}
                      onClick={() => handleItemClick(item)}
                    >
                      <span className="menu-row-popover-icon">{item.icon}</span>
                      <span className="menu-row-popover-label">{item.label}</span>
                      {item.badge && item.badge > 0 && (
                        <span className="menu-row-popover-badge">{item.badge}</span>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  )
})
