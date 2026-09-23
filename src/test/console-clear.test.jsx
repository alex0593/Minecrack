import { describe, it, expect } from 'vitest';
import React, { useEffect } from 'react';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { StoreProvider, useStore } from '../store';
import ConsoleTab from '../components/main-panel/ConsoleTab';

const wrapper = ({ children }) => React.createElement(StoreProvider, null, children);

describe('CLEAR_GAME_LOGS', () => {
  it('vacía los logs sin tocar el resto del estado', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => {
      result.current.dispatch({ type: 'ADD_INSTANCE', payload: { id: '1', name: 'A' } });
      result.current.dispatch({ type: 'ADD_LOG', payload: { text: 'hola', level: 'info' } });
      result.current.dispatch({ type: 'ADD_LOG', payload: { text: 'boom', level: 'error' } });
    });
    expect(result.current.state.gameLogs).toHaveLength(2);

    act(() => {
      result.current.dispatch({ type: 'CLEAR_GAME_LOGS' });
    });
    expect(result.current.state.gameLogs).toHaveLength(0);
    expect(result.current.state.instances).toHaveLength(1);
    expect(result.current.state.gameRunning).toBe(false);
  });
});

/** Seed — siembra un log de prueba al montar */
function Seed() {
  const { dispatch } = useStore();
  useEffect(() => {
    dispatch({ type: 'ADD_LOG', payload: { text: 'linea de prueba', level: 'info' } });
  }, []);
  return null;
}

describe('ConsoleTab — botón Limpiar', () => {
  it('borra los logs al pulsar 🗑 Limpiar (regresión: antes despachaba SET_GAME_RUNNING)', () => {
    render(
      <StoreProvider>
        <Seed />
        <ConsoleTab />
      </StoreProvider>
    );
    expect(screen.getByText('linea de prueba')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(/Limpiar consola/));

    expect(screen.queryByText('linea de prueba')).not.toBeInTheDocument();
    expect(screen.getByText('Consola vacía')).toBeInTheDocument();
  });
});
