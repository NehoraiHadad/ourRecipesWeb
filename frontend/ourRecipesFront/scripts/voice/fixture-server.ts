/** Local test-only reverse proxy. Large model fixtures stream without a copy. */
import { createServer, request as httpRequest } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
export async function fixtureServer(fixtureDir: string, upstreamURL: string) {
  const upstream = new URL(upstreamURL);
  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith('/fixtures/')) {
      const proxy = httpRequest(new URL(req.url || '/', upstream), { method: req.method, headers: { ...req.headers, host: upstream.host } }, response => {
        res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
      });
      proxy.on('error', () => res.writeHead(502).end()); req.pipe(proxy); return;
    }
    try {
      const filename = path.resolve(fixtureDir, decodeURIComponent(req.url.slice('/fixtures/'.length)));
      if (!filename.startsWith(path.resolve(fixtureDir) + path.sep)) { res.writeHead(403).end(); return; }
      const metadata = await stat(filename);
      res.writeHead(200, { 'Content-Length': metadata.size }); createReadStream(filename).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { server, port, url: `http://127.0.0.1:${port}` };
}
