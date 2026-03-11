import { useEffect, useState } from "react";

import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ChangelogDialogProps {
  version: string;
  changelogContent: string;
  onClose: () => void;
}

export function ChangelogDialog({
  version,
  changelogContent,
  onClose,
}: ChangelogDialogProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(true);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300); // Allow time for fade-out animation
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            {t("Changelog pour la version")}{" "}
            {version.startsWith("v") ? version : `v${version}`}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label={t("Fermer")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="prose max-w-none">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {changelogContent}
            </pre>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            {t("Fermer")}
          </button>
        </div>
      </div>
    </div>
  );
}
