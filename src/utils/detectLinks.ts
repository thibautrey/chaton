/**
 * Detects URLs in a given text and returns them as an array.
 * @param text The text to search for URLs.
 * @returns An array of detected URLs.
 */
export function detectLinks(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const links: string[] = [];
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    links.push(match[0]);
  }
  
  return links;
}

/**
 * Replaces URLs in a given text with clickable anchor elements.
 * @param text The text to process.
 * @returns The processed text with URLs replaced by clickable elements.
 */
export function replaceLinksWithAnchors(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="#" class="clickable-link" data-url="${url}">${url}</a>`;
  });
}
