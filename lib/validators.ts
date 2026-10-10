import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  displayName: z.string().min(2).max(60),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const storeSchema = z.object({
  name: z.string().min(2).max(60),
  vendorType: z.enum(['private', 'professional', 'company']),
  description_it: z.string().max(1500).default(''),
  description_en: z.string().max(1500).default(''),
  city: z.string().min(2).max(80),
  region: z.string().max(80).optional().default(''),
  phone: z.string().min(6).max(30),
  avg_production_days: z.coerce.number().int().min(0).max(90).default(3),
  return_policy: z.string().max(1500).optional().default(''),
  taxId: z.string().min(5).max(30),
  acceptTerms: z.literal('on'),
});

export const productSchema = z
  .object({
    title_it: z.string().max(120).default(''),
    title_en: z.string().max(120).default(''),
    description_it: z.string().max(4000).default(''),
    description_en: z.string().max(4000).default(''),
    category_id: z.string().uuid(),
    price: z.string().min(1),
    production_days: z.coerce.number().int().min(0).max(90),
    is_customizable: z.boolean(),
    customization_note: z.string().max(300).optional().default(''),
    local_pickup: z.boolean(),
  })
  .refine((v) => v.title_it.trim() !== '' || v.title_en.trim() !== '', {
    path: ['title_it'],
    message: 'title required',
  });

export const variantSchema = z.object({
  material: z.string().max(40).default(''),
  color: z.string().max(40).default(''),
  size: z.string().max(40).default(''),
  finish: z.string().max(40).default(''),
  price_delta: z.string().default('0'),
  stock: z.coerce.number().int().min(0).max(100000),
});

export const addressSchema = z.object({
  full_name: z.string().min(2).max(80),
  line1: z.string().min(3).max(120),
  line2: z.string().max(120).optional().default(''),
  city: z.string().min(2).max(80),
  postal_code: z.string().min(3).max(12),
  province: z.string().max(40).optional().default(''),
  country: z.string().length(2).default('IT'),
  phone: z.string().max(30).optional().default(''),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(1500).default(''),
});

export const reportSchema = z.object({
  target_type: z.enum(['product', 'store', 'review']),
  target_id: z.string().uuid(),
  reason: z.enum(['counterfeit', 'dangerous', 'illegal', 'misleading', 'other']),
  details: z.string().max(1000).optional().default(''),
});

export const trackingSchema = z.object({
  carrier: z.string().min(2).max(40),
  tracking_code: z.string().min(3).max(60),
});
