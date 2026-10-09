import axios from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from './token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
  withCredentials: true, // envía la cookie HttpOnly del refresh token
});

// Adjuntar el access token (en memoria) si existe.
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Subidas de archivo (FormData): quitar el 'Content-Type: application/json' que
  // trae el cliente por defecto. Si se dejara, axios SERIALIZA el FormData a JSON y
  // el backend responde 415 (el archivo nunca llega). Al borrarlo, el navegador pone
  // 'multipart/form-data' con su boundary. Además, las importaciones son pesadas →
  // ampliamos el timeout (el default de 15s se queda corto para miles de filas).
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    const h = config.headers as unknown as { delete?: (k: string) => void; [k: string]: unknown };
    if (typeof h.delete === 'function') h.delete('Content-Type');
    else delete h['Content-Type'];
    config.timeout = 120000;
  }
  return config;
});

// Endpoints de auth que NO deben disparar un re-intento de refresh (evita bucles).
const NO_REFRESH = ['/auth/refresh', '/auth/google', '/auth/logout'];

// Ante un 401, intenta renovar el access token usando la cookie del refresh token
// y reintenta la petición original una sola vez.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      const url: string = originalRequest?.url || '';

      if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !NO_REFRESH.some((p) => url.includes(p))
      ) {
        originalRequest._retry = true;
        try {
          // La cookie HttpOnly viaja sola (withCredentials); no se manda body.
          const { data } = await axios.post(
              (import.meta.env.VITE_API_URL || '/api/v1') + '/auth/refresh',
              {},
              { withCredentials: true }
          );
          const newAccess = data.data.accessToken;
          setAccessToken(newAccess);
          originalRequest.headers.Authorization = 'Bearer ' + newAccess;
          return api(originalRequest);
        } catch {
          clearAccessToken();
        }
      }

      return Promise.reject(error);
    }
);

export default api;
