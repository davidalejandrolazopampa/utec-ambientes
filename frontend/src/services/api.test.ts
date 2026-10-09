import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('./token', () => ({
  getAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}));

import api from './api';
import { getAccessToken, setAccessToken, clearAccessToken } from './token';

// Acceso directo a los handlers registrados en los interceptores.
type Handler = { fulfilled: (v: unknown) => unknown; rejected: (e: unknown) => Promise<unknown> };
const reqH = (api.interceptors.request as unknown as { handlers: Handler[] }).handlers[0];
const resH = (api.interceptors.response as unknown as { handlers: Handler[] }).handlers[0];

describe('api interceptores', () => {
  beforeEach(() => vi.clearAllMocks());

  it('request: adjunta el Bearer si hay access token', () => {
    (getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue('tok123');
    const cfg = reqH.fulfilled({ headers: {} }) as { headers: Record<string, string> };
    expect(cfg.headers.Authorization).toBe('Bearer tok123');
  });

  it('request: sin token no añade Authorization', () => {
    (getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const cfg = reqH.fulfilled({ headers: {} }) as { headers: Record<string, string> };
    expect(cfg.headers.Authorization).toBeUndefined();
  });

  it('request: con FormData borra el Content-Type y amplía el timeout', () => {
    (getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const fd = new FormData();
    fd.append('archivo', new Blob(['x']), 'h.xlsx');
    // AxiosHeaders real expone .delete(); simulamos ambas formas (objeto plano y con delete).
    const deleted: string[] = [];
    const headers = { 'Content-Type': 'application/json', delete: (k: string) => deleted.push(k) };
    const cfg = reqH.fulfilled({ headers, data: fd }) as { timeout: number };
    expect(deleted).toContain('Content-Type');
    expect(cfg.timeout).toBe(120000);
  });

  it('request: con FormData y headers sin delete, elimina la clave Content-Type', () => {
    (getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const fd = new FormData();
    const headers: Record<string, unknown> = { 'Content-Type': 'application/json' };
    reqH.fulfilled({ headers, data: fd });
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('response: pasa las respuestas exitosas tal cual', () => {
    const r = { status: 200 };
    expect(resH.fulfilled(r)).toBe(r);
  });

  it('response: 401 en endpoint NO_REFRESH no intenta renovar', async () => {
    const spy = vi.spyOn(axios, 'post');
    await expect(resH.rejected({ config: { url: '/auth/refresh' }, response: { status: 401 } })).rejects.toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('response: un error que no es 401 se propaga', async () => {
    await expect(resH.rejected({ config: { url: '/x' }, response: { status: 500 } })).rejects.toBeTruthy();
  });

  it('response: 401 renueva el token y guarda el nuevo access', async () => {
    vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: { data: { accessToken: 'nuevo-token' } } });
    await resH.rejected({ config: { url: '/reservas', headers: {} }, response: { status: 401 } }).catch(() => {});
    expect(setAccessToken).toHaveBeenCalledWith('nuevo-token');
  });

  it('response: si el refresh falla, limpia el access token', async () => {
    vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('refresh falló'));
    await resH.rejected({ config: { url: '/reservas', headers: {} }, response: { status: 401 } }).catch(() => {});
    expect(clearAccessToken).toHaveBeenCalled();
  });
});
