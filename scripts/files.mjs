import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
export const stringify = value => JSON.stringify(value, null, 2) + '\n';
export const sorted = entries => Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));

export async function readOptional(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function json(path, schema) {
  const bytes = await readOptional(path);
  return bytes && schema.parse(JSON.parse(bytes.toString('utf8')));
}

export async function writeChanged(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(stringify(value));
  if ((await readOptional(path))?.equals(bytes)) return false;
  await mkdir(dirname(path), { recursive: true });
  const temp = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, bytes);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
  return true;
}
