import { randomUUID } from 'node:crypto';

export const TASK_CATEGORIES = ['Work', 'Study', 'Personal', 'Health', 'Other'];
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
export const TASK_STATUSES = ['Todo', 'In progress', 'Blocked', 'Done'];
export const PROJECT_STATUSES = ['Planning', 'Active', 'Paused', 'Completed'];

const timestamp = () => new Date().toISOString();
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const toTask = (row) => row ? ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  priority: row.priority,
  status: row.status,
  dueDate: row.due_date,
  projectId: row.project_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
}) : null;
const toProject = (row) => row ? ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  color: row.color,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  taskCount: row.task_count,
  completedCount: row.completed_count,
  progress: row.task_count ? Math.round((row.completed_count / row.task_count) * 100) : 0,
}) : null;

function boundedText(value, field, max, required = false) {
  if (value === undefined) {
    if (required) throw new Error(`${field} is required.`);
    return undefined;
  }
  if (value === null) {
    if (required) throw new Error(`${field} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const clean = value.trim();
  if (required && !clean) throw new Error(`${field} is required.`);
  if (clean.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
  return clean;
}

function choice(value, allowed, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!allowed.includes(value)) throw new Error(`${field} must be one of: ${allowed.join(', ')}.`);
  return value;
}

function validateDueDate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('dueDate must use YYYY-MM-DD format.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('dueDate is not a valid calendar date.');
  return value;
}

export function createTaskService(db) {
  const taskById = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const projectById = db.prepare(`SELECT p.*, COUNT(t.id) AS task_count, COALESCE(SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END),0) AS completed_count FROM projects p LEFT JOIN tasks t ON t.project_id = p.id WHERE p.id = ? GROUP BY p.id`);

  function listTasks(filters = {}) {
    const clauses = [];
    const values = [];
    for (const [key, column, allowed] of [
      ['status', 'status', TASK_STATUSES],
      ['category', 'category', TASK_CATEGORIES],
      ['priority', 'priority', TASK_PRIORITIES],
    ]) {
      if (filters[key] && allowed.includes(filters[key])) { clauses.push(`${column} = ?`); values.push(filters[key]); }
    }
    if (filters.projectId) { clauses.push('project_id = ?'); values.push(filters.projectId); }
    if (filters.search) {
      const search = `%${String(filters.search).trim().slice(0, 120)}%`;
      clauses.push('(title LIKE ? OR description LIKE ?)'); values.push(search, search);
    }
    if (filters.dueDate) { clauses.push('due_date = ?'); values.push(filters.dueDate); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db.prepare(`SELECT * FROM tasks ${where} ORDER BY CASE status WHEN 'Blocked' THEN 0 WHEN 'In progress' THEN 1 WHEN 'Todo' THEN 2 ELSE 3 END, CASE priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, due_date IS NULL, due_date ASC, created_at DESC`).all(...values).map(toTask);
  }

  function createTask(input) {
    const title = boundedText(input.title, 'title', 180, true);
    const description = boundedText(input.description ?? '', 'description', 2000) ?? '';
    const category = choice(input.category, TASK_CATEGORIES, 'Other', 'category');
    const priority = choice(input.priority, TASK_PRIORITIES, 'Medium', 'priority');
    const status = choice(input.status, TASK_STATUSES, 'Todo', 'status');
    const dueDate = validateDueDate(input.dueDate) ?? null;
    const projectId = input.projectId || null;
    if (projectId && !projectById.get(projectId)) throw new Error('Project not found.');
    const now = timestamp();
    const id = randomUUID();
    db.prepare('INSERT INTO tasks(id,title,description,category,priority,status,due_date,project_id,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, title, description, category, priority, status, dueDate, projectId, now, now, status === 'Done' ? now : null);
    return toTask(taskById.get(id));
  }

  function updateTask(id, input) {
    const current = taskById.get(id);
    if (!current) return null;
    const next = {
      title: input.title === undefined ? current.title : boundedText(input.title, 'title', 180, true),
      description: input.description === undefined ? current.description : (boundedText(input.description, 'description', 2000) ?? ''),
      category: choice(input.category, TASK_CATEGORIES, current.category, 'category'),
      priority: choice(input.priority, TASK_PRIORITIES, current.priority, 'priority'),
      status: choice(input.status, TASK_STATUSES, current.status, 'status'),
      dueDate: validateDueDate(input.dueDate) ?? (input.dueDate === null || input.dueDate === '' ? null : current.due_date),
      projectId: input.projectId === undefined ? current.project_id : (input.projectId || null),
    };
    if (next.projectId && !projectById.get(next.projectId)) throw new Error('Project not found.');
    const now = timestamp();
    const completedAt = next.status === 'Done' ? (current.completed_at || now) : null;
    db.prepare('UPDATE tasks SET title=?,description=?,category=?,priority=?,status=?,due_date=?,project_id=?,updated_at=?,completed_at=? WHERE id=?')
      .run(next.title, next.description, next.category, next.priority, next.status, next.dueDate, next.projectId, now, completedAt, id);
    return toTask(taskById.get(id));
  }

  function deleteTask(id) { return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0; }

  function listProjects() {
    return db.prepare(`SELECT p.*, COUNT(t.id) AS task_count, COALESCE(SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END),0) AS completed_count FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY CASE p.status WHEN 'Active' THEN 0 WHEN 'Planning' THEN 1 WHEN 'Paused' THEN 2 ELSE 3 END, p.updated_at DESC`).all().map(toProject);
  }

  function createProject(input) {
    const name = boundedText(input.name, 'name', 100, true);
    const description = boundedText(input.description ?? '', 'description', 1000) ?? '';
    const status = choice(input.status, PROJECT_STATUSES, 'Active', 'status');
    const color = choice(input.color, ['#88d8ad', '#8eb8ff', '#c8a7ff', '#ffb980', '#ff91a8'], '#88d8ad', 'color');
    const now = timestamp();
    const id = randomUUID();
    db.prepare('INSERT INTO projects(id,name,description,status,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, name, description, status, color, now, now);
    return toProject(projectById.get(id));
  }

  function updateProject(id, input) {
    const current = projectById.get(id);
    if (!current) return null;
    const name = input.name === undefined ? current.name : boundedText(input.name, 'name', 100, true);
    const description = input.description === undefined ? current.description : (boundedText(input.description, 'description', 1000) ?? '');
    const status = choice(input.status, PROJECT_STATUSES, current.status, 'status');
    const color = choice(input.color, ['#88d8ad', '#8eb8ff', '#c8a7ff', '#ffb980', '#ff91a8'], current.color, 'color');
    db.prepare('UPDATE projects SET name=?,description=?,status=?,color=?,updated_at=? WHERE id=?').run(name, description, status, color, timestamp(), id);
    return toProject(projectById.get(id));
  }

  function deleteProject(id) { return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0; }

  function getDailySummary(day = localDate()) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('day must use YYYY-MM-DD format.');
    const parsedDay = new Date(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) throw new Error('day is not a valid calendar date.');
    const tasks = listTasks();
    const active = tasks.filter((task) => task.status !== 'Done');
    const completedToday = tasks.filter((task) => task.completedAt?.slice(0, 10) === day);
    const dueToday = active.filter((task) => task.dueDate === day);
    const overdue = active.filter((task) => task.dueDate && task.dueDate < day);
    const blocked = active.filter((task) => task.status === 'Blocked');
    return {
      date: day,
      totals: { open: active.length, completedToday: completedToday.length, dueToday: dueToday.length, overdue: overdue.length, blocked: blocked.length },
      completedTasks: completedToday,
      dueTasks: dueToday,
      overdueTasks: overdue,
      blockedTasks: blocked,
      projects: listProjects(),
    };
  }

  return { listTasks, createTask, updateTask, deleteTask, listProjects, createProject, updateProject, deleteProject, getDailySummary };
}
