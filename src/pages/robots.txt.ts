import type { APIRoute } from 'astro';
import { asset } from '../lib/content';

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL(asset('sitemap-index.xml'), site);
  return new Response('User-agent: *\nAllow: /\nSitemap: ' + sitemap + '\n');
};
