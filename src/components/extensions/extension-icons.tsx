/* eslint-disable react-refresh/only-export-components */
import {
  Archive,
  Blocks,
  Bot,
  Brain,
  Database,
  Gauge,
  GitBranch,
  Lightbulb,
  Lock,
  MessageCircle,
  MessageSquareShare,
  Puzzle,
  Radio,
  Settings,
  Sparkles,
  Waypoints,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { useState, useCallback } from "react";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type IconValue =
  | { kind: "svg"; Component: IconComponent }
  | { kind: "image"; src: string; fallbacks?: string[] };

const ICONS: Record<string, IconComponent> = {
  Blocks,
  Bot,
  Brain,
  Database,
  Gauge,
  Lightbulb,
  MessageCircle,
  MessageSquareShare,
  Puzzle,
  Radio,
  Settings,
  Sparkles,
  Waypoints,
  Workflow,
  Wrench,
  Zap,
  Lock,
  Archive,
  GitBranch,
};

// Bundled icons exist as .svg or .png; try both extensions
const STATIC_ICON_EXTENSIONS = ["svg", "png"] as const;

/**
 * Build candidate paths for the static icon bundled with the app.
 * Icons may be stored as .svg or .png so we return both candidates.
 */
function staticIconCandidates(extensionId: string): string[] {
  const normalized = extensionId.replace(/\//g, "-");
  return STATIC_ICON_EXTENSIONS.map(
    (ext) => `/extension-icons/${normalized}.${ext}`,
  );
}

/**
 * Resolve an extension icon for display.
 *
 * Priority:
 *  1. Named lucide-react icon (used by manifest sidebar menu items)
 *  2. Explicit image URL or data-URL (local data-URL for installed,
 *     CDN URL for marketplace)
 *  3. Static icon bundled with the app (/extension-icons/)
 *  4. Puzzle fallback
 *
 * @param iconName - An icon identifier: lucide name, data-URL, HTTP URL, or
 *                   relative path from the manifest.
 * @param extensionId - The extension ID, used to look up bundled static icons.
 */
export function getExtensionIcon(
  iconName?: string | null,
  extensionId?: string,
): IconValue {
  const normalized = typeof iconName === "string" ? iconName.trim() : "";

  // 1. Named lucide-react icon from manifest menu items
  if (ICONS[normalized]) return { kind: "svg", Component: ICONS[normalized] };

  // 2. Explicit image: data-URL (local installed), HTTP URL (marketplace CDN),
  //    or absolute path
  if (/^(data:image\/|https?:\/\/|\/)/i.test(normalized)) {
    // When an explicit src is provided, still attach static fallbacks
    // in case the primary source fails to load
    const fallbacks = extensionId ? staticIconCandidates(extensionId) : undefined;
    return { kind: "image", src: normalized, fallbacks };
  }

  // 3. Bundled static icon for this extension ID (try .svg then .png)
  if (extensionId) {
    const [first, ...rest] = staticIconCandidates(extensionId);
    return { kind: "image", src: first, fallbacks: rest };
  }

  // 4. Final fallback
  return { kind: "svg", Component: Puzzle };
}

/**
 * Render an extension icon with automatic fallback handling.
 *
 * Tries the primary image source, then each fallback candidate,
 * and finally renders the Puzzle lucide icon if all fail.
 */
export function ExtensionIcon({
  iconName,
  extensionId,
  className,
}: {
  iconName?: string | null;
  extensionId?: string;
  className?: string;
}) {
  const iconValue = getExtensionIcon(iconName, extensionId);
  const [fallbackIndex, setFallbackIndex] = useState(-1);
  const [allFailed, setAllFailed] = useState(false);

  const handleError = useCallback(() => {
    if (iconValue.kind !== "image") return;
    const fallbacks = iconValue.fallbacks ?? [];
    const nextIndex = fallbackIndex + 1;
    if (nextIndex < fallbacks.length) {
      setFallbackIndex(nextIndex);
    } else {
      setAllFailed(true);
    }
  }, [iconValue, fallbackIndex]);

  if (iconValue.kind === "svg" || allFailed) {
    const Component = iconValue.kind === "svg" ? iconValue.Component : Puzzle;
    return <Component className={className} />;
  }

  const src =
    fallbackIndex >= 0 ? iconValue.fallbacks?.[fallbackIndex] ?? iconValue.src : iconValue.src;

  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
      onError={handleError}
    />
  );
}
