import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createDatabase } from '../server/database.js';
import { createApiServer } from '../server/app.js';
import { createTaskService } from '../server/service.js';

const db = createDatabase(':memory:');
const service = createTaskService(db);
const server = createApiServer(service);

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true, 'health endpoint responds');
  const address = new URL(base);
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: address.hostname, port: address.port, path: '/api/health', headers: { host: 'attacker.example' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(hostileHostStatus, 403, 'requests with a non-loopback Host are rejected');
  const hostileOrigin = await fetch(`${base}/api/health`, { headers: { origin: 'https://attacker.example' } });
  assert.equal(hostileOrigin.status, 403, 'requests with a non-loopback Origin are rejected');

  const projectResponse = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ name: 'Chetanverse demo', description: 'A real task flow' }),
  });
  assert.equal(projectResponse.status, 201);
  const project = await projectResponse.json();
  assert.equal(project.completedCount, 0, 'a project without tasks starts with a numeric zero completed count');

  const projectUpdate = await fetch(`${base}/api/projects/${project.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Chetanverse demo updated', status: 'Paused', color: '#8eb8ff' }),
  });
  assert.equal(projectUpdate.status, 200);
  assert.equal((await projectUpdate.json()).name, 'Chetanverse demo updated');

  const taskResponse = await fetch(`${base}/api/tasks`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Review the demo', category: 'Work', priority: 'High', dueDate: new Date().toISOString().slice(0, 10), projectId: project.id }),
  });
  assert.equal(taskResponse.status, 201);
  const task = await taskResponse.json();
  assert.equal(task.status, 'Todo');
  const dashboardWithOpenTask = await fetch(`${base}/api/dashboard`).then((response) => response.json());
  assert.deepEqual(dashboardWithOpenTask.counts, { open: 1, completed: 0, dueToday: 1, projects: 1 }, 'dashboard statistics include a newly created due-today task and its project');
  assert.equal(dashboardWithOpenTask.tasks.some((item) => item.id === task.id), true, 'dashboard task preview includes the saved task');

  const editResponse = await fetch(`${base}/api/tasks/${task.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Review and improve the demo', description: 'Edited through the API', priority: 'Urgent', status: 'In progress' }),
  });
  assert.equal(editResponse.status, 200);
  const editedTask = await editResponse.json();
  assert.equal(editedTask.title, 'Review and improve the demo');
  assert.equal(editedTask.description, 'Edited through the API');
  assert.equal(editedTask.status, 'In progress');
  assert.equal((await fetch(`${base}/api/tasks?status=In%20progress&projectId=${project.id}`).then((response) => response.json())).some((item) => item.id === task.id), true, 'task route filters by status and project');
  assert.equal((await fetch(`${base}/api/tasks?search=Review%20and%20improve`).then((response) => response.json())).some((item) => item.id === task.id), true, 'task route searches saved titles');

  const updateResponse = await fetch(`${base}/api/tasks/${task.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'Done' }),
  });
  assert.equal(updateResponse.status, 200);
  assert.ok((await updateResponse.json()).completedAt);
  assert.equal(service.listProjects()[0].progress, 100);
  const dashboardWithCompletedTask = await fetch(`${base}/api/dashboard`).then((response) => response.json());
  assert.deepEqual(dashboardWithCompletedTask.counts, { open: 0, completed: 1, dueToday: 0, projects: 1 }, 'dashboard statistics update when a task is completed');

  const summary = await fetch(`${base}/api/summary/today`).then((response) => response.json());
  assert.equal(summary.totals.completedToday, 1);
  assert.equal(summary.totals.dueToday, 0);

  const today = new Date().toISOString().slice(0, 10);
  const yesterdayDate = new Date(`${today}T00:00:00.000Z`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  service.createTask({ title: 'Due today audit', dueDate: today });
  service.createTask({ title: 'Overdue audit', dueDate: yesterday });
  service.createTask({ title: 'Blocked audit', dueDate: yesterday, status: 'Blocked' });
  const fullSummary = service.getDailySummary(today);
  assert.deepEqual(fullSummary.totals, { open: 3, completedToday: 1, dueToday: 1, overdue: 2, blocked: 1 });

  const invalid = await fetch(`${base}/api/tasks`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '', priority: 'Immediate' }),
  });
  assert.equal(invalid.status, 400);
  const invalidDate = await fetch(`${base}/api/summary/today?date=2026-02-30`);
  assert.equal(invalidDate.status, 400, 'daily summaries reject impossible calendar dates');

  const uncompleteResponse = await fetch(`${base}/api/tasks/${task.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'In progress' }),
  });
  assert.equal((await uncompleteResponse.json()).completedAt, null, 'moving a completed task back to progress clears completion time');

  const deleteResponse = await fetch(`${base}/api/tasks/${task.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 204);
  for (const item of service.listTasks()) service.deleteTask(item.id);
  assert.equal(service.listTasks().length, 0);

  const remainingTask = service.createTask({ title: 'Project deletion relationship check', projectId: project.id });
  const deleteProject = await fetch(`${base}/api/projects/${project.id}`, { method: 'DELETE' });
  assert.equal(deleteProject.status, 204);
  assert.equal(service.listTasks()[0].projectId, null, 'deleting a project preserves tasks as unassigned');
  service.deleteTask(remainingTask.id);

  console.log('PASS: API task and project create/edit/complete/delete, validation, summary, progress, and project deletion relationship handling.');
} finally {
  await new Promise((resolve) => server.close(resolve));
  db.close();
}
