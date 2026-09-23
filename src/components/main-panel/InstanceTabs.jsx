import './InstanceTabs.css';

/** InstanceTabs — barra de pestañas de la instancia (Mods, Recursos, Shaders, Stats, Consola) */
export default function InstanceTabs({ tabs, activeTab, onSelect }) {
  return (
    <div className="instance-tabs">
      {tabs.map(t => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          className={`instance-tab${activeTab === t.id ? ' active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
