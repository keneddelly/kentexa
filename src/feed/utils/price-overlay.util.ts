// Burns a bold price banner (and a small category badge) directly into a
// Cloudinary-hosted image URL, using Cloudinary's on-the-fly text-overlay
// transformation — no new image-processing dependency, no separate stored
// asset. Used when auto-sharing a product/classified/service as a Moment
// on the home feed: a listing photo with no price on it gives a viewer
// nothing to act on, so the price and category are overlaid at the moment
// the Moment is published.
//
// Only works on Cloudinary delivery URLs (".../image/upload/..."); any
// other URL is returned unchanged.
export function withPriceOverlay(
  imageUrl: string | null | undefined,
  opts: { priceLabel?: string | null; category?: string | null },
): string | undefined {
  if (!imageUrl) return imageUrl || undefined;
  const marker = '/image/upload/';
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return imageUrl;

  const before = imageUrl.slice(0, idx + marker.length);
  const after = imageUrl.slice(idx + marker.length);

  const layers: string[] = [];

  if (opts.category) {
    const text = encodeURIComponent(String(opts.category).toUpperCase());
    layers.push(
      `l_text:Arial_28_bold:${text},co_white,b_rgb:1d4ed8,g_north,y_18,r_6`,
    );
  }

  if (opts.priceLabel) {
    const text = encodeURIComponent(opts.priceLabel);
    layers.push(
      `l_text:Arial_56_bold:${text},co_white,b_rgb:16a34a,g_south,y_20,r_8`,
    );
  }

  if (layers.length === 0) return imageUrl;
  return `${before}${layers.join('/')}/${after}`;
}

// Formats a product/classified price for the overlay — plain "TZS X,XXX".
export function formatPriceLabel(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined || Number(amount) <= 0) return null;
  return `TZS ${Math.round(Number(amount)).toLocaleString('en-US')}`;
}

// Formats a service ad's price, which — unlike a fixed product/classified
// price — can be a range, per-unit rate, or not fixed at all
// (negotiate/free-quote), so there's no single number to overlay in
// those cases.
export function formatServicePriceLabel(
  priceType: string,
  price: number | null | undefined,
  priceMax?: number | null,
): string | null {
  if (priceType === 'negotiate' || priceType === 'free_quote') return null;
  if (!price || Number(price) <= 0) return null;
  const base = `TZS ${Math.round(Number(price)).toLocaleString('en-US')}`;
  const withRange =
    priceMax && Number(priceMax) > Number(price)
      ? `${base}–${Math.round(Number(priceMax)).toLocaleString('en-US')}`
      : base;
  const unit =
    priceType === 'per_hour' ? '/saa' : priceType === 'per_day' ? '/siku' : '';
  return `${withRange}${unit}`;
}
