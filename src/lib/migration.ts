/**
 * CSS to Tailwind Migration Utilities
 * 
 * This module provides utilities for incremental migration from global CSS classes
 * to Tailwind utility classes. Use the `migrated` function to gradually replace
 * CSS classes while maintaining backward compatibility.
 * 
 * Migration Strategy:
 * 1. Keep the old CSS class for backward compatibility
 * 2. Add the new Tailwind equivalent
 * 3. Remove old CSS class once all usages are updated
 * 4. Delete old CSS rule once no component uses it
 * 
 * @example
 * // Before migration
 * className="notification-bell-dropdown"
 * 
 * // After migration (dual-class approach)
 * className={migrated('notification-bell-dropdown', 'absolute top-full right-0 mt-2')}
 * 
 * // When ready to remove old CSS
 * className="absolute top-full right-0 mt-2 w-96 max-h-[500px] bg-white rounded-xl ..."
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge classes with optional legacy CSS class support.
 * 
 * @param legacyClass - The old CSS class name (will be removed after migration)
 * @param tailwindClasses - The new Tailwind utility classes
 * @returns Merged class string
 * 
 * @example
 * // Gradually migrate from .sidebar-panel to Tailwind
 * className={migrated('sidebar-panel', 'w-80 shrink-0 bg-[#ececee]')}
 */
export function migrated<T extends string>(legacyClass: T, tailwindClasses: ClassValue): string {
  return twMerge(clsx(legacyClass, tailwindClasses))
}

/**
 * Map of legacy CSS classes to their Tailwind equivalents.
 * Use this to track migration progress and find Tailwind alternatives.
 */
export const CSS_MIGRATION_MAP: Record<string, string> = {
  // Layout
  '.sidebar-panel': 'w-80 shrink-0 flex flex-col bg-[#ececee] pt-6',
  '.main-panel': 'flex min-w-0 flex-1 flex-col bg-[#f3f3f5] relative',
  '.sidebar-nav': 'space-y-1 px-3 pb-3 pt-1',
  '.sidebar-scroll': 'min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2',

  // Sidebar items
  '.sidebar-item': 'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[#46474d] hover:bg-white/70',
  '.sidebar-item-active': 'bg-white text-[#2c2d34] shadow-sm',
  '.sidebar-section-head': 'flex items-center gap-2 px-4 py-2 text-[#8d8e95]',
  '.sidebar-icon-button': 'inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#7d7e86] hover:bg-white/70',

  // Search
  '.sidebar-search-wrap': 'flex items-center gap-2 rounded-xl border border-[#dcdddf] bg-[#f2f2f4] px-3 py-2',
  '.sidebar-search-input': 'w-full border-0 bg-transparent p-0 text-xs text-[#2a2b30] placeholder:text-[#a1a2a9]',

  // Chat
  '.chat-section': 'mx-auto w-full max-w-[920px] px-0 py-5',
  '.chat-timeline': 'space-y-0',
  '.chat-empty': 'rounded-xl border border-dashed border-[#d8d9de] bg-white/45 p-4 text-sm text-[#7e818a]',
  '.chat-message': 'py-2.5',
  '.chat-message-user': 'flex w-full justify-end py-2',
  '.chat-message-body': 'relative min-w-0',
  '.chat-message-text': 'bg-transparent p-0 text-[15px] leading-7 text-[#232731]',

  // Composer
  '.composer-shell': 'flex flex-col rounded-2xl border border-[#d5d6dd] bg-white shadow-sm transition-all',
  '.composer-input': 'min-h-[44px] max-h-[400px] flex-1 overflow-y-auto px-4 py-3 text-[15px] leading-7 outline-none',
  '.composer-footer': 'flex items-center justify-end gap-2 px-3 pb-2 pt-1',

  // Notifications (notification-bell.css)
  '.notification-bell-wrapper': 'relative',
  '.notification-bell-button': 'relative bg-none border-none cursor-pointer p-1.5 flex items-center justify-center rounded-lg text-[#66676f] transition-all hover:bg-[#f0f0f2] hover:text-[#2c2d34]',
  '.notification-bell-badge': 'absolute top-0 right-0 flex items-center justify-center min-w-5 h-5 p-0.5 bg-[#b83e3e] text-white text-[11px] font-semibold rounded-[10px] border-2 border-white',
  '.notification-bell-dropdown': 'absolute top-full right-0 mt-2 w-96 max-h-[500px] bg-white border border-[#e0e1e6] rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.12)] flex flex-col z-[1000]',
  '.notification-bell-header': 'flex items-center justify-between p-3.5 border-b border-[#f0f0f2] bg-[#fafbfc]',
  '.notification-bell-title': 'text-sm font-semibold m-0 text-[#2c2d34]',
  '.notification-bell-clear': 'bg-none border-none cursor-pointer p-1 flex items-center justify-center text-[#a1a2a9] rounded-md transition-all hover:bg-[#f0f0f2] hover:text-[#66676f]',
  '.notification-bell-list': 'flex-1 overflow-y-auto flex flex-col',
  '.notification-bell-empty': 'flex items-center justify-center p-10 text-[#a1a2a9] text-sm',
  '.notification-bell-item': 'flex gap-3 p-3 border-b border-[#f8f8f9] transition-colors hover:bg-[#f8f8f9]',
  '.notification-bell-item-icon': 'shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs font-semibold',
  '.notification-bell-item-content': 'flex-1 min-w-0',
  '.notification-bell-item-message': 'text-[13px] text-[#2c2d34] leading-6 mb-1.5 break-words',
  '.notification-bell-item-meta': 'flex gap-2 items-center text-[11px]',
  '.notification-bell-item-type': 'px-1.5 py-0.5 bg-[#f0f0f2] rounded text-[#66676f] font-medium',
  '.notification-bell-item-time': 'text-[#a1a2a9]',
  '.notification-bell-item-delete': 'shrink-0 bg-none border-none cursor-pointer p-1 flex items-center justify-center text-[#a1a2a9] rounded transition-all opacity-0 hover:bg-[#f0f0f2] hover:text-[#66676f]',
  '.notification-bell-item-link': 'inline-flex items-center gap-1.5 mt-2 px-2.5 py-1.5 bg-[#f0f0f2] border border-[#d4d5db] rounded text-[#3d6b99] text-xs font-medium cursor-pointer transition-all hover:bg-[#e8e9ed] hover:border-[#c0c1c8]',
  '.notification-bell-overlay': 'fixed inset-0 z-[999]',

  // Notification types
  '.notification-type-success .notification-bell-item-icon': 'bg-[#f0fdf4] text-[#3d9970]',
  '.notification-type-warning .notification-bell-item-icon': 'bg-[#faf8f3] text-[#c97c3c]',
  '.notification-type-error .notification-bell-item-icon': 'bg-[#faf5f5] text-[#b83e3e]',
  '.notification-type-info .notification-bell-item-icon': 'bg-[#f5f9fc] text-[#3d6b99]',
  '.notification-type-success .notification-bell-item-type': 'bg-[#d4e8dd] text-[#3d9970]',
  '.notification-type-warning .notification-bell-item-type': 'bg-[#ebe1ca] text-[#c97c3c]',
  '.notification-type-error .notification-bell-item-type': 'bg-[#e8d4d4] text-[#b83e3e]',
  '.notification-type-info .notification-bell-item-type': 'bg-[#d4e0e8] text-[#3d6b99]',
  '.notification-type-success .notification-bell-item-link': 'text-[#3d9970] hover:bg-[#e8f5f0] hover:border-[#d4e8dd]',
  '.notification-type-warning .notification-bell-item-link': 'text-[#c97c3c] hover:bg-[#fef8f0] hover:border-[#ebe1ca]',
  '.notification-type-error .notification-bell-item-link': 'text-[#b83e3e] hover:bg-[#fef5f5] hover:border-[#e8d4d4]',

  // LinkSheet
  '.link-sheet': 'flex flex-col h-full bg-white rounded-t-2xl',
  '.link-sheet-header': 'flex items-center justify-between px-4 py-3 border-b border-[#e4e5ea]',
  '.link-sheet-title': 'text-sm font-semibold text-[#2c2d34]',
  '.link-sheet-content': 'flex-1 overflow-y-auto p-4',
  '.link-sheet-footer': 'flex items-center justify-end gap-2 p-3 border-t border-[#e4e5ea]',
}

/**
 * Get the Tailwind equivalent for a legacy CSS class.
 * Returns undefined if no mapping exists.
 */
export function getTailwindEquivalent(legacyClass: string): string | undefined {
  return CSS_MIGRATION_MAP[legacyClass]
}

/**
 * Check migration progress for a CSS file.
 * Returns statistics about mapped vs unmapped classes.
 */
export function analyzeMigrationProgress(
  usedClasses: string[],
  mappedClasses: string[] = Object.keys(CSS_MIGRATION_MAP).map(c => c.slice(1)) // Remove dot prefix
): { total: number; mapped: number; percentage: number; unmapped: string[] } {
  const unmapped = usedClasses.filter(c => !mappedClasses.includes(c) && !c.startsWith('tw-'))
  return {
    total: usedClasses.length,
    mapped: usedClasses.length - unmapped.length,
    percentage: Math.round(((usedClasses.length - unmapped.length) / usedClasses.length) * 100),
    unmapped,
  }
}

/**
 * Create a merged class string from legacy and Tailwind classes.
 * This is the recommended way to gradually migrate components.
 * 
 * @param legacyClass - The old CSS class (will be phased out)
 * @param tailwindClasses - Tailwind utilities (can be multiple)
 * @param options - Additional options
 * @param options.keepLegacy - Force keep legacy class (default: true during migration)
 * 
 * @example
 * // Component.jsx
 * className={css(
 *   'notification-bell-dropdown',  // Legacy class
 *   'absolute top-full right-0 mt-2 w-96',  // Tailwind classes
 * )}
 */
export function css<T extends string>(legacyClass: T, tailwindClasses?: ClassValue): string {
  if (tailwindClasses === undefined) {
    return legacyClass
  }
  return twMerge(clsx(legacyClass, tailwindClasses))
}

/**
 * Compose multiple Tailwind classes with optional legacy class support.
 * 
 * @example
 * className={compose(
 *   'flex items-center gap-2',
 *   isActive && 'bg-white shadow-sm',
 *   isDisabled && 'opacity-50 cursor-not-allowed',
 * )}
 */
export function compose(...classes: ClassValue[]): string {
  return twMerge(clsx(classes))
}
