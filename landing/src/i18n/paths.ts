import type { LanguageCode } from "./translations";

export function buildLocalizedPath(language: LanguageCode, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return language === "en" ? normalizedPath : `/${language}${normalizedPath}`;
}
