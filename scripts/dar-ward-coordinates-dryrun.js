#!/usr/bin/env node
/**
 * DRY RUN ONLY. Looks up a map coordinate for each Dar es Salaam place name using the
 * Google Places API (the same key the app already uses) and writes a CSV for review.
 * Nothing is written to the database. Run it where GOOGLE_MAPS_API_KEY is set:
 *
 *   GOOGLE_MAPS_API_KEY=... node scripts/dar-ward-coordinates-dryrun.js <output.csv>
 *
 * Names come from src/tz-location/dar-common-places.ts (the place list the app already
 * uses). A place Google cannot match in Dar es Salaam gets an empty coordinate; it is
 * never guessed.
 */
const fs = require('fs');
const path = require('path');

const apiKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
const outFile = process.argv[2] || path.join(process.cwd(), 'dar-ward-coordinates-dryrun.csv');
if (!apiKey) {
  console.error('GOOGLE_MAPS_API_KEY is not set. Nothing was looked up.');
  process.exit(1);
}

// Pull the quoted place names out of the common-places file (the zone keys like 'kilwa_4'
// are skipped: they are lowercase codes, never place names).
function namesFromCommonPlaces() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'tz-location', 'dar-common-places.ts'), 'utf8');
  const body = src.slice(src.indexOf('DAR_COMMON_PLACES'));
  const found = new Set();
  for (const m of body.matchAll(/'([^'\n]+)'|"([^"\n]+)"/g)) {
    const name = (m[1] ?? m[2]).trim();
    if (/^[a-z0-9_]+$/.test(name)) continue; // zone key, not a place
    if (name.length < 3) continue;
    found.add(name);
  }
  return [...found];
}

const DARES = /dar es salaam|dar-es-salaam/i;

async function lookup(name) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: `${name}, Dar es Salaam, Tanzania`, regionCode: 'TZ', languageCode: 'sw', maxResultCount: 3 }),
  });
  if (!response.ok) return { name, status: `http_${response.status}` };
  const data = await response.json();
  const hit = (data.places || []).find((p) => DARES.test(p.formattedAddress || ''));
  if (!hit) return { name, status: 'not_found_in_dar' };
  return {
    name,
    status: 'ok',
    latitude: hit.location?.latitude,
    longitude: hit.location?.longitude,
    googleName: hit.displayName?.text || '',
    address: (hit.formattedAddress || '').replace(/,/g, ' '),
  };
}

(async () => {
  const names = namesFromCommonPlaces();
  const rows = [['place', 'status', 'latitude', 'longitude', 'google_name', 'google_address']];
  for (const name of names) {
    const r = await lookup(name);
    rows.push([r.name, r.status, r.latitude ?? '', r.longitude ?? '', r.googleName ?? '', r.address ?? '']);
    await new Promise((resolve) => setTimeout(resolve, 150)); // stay well under the rate limit
  }
  fs.writeFileSync(outFile, rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n');
  const ok = rows.filter((r) => r[1] === 'ok').length;
  console.log(`Looked up ${names.length} places: ${ok} found in Dar es Salaam. Review ${outFile} before any write.`);
})();
