// Autenticación con Google Identity Services (flujo de token para apps cliente-only,
// sin backend ni client_secret). El access token vive solo en sessionStorage
// (se pierde al cerrar la pestaña) y expira a la hora.

const Auth = (() => {
  const STORAGE_KEY = 'gtasks_cal_token_v1';
  let tokenClient = null;
  let onChangeCallback = () => {};

  function getStoredToken() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.access_token || !data.expires_at) return null;
      if (Date.now() >= data.expires_at - 30_000) return null; // margen de 30s
      return data;
    } catch {
      return null;
    }
  }

  function storeToken(tokenResponse) {
    const expires_at = Date.now() + (tokenResponse.expires_in * 1000);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      access_token: tokenResponse.access_token,
      expires_at,
    }));
  }

  function clearToken() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function init(onChange) {
    onChangeCallback = onChange || (() => {});

    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      console.error('Google Identity Services no se cargó todavía.');
      return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      prompt: '',
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          storeToken(tokenResponse);
          onChangeCallback(true);
        } else {
          onChangeCallback(false);
        }
      },
      error_callback: (err) => {
        console.error('Error de autenticación', err);
        onChangeCallback(false);
      },
    });

    // Intento de sesión silenciosa si ya hubo login antes en esta pestaña.
    const existing = getStoredToken();
    if (existing) {
      onChangeCallback(true);
    }
  }

  function login() {
    if (!tokenClient) return;
    const existing = getStoredToken();
    tokenClient.requestAccessToken({ prompt: existing ? '' : 'consent' });
  }

  function ensureFreshToken() {
    return new Promise((resolve, reject) => {
      const existing = getStoredToken();
      if (existing) {
        resolve(existing.access_token);
        return;
      }
      if (!tokenClient) {
        reject(new Error('No hay tokenClient inicializado'));
        return;
      }
      const prevCallback = tokenClient.callback;
      tokenClient.callback = (tokenResponse) => {
        tokenClient.callback = prevCallback;
        if (tokenResponse && tokenResponse.access_token) {
          storeToken(tokenResponse);
          onChangeCallback(true);
          resolve(tokenResponse.access_token);
        } else {
          reject(new Error('No se pudo renovar el token'));
        }
      };
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  function logout() {
    const existing = getStoredToken();
    if (existing && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(existing.access_token, () => {});
    }
    clearToken();
    onChangeCallback(false);
  }

  function isLoggedIn() {
    return !!getStoredToken();
  }

  function getToken() {
    const existing = getStoredToken();
    return existing ? existing.access_token : null;
  }

  return { init, login, logout, isLoggedIn, getToken, ensureFreshToken };
})();
