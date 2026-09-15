// Vista de calendario mensual sobre Google Calendar.

const CalendarView = (() => {
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  let cursor = startOfMonth(new Date());
  let events = [];
  let editingEventId = null;
  let editingCalendarId = null;
  const el = {};

  function cacheEls() {
    el.grid = document.getElementById('calendarGrid');
    el.title = document.getElementById('calTitle');
    el.prev = document.getElementById('calPrev');
    el.next = document.getElementById('calNext');
    el.today = document.getElementById('calToday');
    el.newEventBtn = document.getElementById('newEventBtn');

    el.eventModal = document.getElementById('eventModal');
    el.eventForm = document.getElementById('eventForm');
    el.eventModalTitle = document.getElementById('eventModalTitle');
    el.eventTitle = document.getElementById('eventTitle');
    el.eventAllDay = document.getElementById('eventAllDay');
    el.eventStartDate = document.getElementById('eventStartDate');
    el.eventStartTime = document.getElementById('eventStartTime');
    el.eventEndDate = document.getElementById('eventEndDate');
    el.eventEndTime = document.getElementById('eventEndTime');
    el.eventDescription = document.getElementById('eventDescription');
    el.eventDeleteBtn = document.getElementById('eventDeleteBtn');
    el.eventCancelBtn = document.getElementById('eventCancelBtn');
    el.eventStartTimeWrap = document.getElementById('eventStartTimeWrap');
    el.eventEndTimeWrap = document.getElementById('eventEndTimeWrap');

    el.dayModal = document.getElementById('dayModal');
    el.dayModalTitle = document.getElementById('dayModalTitle');
    el.dayAgendaList = document.getElementById('dayAgendaList');
    el.dayModalAddBtn = document.getElementById('dayModalAddBtn');
    el.dayModalCloseBtn = document.getElementById('dayModalCloseBtn');
  }

  function init() {
    cacheEls();
    el.prev.addEventListener('click', () => { cursor = addMonths(cursor, -1); refresh(); });
    el.next.addEventListener('click', () => { cursor = addMonths(cursor, 1); refresh(); });
    el.today.addEventListener('click', () => { cursor = startOfMonth(new Date()); refresh(); });
    el.newEventBtn.addEventListener('click', () => openEventModal({ mode: 'create', dateStr: todayStr() }));

    el.eventAllDay.addEventListener('change', updateTimeFieldsVisibility);
    el.eventForm.addEventListener('submit', onSaveEvent);
    el.eventCancelBtn.addEventListener('click', () => el.eventModal.close());
    el.eventDeleteBtn.addEventListener('click', onDeleteEvent);

    el.dayModalAddBtn.addEventListener('click', () => {
      const dateStr = el.dayModal.dataset.date;
      el.dayModal.close();
      openEventModal({ mode: 'create', dateStr });
    });
    el.dayModalCloseBtn.addEventListener('click', () => el.dayModal.close());
  }

  // ---------- Fechas ----------

  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function todayStr() { return fmtDate(new Date()); }
  function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  function gridRange(month) {
    const first = startOfMonth(month);
    const startWeekday = (first.getDay() + 6) % 7; // 0 = lunes
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startWeekday);

    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridStart.getDate() + 42); // 6 semanas
    return { gridStart, gridEnd };
  }

  // ---------- Carga y render ----------

  async function refresh() {
    el.title.textContent = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    el.grid.innerHTML = '<p class="board-loading">Cargando eventos…</p>';

    const { gridStart, gridEnd } = gridRange(cursor);
    try {
      const calRes = await Api.listCalendarList();
      // 'selected !== false' respeta qué calendarios tiene visibles el usuario en Google Calendar.
      const calendars = (calRes.items || []).filter(c => c.selected !== false);
      const perCalendar = await Promise.all(calendars.map(cal =>
        Api.listEvents(cal.id, gridStart, gridEnd)
          .then(res => (res.items || []).map(ev => ({
            ...ev,
            _calendarId: cal.id,
            _calendarColor: cal.backgroundColor || '#94a3b8',
            _calendarName: cal.summaryOverride || cal.summary || cal.id,
          })))
          .catch(() => []) // un calendario individual fallando no debe tumbar toda la vista
      ));
      events = perCalendar.flat();
    } catch (err) {
      el.grid.innerHTML = `<p class="board-loading">Error al cargar eventos: ${err.message}</p>`;
      return;
    }
    render(gridStart);
  }

  function eventsForDay(dateStr) {
    return events.filter(ev => {
      const start = ev.start.date || ev.start.dateTime.slice(0, 10);
      const end = ev.end.date || ev.end.dateTime.slice(0, 10);
      // 'end.date' en eventos de día completo es exclusivo.
      const endAdj = ev.start.date ? addDaysStr(end, -1) : end;
      return dateStr >= start && dateStr <= endAdj;
    }).sort((a, b) => {
      const ta = a.start.dateTime || a.start.date;
      const tb = b.start.dateTime || b.start.date;
      return ta.localeCompare(tb);
    });
  }

  function addDaysStr(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return fmtDate(dt);
  }

  function render(gridStart) {
    el.grid.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'cal-row cal-head';
    for (const wd of WEEKDAYS) {
      const c = document.createElement('div');
      c.className = 'cal-head-cell';
      c.textContent = wd;
      head.appendChild(c);
    }
    el.grid.appendChild(head);

    const today = todayStr();
    const body = document.createElement('div');
    body.className = 'cal-body';

    for (let w = 0; w < 6; w++) {
      const row = document.createElement('div');
      row.className = 'cal-row';
      for (let d = 0; d < 7; d++) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + w * 7 + d);
        const dateStr = fmtDate(date);
        const inMonth = date.getMonth() === cursor.getMonth();
        const dayEvents = eventsForDay(dateStr);

        const cell = document.createElement('div');
        cell.className = `cal-cell ${inMonth ? '' : 'cal-cell-muted'} ${dateStr === today ? 'cal-cell-today' : ''}`;
        cell.dataset.date = dateStr;

        const dayNum = document.createElement('div');
        dayNum.className = 'cal-day-num';
        dayNum.textContent = date.getDate();
        cell.appendChild(dayNum);

        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'cal-chips';
        const visible = dayEvents.slice(0, 3);
        for (const ev of visible) {
          const chip = document.createElement('div');
          chip.className = 'cal-chip';
          chip.style.background = ev._calendarColor;
          chip.title = ev._calendarName || '';
          chip.textContent = ev.summary || '(Sin título)';
          chip.addEventListener('click', (e) => { e.stopPropagation(); openEventModal({ mode: 'edit', event: ev }); });
          chipsWrap.appendChild(chip);
        }
        if (dayEvents.length > visible.length) {
          const more = document.createElement('div');
          more.className = 'cal-chip cal-chip-more';
          more.textContent = `+${dayEvents.length - visible.length} más`;
          chipsWrap.appendChild(more);
        }
        cell.appendChild(chipsWrap);

        cell.addEventListener('click', () => openDayModal(dateStr));
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
    el.grid.appendChild(body);
  }

  // ---------- Modal de día ----------

  function openDayModal(dateStr) {
    const [y, m, d] = dateStr.split('-');
    el.dayModalTitle.textContent = `${d}/${m}/${y}`;
    el.dayModal.dataset.date = dateStr;
    el.dayAgendaList.innerHTML = '';

    const dayEvents = eventsForDay(dateStr);
    if (dayEvents.length === 0) {
      el.dayAgendaList.innerHTML = '<p class="board-loading">Sin eventos este día.</p>';
    }
    for (const ev of dayEvents) {
      const item = document.createElement('div');
      item.className = 'agenda-item';
      const time = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Todo el día';
      item.innerHTML = `
        <span class="agenda-cal-dot" style="background:${ev._calendarColor}" title="${escapeHtml(ev._calendarName || '')}"></span>
        <span class="agenda-time">${time}</span>
        <span class="agenda-title">${escapeHtml(ev.summary || '(Sin título)')}</span>
      `;
      item.addEventListener('click', () => { el.dayModal.close(); openEventModal({ mode: 'edit', event: ev }); });
      el.dayAgendaList.appendChild(item);
    }
    el.dayModal.showModal();
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------- Modal de evento ----------

  function updateTimeFieldsVisibility() {
    const allDay = el.eventAllDay.checked;
    el.eventStartTimeWrap.style.display = allDay ? 'none' : '';
    el.eventEndTimeWrap.style.display = allDay ? 'none' : '';
  }

  function openEventModal({ mode, dateStr, event }) {
    editingEventId = mode === 'edit' ? event.id : null;
    editingCalendarId = mode === 'edit' ? event._calendarId : null;
    el.eventModalTitle.textContent = mode === 'edit' ? 'Editar evento' : 'Nuevo evento';
    el.eventDeleteBtn.hidden = mode !== 'edit';

    if (mode === 'edit') {
      el.eventTitle.value = event.summary || '';
      el.eventDescription.value = event.description || '';
      const allDay = !!event.start.date;
      el.eventAllDay.checked = allDay;
      if (allDay) {
        el.eventStartDate.value = event.start.date;
        el.eventEndDate.value = addDaysStr(event.end.date, -1);
        el.eventStartTime.value = '';
        el.eventEndTime.value = '';
      } else {
        const s = new Date(event.start.dateTime);
        const en = new Date(event.end.dateTime);
        el.eventStartDate.value = fmtDate(s);
        el.eventStartTime.value = s.toTimeString().slice(0, 5);
        el.eventEndDate.value = fmtDate(en);
        el.eventEndTime.value = en.toTimeString().slice(0, 5);
      }
    } else {
      el.eventTitle.value = '';
      el.eventDescription.value = '';
      el.eventAllDay.checked = false;
      el.eventStartDate.value = dateStr || todayStr();
      el.eventEndDate.value = dateStr || todayStr();
      el.eventStartTime.value = '09:00';
      el.eventEndTime.value = '10:00';
    }
    updateTimeFieldsVisibility();
    el.eventModal.showModal();
  }

  async function onSaveEvent(e) {
    e.preventDefault();
    const summary = el.eventTitle.value.trim();
    if (!summary) return;

    const body = {
      summary,
      description: el.eventDescription.value.trim() || undefined,
    };

    if (el.eventAllDay.checked) {
      body.start = { date: el.eventStartDate.value };
      body.end = { date: addDaysStr(el.eventEndDate.value, 1) };
    } else {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      body.start = { dateTime: `${el.eventStartDate.value}T${el.eventStartTime.value || '00:00'}:00`, timeZone: tz };
      body.end = { dateTime: `${el.eventEndDate.value}T${el.eventEndTime.value || '00:00'}:00`, timeZone: tz };
    }

    try {
      if (editingEventId) {
        await Api.patchEvent(editingCalendarId || CONFIG.CALENDAR_ID, editingEventId, body);
      } else {
        await Api.insertEvent(CONFIG.CALENDAR_ID, body);
      }
      el.eventModal.close();
      await refresh();
    } catch (err) {
      Toast.show('Error al guardar el evento: ' + err.message, 'error');
    }
  }

  async function onDeleteEvent() {
    if (!editingEventId) return;
    if (!confirm('¿Eliminar este evento?')) return;
    try {
      await Api.deleteEvent(editingCalendarId || CONFIG.CALENDAR_ID, editingEventId);
      el.eventModal.close();
      await refresh();
    } catch (err) {
      Toast.show('Error al eliminar el evento: ' + err.message, 'error');
    }
  }

  return { init, refresh };
})();
