import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const fetchMe = vi.fn();
// authStore soporta selector (App) y sin selector (LoginPage / ProtectedRoute).
vi.mock('@/store/authStore', () => ({
  useAuthStore: (sel?: (s: Record<string, unknown>) => unknown) => {
    const state = { fetchMe, login: vi.fn(), isAuthenticated: false, isBootstrapping: false, user: null };
    return sel ? sel(state) : state;
  },
}));

import App from './App';

describe('App', () => {
  it('monta el router, llama a fetchMe al cargar y /login muestra el login', () => {
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>);
    expect(fetchMe).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /UTEC Ambientes/i })).toBeInTheDocument();
  });
});
