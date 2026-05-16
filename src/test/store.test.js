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

  it('ADD_LOG conserva la línea más reciente y añade timestamp', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'ADD_LOG', payload: { text: 'hola', level: 'info' } });
    });
    const last = result.current.state.gameLogs.at(-1);
    expect(last.text).toBe('hola');
    expect(last.timestamp).toBeTruthy();
  });
});

describe('store reducer — config', () => {
  it('SET_CONFIG reemplaza el objeto config completo', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_CONFIG', payload: { setupCompleted: true, javaPath: '/j', gameDir: '/g', theme: 'light' } });
    });
    expect(result.current.state.config.theme).toBe('light');
    expect(result.current.state.config.setupCompleted).toBe(true);
  });

  it('UPDATE_CONFIG hace merge parcial sin perder otros campos', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'UPDATE_CONFIG', payload: { javaPath: '/usr/bin/java' } });
    });
    expect(result.current.state.config.javaPath).toBe('/usr/bin/java');
    // theme por defecto se conserva
    expect(result.current.state.config.theme).toBe('dark');
  });

  it('SET_SHOW_WIZARD alterna el flag', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_SHOW_WIZARD', payload: true });
    });
    expect(result.current.state.showSetupWizard).toBe(true);
  });
});

describe('store reducer — instancias (extra)', () => {
  it('SET_INSTANCES reemplaza la lista completa', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_INSTANCES', payload: [{ id: 'a' }, { id: 'b' }] });
    });
    expect(result.current.state.instances).toHaveLength(2);
  });
});

describe('store reducer — perfil / tabs', () => {
  it('SET_PROFILE establece perfil y marca profileReady', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_PROFILE', payload: { username: 'Steve', uuid: 'u', skin: null } });
    });
    expect(result.current.state.profile.username).toBe('Steve');
    expect(result.current.state.profileReady).toBe(true);
  });

  it('SET_TAB cambia la pestaña activa', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_TAB', payload: 'mods' });
    });
    expect(result.current.state.activeTab).toBe('mods');
  });
});

describe('store reducer — modal', () => {
  it('OPEN_MODAL fija modal y modalData', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'OPEN_MODAL', payload: { name: 'profile', data: { id: 7 } } });
    });
    expect(result.current.state.modal).toBe('profile');
    expect(result.current.state.modalData).toEqual({ id: 7 });
  });

  it('OPEN_MODAL sin data deja modalData en null', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'OPEN_MODAL', payload: { name: 'newInstance' } });
    });
    expect(result.current.state.modalData).toBeNull();
  });

  it('CLOSE_MODAL limpia modal y modalData', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'OPEN_MODAL', payload: { name: 'profile', data: { x: 1 } } });
      result.current.dispatch({ type: 'CLOSE_MODAL' });
    });
    expect(result.current.state.modal).toBeNull();
    expect(result.current.state.modalData).toBeNull();
  });

  it('SET_MODPACK_IMPORT_MODE alterna el flag', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_MODPACK_IMPORT_MODE', payload: true });
    });
    expect(result.current.state.modpackImportMode).toBe(true);
  });
});

describe('store reducer — descarga / java', () => {
  it('SET_DOWNLOAD guarda y limpia el estado de descarga', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_DOWNLOAD', payload: { label: 'x', progress: 5, total: 10 } });
    });
    expect(result.current.state.download.progress).toBe(5);
    act(() => {
      result.current.dispatch({ type: 'SET_DOWNLOAD', payload: null });
    });
    expect(result.current.state.download).toBeNull();
  });

  it('SET_JAVA_DOWNLOAD / CLEAR_JAVA_DOWNLOAD', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'SET_JAVA_DOWNLOAD', payload: { phase: 'download', percent: 42, requiredMajor: 17 } });
    });
    expect(result.current.state.javaDownload.percent).toBe(42);
    act(() => {
      result.current.dispatch({ type: 'CLEAR_JAVA_DOWNLOAD' });
    });
    expect(result.current.state.javaDownload).toBeNull();
  });
});

describe('store reducer — SET_GAME_RUNNING', () => {
  it('al iniciar guarda instanceId y limpia logs', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'ADD_LOG', payload: { text: 'viejo', level: 'info' } });
      result.current.dispatch({ type: 'SET_GAME_RUNNING', payload: { running: true, instanceId: 'inst-1' } });
    });
    expect(result.current.state.gameRunning).toBe(true);
    expect(result.current.state.gameInstanceId).toBe('inst-1');
    expect(result.current.state.gameLogs).toHaveLength(0);
    expect(result.current.state.gameStartedAt).toBeTruthy();
  });

  it('al cerrar acumula playtime y fija lastPlayed en la instancia jugada', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'ADD_INSTANCE', payload: { id: 'inst-1', name: 'A', playtime: 10 } });
      result.current.dispatch({ type: 'SET_GAME_RUNNING', payload: { running: true, instanceId: 'inst-1' } });
    });
    act(() => {
      result.current.dispatch({ type: 'SET_GAME_RUNNING', payload: { running: false } });
    });
    const inst = result.current.state.instances.find(i => i.id === 'inst-1');
    expect(result.current.state.gameRunning).toBe(false);
    expect(result.current.state.gameInstanceId).toBeNull();
    expect(inst.playtime).toBeGreaterThanOrEqual(10);
    expect(inst.lastPlayed).toBeTruthy();
  });
});
