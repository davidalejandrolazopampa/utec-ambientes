import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mocks (hoisted, aplican también a imports dinámicos) ──
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

// GoogleLogin se reemplaza por botones que disparan onSuccess/onError.
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoogleLogin: (props: { onSuccess: (r: { credential?: string }) => void; onError: () => void }) => (
    <div>
      <button data-testid="g-ok" onClick={() => props.onSuccess({ credential: 'cred-123' })}>ok</button>
      <button data-testid="g-empty" onClick={() => props.onSuccess({})}>empty</button>
      <button data-testid="g-error" onClick={() => props.onError()}>err</button>
    </div>
  ),
}));

const login = vi.fn();
vi.mock('@/store/authStore', () => ({ useAuthStore: () => ({ login }) }));

async function renderConClientId(clientId: string) {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', clientId);
  const LoginPage = (await import('../LoginPage')).default;
  return render(<LoginPage />);
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('login exitoso: navega a /laboratorios y muestra bienvenida', async () => {
    login.mockResolvedValueOnce(undefined);
    await renderConClientId('test-client');
    fireEvent.click(screen.getByTestId('g-ok'));
    await waitFor(() => expect(login).toHaveBeenCalledWith('cred-123'));
    expect(toastSuccess).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/laboratorios');
  });

  it('sin credencial: muestra error y no llama login', async () => {
    await renderConClientId('test-client');
    fireEvent.click(screen.getByTestId('g-empty'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/credencial/i)));
    expect(login).not.toHaveBeenCalled();
  });

  it('login falla con mensaje del backend: lo muestra', async () => {
    login.mockRejectedValueOnce({ response: { data: { message: 'Contacta al coordinador' } } });
    await renderConClientId('test-client');
    fireEvent.click(screen.getByTestId('g-ok'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Contacta al coordinador'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('login falla sin mensaje: muestra el genérico', async () => {
    login.mockRejectedValueOnce({});
    await renderConClientId('test-client');
    fireEvent.click(screen.getByTestId('g-ok'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/@utec\.edu\.pe/i)));
  });

  it('onError de Google muestra error', async () => {
    await renderConClientId('test-client');
    fireEvent.click(screen.getByTestId('g-error'));
    expect(toastError).toHaveBeenCalledWith('Error con Google');
  });

  it('sin Client ID: muestra el botón de dev y navega', async () => {
    await renderConClientId('');
    const btn = screen.getByRole('button', { name: /Continuar sin login/i });
    fireEvent.click(btn);
    expect(navigate).toHaveBeenCalledWith('/laboratorios');
  });

  it('renderiza el encabezado', async () => {
    await renderConClientId('test-client');
    expect(screen.getByRole('heading', { name: /UTEC Ambientes/i })).toBeInTheDocument();
  });
});
