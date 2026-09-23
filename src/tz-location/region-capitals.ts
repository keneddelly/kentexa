/**
 * Tanzania region -> region-capital city, the ONE canonical copy.
 *
 * Extracted VERBATIM (same keys, same values, same order) from
 * TzPricingService, which documents why it exists: IntercityRoute stores CITY
 * names, not region names ('Kilimanjaro' -> 'Moshi'). Both TzPricingService
 * (pricing) and logistics place discovery (Stage 2E) read this constant; do
 * not create a second map and do not invent aliases here.
 */
export const TZ_REGION_CAPITALS: Readonly<Record<string, string>> = Object.freeze({
  'Dar es Salaam': 'Dar es Salaam',
  Mwanza: 'Mwanza',
  Arusha: 'Arusha',
  Kilimanjaro: 'Moshi',
  Tanga: 'Tanga',
  Morogoro: 'Morogoro',
  Dodoma: 'Dodoma',
  Mbeya: 'Mbeya',
  Iringa: 'Iringa',
  Mara: 'Musoma',
  Kagera: 'Bukoba',
  Kigoma: 'Kigoma',
  Tabora: 'Tabora',
  Shinyanga: 'Shinyanga',
  Singida: 'Singida',
  Lindi: 'Lindi',
  Mtwara: 'Mtwara',
  Ruvuma: 'Songea',
  Pwani: 'Kibaha',
  Rukwa: 'Sumbawanga',
  Manyara: 'Babati',
  Geita: 'Geita',
  Katavi: 'Mpanda',
  Njombe: 'Njombe',
  Simiyu: 'Bariadi',
  Songwe: 'Vwawa',
  'Zanzibar North': 'Mkokotoni',
  'Zanzibar South': 'Koani',
  'Zanzibar West': 'Zanzibar City',
  'Pemba North': 'Wete',
  'Pemba South': 'Chake Chake',
});
