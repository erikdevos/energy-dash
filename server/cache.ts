import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(ROOT, 'data');
export const CACHE_DIR = join(DATA_DIR, 'cache');

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

/** Haalt een waarde uit de schijfcache, of berekent en bewaart hem. */
export async function cached<T>(name: string, produce: () => Promise<T>): Promise<T> {
  const path = join(CACHE_DIR, name);
  const hit = await readJson<T>(path);
  if (hit !== null) return hit;
  const value = await produce();
  await writeJson(path, value);
  return value;
}
