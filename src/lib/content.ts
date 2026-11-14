import business from '../../content/business.json';
import categoriesData from '../../content/categories.json';
import fr from '../../content/fr.json';
import ar from '../../content/ar.json';
import en from '../../content/en.json';
import type { z } from 'zod';
import type { itemSchema } from '../../scripts/schema.mjs';

export const locales = ['fr', 'ar', 'en'] as const;
export type Locale = typeof locales[number];
export type Item = z.infer<typeof itemSchema>;
export const copy = { fr, ar, en };
export const categories: Record<string, Record<Locale, string>> = categoriesData;
export const items = Object.values(import.meta.glob<Item>('../../content/items/*.json', { eager: true, import: 'default' }))
  .sort((a, b) => a.id.localeCompare(b.id));
export { business };
export const businessName = (lang: Locale) => lang === 'ar' ? business.nameAr : business.name;
export const cityAddress = business.locality + ' ' + business.postalCode;
export const pagePath = (lang: Locale, path = '') => [lang === 'fr' ? '' : lang, path].filter(Boolean).join('/');
export const asset = (path: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
export const route = (lang: Locale, path = '') => {
  const page = pagePath(lang, path);
  return asset(page ? page + '/' : '');
};
export const listing = (kind: Item['kind']) => kind === 'portfolio' ? 'realisations' : 'catalogue';
export const itemPath = (item: Item) => listing(item.kind) + '/' + item.id;
export const whatsapp = (message: string) => 'https://wa.me/' + business.whatsapp + '?text=' + encodeURIComponent(message);
