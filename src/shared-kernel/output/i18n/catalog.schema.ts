import { z } from 'zod';

const PluralFormsSchema = z.object({
  zero: z.string().optional(),
  one: z.string().optional(),
  two: z.string().optional(),
  few: z.string().optional(),
  many: z.string().optional(),
  other: z.string(),
});

export type Leaf = string | z.infer<typeof PluralFormsSchema>;

const LeafSchema: z.ZodType<Leaf> = z.union([z.string(), PluralFormsSchema]);

export const CatalogSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.record(z.string(), z.union([LeafSchema, CatalogSchema])),
);

export type Catalog = z.infer<typeof CatalogSchema>;
export type PluralForms = z.infer<typeof PluralFormsSchema>;
