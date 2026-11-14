import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { json } from './files.mjs';
import { planPublication } from './plan.mjs';
import { categoriesSchema, decisionsSchema, itemSchema, manifestSchema } from './schema.mjs';

const text = z.string().trim().min(1);
const https = z.string().url().startsWith('https://');
const businessSchema = z.object({
  name: text,
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  phoneLabel: text,
  whatsapp: z.string().regex(/^[1-9]\d{7,14}$/),
  street: text,
  locality: text,
  postalCode: text,
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  maps: https,
  embed: https.startsWith('https://www.google.com/maps/embed?'),
  facebook: text,
}).strict();

export async function validate(root = process.cwd()) {
  const requiredContent = async (name, schema) => {
    const data = await json(join(root, 'content', name + '.json'), schema);
    if (!data) throw new Error('Contenu absent : ' + name);
    return data;
  };
  const [categories, manifest, decisions, , fr, ar, en] = await Promise.all([
    requiredContent('categories', categoriesSchema),
    requiredContent('manifest', manifestSchema),
    requiredContent('decisions', decisionsSchema),
    requiredContent('business', businessSchema),
    ...['fr', 'ar', 'en'].map(lang => requiredContent(lang, z.record(text))),
  ]);
  for (const lang of [ar, en]) {
    if (Object.keys(lang).sort().join() !== Object.keys(fr).sort().join()) throw new Error('Clés de traduction incohérentes.');
  }
  const active = Object.values(manifest.files).map(file => file.hash);
  if (active.some(id => !manifest.photos[id])) throw new Error('Analyse manquante dans le manifeste.');
  const { published } = planPublication(active, manifest.photos, decisions, categories);
  const expectedGroups = new Map(published.map(group => ['m-' + group.id, group]));
  const directory = join(root, 'content', 'items');
  const media = new Set();
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.json'))) {
    const item = itemSchema.parse(JSON.parse(await readFile(join(directory, file), 'utf8')));
    const group = expectedGroups.get(item.id);
    if (file !== item.id + '.json' || !group || item.kind !== group.kind || item.category !== group.analysis.category ||
        item.images.map(image => image.src).join() !== group.members.map(id => '/media/' + id + '.webp').join()) {
      throw new Error('Fiche incohérente : ' + file);
    }
    expectedGroups.delete(item.id);
    for (const photo of item.images) {
      const name = photo.src.split('/').at(-1);
      const bytes = await readFile(join(root, 'public', 'media', name));
      const metadata = await sharp(bytes).metadata();
      if (metadata.format !== 'webp' || metadata.width !== photo.width || metadata.height !== photo.height ||
          metadata.exif || metadata.iptc || metadata.xmp) throw new Error('Média incohérent : ' + photo.src);
      media.add(name);
    }
  }
  if (expectedGroups.size) throw new Error('Fiches approuvées absentes.');
  const mediaFiles = (await readdir(join(root, 'public', 'media'))).filter(name => name !== '.gitkeep');
  if (mediaFiles.some(name => !media.has(name))) throw new Error('Média non référencé dans public/media.');
}
