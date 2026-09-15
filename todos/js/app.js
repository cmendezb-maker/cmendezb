// Orquestación general: login, refresco y toasts.
// Nota: la vista de Calendario está desactivada por ahora (ver js/calendarView.js).
// Para reactivarla: añade <script src="js/calendarView.js"> antes de este archivo en
// index.html, vuelve a poner la pestaña/vista de Calendario, y restaura las llamadas
// a CalendarView aquí (búscalas en el historial de cambios).

const Toast = (() => {
  function show(message, type = 'info') {
    const host = document.getElementById('toastHost');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-visible'));
    setTimeout(() => {
      t.classList.remove('toast-visible');
      setTimeout(() => t.remove(), 300);
    }, 4000);
  }
  return { show };
})();

(function App() {
  let autoRefreshTimer = null;

  const els = {};

  function cacheEls() {
    els.loginScreen = document.getElementById('loginScreen');
    els.boardView = document.getElementById('boardView');
    els.loginBtnCenter = document.getElementById('loginBtnCenter');
    els.logoutBtn = document.getElementById('logoutBtn');
    els.refreshBtn = document.getElementById('refreshBtn');
    els.configWarning = document.getElementById('configWarning');
  }

  async function onAuthChange(loggedIn) {
    if (loggedIn) {
      els.loginScreen.hidden = true;
      els.boardView.hidden = false;
      Board.refresh();
      startAutoRefresh();
    } else {
      els.loginScreen.hidden = false;
      els.boardView.hidden = true;
      stopAutoRefresh();
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    const ms = (CONFIG.AUTO_REFRESH_MINUTES || 5) * 60 * 1000;
    autoRefreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') Board.refresh();
    }, ms);
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }

  function wireEvents() {
    els.loginBtnCenter.addEventListener('click', () => Auth.login());
    els.logoutBtn.addEventListener('click', () => Auth.logout());
    els.refreshBtn.addEventListener('click', () => {
      Toast.show('Actualizando…', 'info');
      Board.refresh();
    });
  }

  function checkConfig() {
    if (!CONFIG.CLIENT_ID || CONFIG.CLIENT_ID.includes('TU_CLIENT_ID')) {
      els.configWarning.hidden = false;
      els.loginBtnCenter.disabled = true;
    }
  }

  function boot() {
    cacheEls();
    wireEvents();
    checkConfig();
    Board.init();
    // GIS puede tardar un instante en cargar su script async.
    const waitForGis = setInterval(() => {
      if (window.google && google.accounts && google.accounts.oauth2) {
        clearInterval(waitForGis);
        Auth.init(onAuthChange);
      }
    }, 100);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
