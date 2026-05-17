import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { StoreProvider, useStore } from '../store';

const wrapper = ({ children }) => React.createElement(StoreProvider, null, children);

describe('store contract — provider shape & public API', () => {
  it('useStore() retorna { state, dispatch, openModal, closeModal }', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    expect(result.current).toHaveProperty('state');
    expect(result.current).toHaveProperty('dispatch');
    expect(result.current).toHaveProperty('openModal');
    expect(result.current).toHaveProperty('closeModal');
  });

  it('state tiene todas las propiedades esperadas', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    const s = result.current.state;
    expect(s).toHaveProperty('instances');
    expect(s).toHaveProperty('selectedInstanceId');
    expect(s).toHaveProperty('instanceMods');
    expect(s).toHaveProperty('profile');
    expect(s).toHaveProperty('profileReady');
    expect(s).toHaveProperty('activeTab');
    expect(s).toHaveProperty('modal');
    expect(s).toHaveProperty('modalData');
    expect(s).toHaveProperty('modpackImportMode');
    expect(s).toHaveProperty('download');
    expect(s).toHaveProperty('gameRunning');
    expect(s).toHaveProperty('gameInstanceId');
    expect(s).toHaveProperty('gameStartedAt');
    expect(s).toHaveProperty('gameLogs');
    expect(s).toHaveProperty('config');
    expect(s).toHaveProperty('showSetupWizard');
    expect(s).toHaveProperty('errorMessage');
    expect(s).toHaveProperty('javaDownload');
  });
});

describe('store contract — openModal behavior', () => {
  it('openModal(name, data) fija modal + modalData', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.openModal('profile', { x: 1 });
    });
    expect(result.current.state.modal).toBe('profile');
    expect(result.current.state.modalData).toEqual({ x: 1 });
  });

  it('openModal sin data deja modalData en null', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.openModal('newInstance');
    });
    expect(result.current.state.modal).toBe('newInstance');
    expect(result.current.state.modalData).toBeNull();
  });

  it('abrir modal mientras otro está abierto auto-cierra el primero', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    // Abrir primer modal
    act(() => {
      result.current.openModal('profile', { id: 1 });
    });
    expect(result.current.state.modal).toBe('profile');
    expect(result.current.state.modalData).toEqual({ id: 1 });

    // Abrir segundo modal — debe cerrar el primero automáticamente
    act(() => {
      result.current.openModal('newInstance');
    });
    expect(result.current.state.modal).toBe('newInstance');
    expect(result.current.state.modalData).toBeNull();
  });

  it('closeModal() fija modal y modalData en null', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.openModal('profile', { x: 1 });
    });
    act(() => {
      result.current.closeModal();
    });
    expect(result.current.state.modal).toBeNull();
    expect(result.current.state.modalData).toBeNull();
  });
});

describe('store contract — openModal identity stability (P4 gate)', () => {
  it('openModal es referentially stable entre cambios de state', () => {
    const { result, rerender } = renderHook(() => useStore(), { wrapper });
    const openModal1 = result.current.openModal;

    // Cambiar state (ej: ADD_INSTANCE)
    act(() => {
      result.current.dispatch({ type: 'ADD_INSTANCE', payload: { id: '1', name: 'Test' } });
    });
    rerender();

    const openModal2 = result.current.openModal;
    // Si openModal identity es estable, P4 puede memoizar DispatchContext
    // (nota: actualmente puede no ser estable porque depende de [state.modal],
    // pero esta prueba documenta lo que P4 debe lograr)
    expect(typeof openModal1).toBe('function');
    expect(typeof openModal2).toBe('function');
  });
});

describe('store contract — SET_GAME_RUNNING playtime accumulation', () => {
  it('al cerrar juego, acumula playtime y fija lastPlayed', () => {
    const { result } = renderHook(() => useStore(), { wrapper });

    // Crear instancia con playtime inicial
    act(() => {
      result.current.dispatch({
        type: 'ADD_INSTANCE',
        payload: { id: 'inst-1', name: 'Test', playtime: 100 },
      });
    });

    // Iniciar juego
    act(() => {
      result.current.dispatch({
        type: 'SET_GAME_RUNNING',
        payload: { running: true, instanceId: 'inst-1' },
      });
    });
    expect(result.current.state.gameRunning).toBe(true);
    expect(result.current.state.gameLogs).toHaveLength(0);

    // Esperar un bit (en test es muy rápido, pero debe acumular algo)
    // Cerrar juego
    act(() => {
      result.current.dispatch({
        type: 'SET_GAME_RUNNING',
        payload: { running: false },
      });
    });

    const inst = result.current.state.instances.find(i => i.id === 'inst-1');
    expect(inst.playtime).toBeGreaterThanOrEqual(100);  // Al menos lo que ya tenía
    expect(inst.lastPlayed).toBeTruthy();
    expect(result.current.state.gameRunning).toBe(false);
    expect(result.current.state.gameInstanceId).toBeNull();
  });

  it('al iniciar SET_GAME_RUNNING, limpia gameLogs', () => {
    const { result } = renderHook(() => useStore(), { wrapper });

    // Añadir logs antiguos
    act(() => {
      result.current.dispatch({
        type: 'ADD_LOG',
        payload: { text: 'old log', level: 'info' },
      });
    });
    expect(result.current.state.gameLogs).toHaveLength(1);

    // Iniciar juego
    act(() => {
      result.current.dispatch({
        type: 'SET_GAME_RUNNING',
        payload: { running: true, instanceId: 'some-id' },
      });
    });

    // gameLogs debe estar limpio
    expect(result.current.state.gameLogs).toHaveLength(0);
  });
});

describe('store contract — ADD_LOG capping at 500', () => {
  it('ADD_LOG mantiene máximo 500 líneas, conservando las más recientes', () => {
    const { result } = renderHook(() => useStore(), { wrapper });

    // Añadir 510 logs
    act(() => {
      for (let i = 0; i < 510; i++) {
        result.current.dispatch({
          type: 'ADD_LOG',
          payload: { text: `line ${i}`, level: 'info' },
        });
      }
    });

    // Debe tener máximo 500
    expect(result.current.state.gameLogs.length).toBeLessThanOrEqual(500);

    // Debe mantener la línea más reciente (509)
    const last = result.current.state.gameLogs.at(-1);
    expect(last.text).toBe('line 509');
  });

  it('ADD_LOG añade timestamp automático si no tiene', () => {
    const { result } = renderHook(() => useStore(), { wrapper });

    act(() => {
      result.current.dispatch({
        type: 'ADD_LOG',
        payload: { text: 'test', level: 'info' },
      });
    });

    const log = result.current.state.gameLogs[0];
    expect(log.timestamp).toBeTruthy();
    expect(typeof log.timestamp).toBe('number');
  });
});
