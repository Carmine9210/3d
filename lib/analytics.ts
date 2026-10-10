/** Utilità pure per le statistiche (testabili). */

/** Percentuale ordini/visite, 0 se non ci sono visite. */
export function conversionRate(orders: number, views: number): number {
  if (views <= 0) return 0;
  return Math.min(100, (orders / views) * 100);
}

/** Serie giornaliera continua degli ultimi `days` giorni (UTC), sommando i valori dello stesso giorno. */
export function buildDailySeries(points: { day: string; value: number }[], days: number, today = new Date()) {
  const sums = new Map<string, number>();
  for (const p of points) sums.set(p.day, (sums.get(p.day) ?? 0) + p.value);
  const out: { day: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, value: sums.get(key) ?? 0 });
  }
  return out;
}

export type FunnelStep = { key: 'views' | 'cart_adds' | 'checkouts' | 'paid'; value: number; pct: number };

/** Funnel visite → carrello → checkout → pagati, con percentuale rispetto al passo precedente. */
export function buildFunnel(views: number, cartAdds: number, checkouts: number, paid: number): FunnelStep[] {
  const raw: [FunnelStep['key'], number][] = [['views', views], ['cart_adds', cartAdds], ['checkouts', checkouts], ['paid', paid]];
  return raw.map(([key, value], i) => {
    const prev = i === 0 ? value : raw[i - 1][1];
    return { key, value, pct: i === 0 ? 100 : prev > 0 ? Math.min(100, (value / prev) * 100) : 0 };
  });
}
