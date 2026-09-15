// Tablero Kanban: una columna por lista de Google Tasks.

const Board = (() => {
  const COLLAPSE_KEY = 'gtasks_cal_collapsed_lists_v1';
  const ORDER_KEY = 'gtasks_cal_list_order_v1';
  const COLOR_KEY = 'gtasks_cal_list_colors_v1';

  const PRESET_COLORS = [
    { name: 'Azul', hex: '#5b8def' },
    { name: 'Verde', hex: '#4caf7d' },
    { name: 'Rojo', hex: '#e2645a' },
    { name: 'Naranja', hex: '#e8973f' },
  ];

  let taskLists = [];          // [{id, title}]
  let tasksByList = {};        // { listId: [task, ...] }
  let showCompleted = false;
  let dragState = null;        // { type: 'task', taskId, sourceListId } | { type: 'list', listId }
  let editingContext = null;   // { mode: 'create'|'edit', listId, parentId, task }
  let expandedIds = loadIdSet(COLLAPSE_KEY); // Set de listIds abiertos explícitamente; por defecto todo cerrado.
  let listOrder = loadOrder();               // Array de listIds en el orden elegido por el usuario.
  let listColors = loadColors();             // { listId: '#rrggbb' }

  const el = {};

  function loadIdSet(key) {
    try {
      const raw = localStorage.getItem(key);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }

  function saveExpandedIds() {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...expandedIds]));
    } catch {
      // localStorage no disponible (modo privado, cuota, etc.) — se pierde entre sesiones, no es crítico.
    }
  }

  function loadOrder() {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveOrder() {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(listOrder));
    } catch {
      // No crítico si no se puede persistir.
    }
  }

  function orderedTaskLists() {
    const byId = new Map(taskLists.map(l => [l.id, l]));
    const ordered = [];
    for (const id of listOrder) {
      if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
    }
    // Listas nuevas que aún no están en el orden guardado: al final, en el orden que dé la API.
    for (const list of taskLists) {
      if (byId.has(list.id)) ordered.push(list);
    }
    return ordered;
  }

  function reorderLists(draggedId, targetId) {
    if (draggedId === targetId) return;
    const currentOrder = orderedTaskLists().map(l => l.id);
    const from = currentOrder.indexOf(draggedId);
    if (from !== -1) currentOrder.splice(from, 1);
    const to = currentOrder.indexOf(targetId);
    if (to === -1) currentOrder.push(draggedId);
    else currentOrder.splice(to, 0, draggedId);
    listOrder = currentOrder;
    saveOrder();
  }

  function toggleList(listId) {
    if (expandedIds.has(listId)) expandedIds.delete(listId);
    else expandedIds.add(listId);
    saveExpandedIds();
    render();
  }

  function loadColors() {
    try {
      const raw = localStorage.getItem(COLOR_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveColors() {
    try {
      localStorage.setItem(COLOR_KEY, JSON.stringify(listColors));
    } catch {
      // No crítico si no se puede persistir.
    }
  }

  function setListColor(listId, color) {
    if (color) listColors[listId] = color;
    else delete listColors[listId];
    saveColors();
    render();
  }

  function closeAllColorPickers() {
    for (const opt of el.board.querySelectorAll('.col-color-options:not([hidden])')) {
      opt.hidden = true;
    }
  }

  // Recuento de vencidas/hoy de una lista completa (incluye subtareas), independiente
  // del filtro "mostrar completadas" — para que la insignia de cabecera sea siempre fiable,
  // visible aunque la lista esté cerrada.
  function listCounts(listId) {
    const tasks = tasksByList[listId] || [];
    const today = todayStr();
    let total = 0;
    let overdue = 0;
    let dueToday = 0;
    for (const t of tasks) {
      if (t.status === 'completed') continue;
      total++;
      const due = dueDateStr(t);
      if (!due) continue;
      if (due < today) overdue++;
      else if (due === today) dueToday++;
    }
    return { total, overdue, dueToday };
  }

  function cacheEls() {
    el.board = document.getElementById('board');
    el.toggleCompleted = document.getElementById('toggleCompleted');
    el.newListBtn = document.getElementById('newListBtn');
    el.taskModal = document.getElementById('taskModal');
    el.taskForm = document.getElementById('taskForm');
    el.taskModalTitle = document.getElementById('taskModalTitle');
    el.taskTitle = document.getElementById('taskTitle');
    el.taskNotes = document.getElementById('taskNotes');
    el.taskDue = document.getElementById('taskDue');
    el.taskDeleteBtn = document.getElementById('taskDeleteBtn');
    el.taskCancelBtn = document.getElementById('taskCancelBtn');
    el.listModal = document.getElementById('listModal');
    el.listForm = document.getElementById('listForm');
    el.listTitle = document.getElementById('listTitle');
    el.listCancelBtn = document.getElementById('listCancelBtn');
  }

  function init() {
    cacheEls();
    document.addEventListener('click', closeAllColorPickers);
    el.toggleCompleted.addEventListener('change', () => {
      showCompleted = el.toggleCompleted.checked;
      render();
    });
    el.newListBtn.addEventListener('click', () => {
      el.listTitle.value = '';
      el.listModal.showModal();
    });
    el.listCancelBtn.addEventListener('click', () => el.listModal.close());
    el.listForm.addEventListener('submit', onCreateList);

    el.taskCancelBtn.addEventListener('click', () => el.taskModal.close());
    el.taskForm.addEventListener('submit', onSaveTask);
    el.taskDeleteBtn.addEventListener('click', onDeleteTask);
  }

  async function refresh() {
    el.board.innerHTML = '<p class="board-loading">Cargando tareas…</p>';
    const listsRes = await Api.listTaskLists();
    taskLists = listsRes.items || [];
    tasksByList = {};
    await Promise.all(taskLists.map(async (list) => {
      const res = await Api.listTasks(list.id, { showCompleted: true, showHidden: true });
      tasksByList[list.id] = res.items || [];
    }));
    render();
  }

  // ---------- Helpers de fecha ----------

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dueDateStr(task) {
    if (!task.due) return null;
    return task.due.slice(0, 10); // 'YYYY-MM-DD' (la hora siempre viene a 00:00Z)
  }

  function highlightClass(task) {
    if (task.status === 'completed') return '';
    const due = dueDateStr(task);
    if (!due) return '';
    const today = todayStr();
    if (due < today) return 'card-overdue';
    if (due === today) return 'card-today';
    return '';
  }

  function formatDue(task) {
    const due = dueDateStr(task);
    if (!due) return '';
    const [y, m, d] = due.split('-');
    return `${d}/${m}/${y}`;
  }

  // ---------- Construcción del árbol de subtareas ----------

  function buildTree(tasks) {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const childrenOf = new Map();
    const roots = [];
    for (const t of tasks) {
      if (t.parent && byId.has(t.parent)) {
        if (!childrenOf.has(t.parent)) childrenOf.set(t.parent, []);
        childrenOf.get(t.parent).push(t);
      } else {
        roots.push(t);
      }
    }
    const byPos = (a, b) => (a.position || '').localeCompare(b.position || '');
    roots.sort(byPos);
    for (const arr of childrenOf.values()) arr.sort(byPos);
    return { roots, childrenOf };
  }

  // ---------- Render ----------

  function render() {
    el.board.innerHTML = '';
    for (const list of orderedTaskLists()) {
      el.board.appendChild(renderColumn(list));
    }
  }

  function renderColumn(list) {
    const tasks = (tasksByList[list.id] || []).filter(t => showCompleted || t.status !== 'completed' || dueDateStr(t) === todayStr());
    const { roots, childrenOf } = buildTree(tasks);

    const isExpanded = expandedIds.has(list.id);
    const color = listColors[list.id] || '';
    const counts = listCounts(list.id);

    const col = document.createElement('div');
    col.className = `board-column ${isExpanded ? '' : 'is-collapsed'} ${counts.overdue ? 'has-overdue' : counts.dueToday ? 'has-today' : ''}`;
    col.dataset.listId = list.id;
    if (color) {
      col.style.setProperty('--list-color', color);
      col.classList.add('has-color');
    }
    // El drop-target va en toda la columna (no solo en el body) para poder
    // soltar una tarjeta sobre una lista cerrada y que se mueva igualmente.
    col.addEventListener('dragover', onColumnDragOver);
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', (e) => onColumnDrop(e, list.id));

    const header = document.createElement('div');
    header.className = 'board-column-header';
    header.innerHTML = `
      <span class="col-drag-handle" draggable="true" title="Arrastrar para reordenar listas">⠿</span>
      <button type="button" class="col-toggle" aria-expanded="${isExpanded}" title="${isExpanded ? 'Cerrar lista' : 'Abrir lista'}">
        <span class="col-chevron">▸</span>
      </button>
      <h3>${escapeHtml(list.title)}</h3>
      <span class="col-badges">
        <span class="col-badge col-badge-total" title="Total de tareas pendientes">${counts.total}</span>
        ${counts.overdue ? `<span class="col-badge col-badge-overdue" title="Vencidas">${counts.overdue}</span>` : ''}
        ${counts.dueToday ? `<span class="col-badge col-badge-today" title="Para hoy">${counts.dueToday}</span>` : ''}
      </span>
      <div class="col-color-picker">
        <button type="button" class="col-color-swatch" title="Elegir color de la lista" style="${color ? `--list-color:${color}` : ''}"></button>
        <div class="col-color-options" hidden>
          ${PRESET_COLORS.map(c => `<button type="button" class="color-opt ${color === c.hex ? 'is-selected' : ''}" data-color="${c.hex}" title="${c.name}" style="background:${c.hex}"></button>`).join('')}
          <button type="button" class="color-opt color-opt-none ${!color ? 'is-selected' : ''}" data-color="" title="Sin color"></button>
        </div>
      </div>
    `;
    header.addEventListener('click', () => toggleList(list.id));

    const handle = header.querySelector('.col-drag-handle');
    handle.addEventListener('click', (e) => e.stopPropagation());
    handle.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      dragState = { type: 'list', listId: list.id };
      e.dataTransfer.effectAllowed = 'move';
      col.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => col.classList.remove('dragging'));

    const colorPicker = header.querySelector('.col-color-picker');
    const colorOptions = header.querySelector('.col-color-options');
    colorPicker.addEventListener('click', (e) => e.stopPropagation());
    header.querySelector('.col-color-swatch').addEventListener('click', () => {
      closeAllColorPickers();
      colorOptions.hidden = !colorOptions.hidden;
    });
    for (const opt of colorOptions.querySelectorAll('.color-opt')) {
      opt.addEventListener('click', () => {
        setListColor(list.id, opt.dataset.color);
        colorOptions.hidden = true;
      });
    }

    col.appendChild(header);

    if (isExpanded) {
      const body = document.createElement('div');
      body.className = 'board-column-body';
      for (const task of roots) {
        body.appendChild(renderCard(task, list.id, childrenOf, 0));
      }
      col.appendChild(body);

      const footer = document.createElement('button');
      footer.className = 'board-column-add';
      footer.type = 'button';
      footer.textContent = '+ Nueva tarea';
      footer.addEventListener('click', () => openTaskModal({ mode: 'create', listId: list.id }));
      col.appendChild(footer);
    }

    return col;
  }

  function renderCard(task, listId, childrenOf, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'task-card-wrap';
    wrap.style.marginLeft = `${depth * 16}px`;

    const card = document.createElement('div');
    card.className = `task-card ${highlightClass(task)} ${task.status === 'completed' ? 'is-completed' : ''}`;
    card.draggable = true;
    card.dataset.taskId = task.id;
    card.dataset.listId = listId;

    const due = formatDue(task);
    card.innerHTML = `
      <label class="task-check">
        <input type="checkbox" ${task.status === 'completed' ? 'checked' : ''}>
      </label>
      <div class="task-card-body">
        <div class="task-title">${escapeHtml(task.title || '(Sin título)')}</div>
        ${due ? `<div class="task-due">${due}</div>` : ''}
      </div>
      <button type="button" class="task-add-sub" title="Añadir subtarea">+</button>
    `;

    card.querySelector('.task-check input').addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.task-check input').addEventListener('change', (e) => onToggleComplete(task, listId, e.target.checked));
    card.querySelector('.task-add-sub').addEventListener('click', (e) => {
      e.stopPropagation();
      openTaskModal({ mode: 'create', listId, parentId: task.id });
    });
    card.addEventListener('click', () => openTaskModal({ mode: 'edit', listId, task }));

    card.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      dragState = { type: 'task', taskId: task.id, sourceListId: listId };
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      clearDropIndicators();
    });
    card.addEventListener('dragover', (e) => {
      if (!dragState || dragState.type !== 'task' || dragState.taskId === task.id) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = card.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      clearDropIndicators();
      card.classList.add(before ? 'drop-before' : 'drop-after');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', (e) => {
      if (!dragState || dragState.type !== 'task') return;
      e.preventDefault();
      e.stopPropagation();
      const before = card.classList.contains('drop-before');
      clearDropIndicators();
      onCardDrop(listId, task.id, task.parent || null, before);
    });

    wrap.appendChild(card);

    const children = childrenOf.get(task.id) || [];
    for (const child of children) {
      wrap.appendChild(renderCard(child, listId, childrenOf, depth + 1));
    }
    return wrap;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------- Acciones ----------

  async function onToggleComplete(task, listId, checked) {
    try {
      await Api.patchTask(listId, task.id, {
        status: checked ? 'completed' : 'needsAction',
      });
      await refresh();
    } catch (err) {
      Toast.show('Error al actualizar la tarea: ' + err.message, 'error');
    }
  }

  function openTaskModal({ mode, listId, parentId, task }) {
    editingContext = { mode, listId, parentId, task };
    el.taskModalTitle.textContent = mode === 'edit' ? 'Editar tarea' : 'Nueva tarea';
    el.taskTitle.value = task ? (task.title || '') : '';
    el.taskNotes.value = task ? (task.notes || '') : '';
    el.taskDue.value = task ? (dueDateStr(task) || '') : '';
    el.taskDeleteBtn.hidden = mode !== 'edit';
    el.taskModal.showModal();
  }

  async function onSaveTask(e) {
    e.preventDefault();
    const title = el.taskTitle.value.trim();
    const notes = el.taskNotes.value.trim();
    const due = el.taskDue.value ? `${el.taskDue.value}T00:00:00.000Z` : null;
    if (!title) return;

    try {
      if (editingContext.mode === 'create') {
        const body = { title };
        if (notes) body.notes = notes;
        if (due) body.due = due;
        await Api.insertTask(editingContext.listId, body, editingContext.parentId);
      } else {
        const { listId, task } = editingContext;
        await Api.patchTask(listId, task.id, {
          title,
          notes: notes || null,
          due: due || null,
        });
      }
      el.taskModal.close();
      await refresh();
    } catch (err) {
      Toast.show('Error al guardar la tarea: ' + err.message, 'error');
    }
  }

  async function onDeleteTask() {
    const { listId, task } = editingContext;
    if (!task) return;
    if (!confirm(`¿Eliminar "${task.title}"? Esto también eliminará sus subtareas.`)) return;
    try {
      await Api.deleteTask(listId, task.id);
      el.taskModal.close();
      await refresh();
    } catch (err) {
      Toast.show('Error al eliminar: ' + err.message, 'error');
    }
  }

  async function onCreateList(e) {
    e.preventDefault();
    const title = el.listTitle.value.trim();
    if (!title) return;
    try {
      await Api.insertTaskList(title);
      el.listModal.close();
      await refresh();
    } catch (err) {
      Toast.show('Error al crear la lista: ' + err.message, 'error');
    }
  }

  // ---------- Drag & drop ----------

  function clearDropIndicators() {
    for (const c of el.board.querySelectorAll('.task-card.drop-before, .task-card.drop-after')) {
      c.classList.remove('drop-before', 'drop-after');
    }
  }

  // Id del hermano que precede a `targetTaskId` dentro del mismo padre (null = nivel superior).
  // Devuelve undefined si `targetTaskId` ya es el primero (para pedirle a la API que lo ponga al frente).
  function siblingBeforeTarget(listId, parentId, targetTaskId) {
    const siblings = (tasksByList[listId] || [])
      .filter(t => (t.parent || null) === (parentId || null))
      .sort((a, b) => (a.position || '').localeCompare(b.position || ''));
    const idx = siblings.findIndex(t => t.id === targetTaskId);
    return idx > 0 ? siblings[idx - 1].id : undefined;
  }

  function lastTopLevelTaskId(listId) {
    const roots = (tasksByList[listId] || [])
      .filter(t => !t.parent)
      .sort((a, b) => (a.position || '').localeCompare(b.position || ''));
    return roots.length ? roots[roots.length - 1].id : undefined;
  }

  function onColumnDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  async function onColumnDrop(e, destListId) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    clearDropIndicators();
    if (!dragState) return;
    if (dragState.type === 'list') {
      const { listId } = dragState;
      dragState = null;
      reorderLists(listId, destListId);
      render();
      return;
    }
    if (dragState.type !== 'task') return;
    // Soltado en el hueco vacío de la columna (no sobre una tarjeta concreta):
    // se añade al final, como tarea de nivel superior.
    await handleDrop(destListId, null, lastTopLevelTaskId(destListId));
  }

  async function onCardDrop(destListId, targetTaskId, targetParentId, before) {
    if (!dragState || dragState.type !== 'task') return;
    if (dragState.taskId === targetTaskId) return;
    const previous = before ? siblingBeforeTarget(destListId, targetParentId, targetTaskId) : targetTaskId;
    await handleDrop(destListId, targetParentId, previous);
  }

  async function handleDrop(destListId, parentId, previousId) {
    const { taskId, sourceListId } = dragState;
    dragState = null;

    try {
      if (sourceListId === destListId) {
        await Api.moveTask(destListId, taskId, { parent: parentId || undefined, previous: previousId || undefined });
      } else {
        await moveTaskAcrossLists(taskId, sourceListId, destListId, parentId, previousId);
      }
      await refresh();
    } catch (err) {
      Toast.show('Error al mover la tarea: ' + err.message, 'error');
    }
  }

  async function moveTaskAcrossLists(taskId, sourceListId, destListId, parentId, beforeTaskId) {
    const sourceTasks = tasksByList[sourceListId] || [];
    const { childrenOf } = buildTree(sourceTasks);
    const root = sourceTasks.find(t => t.id === taskId);
    if (!root) return;

    // Recolecta el subárbol completo (tarea + descendientes) en orden padre->hijos.
    const subtree = [];
    (function collect(t) {
      subtree.push(t);
      for (const c of (childrenOf.get(t.id) || [])) collect(c);
    })(root);

    const idMap = new Map(); // id antiguo -> id nuevo
    let newRootId = null;

    for (const node of subtree) {
      const body = { title: node.title || '' };
      if (node.notes) body.notes = node.notes;
      if (node.due) body.due = node.due;
      const newParent = node.parent ? idMap.get(node.parent) : undefined;
      const created = await Api.insertTask(destListId, body, newParent);
      idMap.set(node.id, created.id);
      if (node.id === taskId) newRootId = created.id;
      if (node.status === 'completed') {
        await Api.patchTask(destListId, created.id, { status: 'completed' });
      }
    }

    if (newRootId && (parentId || beforeTaskId)) {
      await Api.moveTask(destListId, newRootId, { parent: parentId || undefined, previous: beforeTaskId || undefined });
    }

    // Borra los originales (en cualquier orden; no dependen entre sí una vez copiados).
    for (const node of subtree) {
      await Api.deleteTask(sourceListId, node.id);
    }
  }

  return { init, refresh };
})();
