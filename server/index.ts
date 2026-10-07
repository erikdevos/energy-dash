import { createServer, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { DATA_DIR, ROOT, readJson } from './cache.ts';
import { getPricesToday, getPriceYear } from './prices.ts';
import { getWeatherYear } from './pvgis.ts';
import { chargee } from './chargee.ts';

const PORT = Number(process.env.PORT ?? 5174);
const DIST = join(ROOT, 'dist');

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function num(v: string | null, fallback: number, min: number, max: number): number {
  const n = v === null ? fallback : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
};

async function serveStatic(path: string, res: ServerResponse) {
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(DIST, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Niet gevonden. Draai eerst `npm run build`, of gebruik `npm run dev`.');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const q = url.searchParams;
  try {
    switch (url.pathname) {
      case '/api/prices': {
        const year = num(q.get('year'), 2025, 2020, 2025);
        return json(res, 200, await getPriceYear(year));
      }
      case '/api/prices/today':
        return json(res, 200, { unit: 'EUR/kWh excl. BTW', prices: await getPricesToday() });
      case '/api/pv': {
        const weather = await getWeatherYear({
          lat: num(q.get('lat'), 52.09, 50.7, 53.6),
          lon: num(q.get('lon'), 5.12, 3.3, 7.3),
          angle: num(q.get('angle'), 35, 0, 90),
          orientation: q.get('orientation') ?? 'zuid',
          year: num(q.get('year'), 2023, 2005, 2023),
        });
        return json(res, 200, weather);
      }
      case '/api/live':
        return json(res, 200, await chargee.live());
      case '/api/history': {
        // res in minuten: 15 (kwartier), 60 (uur) of 1440 (dag)
        const resMin = [15, 60, 1440].includes(Number(q.get('res'))) ? Number(q.get('res')) : 60;
        return json(res, 200, await chargee.history(num(q.get('days'), 2, 1, 800), resMin));
      }
      case '/api/maanden':
        return json(res, 200, (await readJson(join(DATA_DIR, 'maanden.json'))) ?? { maanden: [] });
      case '/api/jaarnotas': {
        // Eigen nota's (data/jaarnotas.json) hebben voorrang op het voorbeeldbestand.
        const own = await readJson(join(DATA_DIR, 'jaarnotas.json'));
        const mock = await readJson(join(DATA_DIR, 'jaarnotas.mock.json'));
        return json(res, 200, own ?? mock);
      }
      default:
        if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'onbekende route' });
        return serveStatic(url.pathname, res);
    }
  } catch (err) {
    console.error(err);
    return json(res, 502, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Poort ${PORT} is al in gebruik: draait het dashboard al in een andere terminal? Stop die eerst.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`energy-dash API op http://localhost:${PORT} (Chargee: ${chargee.describe()})`);
  void chargee.startCollector().then(() => {
    console.log(chargee.collecting ? 'Meterdata wordt opgeslagen in data/p1/.' : 'Losse collector actief: dashboard leest mee.');
  });
});
