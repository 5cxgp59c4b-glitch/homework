'use strict';

const STORAGE_KEY = 'task-manager-v1';

const PRIORITY_LABELS   = { high: '高', medium: '中', low: '低' };
const STATUS_LABELS     = { todo: '未着手', 'in-progress': '進行中', done: '完了' };
const RECURRENCE_LABELS = { daily: '毎日', weekly: '毎週', monthly: '毎月' };

let state = {
  tasks:        [],
  categories:   ['仕事', '個人', '学習'],
  filters:      { status: 'all', priority: 'all', category: 'all', search: '' },
  editingId:    null,
  view:         'calendar',
  calendarDate: new Date(),
};

// ---- Storage ----

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data       = JSON.parse(saved);
      state.tasks      = data.tasks      || [];
      state.categories = data.categories || ['仕事', '個人', '学習'];
    }
  } catch (e) {
    console.error('データの読み込みに失敗しました:', e);
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tasks:      state.tasks,
      categories: state.categories,
    }));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      handleStorageQuotaError();
    } else {
      console.error('データの保存に失敗しました:', e);
    }
  }
}

function handleStorageQuotaError() {
  const doneTasks = state.tasks
    .filter(t => t.status === 'done')
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const targets = doneTasks.slice(0, 20);

  if (targets.length === 0) {
    alert(
      'ストレージの容量が不足しているため、データを保存できませんでした。\n' +
      'エクスポートで現在のデータをバックアップし、不要な課題を削除してください。'
    );
    return;
  }

  const shouldDelete = confirm(
    'ストレージの容量が不足しているため、データを保存できませんでした。\n\n' +
    `完了済みの課題のうち古いものから ${targets.length} 件を削除して容量を確保しますか？\n` +
    '（削除前にエクスポートでバックアップすることをお勧めします）'
  );

  if (!shouldDelete) return;

  const targetIds = new Set(targets.map(t => t.id));
  state.tasks = state.tasks.filter(t => !targetIds.has(t.id));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tasks:      state.tasks,
      categories: state.categories,
    }));
    render();
  } catch (e2) {
    alert(
      '古い完了済み課題を削除しましたが、まだ容量が不足しています。\n' +
      'エクスポートでデータをバックアップし、手動で課題を削除してください。'
    );
  }
}

// ---- Utilities ----

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
}

function getDueStatus(dateStr) {
  if (!dateStr) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due  = new Date(dateStr + 'T00:00:00');
  const diff = (due - today) / 86400000;
  if (diff < 0)  return 'overdue';
  if (diff <= 3) return 'due-soon';
  return '';
}

function parseTags(str) {
  if (Array.isArray(str)) return str;
  return (str || '').split(',').map(t => t.trim()).filter(Boolean);
}

function calculateNextDue(dateStr, type, interval) {
  const d = new Date(dateStr + 'T00:00:00');
  const n = Number(interval) || 1;
  if (type === 'daily')   d.setDate(d.getDate() + n);
  if (type === 'weekly')  d.setDate(d.getDate() + n * 7);
  if (type === 'monthly') d.setMonth(d.getMonth() + n);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---- Task operations ----

function addTask(data) {
  const count    = data.recurring ? (Number(data.recurrenceCount) || 1) : 1;
  let currentDue = data.dueDate || null;

  for (let i = 0; i < count; i++) {
    state.tasks.unshift({
      id:                 generateId(),
      title:              data.title.trim(),
      description:        (data.description || '').trim(),
      status:             data.status             || 'todo',
      priority:           data.priority           || 'medium',
      dueDate:            currentDue,
      category:           data.category           || '',
      tags:               parseTags(data.tags),
      recurring:          data.recurring          || false,
      recurrenceType:     data.recurrenceType     || 'weekly',
      recurrenceInterval: Number(data.recurrenceInterval) || 1,
      createdAt:          new Date().toISOString(),
    });
    if (currentDue && i < count - 1) {
      currentDue = calculateNextDue(currentDue, data.recurrenceType, data.recurrenceInterval);
    }
  }
  saveData();
  render();
}

function updateTask(id, data) {
  state.tasks = state.tasks.map(t =>
    t.id !== id ? t : {
      ...t,
      title:              data.title.trim(),
      description:        (data.description || '').trim(),
      status:             data.status,
      priority:           data.priority,
      dueDate:            data.dueDate || null,
      category:           data.category || '',
      tags:               parseTags(data.tags),
      recurring:          data.recurring,
      recurrenceType:     data.recurrenceType     || 'weekly',
      recurrenceInterval: Number(data.recurrenceInterval) || 1,
    }
  );
  saveData();
  render();
}

function toggleDone(id) {
  state.tasks = state.tasks.map(t =>
    t.id !== id ? t : { ...t, status: t.status === 'done' ? 'todo' : 'done' }
  );
  saveData();
  render();
}

function deleteTask(id) {
  if (!confirm('この課題を削除しますか？')) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveData();
  render();
}

// ---- Category operations ----

function addCategory(name) {
  if (!name || state.categories.includes(name)) return false;
  state.categories.push(name);
  saveData();
  render();
  return true;
}

function deleteCategory(name) {
  if (!confirm(`カテゴリ「${name}」を削除しますか？\nこのカテゴリの課題はカテゴリなしになります。`)) return;
  state.categories = state.categories.filter(c => c !== name);
  state.tasks      = state.tasks.map(t => t.category === name ? { ...t, category: '' } : t);
  saveData();
  render();
}

// ---- Filtering ----

function getFilteredTasks() {
  const { status, priority, category, search } = state.filters;
  return state.tasks.filter(t => {
    if (status   !== 'all' && t.status   !== status)   return false;
    if (priority !== 'all' && t.priority !== priority) return false;
    if (category !== 'all' && t.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) &&
          !t.description.toLowerCase().includes(q) &&
          !t.tags.some(tag => tag.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

// ---- View ----

function setView(view) {
  state.view = view;
  document.getElementById('listViewBtn').classList.toggle('active', view === 'list');
  document.getElementById('calendarViewBtn').classList.toggle('active', view === 'calendar');
  document.getElementById('taskList').style.display        = view === 'list'     ? 'flex'  : 'none';
  document.getElementById('calendarSection').style.display = view === 'calendar' ? 'block' : 'none';
  document.getElementById('dataActions').style.display     = view === 'calendar' ? 'flex'  : 'none';
  document.querySelector('.filters').style.display         = view === 'list'     ? ''      : 'none';
  if (view === 'calendar') renderCalendar();
}

// ---- Render ----

function render() {
  renderTasks();
  renderCategoryFilter();
  renderCategoryOptions();
  renderCategoryList();
  if (state.view === 'calendar') renderCalendar();
}

function renderTasks() {
  const tasks = getFilteredTasks().sort((a, b) => {
    const aDone = a.status === 'done', bDone = b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
  const container = document.getElementById('taskList');

  if (tasks.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>課題がありません</p></div>`;
    return;
  }

  container.innerHTML = tasks.map((task, index) => {
    const dueStatus = task.dueDate ? getDueStatus(task.dueDate) : '';
    const dueLabel  = { overdue: ' 期限超過', 'due-soon': ' 間近', '': '' }[dueStatus];

    const dueDateHtml   = task.dueDate
      ? `<span class="due-date ${dueStatus}"><span aria-hidden="true">📅</span> ${formatDate(task.dueDate)}${dueLabel}</span>` : '';
    const categoryHtml  = task.category
      ? `<span class="badge badge-category">${escapeHtml(task.category)}</span>` : '';
    const tagsHtml      = task.tags.map(tag =>
      `<span class="badge badge-tag">#${escapeHtml(tag)}</span>`
    ).join('');
    const recurringHtml = task.recurring
      ? `<span class="badge badge-recurring"><span aria-hidden="true">🔄</span> ${RECURRENCE_LABELS[task.recurrenceType] || '繰り返し'}</span>` : '';

    return `
      <div class="task-item priority-${task.priority} status-${task.status}" style="animation-delay:${index * 0.04}s">
        <div class="task-priority-band"></div>
        <input type="checkbox" class="task-check" ${task.status === 'done' ? 'checked' : ''}
          onchange="toggleDone('${task.id}')">
        <div class="task-content">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
          <div class="task-meta">
            <span class="badge badge-priority-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>
            <span class="badge badge-status-${task.status}">${STATUS_LABELS[task.status]}</span>
            ${categoryHtml}
            ${tagsHtml}
            ${recurringHtml}
            ${dueDateHtml}
          </div>
        </div>
        <div class="task-actions">
          <button class="icon-btn" onclick="openEditModal('${task.id}')" aria-label="編集"><span aria-hidden="true">✏️</span></button>
          <button class="icon-btn delete" onclick="deleteTask('${task.id}')" aria-label="削除"><span aria-hidden="true">🗑️</span></button>
        </div>
      </div>
    `;
  }).join('');
}

function renderCalendar() {
  const year  = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();

  document.getElementById('calendarMonthLabel').textContent = `${year}年${month + 1}月`;

  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today       = new Date();

  const taskMap = {};
  state.tasks.forEach(task => {
    if (!task.dueDate) return;
    const d = new Date(task.dueDate + 'T00:00:00');
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const key = d.getDate();
    if (!taskMap[key]) taskMap[key] = [];
    taskMap[key].push(task);
  });

  let cells = '';

  for (let i = 0; i < firstDow; i++) {
    cells += `<div class="cal-cell cal-cell-empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = today.getFullYear() === year
                 && today.getMonth()    === month
                 && today.getDate()     === day;
    const tasks     = taskMap[day] || [];
    const visible   = tasks.slice(0, 3);
    const moreCount = tasks.length - visible.length;

    const tasksHtml = visible.map(t => `
      <button class="cal-task priority-dot-${t.priority} ${t.status === 'done' ? 'cal-task-done' : ''}"
            onclick="openEditModal('${t.id}')"
            aria-label="${escapeHtml(t.title)}">${escapeHtml(t.title)}</button>
    `).join('');

    cells += `
      <div class="cal-cell ${isToday ? 'cal-cell-today' : ''}">
        <div class="cal-day-number ${isToday ? 'cal-day-today' : ''}">${day}</div>
        ${tasksHtml}
        ${moreCount > 0 ? `<div class="cal-more">+${moreCount}件</div>` : ''}
      </div>
    `;
  }

  document.getElementById('calendarGrid').innerHTML = cells;
}

function renderCategoryFilter() {
  const select  = document.getElementById('categoryFilter');
  const current = state.filters.category;
  select.innerHTML = `<option value="all">すべてのカテゴリ</option>`
    + state.categories.map(c =>
        `<option value="${escapeHtml(c)}" ${current === c ? 'selected' : ''}>${escapeHtml(c)}</option>`
      ).join('');
}

function renderCategoryOptions() {
  const select  = document.getElementById('taskCategory');
  const current = select.value;
  select.innerHTML = `<option value="">なし</option>`
    + state.categories.map(c =>
        `<option value="${escapeHtml(c)}" ${current === c ? 'selected' : ''}>${escapeHtml(c)}</option>`
      ).join('');
}

function renderCategoryList() {
  const container = document.getElementById('categoryList');
  if (!container) return;
  if (state.categories.length === 0) {
    container.innerHTML = `<p style="font-size:13px;color:#aaa;text-align:center;padding:8px 0;">カテゴリがありません</p>`;
    return;
  }
  container.innerHTML = state.categories.map(c => `
    <div class="category-item">
      <span>${escapeHtml(c)}</span>
      <button class="icon-btn delete" onclick="deleteCategory('${escapeHtml(c)}')" aria-label="${escapeHtml(c)}を削除"><span aria-hidden="true">🗑️</span></button>
    </div>
  `).join('');
}

// ---- Export / Import ----

function exportData() {
  const data = JSON.stringify({ tasks: state.tasks, categories: state.categories }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tasks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.tasks)) throw new Error();
      if (!confirm(`${data.tasks.length}件の課題をインポートします。現在のデータは上書きされます。よろしいですか？`)) return;
      state.tasks      = data.tasks;
      state.categories = Array.isArray(data.categories) ? data.categories : state.categories;
      saveData();
      render();
    } catch {
      alert('ファイルの形式が正しくありません。');
    }
  };
  reader.readAsText(file);
}

// ---- Modal helpers ----

function openAddModal() {
  state.editingId = null;
  document.getElementById('modalTitle').textContent           = '課題を追加';
  document.getElementById('submitBtn').textContent            = '追加';
  document.getElementById('taskForm').reset();
  document.getElementById('taskPriority').value               = 'medium';
  document.getElementById('taskStatus').value                 = 'todo';
  document.getElementById('taskRecurring').checked            = false;
  document.getElementById('taskRecurrenceType').value         = 'weekly';
  document.getElementById('taskRecurrenceInterval').value     = '1';
  document.getElementById('taskRecurrenceCount').value        = '1';
  document.getElementById('recurrenceOptions').classList.remove('open');
  document.querySelector('.recurring-label').style.display    = '';
  renderCategoryOptions();
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('taskTitle').focus();
}

function openEditModal(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  state.editingId = id;

  document.getElementById('modalTitle').textContent           = '課題を編集';
  document.getElementById('submitBtn').textContent            = '保存';
  document.getElementById('taskTitle').value                  = task.title;
  document.getElementById('taskDescription').value            = task.description;
  document.getElementById('taskPriority').value               = task.priority;
  document.getElementById('taskStatus').value                 = task.status;
  document.getElementById('taskDueDate').value                = task.dueDate || '';
  document.getElementById('taskTags').value                   = task.tags.join(', ');
  document.getElementById('taskRecurring').checked            = !!task.recurring;
  document.getElementById('taskRecurrenceType').value         = task.recurrenceType     || 'weekly';
  document.getElementById('taskRecurrenceInterval').value     = task.recurrenceInterval || 1;
  document.getElementById('recurrenceOptions').classList.remove('open');
  document.querySelector('.recurring-label').style.display    = 'none';
  renderCategoryOptions();
  document.getElementById('taskCategory').value = task.category || '';
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('taskTitle').focus();
}

function closeTaskModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  state.editingId = null;
}

function closeCategoryModal() {
  document.getElementById('categoryModalOverlay').classList.remove('open');
}

// ---- Event Listeners ----

document.getElementById('addTaskBtn').addEventListener('click', openAddModal);
document.getElementById('modalClose').addEventListener('click', closeTaskModal);
document.getElementById('cancelBtn').addEventListener('click', closeTaskModal);

document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeTaskModal();
});

document.getElementById('taskForm').addEventListener('submit', e => {
  e.preventDefault();
  const data = {
    title:              document.getElementById('taskTitle').value,
    description:        document.getElementById('taskDescription').value,
    priority:           document.getElementById('taskPriority').value,
    status:             document.getElementById('taskStatus').value,
    dueDate:            document.getElementById('taskDueDate').value,
    category:           document.getElementById('taskCategory').value,
    tags:               document.getElementById('taskTags').value,
    recurring:          document.getElementById('taskRecurring').checked,
    recurrenceType:     document.getElementById('taskRecurrenceType').value,
    recurrenceInterval: document.getElementById('taskRecurrenceInterval').value,
    recurrenceCount:    document.getElementById('taskRecurrenceCount').value,
  };
  if (!data.title.trim()) return;
  state.editingId ? updateTask(state.editingId, data) : addTask(data);
  closeTaskModal();
});

document.getElementById('taskRecurring').addEventListener('change', e => {
  document.getElementById('recurrenceOptions').classList.toggle('open', e.target.checked);
});

document.getElementById('searchInput').addEventListener('input', e => {
  state.filters.search = e.target.value;
  renderTasks();
  if (state.view === 'calendar') renderCalendar();
});

document.getElementById('statusFilter').addEventListener('change', e => {
  state.filters.status = e.target.value;
  renderTasks();
  if (state.view === 'calendar') renderCalendar();
});

document.getElementById('priorityFilter').addEventListener('change', e => {
  state.filters.priority = e.target.value;
  renderTasks();
  if (state.view === 'calendar') renderCalendar();
});

document.getElementById('categoryFilter').addEventListener('change', e => {
  state.filters.category = e.target.value;
  renderTasks();
  if (state.view === 'calendar') renderCalendar();
});

document.getElementById('listViewBtn').addEventListener('click', () => setView('list'));
document.getElementById('calendarViewBtn').addEventListener('click', () => setView('calendar'));

document.getElementById('calPrevBtn').addEventListener('click', () => {
  state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById('calNextBtn').addEventListener('click', () => {
  state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
  renderCalendar();
});

document.getElementById('manageCategoriesBtn').addEventListener('click', () => {
  renderCategoryList();
  document.getElementById('categoryModalOverlay').classList.add('open');
  document.getElementById('newCategoryInput').value = '';
  document.getElementById('newCategoryInput').focus();
});

document.getElementById('categoryModalClose').addEventListener('click', closeCategoryModal);

document.getElementById('categoryModalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCategoryModal();
});

document.getElementById('addCategoryBtn').addEventListener('click', () => {
  const input = document.getElementById('newCategoryInput');
  const name  = input.value.trim();
  if (!name) return;
  if (state.categories.includes(name)) {
    alert(`カテゴリ「${name}」はすでに存在します`);
    return;
  }
  addCategory(name);
  input.value = '';
  input.focus();
});

document.getElementById('newCategoryInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addCategoryBtn').click(); }
});

document.addEventListener('keydown', e => {
  const isInput = ['input', 'textarea', 'select'].includes(e.target.tagName.toLowerCase());
  if (e.key === 'Escape') { closeTaskModal(); closeCategoryModal(); }
  if (e.key === 'n' && !isInput && !e.metaKey && !e.ctrlKey) openAddModal();
});

document.getElementById('exportBtn').addEventListener('click', exportData);

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').value = '';
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', e => {
  if (e.target.files[0]) importData(e.target.files[0]);
});

// ---- Init ----
loadData();
setView('calendar');
render();
