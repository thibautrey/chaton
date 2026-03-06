import type { ComponentType, SVGProps } from 'react'
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

export function getExtensionIcon(iconName?: string | null): IconComponent {
  const normalized = typeof iconName === 'string' ? iconName.trim() : ''
  if (!normalized) return Puzzle
  return ICONS[normalized] ?? Puzzle
}
