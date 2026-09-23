import { describe, it, expect, vi } from 'vitest';
import React, { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { StoreProvider, useStore } from '../store';
import ModBrowserModal from '../components/ModBrowserModal';

// Nunca resolver: el modal dispara la búsqueda en montaje (y un debounce a
// 400 ms que se limpia al desmontar). Promise pendiente = cero red y cero
// actualizaciones de estado posteriores al test.
vi.mock('../lib/api/modrinth', async (importOriginal) => ({
  ...(await importOriginal()),
  searchMods: vi.fn(() => new Promise(() => {})),
  searchModpacks: vi.fn(() => new Promise(() => {})),
  getVersion: vi.fn(() => new Promise(() => {})),
}));

vi.mock('../lib/api/curseforge', async (importOriginal) => ({
  ...(await importOriginal()),
  searchMods: vi.fn(() => new Promise(() => {})),
  searchModpacks: vi.fn(() => new Promise(() => {})),
  isCurseForgeConfigured: vi.fn(() => false),
}));

/**
 * Harness — monta el modal sobre una instancia cuyo loader puede cambiar en
 * caliente, que es justo el camino que rompía las rules of hooks.
 */
function Harness({ loader }) {
  const { state, dispatch } = useStore();
  useEffect(() => {
    dispatch({
      type: 'SET_INSTANCES',
      payload: [{ id: 'i1', name: 'Test', version: '1.21.4', loader, installed: true }],
    });
  }, [loader]);
  if (!state.instances.length) return null;
  return <ModBrowserModal instanceId="i1" onClose={() => {}} />;
}

describe('ModBrowserModal — rules of hooks', () => {
  it('el guard vanilla no varía el número de hooks al pasar a fabric', () => {
    const { rerender } = render(
      <StoreProvider>
        <Harness loader="vanilla" />
      </StoreProvider>
    );
    expect(screen.getByText(/Vanilla no soporta mods/)).toBeInTheDocument();

    // Con el guard como early-return dentro del mismo componente, este cambio
    // de loader lanzaba "Rendered more hooks than expected".
    rerender(
      <StoreProvider>
        <Harness loader="fabric" />
      </StoreProvider>
    );
    expect(screen.queryByText(/Vanilla no soporta mods/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Buscar mods/)).toBeInTheDocument();
  });

  it('muestra el guard de vanilla con cierre funcional', () => {
    const onClose = vi.fn();
    function GuardHarness() {
      const { state, dispatch } = useStore();
      useEffect(() => {
        dispatch({
          type: 'SET_INSTANCES',
          payload: [{ id: 'i1', name: 'T', version: '1.21.4', loader: 'vanilla', installed: true }],
        });
      }, []);
      if (!state.instances.length) return null;
      return <ModBrowserModal instanceId="i1" onClose={onClose} />;
    }
    render(
      <StoreProvider>
        <GuardHarness />
      </StoreProvider>
    );
    expect(screen.getByText(/Vanilla no soporta mods/)).toBeInTheDocument();
    screen.getAllByText('Cerrar').forEach(btn => btn.click());
    expect(onClose).toHaveBeenCalled();
  });
});
