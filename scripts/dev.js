import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import viteConfig from '../vite.config.js';
import { createApiServer } from '../server/app.js';
import { createDatabase } from '../server/database.js';
import { createTaskService } from '../server/service.js';
import { parsePort } from '../server/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
let apiPort;
try { apiPort = parsePort(process.env.PORT); }
catch (error) {
  console.error(error.message);
  process.exit(1);
}
const db = createDatabase(process.env.DATABASE_PATH || path.join(root, 'data', 'chetanverse.sqlite'));
const api = createApiServer(createTaskService(db));
const web = await createViteServer({ ...viteConfig, configFile: false, root });

await new Promise((resolve, reject) => {
  api.once('error', reject);
  api.listen(apiPort, '127.0.0.1', resolve);
});
await web.listen();
console.log('Chetanverse API: http://127.0.0.1:8787');
console.log('Chetanverse dashboard: http://127.0.0.1:5173');

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await web.close();
  await new Promise((resolve) => api.close(resolve));
  db.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
