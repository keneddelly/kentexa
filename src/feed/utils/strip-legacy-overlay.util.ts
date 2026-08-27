// Reverses the old price-overlay.util.ts behavior (removed) at READ time,
// so Moments created before that removal stop showing their burned-in
// price+category banner without needing a data migration/backfill.
//
// The old overlay always inserted one or more Cloudinary `l_text:...`
// transformation segments directly after "/image/upload/", immediately
// before the image's original (un-transformed) path — e.g.:
//   .../image/upload/l_text:Arial_28_bold:CAT,co_white,.../l_text:Arial_56_bold:PRICE,.../v123/foo.jpg
// Stripping every leading `l_text:...` segment at that exact position
// deterministically restores the original URL, since that's the only kind
// of transformation this app ever inserted there.
export function stripLegacyPriceOverlay(
  imageUrl: string | null | undefined,
): string | null | undefined {
  if (!imageUrl) return imageUrl;
  const marker = '/image/upload/';
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return imageUrl;

  const before = imageUrl.slice(0, idx + marker.length);
  let rest = imageUrl.slice(idx + marker.length);

  while (rest.startsWith('l_text:')) {
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) break;
    rest = rest.slice(slashIdx + 1);
  }

  return before + rest;
}
