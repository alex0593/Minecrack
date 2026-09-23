import { useStore } from '../../store';
import './WelcomeView.css';

/** WelcomeView — pantalla de bienvenida cuando no hay instancia seleccionada */
export default function WelcomeView() {
  const { openModal } = useStore();
  return (
    <div className="welcome-view">
      <div className="welcome-logo">⛏️</div>
      <h1 className="welcome-title">Bienvenido a <span>Minecrack</span></h1>
      <p className="welcome-subtitle">
        Tu launcher de Minecraft multiplataforma con soporte para Fabric, Forge y Quilt.
        Juega offline con cualquier nick.
      </p>
      <div className="welcome-actions">
        <button
          id="btn-create-first-instance"
          className="btn btn-primary btn-lg"
          onClick={() => openModal('newInstance')}
        >
          ➕ Crear primera instancia
        </button>
        <button
          id="btn-browse-mods-welcome"
          className="btn btn-ghost btn-lg"
          onClick={() => openModal('modBrowser')}
        >
          🔍 Explorar mods
        </button>
      </div>
    </div>
  );
}
