import React from 'react';
import { replaceLinksWithAnchors } from '../utils/detectLinks';

interface ClickableMessageProps {
  text: string;
  onLinkClick: (url: string) => void;
}

const ClickableMessage: React.FC<ClickableMessageProps> = ({ text, onLinkClick }) => {
  const processedText = replaceLinksWithAnchors(text);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const url = e.currentTarget.getAttribute('data-url');
    if (url) {
      onLinkClick(url);
    }
  };

  return (
    <div
      className="clickable-message"
      dangerouslySetInnerHTML={{ __html: processedText }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('clickable-link')) {
          e.preventDefault();
          const url = target.getAttribute('data-url');
          if (url) {
            onLinkClick(url);
          }
        }
      }}
    />
  );
};

export default ClickableMessage;
