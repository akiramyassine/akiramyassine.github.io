import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://akiramyassine.gt.tc',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
