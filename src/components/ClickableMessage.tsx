import React from 'react';
import { replaceLinksWithAnchors } from '../utils/detectLinks';

interface ClickableMessageProps {
  text: string;
  onLinkClick: (url: string) => void;
}

const ClickableMessage: React.FC<ClickableMessageProps> = ({ text, onLinkClick }) => {
  const processedText = replaceLinksWithAnchors(text);

  return (
    <div
      className="whitespace-pre-wrap break-words overflow-wrap-anywhere bg-transparent p-0 text-[15px] leading-7 text-[#232731] [&_.clickable-link]:cursor-pointer [&_.clickable-link]:text-[#22579a] [&_.clickable-link]:underline [&_.clickable-link]:underline-offset-2 hover:[&_.clickable-link]:text-[#1a4478]"
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
