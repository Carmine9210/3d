import { createClient } from '@/lib/supabase/server';

const DEFAULTS = {
  default_commission_bps: 1000,
  auto_publish_threshold: 3,
  shipping_flat_cents: 490,
  free_shipping_over_cents: 6000,
} as const;

export type AppConfig = { -readonly [K in keyof typeof DEFAULTS]: number };

export async function getAppConfig(): Promise<AppConfig> {
  const supabase = await createClient();
  const { data } = await supabase.from('app_config').select('key,value');
  const cfg: AppConfig = { ...DEFAULTS };
  for (const row of data ?? []) {
    if (row.key in cfg && typeof row.value === 'number') {
      (cfg as Record<string, number>)[row.key] = row.value;
    }
  }
  return cfg;
}
