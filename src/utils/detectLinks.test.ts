import { detectLinks, replaceLinksWithAnchors } from './detectLinks';

describe('detectLinks', () => {
  it('should detect URLs in text', () => {
    const text = 'Check out https://example.com and http://test.com for more info.';
    const links = detectLinks(text);
    expect(links).toEqual(['https://example.com', 'http://test.com']);
  });

  it('should return an empty array if no URLs are found', () => {
    const text = 'This text has no URLs.';
    const links = detectLinks(text);
    expect(links).toEqual([]);
  });
});

describe('replaceLinksWithAnchors', () => {
  it('should replace URLs with clickable anchor elements', () => {
    const text = 'Visit https://example.com for more information.';
    const processedText = replaceLinksWithAnchors(text);
    expect(processedText).toContain('<a href="#" class="clickable-link" data-url="https://example.com">https://example.com</a>');
  });

  it('should handle multiple URLs in the text', () => {
    const text = 'Links: https://example.com and http://test.com.';
    const processedText = replaceLinksWithAnchors(text);
    expect(processedText).toContain('<a href="#" class="clickable-link" data-url="https://example.com">https://example.com</a>');
    expect(processedText).toContain('<a href="#" class="clickable-link" data-url="http://test.com">http://test.com</a>');
  });
});
