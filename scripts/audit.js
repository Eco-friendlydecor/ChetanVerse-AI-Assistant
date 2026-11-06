import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../server/database.js';
import { createTaskService } from '../server/service.js';
import { createMcpProtocol, parseMcpLine } from '../server/mcp.js';
import { parsePort } from '../server/config.js';

async function runMcpAudit() {
  const db = createDatabase(':memory:');
  const protocol = createMcpProtocol(createTaskService(db));
  let id = 0;
  const request = (method, params = {}) => protocol.handle({ jsonrpc: '2.0', id: ++id, method, params });
  const invoke = (name, args) => {
    const reply = request('tools/call', { name, arguments: args });
    assert.ok(!reply.error, `${name} should return a tool result`);
    assert.equal(reply.result.isError, undefined, `${name} should not return a tool error: ${reply.result.content[0].text}`);
    return JSON.parse(reply.result.content[0].text);
  };
  try {
    const init = request('initialize', { protocolVersion: '2025-11-25' });
    assert.equal(init.result.serverInfo.name, 'chetanverse-productivity');
    assert.deepEqual(parseMcpLine('{malformed json', protocol), {
      jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' },
    }, 'MCP returns a parse error for malformed input lines');
    const listedTools = request('tools/list').result.tools.map((tool) => tool.name);
    assert.deepEqual(listedTools, ['list_tasks', 'create_task', 'update_task', 'list_projects', 'create_project', 'update_project', 'get_daily_summary']);
    const unexpectedArgument = request('tools/call', { name: 'list_tasks', arguments: { toString: 'unexpected' } });
    assert.equal(unexpectedArgument.result.isError, true, 'MCP rejects inherited object keys as unknown arguments');
    assert.match(unexpectedArgument.result.content[0].text, /Unknown argument: toString/);
    const project = invoke('create_project', { name: 'MCP contract', description: 'Project CRUD', status: 'Planning' });
    assert.equal(project.completedCount, 0);
    assert.equal(invoke('update_project', { id: project.id, name: 'MCP contract updated', status: 'Active' }).name, 'MCP contract updated');
    const today = new Date().toISOString().slice(0, 10);
    const task = invoke('create_task', { title: 'MCP task', category: 'Study', priority: 'High', dueDate: today, projectId: project.id });
    assert.equal(invoke('list_tasks', { search: 'MCP task' }).length, 1);
    assert.equal(invoke('update_task', { id: task.id, status: 'Done', title: 'MCP task completed' }).status, 'Done');
    assert.equal(invoke('list_projects', {})[0].progress, 100);
    const summary = invoke('get_daily_summary', { date: today });
    assert.equal(summary.totals.completedToday, 1);
    assert.equal(summary.totals.dueToday, 0);
    console.log('PASS: MCP initialize, tools/list, and every advertised task/project/summary tool call.');
  } finally {
    db.close();
  }
}

function runConfigAudit() {
  assert.equal(parsePort(undefined), 8787);
  assert.equal(parsePort('5174'), 5174);
  for (const value of ['invalid', '0', '65536', '1.5']) {
    assert.throws(() => parsePort(value), /PORT must be an integer between 1 and 65535/);
  }
  console.log('PASS: PORT defaults and input bounds are validated.');
}

async function runPersistenceAudit() {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'chetanverse-audit-'));
  const dbPath = path.join(folder, 'persistence.sqlite');
  let db;
  try {
    db = createDatabase(dbPath);
    let service = createTaskService(db);
    const project = service.createProject({ name: 'Restart audit project' });
    assert.equal(project.completedCount, 0);
    const task = service.createTask({ title: 'Restart audit task', projectId: project.id });
    service.updateTask(task.id, { status: 'Done' });
    db.close();
    db = createDatabase(dbPath);
    service = createTaskService(db);
    assert.equal(service.listTasks()[0].title, 'Restart audit task');
    assert.equal(service.listProjects()[0].taskCount, 1);
    assert.equal(service.listProjects()[0].progress, 100);
    console.log('PASS: file-backed SQLite task/project data survives closing and reopening the database.');
  } finally {
    db?.close();
    await rm(folder, { recursive: true, force: true });
  }
}

await runMcpAudit();
runConfigAudit();
await runPersistenceAudit();
