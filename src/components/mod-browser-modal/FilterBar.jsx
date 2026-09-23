/** FilterBar — barra de búsqueda y filtros del explorador de mods */
import Select from '../ui/Select';
import { isCurseForgeConfigured } from '../../lib/api/curseforge';
import './FilterBar.css';

const LOADERS_MODRINTH = ['fabric', 'forge', 'quilt', 'neoforge'];

export default function FilterBar({
  query,
  onQueryChange,
  filterType,
  onFilterTypeChange,
  filterSource,
  onFilterSourceChange,
  filterVersion,
  onFilterVersionChange,
  filterLoader,
  onFilterLoaderChange,
}) {
  return (
    <div className="modbrowser-filters">
      <input
        className="modbrowser-search"
        placeholder={filterType === 'mods' ? 'Buscar mods...' : 'Buscar modpacks...'}
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        autoFocus
      />
      <Select
        size="sm"
        value={filterType}
        onChange={onFilterTypeChange}
        options={[
          { value: 'mods', label: 'Mods' },
          { value: 'modpacks', label: 'Modpacks' },
        ]}
      />
      <Select
        size="sm"
        value={filterSource}
        onChange={onFilterSourceChange}
        options={[
          { value: 'modrinth', label: 'Modrinth' },
          ...(isCurseForgeConfigured() ? [{ value: 'curseforge', label: 'CurseForge' }] : []),
        ]}
      />
      <input
        className="modbrowser-filter-input"
        placeholder="Versión MC"
        value={filterVersion}
        onChange={e => onFilterVersionChange(e.target.value)}
      />
      <Select
        size="sm"
        value={filterLoader}
        onChange={onFilterLoaderChange}
        placeholder="Todos los loaders"
        options={[
          { value: '', label: 'Todos los loaders' },
          ...LOADERS_MODRINTH.map(l => ({
            value: l,
            label: l.charAt(0).toUpperCase() + l.slice(1),
          })),
        ]}
      />
    </div>
  );
}
