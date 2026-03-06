import { useEffect, useState } from "react";

export function WindowControls() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Detect if we're on macOS
    setIsMac(window.navigator.platform.toUpperCase().indexOf("MAC") >= 0);
  }, []);

  if (!isMac) {
    return null;
  }

  return (
    <div className="window-controls">
      <button 
        className="window-control window-control-close" 
        onClick={() => window.electronAPI?.closeWindow()}
        aria-label="Close"
      >
        <span className="window-control-icon"></span>
      </button>
      <button 
        className="window-control window-control-minimize" 
        onClick={() => window.electronAPI?.minimizeWindow()}
        aria-label="Minimize"
      >
        <span className="window-control-icon"></span>
      </button>
      <button 
        className="window-control window-control-maximize" 
        onClick={() => window.electronAPI?.maximizeWindow()}
        aria-label="Maximize"
      >
        <span className="window-control-icon"></span>
      </button>
    </div>
  );
}
