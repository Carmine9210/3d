import 'server-only';
import { centsToDecimal, toCsv } from '@/lib/csv';

export type ExportOrder = {
  id: string; created_at: string; paid_at: string | null; status: string; currency: string;
  subtotal_cents: number; discount_cents: number; coupon_code: string | null; shipping_cents: number;
  platform_fee_cents: number; total_cents: number; refunded_cents: number; pickup: boolean;
  carrier: string | null; tracking_code: string | null; shipping_address: unknown;
  stores?: { name: string } | null;
  order_items: { title_snapshot: string; variant_snapshot: string | null; quantity: number }[];
};

/** Intervallo date da query string (YYYY-MM-DD), predefinito: ultimi 90 giorni. */
export function parseRange(url: URL) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const fromRaw = url.searchParams.get('from') ?? '';
  const toRaw = url.searchParams.get('to') ?? '';
  const to = re.test(toRaw) ? new Date(`${toRaw}T23:59:59.999Z`) : new Date();
  const from = re.test(fromRaw) ? new Date(`${fromRaw}T00:00:00Z`) : new Date(to.getTime() - 90 * 86400_000);
  return { from, to };
}

export function ordersCsv(orders: ExportOrder[], withStore: boolean): string {
  const header = [
    'data', 'pagato_il', 'ordine', ...(withStore ? ['shop'] : []), 'stato', 'cliente', 'citta', 'cap', 'paese', 'articoli',
    'subtotale', 'sconto', 'codice_sconto', 'spedizione', 'totale', 'commissione', 'netto_venditore', 'rimborsato', 'valuta',
    'ritiro', 'corriere', 'tracking',
  ];
  const rows = orders.map((o) => {
    const a = (o.shipping_address ?? {}) as Record<string, string>;
    const net = o.subtotal_cents - o.discount_cents + o.shipping_cents - o.platform_fee_cents;
    return [
      o.created_at.slice(0, 10), o.paid_at?.slice(0, 10) ?? '', o.id, ...(withStore ? [o.stores?.name ?? ''] : []), o.status,
      a.full_name ?? '', a.city ?? '', a.postal_code ?? '', a.country ?? '',
      o.order_items.map((i) => `${i.quantity}x ${i.title_snapshot}${i.variant_snapshot ? ` (${i.variant_snapshot})` : ''}`).join(' | '),
      centsToDecimal(o.subtotal_cents), centsToDecimal(o.discount_cents), o.coupon_code ?? '', centsToDecimal(o.shipping_cents),
      centsToDecimal(o.total_cents), centsToDecimal(o.platform_fee_cents), centsToDecimal(net), centsToDecimal(o.refunded_cents), o.currency,
      o.pickup ? 'si' : 'no', o.carrier ?? '', o.tracking_code ?? '',
    ];
  });
  return toCsv(header, rows);
}

export function csvResponse(body: string, filename: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const EXPORT_SELECT =
  'id, created_at, paid_at, status, currency, subtotal_cents, discount_cents, coupon_code, shipping_cents, platform_fee_cents, total_cents, refunded_cents, pickup, carrier, tracking_code, shipping_address, order_items ( title_snapshot, variant_snapshot, quantity )';
