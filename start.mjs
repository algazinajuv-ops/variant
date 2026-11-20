import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createSite } from './server.mjs';
import { loadAssets } from './build.mjs';

const port = Number(process.env.PORT || 8787);
const site = createSite(await loadAssets());
const server = createServer(async (incoming, outgoing) => {
  const controller = new AbortController();
  outgoing.once('close', () => {
    if (!outgoing.writableEnded) controller.abort();
  });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(incoming.url, origin);
    if (url.origin !== origin || incoming.headers.host !== url.host) {
      outgoing.writeHead(403);
      outgoing.end();
      return;
    }
    const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD';
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      signal: controller.signal,
      ...(hasBody && { body: Readable.toWeb(incoming), duplex: 'half' })
    });
    const response = await site.fetch(request, process.env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    if (!outgoing.writableEnded) outgoing.end();
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port}/`);
});
