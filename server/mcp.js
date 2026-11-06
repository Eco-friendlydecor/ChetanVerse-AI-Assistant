import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabase } from './database.js';
import { createTaskService, PROJECT_STATUSES, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from './service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (description, type = 'string', extra = {}) => ({ type, description, ...extra });
const enumField = (description, values) => read(description, 'string', { enum: values });
const taskProperties = {
  title: read('Concise task name', 'string', { minLength: 1, maxLength: 180 }),
  description: read('Additional context', 'string', { maxLength: 2000 }),
  category: enumField('Inferred task category', TASK_CATEGORIES),
  priority: enumField('Inferred urgency', TASK_PRIORITIES),
  status: enumField('Task status', TASK_STATUSES),
  dueDate: read('Optional due date in YYYY-MM-DD format', ['string', 'null'], { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  projectId: read('Optional ID of a saved project', ['string', 'null']),
};

const tools = [
  { name: 'list_tasks', description: 'Read real saved tasks. Filter by status, category, priority, project, or search text.', inputSchema: { type: 'object', properties: {
    status: enumField('Filter by task status', TASK_STATUSES), category: enumField('Filter by category', TASK_CATEGORIES), priority: enumField('Filter by priority', TASK_PRIORITIES), projectId: read('Filter by project ID'), search: read('Search task titles and notes', 'string', { maxLength: 120 }),
  } } },
  { name: 'create_task', description: 'Create a task in the local Chetanverse database. Infer title, category, and priority from the user request; use the project if one is named. Categories: Work, Study, Personal, Health, Other. Priorities: Low, Medium, High, Urgent.', inputSchema: { type: 'object', properties: taskProperties, required: ['title'] } },
  { name: 'update_task', description: 'Update a saved task, including status to track progress. Statuses: Todo, In progress, Blocked, Done.', inputSchema: { type: 'object', properties: { id: read('Task ID', 'string', { minLength: 1 }), ...taskProperties }, required: ['id'] } },
  { name: 'list_projects', description: 'List saved projects and progress calculated from linked completed tasks.', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_project', description: 'Create a project in the local Chetanverse database.', inputSchema: { type: 'object', properties: {
    name: read('Project name', 'string', { minLength: 1, maxLength: 100 }),
    description: read('Project description', 'string', { maxLength: 1000 }),
    status: enumField('Project status', PROJECT_STATUSES),
  }, required: ['name'] } },
  { name: 'update_project', description: 'Update a saved project. Progress is calculated from its linked tasks.', inputSchema: { type: 'object', properties: {
    id: read('Project ID', 'string', { minLength: 1 }),
    name: read('Project name', 'string', { minLength: 1, maxLength: 100 }),
    description: read('Project description', 'string', { maxLength: 1000 }),
    status: enumField('Project status', PROJECT_STATUSES),
  }, required: ['id'] } },
  { name: 'get_daily_summary', description: 'Summarize actual saved tasks due today, overdue, blocked, completed today, and project progress.', inputSchema: { type: 'object', properties: { date: read('Optional date in YYYY-MM-DD format', 'string', { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }) } } },
];

const protocolVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
function response(id, result) { return { jsonrpc: '2.0', id, result }; }
function protocolError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function toolResult(value, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) };
}

function validateArguments(name, args) {
  const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const allowed = new Set(tools.find((tool) => tool.name === name)?.inputSchema.required || []);
  const properties = tools.find((tool) => tool.name === name)?.inputSchema.properties || {};
  for (const required of allowed) if (typeof input[required] !== 'string' || !input[required].trim()) throw new Error(`${required} is required.`);
  for (const key of Object.keys(input)) if (!Object.hasOwn(properties, key)) throw new Error(`Unknown argument: ${key}.`);
  if (input.status) {
    const allowedStatuses = name.endsWith('project') ? PROJECT_STATUSES : TASK_STATUSES;
    if (!allowedStatuses.includes(input.status)) throw new Error(`status must be one of: ${allowedStatuses.join(', ')}.`);
  }
  if (input.category && !TASK_CATEGORIES.includes(input.category)) throw new Error(`category must be one of: ${TASK_CATEGORIES.join(', ')}.`);
  if (input.priority && !TASK_PRIORITIES.includes(input.priority)) throw new Error(`priority must be one of: ${TASK_PRIORITIES.join(', ')}.`);
  if (input.dueDate !== undefined && input.dueDate !== null && (typeof input.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate))) throw new Error('dueDate must use YYYY-MM-DD format.');
  if (input.date !== undefined && (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date))) throw new Error('date must use YYYY-MM-DD format.');
  for (const key of ['title', 'name', 'description']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`${key} must be text.`);
  }
  return input;
}

function callTool(name, rawArgs, service) {
  const args = validateArguments(name, rawArgs);
  switch (name) {
    case 'list_tasks': return service.listTasks(args);
    case 'create_task': return service.createTask(args);
    case 'update_task': {
      const { id, ...updates } = args;
      return service.updateTask(id, updates) || { error: 'Task not found.' };
    }
    case 'list_projects': return service.listProjects();
    case 'create_project': return service.createProject(args);
    case 'update_project': {
      const { id, ...updates } = args;
      return service.updateProject(id, updates) || { error: 'Project not found.' };
    }
    case 'get_daily_summary': return service.getDailySummary(args.date);
    default: throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

function handle(message, service) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return message?.id === undefined ? null : protocolError(message.id, -32600, 'Invalid JSON-RPC request.');
  }
  if (message.id === undefined) return null;
  const params = message.params || {};
  switch (message.method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      const protocolVersion = protocolVersions.includes(requested) ? requested : protocolVersions[0];
      return response(message.id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'chetanverse-productivity', version: '1.0.0' } });
    }
    case 'ping': return response(message.id, {});
    case 'tools/list': return response(message.id, { tools });
    case 'tools/call': {
      try { return response(message.id, toolResult(callTool(params.name, params.arguments, service))); }
      catch (error) {
        if (error.code === -32602) return protocolError(message.id, -32602, error.message);
        return response(message.id, toolResult({ error: error.message || 'Tool call failed.' }, true));
      }
    }
    default: return protocolError(message.id, -32601, `Method not found: ${message.method}`);
  }
}

export function createMcpProtocol(service) {
  return { tools, handle: (message) => handle(message, service) };
}

export function parseMcpLine(line, protocol) {
  let message;
  try { message = JSON.parse(line); }
  catch { return protocolError(null, -32700, 'Parse error.'); }
  return protocol.handle(message);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const db = createDatabase(process.env.DATABASE_PATH || path.join(root, 'data', 'chetanverse.sqlite'));
  const protocol = createMcpProtocol(createTaskService(db));
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', (line) => {
    const result = parseMcpLine(line, protocol);
    if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
  });
  input.on('close', () => { db.close(); });
  process.on('SIGINT', () => { db.close(); process.exit(0); });
}
