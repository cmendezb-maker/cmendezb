// Configuración de la aplicación.
// Sustituye CLIENT_ID por el "ID de cliente OAuth 2.0" (tipo Web application)
// que crees en Google Cloud Console. Ver README.md para la guía paso a paso.
const CONFIG = {
  CLIENT_ID: '436614251207-ij8akrrk7d0rv3p53k6dbtnka2vqmff5.apps.googleusercontent.com',

  // Scopes mínimos necesarios: gestión completa de Tasks, gestión de eventos de Calendar,
  // y lectura de la lista de calendarios (para poder mostrar eventos de todos tus calendarios).
  SCOPES: [
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  ].join(' '),

  // Calendario en el que se crean los eventos nuevos. 'primary' es el calendario
  // principal del usuario. La vista de calendario, en cambio, LEE eventos de
  // todos los calendarios visibles del usuario, no solo de este.
  CALENDAR_ID: 'primary',

  // Minutos entre refrescos automáticos en segundo plano (no hay push notifications sin backend).
  AUTO_REFRESH_MINUTES: 5,
};
