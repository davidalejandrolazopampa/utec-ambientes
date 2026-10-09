// Access token en memoria (NO en localStorage) para reducir el robo por XSS.
// El refresh token vive en una cookie HttpOnly que JS no puede leer. Al recargar
// la página este valor se pierde y se re-obtiene vía /auth/refresh con la cookie.
let accessToken: string | null = null;

export const getAccessToken = (): string | null => accessToken;
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const clearAccessToken = (): void => {
  accessToken = null;
};
