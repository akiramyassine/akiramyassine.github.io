import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { hash, writeChanged } from '../scripts/files.mjs';
import { planPublication } from '../scripts/plan.mjs';
import { synchronize } from '../scripts/sync.mjs';
import { validate } from '../scripts/validate.mjs';

const categories = { canapes: { fr: 'Canapés', ar: 'الأرائك', en: 'Sofas' } };
const alt = { fr: 'Photo de test', ar: 'صورة اختبار', en: 'Test photo' };
const translations = Object.fromEntries(Object.entries(alt).map(([lang, title]) => [lang, {
  title, description: title, details: [],
}]));
const observation = { category: 'canapes', translations, alt };

async function fixture(t, parent = tmpdir()) {
  const root = await mkdtemp(join(parent, 'akiram-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = name => join(root, 'content', name + '.json');
  await mkdir(join(root, 'content', 'items'), { recursive: true });
  await mkdir(join(root, 'public', 'media'), { recursive: true });
  for (const name of ['business', 'fr', 'ar', 'en']) {
    await writeChanged(paths(name), JSON.parse(await readFile(new URL('../content/' + name + '.json', import.meta.url), 'utf8')));
  }
  const decide = (groups = {}, publish = {}) => writeChanged(paths('decisions'), { groups, publish });
  await writeChanged(paths('categories'), categories);
  await writeChanged(paths('manifest'), { version: 1, photos: {}, files: {} });
  await decide();
  const sources = new Map();
  const add = async (id, background, checksum = false) => {
    const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background } }).png().toBuffer();
    sources.set(id, { id, bytes, md5Checksum: hash(bytes, 'md5'), sha256Checksum: checksum ? hash(bytes) : undefined });
    return hash(bytes);
  };
  const requests = [];
  let failAt;
  const sync = () => synchronize({
    root,
    drive: { list: async () => [...sources.values()], download: async file => file.bytes },
    analyze: async photos => {
      requests.push(photos.map(photo => photo.id));
      if (requests.length === failAt) throw new Error('Panne simulée');
      return Object.fromEntries(photos.map(({ id }) => [id, observation]));
    },
    batchSize: 1,
    log() {},
  });
  return { root, add, decide, sync, requests, sources, failOn: value => { failAt = value; } };
}

test('doublons exacts, approbation portfolio, regroupement, retrait et relance sans modification', async t => {
  const f = await fixture(t);
  const first = await f.add('a', 'red');
  assert.equal(await f.add('b', 'red'), first);
  const second = await f.add('c', 'blue');
  const initial = await f.sync();
  assert.equal(initial.analyzed, 2);
  assert.equal(initial.batches, 2);
  assert.equal(initial.published, 0);
  const again = await f.sync();
  assert.equal(again.downloads, 0);
  assert.equal(again.analyzed, 0);
  assert.equal(again.writes, 0);
  await f.add('drive-sha256', 'red', true);
  const knownChecksum = await f.sync();
  assert.equal(knownChecksum.downloads, 0);
  assert.equal(knownChecksum.analyzed, 0);

  await f.decide({ [second]: first }, { [first]: 'portfolio' });
  const publication = await f.sync();
  assert.equal(publication.published, 1);
  assert.equal(publication.analyzed, 0);
  await validate(f.root);
  const itemPath = join(f.root, 'content', 'items', 'm-' + first + '.json');
  const item = JSON.parse(await readFile(itemPath, 'utf8'));
  assert.equal(item.kind, 'portfolio');
  assert.equal(item.images.length, 2);
  assert.equal(item.images[0].src, '/media/' + first + '.webp');

  f.sources.delete('c');
  assert.equal((await f.sync()).analyzed, 0);
  await validate(f.root);
  assert.deepEqual(await readdir(join(f.root, 'public', 'media')), [first + '.webp']);
  assert.equal((await f.sync()).writes, 0);

  // Re-upload after deletion, and after the runner cache has been evicted.
  await rm(join(f.root, '.sync-cache'), { recursive: true });
  await f.add('new-id', 'blue');
  assert.equal((await f.sync()).analyzed, 0);
  await validate(f.root);
});

test('reprend un lot après une panne sans rappeler l’IA pour le lot terminé', async t => {
  const f = await fixture(t);
  const first = await f.add('a', 'red');
  const second = await f.add('b', 'blue');
  f.failOn(2);
  await assert.rejects(f.sync(), /Panne simulée/);
  assert.deepEqual(await readdir(join(f.root, 'content', 'items')), []);
  await f.sync();
  assert.deepEqual(f.requests, [[first], [second], [second]]);
});

test('signale les rapprochements visuels sans fusionner les fiches', () => {
  const first = 'a'.repeat(64);
  const second = 'b'.repeat(64);
  const photos = {
    [first]: { visual: '0000000000000000', analysis: observation },
    [second]: { visual: '0000000000000001', analysis: observation },
  };
  const plan = planPublication([first, second], photos, { publish: {}, groups: {} }, categories);
  assert.equal(plan.drafts.length, 2);
  assert.deepEqual(plan.suggestions[0], { id: first, matches: [{ other: second, distance: 1 }] });
  assert.throws(() => planPublication([first, second], photos, {
    publish: {}, groups: { [first]: second, [second]: first },
  }, categories), /référence/);
});

test('compile les catégories dynamiques et les deux types de fiches avec leurs trois variantes', async t => {
  // The temporary project inherits the installed dependencies from the workspace.
  const cache = resolve('.sync-cache');
  await mkdir(cache, { recursive: true });
  const f = await fixture(t, cache);
  for (const name of ['astro.config.mjs', 'src', 'tsconfig.json', 'package.json']) {
    await cp(resolve(name), join(f.root, name), { recursive: true });
  }
  await writeChanged(join(f.root, 'content/categories.json'), {
    ...categories, autre: { fr: 'Autre', ar: 'أخرى', en: 'Other' },
  });
  const first = await f.add('a', 'red', true);
  const second = await f.add('b', 'green', true);
  await f.sync();
  await f.decide({}, { [first]: 'catalogue', [second]: 'portfolio' });
  await f.sync();
  await validate(f.root);

  const astro = resolve('node_modules/astro');
  const { bin } = JSON.parse(await readFile(join(astro, 'package.json'), 'utf8'));
  execFileSync(process.execPath, [join(astro, bin.astro ?? bin), 'build'], { cwd: f.root });
  for (const [lang, prefix] of [['fr', ''], ['en', 'en'], ['ar', 'ar']]) {
    const dist = join(f.root, 'dist', prefix);
    for (const [directory, id] of [['catalogue', first], ['realisations', second]]) {
      const page = await readFile(join(dist, directory, 'm-' + id, 'index.html'), 'utf8');
      assert.ok(page.includes('lang="' + lang + '" dir="' + (lang === 'ar' ? 'rtl' : 'ltr') + '"'));
      assert.ok(page.includes('/media/' + id + '.webp'));
      assert.ok(page.includes('wa.me/212620069078?text='));
      assert.ok(page.includes('hreflang="ar"'));
      assert.ok(page.includes(alt[lang]));
    }
    const filter = await readFile(join(dist, 'catalogue/categorie/canapes/index.html'), 'utf8');
    assert.ok(filter.includes('/media/' + first + '.webp'));
    assert.ok(!filter.includes('/media/' + second + '.webp'));
    await readFile(join(dist, 'catalogue/categorie/autre/index.html'));
  }
});
