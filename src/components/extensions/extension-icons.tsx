import type { ComponentType, SVGProps } from 'react'
import { ImageIcon } from 'lucide-react'
import {
  Blocks,
  Bot,
  Brain,
  Gauge,
  MessageCircle,
  MessageSquareShare,
  Puzzle,
  Radio,
  Settings,
  Sparkles,
  Waypoints,
  Workflow,
  Wrench,
} from 'lucide-react'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>
type IconValue =
  | { kind: 'svg'; Component: IconComponent }
  | { kind: 'image'; src: string }

const ICONS: Record<string, IconComponent> = {
  Blocks,
  Bot,
  Brain,
  Gauge,
  MessageCircle,
  MessageSquareShare,
  Puzzle,
  Radio,
  Settings,
  Sparkles,
  Waypoints,
  Workflow,
  Wrench,
}

export function getExtensionIcon(iconName?: string | null): IconValue {
  const normalized = typeof iconName === 'string' ? iconName.trim() : ''
  if (!normalized) return { kind: 'svg', Component: Puzzle }
  if (/^data:image\//i.test(normalized)) return { kind: 'image', src: normalized }
  return ICONS[normalized] ? { kind: 'svg', Component: ICONS[normalized] } : { kind: 'svg', Component: ImageIcon }
}
