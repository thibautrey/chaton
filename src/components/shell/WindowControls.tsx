import { useEffect, useState } from "react";

export function WindowControls() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Detect if we're on macOS
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(window.navigator.platform.toUpperCase().indexOf("MAC") >= 0);
  }, []);

  const shouldRenderControls = isMac;

  if (!shouldRenderControls) {
    return null;
  }

  return (
    <div className="window-controls">
      <button 
        className="window-control window-control-close" 
        onClick={() => window.electron?.ipcRenderer.send('window:close')}
        aria-label="Close"
      >
        <span className="window-control-icon"></span>
      </button>
      <button 
        className="window-control window-control-minimize" 
        onClick={() => window.electron?.ipcRenderer.send('window:minimize')}
        aria-label="Minimize"
      >
        <span className="window-control-icon"></span>
      </button>
      <button 
        className="window-control window-control-maximize" 
        onClick={() => window.electron?.ipcRenderer.send('window:maximize')}
        aria-label="Maximize"
      >
        <span className="window-control-icon"></span>
      </button>
    </div>
  );
}
