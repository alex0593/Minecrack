import { describe, it, expect } from 'vitest';

// El reducer está definido localmente en store.jsx — lo importamos a través del módulo.
// Como store.jsx exporta StoreProvider y useStore (no el reducer en sí),
// probamos el comportamiento via renderizado con renderHook.
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { StoreProvider, useStore } from '../store';

const wrapper = ({ children }) => React.createElement(StoreProvider, null, children);

describe('store reducer — instancias', () => {
  it('ADD_INSTANCE añade una instancia', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'ADD_INSTANCE', payload: { id: '1', name: 'A' } });
    });
    expect(result.current.state.instances).toHaveLength(1);
    expect(result.current.state.instances[0].name).toBe('A');
  });

  it('REMOVE_INSTANCE elimina la instancia y deselecciona si era la seleccionada', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'ADD_INSTANCE', payload: { id: '1', name: 'A' } });
      result.current.dispatch({ type: 'SELECT_INSTANCE', payload: '1' });
    });
    expect(result.current.state.selectedInstanceId).toBe('1');
    act(() => {
      result.current.dispatch({ type: 'REMOVE_INSTANCE', payload: '1' });
    });
    expect(result.current.state.instances).toHaveLength(0);
    expect(result.current.state.selectedInstanceId).toBeNull();
  });

  it('UPDATE_INSTANCE actualiza sólo los campos indicados', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'ADD_INSTANCE', payload: { id: '1', name: 'A', ram: 2048 } });
      result.current.dispatch({ type: 'UPDATE_INSTANCE', payload: { id: '1', ram: 4096 } });
    });
    const inst = result.current.state.instances[0];
    expect(inst.ram).toBe(4096);
    expect(inst.name).toBe('A');
  });

  it('SELECT_INSTANCE limpia instanceMods', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_INSTANCE_MODS', payload: [{ filename: 'a.jar' }] });
      result.current.dispatch({ type: 'SELECT_INSTANCE', payload: '1' });
    });
    expect(result.current.state.instanceMods).toHaveLength(0);
  });
});

describe('store reducer — error', () => {
  it('SET_ERROR / CLEAR_ERROR', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_ERROR', payload: 'algo salió mal' });
    });
    expect(result.current.state.errorMessage).toBe('algo salió mal');
    act(() => {
      result.current.dispatch({ type: 'CLEAR_ERROR' });
    });
    expect(result.current.state.errorMessage).toBeNull();
  });
});

describe('store reducer — mods', () => {
  it('SET_INSTANCE_MODS reemplaza la lista', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    const mods = [{ filename: 'sodium.jar' }, { filename: 'lithium.jar' }];
    act(() => {
      result.current.dispatch({ type: 'SET_INSTANCE_MODS', payload: mods });
    });
    expect(result.current.state.instanceMods).toHaveLength(2);
  });
});

describe('store reducer — logs', () => {
  it('ADD_LOG acumula hasta 500 líneas', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      for (let i = 0; i < 510; i++) {
        result.current.dispatch({ type: 'ADD_LOG', payload: { text: `line ${i}`, level: 'info' } });
      }
    });
    expect(result.current.state.gameLogs.length).toBeLessThanOrEqual(500);
  });
});
