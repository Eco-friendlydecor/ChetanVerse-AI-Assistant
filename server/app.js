import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

const json = (res, status, payload) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(payload === null ? '' : JSON.stringify(payload));
};

const loopbackNames = new Set(['127.0.0.1', 'localhost', '[::1]']);
function isLoopbackAuthority(value) {
  if (typeof value !== 'string' || !value) return false;
  try { return loopbackNames.has(new URL(`http://${value}`).hostname.toLowerCase()); }
  catch { return false; }
}

function isLoopbackOrigin(value) {
  if (typeof value !== 'string' || value === 'null') return false;
  try {
    const origin = new URL(value);
    return ['http:', 'https:'].includes(origin.protocol) && loopbackNames.has(origin.hostname.toLowerCase());
  } catch { return false; }
}

async function readJson(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 24 * 1024) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (!length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Request body must be valid JSON.'); }
}

export function createApp(service) {
  return async (req, res) => {
    if (!isLoopbackAuthority(req.headers.host)) return json(res, 403, { error: 'Requests must use a loopback host.' });
    if (req.headers.origin && !isLoopbackOrigin(req.headers.origin)) return json(res, 403, { error: 'Requests must come from a loopback origin.' });
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const method = req.method || 'GET';
    const route = url.pathname;
    const parts = route.split('/').filter(Boolean);
    try {
      if (method === 'GET' && route === '/api/health') return json(res, 200, { ok: true, service: 'chetanverse-local-api' });
      if (method === 'GET' && route === '/api/dashboard') {
        const tasks = service.listTasks();
        const projects = service.listProjects();
        const now = new Date();
        const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const open = tasks.filter((task) => task.status !== 'Done');
        return json(res, 200, {
          tasks: tasks.slice(0, 6), projects: projects.slice(0, 4),
          counts: {
            open: open.length,
            completed: tasks.filter((task) => task.status === 'Done').length,
            dueToday: open.filter((task) => task.dueDate === day).length,
            projects: projects.length,
          },
        });
      }
      if (method === 'GET' && route === '/api/tasks') return json(res, 200, service.listTasks({
        status: url.searchParams.get('status') || undefined,
        category: url.searchParams.get('category') || undefined,
        priority: url.searchParams.get('priority') || undefined,
        projectId: url.searchParams.get('projectId') || undefined,
        search: url.searchParams.get('search') || undefined,
        dueDate: url.searchParams.get('dueDate') || undefined,
      }));
      if (method === 'POST' && route === '/api/tasks') return json(res, 201, service.createTask(await readJson(req)));
      if (parts[0] === 'api' && parts[1] === 'tasks' && parts[2]) {
        if (method === 'PATCH') {
          const task = service.updateTask(parts[2], await readJson(req));
          return task ? json(res, 200, task) : json(res, 404, { error: 'Task not found.' });
        }
        if (method === 'DELETE') return service.deleteTask(parts[2])
          ? json(res, 204, null)
          : json(res, 404, { error: 'Task not found.' });
      }
      if (method === 'GET' && route === '/api/projects') return json(res, 200, service.listProjects());
      if (method === 'POST' && route === '/api/projects') return json(res, 201, service.createProject(await readJson(req)));
      if (parts[0] === 'api' && parts[1] === 'projects' && parts[2]) {
        if (method === 'PATCH') {
          const project = service.updateProject(parts[2], await readJson(req));
          return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found.' });
        }
        if (method === 'DELETE') return service.deleteProject(parts[2])
          ? json(res, 204, null)
          : json(res, 404, { error: 'Project not found.' });
      }
      if (method === 'GET' && route === '/api/summary/today') {
        return json(res, 200, service.getDailySummary(url.searchParams.get('date') || undefined));
      }
      if (route.startsWith('/api/')) return json(res, 404, { error: 'API route not found.' });
      if (method === 'GET' && route === '/') {
        const html = await readFile(path.join(distRoot, 'index.html'));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
        return res.end(html);
      }
      if (method === 'GET' && route.startsWith('/assets/')) {
        const assetName = decodeURIComponent(route.slice('/assets/'.length));
        if (!assetName || assetName.includes('..') || assetName.includes('/') || assetName.includes('\\')) return json(res, 400, { error: 'Invalid asset path.' });
        const assetPath = path.join(distRoot, 'assets', assetName);
        const content = await readFile(assetPath);
        res.writeHead(200, { 'content-type': mimeTypes[path.extname(assetName)] || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' });
        return res.end(content);
      }
      return json(res, 404, { error: 'Not found.' });
    } catch (error) {
      const status = error.code === 'ENOENT' ? 404 : 400;
      return json(res, status, { error: status === 404 ? 'Not found.' : (error.message || 'Request could not be completed.') });
    }
  };
}

export function createApiServer(service) { return createServer(createApp(service)); }
