import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.PAGES_ORIGIN || 'https://akiramyassine.gt.tc',
  base: process.env.PAGES_BASE_PATH || '/',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
