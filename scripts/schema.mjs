import { z } from 'zod';

export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const section = z.enum(['catalogue', 'portfolio']);
const text = z.string().trim().min(1);
/** @template {z.ZodType} Schema @param {Schema} schema */
const localized = schema => z.object({ fr: schema, ar: schema, en: schema }).strict();
const alt = localized(text.max(180));
const translations = localized(z.object({
  title: text.max(100),
  description: text.max(320),
  details: z.array(text.max(140)).max(6),
}).strict());
const imageSchema = z.object({
  src: z.string().regex(/^\/media\/[a-f0-9]{64}\.webp$/),
  width: z.number().int().positive().max(1800),
  height: z.number().int().positive().max(1800),
  alt,
}).strict();

export const itemSchema = z.object({
  id: z.string().regex(/^m-[a-f0-9]{64}$/),
  kind: section,
  category: slug,
  translations,
  images: z.array(imageSchema).min(1),
}).strict();
export const categoriesSchema = z.record(slug, localized(text));
export const decisionsSchema = z.object({
  groups: z.record(digest, digest),
  publish: z.record(digest, section),
}).strict();

export const analysisSchema = z.object({
  category: slug.nullable(),
  translations,
  alt,
}).strict();

export const photoSchema = z.object({
  visual: z.string().regex(/^[a-f0-9]{16}$/),
  analysis: analysisSchema,
}).strict();
export const fileSchema = z.object({
  version: text,
  hash: digest,
}).strict();
export const manifestSchema = z.object({
  version: z.literal(1),
  files: z.record(digest, fileSchema),
  photos: z.record(digest, photoSchema),
}).strict();
