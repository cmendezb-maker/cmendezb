// Wrappers ligeros sobre las REST API de Google Tasks y Google Calendar.
// Todas las llamadas van autenticadas con el access token en memoria (Auth.getToken()).

const Api = (() => {
  const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';
  const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

  async function request(url, options = {}, isRetry = false) {
    const token = Auth.getToken();
    const headers = Object.assign(
      { 'Authorization': `Bearer ${token}` },
      options.body ? { 'Content-Type': 'application/json' } : {},
      options.headers || {}
    );

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 && !isRetry) {
      await Auth.ensureFreshToken();
      return request(url, options, true);
    }

    if (res.status === 204) return null;

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const message = data?.error?.message || res.statusText;
      throw new Error(`${res.status} ${message}`);
    }
    return data;
  }

  // ---------- Tasks ----------

  function listTaskLists() {
    return request(`${TASKS_BASE}/users/@me/lists?maxResults=100`);
  }

  function insertTaskList(title) {
    return request(`${TASKS_BASE}/users/@me/lists`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  function deleteTaskList(tasklistId) {
    return request(`${TASKS_BASE}/users/@me/lists/${encodeURIComponent(tasklistId)}`, {
      method: 'DELETE',
    });
  }

  function listTasks(tasklistId, { showCompleted = true, showHidden = true } = {}) {
    const params = new URLSearchParams({
      maxResults: '100',
      showCompleted: String(showCompleted),
      showHidden: String(showHidden),
    });
    return request(`${TASKS_BASE}/lists/${encodeURIComponent(tasklistId)}/tasks?${params}`);
  }

  function insertTask(tasklistId, task, parent) {
    const params = parent ? `?parent=${encodeURIComponent(parent)}` : '';
    return request(`${TASKS_BASE}/lists/${encodeURIComponent(tasklistId)}/tasks${params}`, {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  function patchTask(tasklistId, taskId, patch) {
    return request(`${TASKS_BASE}/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  function deleteTask(tasklistId, taskId) {
    return request(`${TASKS_BASE}/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });
  }

  function moveTask(tasklistId, taskId, { parent, previous } = {}) {
    const params = new URLSearchParams();
    if (parent) params.set('parent', parent);
    if (previous) params.set('previous', previous);
    const qs = params.toString();
    return request(`${TASKS_BASE}/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}/move${qs ? '?' + qs : ''}`, {
      method: 'POST',
    });
  }

  // ---------- Calendar ----------

  function listCalendarList() {
    return request(`${CAL_BASE}/users/me/calendarList?maxResults=250`);
  }

  function listEvents(calendarId, timeMin, timeMax) {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    return request(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  }

  function insertEvent(calendarId, event) {
    return request(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  function patchEvent(calendarId, eventId, patch) {
    return request(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  function deleteEvent(calendarId, eventId) {
    return request(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    });
  }

  return {
    listTaskLists, insertTaskList, deleteTaskList,
    listTasks, insertTask, patchTask, deleteTask, moveTask,
    listCalendarList, listEvents, insertEvent, patchEvent, deleteEvent,
  };
})();
