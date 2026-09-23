/** Step3Config — Paso 3: configuración de la instancia (nombre, icono, RAM, JVM) */

import { useState } from 'react';
import './Step3Config.css';

const EMOJI_ICONS = ['🎮', '🌲', '🔧', '⚙️', '💎', '🏔️', '🌊', '🔥', '❄️', '⚡', '🌙', '☀️'];

export default function Step3Config({ pack, version, source, gameVersion, onNext, onBack }) {
  const [instanceName, setInstanceName] = useState(pack.title || pack.name || 'New Modpack');
  const [selectedIcon, setSelectedIcon] = useState(EMOJI_ICONS[0]);
  const [ram, setRam] = useState('4GB');
  const [jvmArgs, setJvmArgs] = useState('');

  // Extraer la versión MC real desde la versión seleccionada del modpack
  const actualMcVersion = version?.game_versions?.[0]
    || version?.gameVersions?.[0]
    || gameVersion;

  return (
    <div className="wizard-step-config">
      <h2>Configurar instancia</h2>

      <div className="wizard-form-group">
        <label htmlFor="instance-name">Nombre:</label>
        <input
          id="instance-name"
          type="text"
          className="input"
          value={instanceName}
          onChange={(e) => setInstanceName(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="wizard-form-group">
        <label>Icono:</label>
        <div className="wizard-icon-picker">
          {EMOJI_ICONS.map(icon => (
            <button
              key={icon}
              className={`wizard-icon-btn ${selectedIcon === icon ? 'selected' : ''}`}
              onClick={() => setSelectedIcon(icon)}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div className="wizard-form-group">
        <label htmlFor="ram-select">RAM asignada:</label>
        <select
          id="ram-select"
          className="input"
          value={ram}
          onChange={(e) => setRam(e.target.value)}
        >
          <option value="512MB">512 MB</option>
          <option value="1GB">1 GB</option>
          <option value="2GB">2 GB</option>
          <option value="4GB">4 GB</option>
          <option value="6GB">6 GB</option>
          <option value="8GB">8 GB</option>
        </select>
      </div>

      <div className="wizard-form-group">
        <label htmlFor="jvm-args">Argumentos JVM (opcional):</label>
        <textarea
          id="jvm-args"
          className="input"
          rows="3"
          placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=200"
          value={jvmArgs}
          onChange={(e) => setJvmArgs(e.target.value)}
        />
      </div>

      <div className="wizard-config-info">
        <strong>Info del modpack:</strong>
        <p>MC {actualMcVersion} · {source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</p>
      </div>

      <div className="wizard-button-group">
        <button className="btn btn-ghost" onClick={onBack}>Atrás</button>
        <button
          className="btn btn-primary"
          onClick={() => onNext({
            instanceName: instanceName.trim() || pack.title || pack.name || 'Modpack',
            icon: selectedIcon,
            ram,
            jvmArgs,
          })}
        >
          Instalar
        </button>
      </div>
    </div>
  );
}
