/* eslint-disable react-refresh/only-export-components */
import {
  Archive,
  Blocks,
  BookOpen,
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
  Archive,
  Blocks,
  BookOpen,
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
 * Decode a data URL SVG and add inline dimensions so it fills its container.
 * Returns the SVG HTML string or null if decoding fails.
 */
function decodeDataUrlSvg(src: string): string | null {
  try {
    const match = src.match(/^data:image\/svg\+xml(?:;charset=[^;,]+)?(?:;(base64))?,(.*)$/i);
    if (!match) return null;

    const isBase64 = Boolean(match[1]);
    const rawPayload = match[2] ?? "";
    const svgContent = isBase64
      ? atob(rawPayload)
      : decodeURIComponent(rawPayload);

    if (!svgContent.trim().startsWith("<svg")) {
      return null;
    }

    // Add inline styles to make SVG fill its container and inherit color.
    return svgContent.replace(
      "<svg",
      "<svg style=\"width:100%;height:100%;display:block;fill:none;stroke:currentColor\""
    );
  } catch {
    return null;
  }
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
 * Data URL images are decoded and rendered as inline SVGs so they
 * properly inherit currentColor from the parent container.
 *
 * Tries the primary image source, then each fallback candidate,
 * and finally renders the Puzzle lucide icon if all fail.
 *
 * @param muted - When true, applies grayscale filter to image icons to match
 *                the muted color applied to lucide icons via CSS currentColor.
 */
export function ExtensionIcon({
  iconName,
  extensionId,
  className,
  muted = false,
}: {
  iconName?: string | null;
  extensionId?: string;
  className?: string;
  muted?: boolean;
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

  // For data URL images, decode and render as inline SVG so currentColor works
  // This ensures image icons respect the parent's text color for consistent styling
  if (src.startsWith("data:image/svg+xml")) {
    const decoded = decodeDataUrlSvg(src);
    if (decoded) {
      return (
        <span
          className={className}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          dangerouslySetInnerHTML={{ __html: decoded }}
        />
      );
    }
    // Fall back to img tag if decoding fails
  }

  return (
    <img
      src={src}
      alt=""
      className={muted ? `${className ?? ""} extension-icon-muted` : className}
      loading="lazy"
      onError={handleError}
    />
  );
}
