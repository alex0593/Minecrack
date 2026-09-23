/** VanillaGuard — aviso «Vanilla no soporta mods» con cierre */
export default function VanillaGuard({ onClose }) {
  return (
    <div className="modbrowser-overlay" onClick={onClose}>
      <div className="modbrowser-modal modal modal--sm" onClick={e => e.stopPropagation()} style={{ minHeight: 'auto' }}>
        <div className="modbrowser-header">
          <h2>📦 Explorar Mods</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🚫</div>
          <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Vanilla no soporta mods</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            Para instalar mods necesitas cambiar el loader de la instancia a
            <strong> Fabric</strong>, <strong>Forge</strong>, <strong>Quilt</strong> o <strong>NeoForge</strong>.
          </p>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'center' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
