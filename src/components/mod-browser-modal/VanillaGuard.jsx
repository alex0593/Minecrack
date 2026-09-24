import Modal from '../ui/Modal';

/** VanillaGuard — aviso «Vanilla no soporta mods» con cierre */
export default function VanillaGuard({ onClose }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Explorar Mods"
      icon="📦"
      size="sm"
      footer={
        <button className="btn btn-ghost" onClick={onClose} style={{ margin: '0 auto' }}>
          Cerrar
        </button>
      }
    >
      <div style={{ textAlign: 'center', padding: 'var(--gap-xl) var(--gap-md)' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🚫</div>
        <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Vanilla no soporta mods</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Para instalar mods necesitas cambiar el loader de la instancia a
          <strong> Fabric</strong>, <strong>Forge</strong>, <strong>Quilt</strong> o <strong>NeoForge</strong>.
        </p>
      </div>
    </Modal>
  );
}
