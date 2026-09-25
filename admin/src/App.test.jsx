import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let App;

beforeEach(async () => {
  // api.js captura el CSRF al importarse: recargar módulos aísla cada test.
  vi.resetModules();
  sessionStorage.clear();
  ({ default: App } = await import('./App'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

it('muestra el login cuando no hay sesión', () => {
  render(<App />);
  expect(screen.getByText('Administración')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
});

it('muestra el detalle del error cuando el login falla', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Invalid credentials' }, 401)));
  render(<App />);
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'intruso' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'mala' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeTruthy());
  expect(sessionStorage.getItem('minecrack.csrf')).toBeNull();
});

it('abre el dashboard tras un login válido y guarda el CSRF', async () => {
  const fetchMock = vi.fn(async url => {
    if (String(url).endsWith('/api/v1/admin/login')) {
      return jsonResponse({ csrfToken: 'csrf-token', username: 'admin' });
    }
    return jsonResponse([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(screen.getByText(/Minecrack Admin/)).toBeTruthy());
  expect(sessionStorage.getItem('minecrack.csrf')).toBe('csrf-token');
});
