import { ChevronDown, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { MenuItem } from '@/components/sidebar/MenuRow'

interface AdaptiveMenuRowProps {
  items: MenuItem[]
  /**
   * Minimum container height to show all items as full buttons.
   * If container is smaller, switches to compact icon mode.
   * Default: 300px (rough estimate for ~4-5 buttons)
   */
  expandThresholdPx?: number
}

/**
 * Adaptive menu system that intelligently displays items:
 * - EXPANDED mode: Full-width buttons when there's enough vertical space
 * - COMPACT mode: Icon row with popover when space is limited
 */
export const AdaptiveMenuRow = memo(function AdaptiveMenuRow({
  items,
  expandThresholdPx = 300,
}: AdaptiveMenuRowProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isCompactMode, setIsCompactMode] = useState(false)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)

  // ResizeObserver to detect available space
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { height } = entry.contentRect
        // Switch to compact mode if height is too small for expanded display
        const shouldBeCompact = height < expandThresholdPx
        setIsCompactMode(shouldBeCompact)
      }
    })

    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
    }
  }, [expandThresholdPx])

  // Update popover position when opened
  useEffect(() => {
    if (!isPopoverOpen || !containerRef.current) {
      setPopoverPosition(null)
      return
    }

    const rect = containerRef.current.getBoundingClientRect()
    setPopoverPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    })
  }, [isPopoverOpen])

  // Close popover on item click
  const handleItemClick = useCallback((item: MenuItem) => {
    item.onClick()
    setIsPopoverOpen(false)
  }, [])

  if (items.length === 0) {
    return null
  }

  // ─── EXPANDED MODE: Show all items as full-width buttons ───
  if (!isCompactMode) {
    return (
      <div ref={containerRef} className="adaptive-menu-expanded">
        {items.map((item, i) => (
          <motion.button
            key={item.id}
            type="button"
            className={`sidebar-item ${item.isActive ? 'sidebar-item-active' : ''}`}
            onClick={() => handleItemClick(item)}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.2, ease: 'easeOut' }}
          >
            <span className="sidebar-nav-icon h-4 w-4">{item.icon}</span>
            <span className="flex-1 text-left text-xs font-medium">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#ff6b35] px-1 text-[10px] font-bold text-white">
                {item.badge}
              </span>
            )}
          </motion.button>
        ))}
      </div>
    )
  }

  // ─── COMPACT MODE: Show as icon row with popover ───
  const maxVisibleIcons = 6
  const displayedItems = items.slice(0, maxVisibleIcons)
  const hiddenItems = items.slice(maxVisibleIcons)
  const hasHiddenItems = hiddenItems.length > 0

  return (
    <>
      <div ref={containerRef} className="menu-row-container">
        <motion.button
          type="button"
          className="menu-row"
          onClick={() => setIsPopoverOpen((prev) => !prev)}
          aria-expanded={isPopoverOpen}
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
                  setIsPopoverOpen((prev) => !prev)
                }}
                title={`${hiddenItems.length} ${hiddenItems.length === 1 ? 'menu' : 'menus'} supplémentaires`}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: displayedItems.length * 0.04, duration: 0.2, ease: 'easeOut' }}
              >
                <ChevronDown className="h-3.5 w-3.5" />
                {hiddenItems.length > 1 && <span className="menu-row-more-count">{hiddenItems.length}</span>}
              </motion.button>
            )}
          </span>
        </motion.button>
      </div>

      {/* Popover with all items and hidden items */}
      {isPopoverOpen && popoverPosition && createPortal(
        <AnimatePresence>
          <motion.div
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
                onClick={() => setIsPopoverOpen(false)}
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
              {hiddenItems.length > 0 && (
                <>
                  <div className="menu-row-popover-divider" />
                  {hiddenItems.map((item) => (
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
