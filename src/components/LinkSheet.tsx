import React, { useEffect, useRef } from 'react';
import '../styles/LinkSheet.css';

interface LinkSheetProps {
  url: string;
  onClose: () => void;
}

const LinkSheet: React.FC<LinkSheetProps> = ({ url, onClose }) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="link-sheet-overlay">
      <div className="link-sheet" ref={sheetRef}>
        <div className="link-sheet-header">
          <button className="link-sheet-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="link-sheet-content">
          <iframe
            src={url}
            title="External Link"
            className="link-sheet-iframe"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
};

export default LinkSheet;
