/** Stima di consegna (pura e testabile). Giorni lavorativi, weekend esclusi. */
export const SHIPPING_DAYS_MIN = 2;
export const SHIPPING_DAYS_MAX = 4;

export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d;
}

export function estimateDelivery(productionDays: number, from = new Date()) {
  return {
    min: addBusinessDays(from, productionDays + SHIPPING_DAYS_MIN),
    max: addBusinessDays(from, productionDays + SHIPPING_DAYS_MAX),
  };
}

export function formatDeliveryRange(min: Date, max: Date, locale: string): string {
  const loc = locale === 'en' ? 'en-GB' : 'it-IT';
  const day = new Intl.DateTimeFormat(loc, { day: 'numeric' });
  const monthShort = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' });
  if (min.getMonth() === max.getMonth() && min.getFullYear() === max.getFullYear()) {
    return `${day.format(min)}–${monthShort.format(max)}`;
  }
  return `${monthShort.format(min)} – ${monthShort.format(max)}`;
}
