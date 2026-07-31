import * as http from 'http';
import { SessionStore } from '../state/SessionStore';

const DEFAULT_PORT = 4545;
const HOST = '127.0.0.1';

export function startIpcServer(
  store: SessionStore,
  getActiveTerminalName: () => string | undefined,
  onLog: (msg: string) => void,
  port: number = DEFAULT_PORT
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/status') {
      res.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      let payload: any;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        payload = raw.length ? JSON.parse(raw) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      if (!payload || typeof payload.terminalId !== 'string' || !payload.terminalId.length) {
        res
          .writeHead(400, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: 'Missing terminalId' }));
        return;
      }

      const session = store.upsert(payload, getActiveTerminalName());
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(session));
    });

    req.on('error', () => {
      res.writeHead(400).end(JSON.stringify({ error: 'Request stream error' }));
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      onLog(
        `AgentHUD: port ${port} already in use — IPC server not started. Another AgentHUD instance may be running, or set a different "agenthud.port".`
      );
    } else {
      onLog(`AgentHUD IPC server error: ${err.message}`);
    }
    // Do not throw/rethrow — the extension must stay usable even if the IPC server fails to bind.
  });

  server.listen(port, HOST);
  return server;
}
