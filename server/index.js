import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiServer } from './app.js';
import { createDatabase } from './database.js';
import { createTaskService } from './service.js';
import { parsePort } from './config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let port;
try { port = parsePort(process.env.PORT); }
catch (error) {
  console.error(error.message);
  process.exit(1);
}
const db = createDatabase(process.env.DATABASE_PATH || path.join(root, 'data', 'chetanverse.sqlite'));
const server = createApiServer(createTaskService(db));
server.on('error', (error) => {
  console.error(`Chetanverse API could not start: ${error.message}`);
  db.close();
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Chetanverse API running at http://127.0.0.1:${port}`);
});

function stop() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
