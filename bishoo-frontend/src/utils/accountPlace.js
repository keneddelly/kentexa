// Pre-filling a form's place from the account's city (audit B): pick a place
// from the place list only when it clearly IS that city: the label or the
// region equals the city name. Otherwise nothing is picked and the person
// chooses from the list (we never guess a wrong place).
const norm = (s) => String(s || '').trim().toLowerCase();

export function pickAccountPlace(candidates, city) {
  const c = norm(city);
  if (!c || !Array.isArray(candidates)) return null;
  const ok = (p) => p && p.placeRef && p.placeRef.providerKey && p.placeRef.providerPlaceId;
  return candidates.find((p) => ok(p) && norm(p.displayLabel) === c)
    || candidates.find((p) => ok(p) && norm(p.regionName) === c && !p.districtName && !p.wardName)
    || null;
}
