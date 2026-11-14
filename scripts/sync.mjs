import { readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { driveFromEnv } from './drive.mjs';
import { visionFromEnv } from './vision.mjs';
import { hash, json, readOptional, sorted, writeChanged } from './files.mjs';
import { optimize, preview } from './media.mjs';
import { planPublication } from './plan.mjs';
import { categoriesSchema, decisionsSchema, digest as digestSchema, fileSchema, itemSchema, manifestSchema, photoSchema } from './schema.mjs';

export async function synchronize({ root, drive, analyze, batchSize = 6, log = console.log }) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 12) throw new Error('Taille de lot autorisée : 1 à 12.');
  const cache = join(root, '.sync-cache', 'v1');
  const readContent = (name, schema) => json(join(root, 'content', name + '.json'), schema);
  const [manifest, categories, decisions, sources] = await Promise.all([
    readContent('manifest', manifestSchema),
    readContent('categories', categoriesSchema),
    readContent('decisions', decisionsSchema),
    drive.list(),
  ]);
  if (!manifest || !categories || !decisions) throw new Error('Configuration de contenu incomplète.');
  const photos = { ...manifest.photos };
  const files = new Map();
  const sourceByHash = new Map();
  const pending = new Map();
  const counters = { files: sources.length, downloads: 0, analyzed: 0, batches: 0, published: 0, writes: 0 };
  const mediaCache = id => join(cache, 'media', id + '.webp');
  const photoCache = id => join(cache, 'analysis', id + '.json');
  const publishedMedia = id => join(root, 'public', 'media', id + '.webp');

  async function download(source) {
    counters.downloads++;
    const bytes = await drive.download(source);
    if (source.md5Checksum && hash(bytes, 'md5') !== source.md5Checksum) throw new Error('Une photo a changé pendant son téléchargement.');
    return bytes;
  }

  async function flush() {
    if (!pending.size) return;
    const batch = [...pending.entries()];
    const input = await Promise.all(batch.map(async ([id, photo]) => ({ id, preview: await preview(photo.data) })));
    const observations = await analyze(input, categories);
    const results = batch.map(([id, photo]) => [id, photoSchema.parse({ visual: photo.visual, analysis: observations[id] })]);
    for (const [id, result] of results) {
      await writeChanged(photoCache(id), result);
      photos[id] = result;
    }
    counters.batches++;
    counters.analyzed += batch.length;
    log('Lot analysé', { images: batch.length, total: counters.analyzed });
    pending.clear();
  }

  for (const source of sources.sort((a, b) => a.id.localeCompare(b.id))) {
    const id = hash(source.id);
    const checksum = source.sha256Checksum && digestSchema.parse(source.sha256Checksum);
    const version = checksum ? 'sha256:' + checksum : source.md5Checksum ? 'md5:' + source.md5Checksum : 'v:' + source.version;
    if (!checksum && !source.md5Checksum && !source.version) throw new Error('Version Drive absente.');
    const checkpoint = join(cache, 'files', id, hash(version) + '.json');
    let entry = manifest.files[id]?.version === version ? manifest.files[id] : await json(checkpoint, fileSchema);
    let bytes;
    if (!entry && checksum) {
      entry = { version, hash: checksum };
    } else if (!entry) {
      bytes = await download(source);
      entry = { version, hash: hash(bytes) };
    }
    const digest = entry.hash;
    files.set(id, entry);
    sourceByHash.set(digest, source);
    if (!photos[digest] && !pending.has(digest)) {
      const cached = await json(photoCache(digest), photoSchema);
      if (cached) photos[digest] = cached;
      else {
        bytes ??= await download(source);
        if (hash(bytes) !== digest) throw new Error('Photo modifiée pendant son traitement.');
        const photo = await optimize(bytes);
        await writeChanged(mediaCache(digest), photo.data);
        pending.set(digest, photo);
      }
    }
    if (entry !== manifest.files[id]) await writeChanged(checkpoint, entry);
    if (pending.size >= batchSize) await flush();
  }
  await flush();

  const plan = planPublication([...sourceByHash.keys()], photos, decisions, categories);
  const activePhotos = new Set(sourceByHash.keys());
  await writeChanged(join(cache, 'review.json'), {
    drafts: plan.drafts,
    rejected: plan.rejected,
    suggestions: plan.suggestions,
    inactivePublications: Object.keys(decisions.publish).filter(id => !plan.published.some(group => group.id === id)),
    activePhotos: [...activePhotos].sort(),
  });

  // Stage the complete output in memory before modifying tracked files.
  const wantedMedia = new Map();
  const items = new Map();
  for (const group of plan.published) {
    const images = [];
    for (const id of group.members) {
      const existing = await readOptional(publishedMedia(id));
      let data = existing ?? await readOptional(mediaCache(id));
      if (!data) {
        const bytes = await download(sourceByHash.get(id));
        if (hash(bytes) !== id) throw new Error('Empreinte Drive modifiée avant publication.');
        data = (await optimize(bytes)).data;
        await writeChanged(mediaCache(id), data);
      }
      const { width, height } = await sharp(data).metadata();
      wantedMedia.set(id + '.webp', existing ? undefined : data);
      images.push({ src: '/media/' + id + '.webp', width, height, alt: photos[id].analysis.alt });
    }
    const item = itemSchema.parse({
      id: 'm-' + group.id,
      kind: group.kind,
      category: group.analysis.category,
      translations: group.analysis.translations,
      images,
    });
    items.set(item.id + '.json', item);
  }

  const itemsDir = join(root, 'content', 'items');
  const mediaDir = join(root, 'public', 'media');
  for (const [file, data] of wantedMedia) {
    if (data && await writeChanged(join(mediaDir, file), data)) counters.writes++;
  }
  for (const [file, item] of items) {
    if (await writeChanged(join(itemsDir, file), item)) counters.writes++;
  }
  for (const [dir, pattern, wanted] of [[itemsDir, /^m-[a-f0-9]{64}\.json$/, items], [mediaDir, /^[a-f0-9]{64}\.webp$/, wantedMedia]]) {
    for (const file of await readdir(dir)) {
      if (pattern.test(file) && !wanted.has(file)) {
        await rm(join(dir, file));
        counters.writes++;
      }
    }
  }
  const updated = { version: 1, files: sorted(files), photos: sorted(Object.entries(photos)) };
  if (await writeChanged(join(root, 'content', 'manifest.json'), updated)) counters.writes++;
  counters.published = items.size;
  log('Synchronisation terminée', counters);
  return counters;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await synchronize({
      root: process.cwd(),
      drive: driveFromEnv(process.env),
      analyze: visionFromEnv(process.env),
      batchSize: Number(process.env.SYNC_BATCH_SIZE || 6),
    });
  } catch (error) {
    // Do not print request objects containing credentials.
    console.error(error.response ? 'Erreur API Drive HTTP ' + error.response.status : error.message);
    process.exitCode = 1;
  }
}
