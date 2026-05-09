import './TitleBar.css';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function getWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export default function TitleBar() {
  const handleMinimize = async () => {
    if (!isTauri) return;
    try { (await getWindow()).minimize(); } catch (e) { console.error(e); }
  };

  const handleMaximize = async () => {
    if (!isTauri) return;
    try { (await getWindow()).toggleMaximize(); } catch (e) { console.error(e); }
  };

  const handleClose = async () => {
    if (!isTauri) return;
    try { (await getWindow()).close(); } catch (e) { console.error(e); }
  };

  return (
    <div className="titlebar">
      <div className="titlebar-logo">
        <div className="titlebar-logo-icon">⛏</div>
        <span className="titlebar-name">Mine<span>crack</span></span>
      </div>

      <div className="titlebar-drag-area" />

      <div className="titlebar-controls">
        <button
          id="btn-minimize"
          className="titlebar-btn"
          onClick={handleMinimize}
          title="Minimizar"
        >─</button>
        <button
          id="btn-maximize"
          className="titlebar-btn"
          onClick={handleMaximize}
          title="Maximizar"
        >□</button>
        <button
          id="btn-close"
          className="titlebar-btn close"
          onClick={handleClose}
          title="Cerrar"
        >✕</button>
      </div>
    </div>
  );
}
