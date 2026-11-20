import { readFile, mkdir, writeFile } from 'node:fs/promises';

export async function loadAssets() {
  return Object.fromEntries(await Promise.all([
    ['/', 'text/html; charset=utf-8', 'index.html'],
    ['/styles.css', 'text/css; charset=utf-8', 'styles.css'],
    ['/app.js', 'text/javascript; charset=utf-8', 'app.js']
  ].map(async ([path, contentType, file]) =>
    [path, [contentType, await readFile(new URL(file, import.meta.url), 'utf8')]])));
}

if (process.argv.includes('--build')) {
  const base = new URL('./dist/', import.meta.url);
  const assets = await loadAssets();
  const server = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');
  await mkdir(new URL('server/', base), { recursive: true });
  await writeFile(new URL('server/index.js', base), `${server}\nexport default createSite(${JSON.stringify(assets)});\n`);
  console.log('Worker bundle ready.');
}
