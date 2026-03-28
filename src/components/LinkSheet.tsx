import React, { useEffect, useRef } from 'react';

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
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[1000] overflow-auto p-5">
      <div 
        className="bg-white w-[90%] max-w-[1200px] h-[80vh] max-h-[80%] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden"
        ref={sheetRef}
      >
        <div className="p-2.5 flex justify-end bg-[#f0f0f0] dark:bg-[#2f313a]">
          <button 
            className="bg-none border-none text-2xl cursor-pointer text-[#66676f] hover:text-[#2c2d34] dark:text-[#a1a2a9] dark:hover:text-[#e4e5ea] transition-colors"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <iframe
            src={url}
            title="External Link"
            className="w-full h-full border-0"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
};

export default LinkSheet;
