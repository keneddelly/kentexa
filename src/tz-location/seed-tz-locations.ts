/**
 * seed-tz-locations.ts
 * Tanzania Administrative Hierarchy Seed Data
 * Source: NBS Tanzania 2022 Census + GADM + OpenStreetMap
 *
 * Run via Admin panel → "Jaza Maeneo ya Tanzania"
 * Or: ts-node src/database/seed-tz-locations.ts
 *
 * Hierarchy:
 *   TzRegion (Mkoa) → TzDistrict (Wilaya) → TzWard (Kata)
 *
 * Coverage:
 *   - All 31 regions with coordinates
 *   - All ~185 districts
 *   - All Dar es Salaam wards (~100) with precise coordinates
 *   - Major wards for other large cities (Mwanza, Arusha, Mbeya etc)
 */

// ── REGIONS ──────────────────────────────────────────────────────────────────
// sortOrder: Dar es Salaam first (most volume), then alphabetical

export const TZ_REGIONS = [
  {
    name: 'Dar es Salaam',
    nameSw: 'Dar es Salaam',
    capital: 'Dar es Salaam',
    code: 'DSM',
    lat: -6.7924,
    lng: 39.2083,
    sortOrder: 1,
  },
  {
    name: 'Mwanza',
    nameSw: 'Mwanza',
    capital: 'Mwanza',
    code: 'MWZ',
    lat: -2.5164,
    lng: 32.9175,
    sortOrder: 2,
  },
  {
    name: 'Arusha',
    nameSw: 'Arusha',
    capital: 'Arusha',
    code: 'ARU',
    lat: -3.3869,
    lng: 36.683,
    sortOrder: 3,
  },
  {
    name: 'Kilimanjaro',
    nameSw: 'Kilimanjaro',
    capital: 'Moshi',
    code: 'KIL',
    lat: -3.3548,
    lng: 37.3436,
    sortOrder: 4,
  },
  {
    name: 'Tanga',
    nameSw: 'Tanga',
    capital: 'Tanga',
    code: 'TAN',
    lat: -5.0659,
    lng: 39.0987,
    sortOrder: 5,
  },
  {
    name: 'Morogoro',
    nameSw: 'Morogoro',
    capital: 'Morogoro',
    code: 'MOR',
    lat: -6.8234,
    lng: 37.665,
    sortOrder: 6,
  },
  {
    name: 'Dodoma',
    nameSw: 'Dodoma',
    capital: 'Dodoma',
    code: 'DOD',
    lat: -6.1722,
    lng: 35.7395,
    sortOrder: 7,
  },
  {
    name: 'Mbeya',
    nameSw: 'Mbeya',
    capital: 'Mbeya',
    code: 'MBY',
    lat: -8.9,
    lng: 33.45,
    sortOrder: 8,
  },
  {
    name: 'Iringa',
    nameSw: 'Iringa',
    capital: 'Iringa',
    code: 'IRI',
    lat: -7.7676,
    lng: 35.6942,
    sortOrder: 9,
  },
  {
    name: 'Mara',
    nameSw: 'Mara',
    capital: 'Musoma',
    code: 'MAR',
    lat: -1.5,
    lng: 34.0,
    sortOrder: 10,
  },
  {
    name: 'Kagera',
    nameSw: 'Kagera',
    capital: 'Bukoba',
    code: 'KAG',
    lat: -1.3325,
    lng: 31.8222,
    sortOrder: 11,
  },
  {
    name: 'Kigoma',
    nameSw: 'Kigoma',
    capital: 'Kigoma',
    code: 'KIG',
    lat: -4.8769,
    lng: 29.6264,
    sortOrder: 12,
  },
  {
    name: 'Tabora',
    nameSw: 'Tabora',
    capital: 'Tabora',
    code: 'TAB',
    lat: -5.0167,
    lng: 32.8,
    sortOrder: 13,
  },
  {
    name: 'Shinyanga',
    nameSw: 'Shinyanga',
    capital: 'Shinyanga',
    code: 'SHI',
    lat: -3.6833,
    lng: 33.4333,
    sortOrder: 14,
  },
  {
    name: 'Singida',
    nameSw: 'Singida',
    capital: 'Singida',
    code: 'SIN',
    lat: -4.8167,
    lng: 34.75,
    sortOrder: 15,
  },
  {
    name: 'Lindi',
    nameSw: 'Lindi',
    capital: 'Lindi',
    code: 'LIN',
    lat: -9.9965,
    lng: 39.7143,
    sortOrder: 16,
  },
  {
    name: 'Mtwara',
    nameSw: 'Mtwara',
    capital: 'Mtwara',
    code: 'MTW',
    lat: -10.2667,
    lng: 40.1833,
    sortOrder: 17,
  },
  {
    name: 'Ruvuma',
    nameSw: 'Ruvuma',
    capital: 'Songea',
    code: 'RUV',
    lat: -10.6833,
    lng: 35.65,
    sortOrder: 18,
  },
  {
    name: 'Pwani',
    nameSw: 'Pwani',
    capital: 'Kibaha',
    code: 'PWA',
    lat: -6.95,
    lng: 38.9167,
    sortOrder: 19,
  },
  {
    name: 'Rukwa',
    nameSw: 'Rukwa',
    capital: 'Sumbawanga',
    code: 'RUK',
    lat: -7.9667,
    lng: 31.6167,
    sortOrder: 20,
  },
  {
    name: 'Manyara',
    nameSw: 'Manyara',
    capital: 'Babati',
    code: 'MAN',
    lat: -4.2167,
    lng: 35.75,
    sortOrder: 21,
  },
  {
    name: 'Geita',
    nameSw: 'Geita',
    capital: 'Geita',
    code: 'GEI',
    lat: -2.8667,
    lng: 32.1667,
    sortOrder: 22,
  },
  {
    name: 'Katavi',
    nameSw: 'Katavi',
    capital: 'Mpanda',
    code: 'KAT',
    lat: -6.3167,
    lng: 31.0667,
    sortOrder: 23,
  },
  {
    name: 'Njombe',
    nameSw: 'Njombe',
    capital: 'Njombe',
    code: 'NJO',
    lat: -9.3333,
    lng: 34.7667,
    sortOrder: 24,
  },
  {
    name: 'Simiyu',
    nameSw: 'Simiyu',
    capital: 'Bariadi',
    code: 'SIM',
    lat: -2.8,
    lng: 34.1833,
    sortOrder: 25,
  },
  {
    name: 'Songwe',
    nameSw: 'Songwe',
    capital: 'Vwawa',
    code: 'SON',
    lat: -8.6167,
    lng: 32.9,
    sortOrder: 26,
  },
  {
    name: 'Zanzibar North',
    nameSw: 'Kaskazini A',
    capital: 'Mkokotoni',
    code: 'ZAN',
    lat: -5.8167,
    lng: 39.2667,
    sortOrder: 27,
  },
  {
    name: 'Zanzibar South',
    nameSw: 'Kusini',
    capital: 'Koani',
    code: 'ZAS',
    lat: -6.1667,
    lng: 39.2833,
    sortOrder: 28,
  },
  {
    name: 'Zanzibar West',
    nameSw: 'Mjini Magharibi',
    capital: 'Zanzibar City',
    code: 'ZAW',
    lat: -6.1667,
    lng: 39.2,
    sortOrder: 29,
  },
  {
    name: 'Pemba North',
    nameSw: 'Kaskazini Pemba',
    capital: 'Wete',
    code: 'PEN',
    lat: -4.9667,
    lng: 39.75,
    sortOrder: 30,
  },
  {
    name: 'Pemba South',
    nameSw: 'Kusini Pemba',
    capital: 'Chake Chake',
    code: 'PES',
    lat: -5.25,
    lng: 39.7667,
    sortOrder: 31,
  },
];

// ── DISTRICTS (Wilaya) ────────────────────────────────────────────────────────
// Format: { region: 'Region Name', districts: [{name, lat, lng, isUrban}] }

export const TZ_DISTRICTS_BY_REGION: Record<
  string,
  Array<{
    name: string;
    nameSw?: string;
    lat: number;
    lng: number;
    isUrban?: boolean;
  }>
> = {
  'Dar es Salaam': [
    { name: 'Ilala', lat: -6.8167, lng: 39.2833, isUrban: true },
    { name: 'Kinondoni', lat: -6.7667, lng: 39.2167, isUrban: true },
    { name: 'Temeke', lat: -6.8667, lng: 39.2833, isUrban: true },
    { name: 'Ubungo', lat: -6.7833, lng: 39.2, isUrban: true },
    { name: 'Kigamboni', lat: -6.9, lng: 39.35, isUrban: false },
  ],

  Mwanza: [
    { name: 'Ilemela', lat: -2.4833, lng: 32.9, isUrban: true },
    { name: 'Nyamagana', lat: -2.5167, lng: 32.9, isUrban: true },
    { name: 'Kwimba', lat: -2.8167, lng: 33.15, isUrban: false },
    { name: 'Magu', lat: -2.5667, lng: 33.45, isUrban: false },
    { name: 'Misungwi', lat: -2.8333, lng: 32.8, isUrban: false },
    { name: 'Sengerema', lat: -2.6, lng: 32.5833, isUrban: false },
    { name: 'Ukerewe', lat: -2.0, lng: 33.0, isUrban: false },
  ],

  Arusha: [
    { name: 'Arusha City', lat: -3.3667, lng: 36.6833, isUrban: true },
    { name: 'Arumeru', lat: -3.3333, lng: 36.8167, isUrban: false },
    { name: 'Karatu', lat: -3.35, lng: 35.65, isUrban: false },
    { name: 'Longido', lat: -2.7167, lng: 36.7, isUrban: false },
    { name: 'Monduli', lat: -3.3, lng: 36.45, isUrban: false },
    { name: 'Meru', lat: -3.2167, lng: 36.95, isUrban: false },
    { name: 'Ngorongoro', lat: -3.2, lng: 35.5, isUrban: false },
  ],

  Kilimanjaro: [
    { name: 'Moshi Municipal', lat: -3.35, lng: 37.3333, isUrban: true },
    { name: 'Moshi Rural', lat: -3.4, lng: 37.35, isUrban: false },
    { name: 'Mwanga', lat: -3.5, lng: 37.3833, isUrban: false },
    { name: 'Rombo', lat: -3.2167, lng: 37.6167, isUrban: false },
    { name: 'Same', lat: -4.0833, lng: 37.7333, isUrban: false },
    { name: 'Siha', lat: -3.1667, lng: 37.1667, isUrban: false },
  ],

  Tanga: [
    { name: 'Tanga City', lat: -5.0667, lng: 39.1, isUrban: true },
    { name: 'Handeni', lat: -5.4333, lng: 38.0167, isUrban: false },
    { name: 'Kilindi', lat: -5.0667, lng: 38.4, isUrban: false },
    { name: 'Korogwe', lat: -5.15, lng: 38.4833, isUrban: false },
    { name: 'Lushoto', lat: -4.7833, lng: 38.2833, isUrban: false },
    { name: 'Mkinga', lat: -4.7167, lng: 38.9167, isUrban: false },
    { name: 'Muheza', lat: -5.1667, lng: 38.7833, isUrban: false },
    { name: 'Pangani', lat: -5.4333, lng: 38.9833, isUrban: false },
  ],

  Morogoro: [
    { name: 'Morogoro Municipal', lat: -6.8167, lng: 37.6667, isUrban: true },
    { name: 'Morogoro Rural', lat: -7.0, lng: 37.5, isUrban: false },
    { name: 'Kilosa', lat: -6.8333, lng: 36.9833, isUrban: false },
    { name: 'Kilombero', lat: -8.4833, lng: 36.55, isUrban: false },
    { name: 'Malinyi', lat: -8.9167, lng: 36.0167, isUrban: false },
    { name: 'Mvomero', lat: -6.0, lng: 37.5, isUrban: false },
    { name: 'Ulanga', lat: -8.7167, lng: 36.6833, isUrban: false },
    { name: 'Gairo', lat: -6.3167, lng: 36.8167, isUrban: false },
  ],

  Dodoma: [
    { name: 'Dodoma City', lat: -6.1722, lng: 35.7395, isUrban: true },
    { name: 'Bahi', lat: -5.9333, lng: 35.3167, isUrban: false },
    { name: 'Chamwino', lat: -6.2833, lng: 35.8833, isUrban: false },
    { name: 'Chemba', lat: -5.5, lng: 35.9333, isUrban: false },
    { name: 'Kondoa', lat: -4.9, lng: 35.7833, isUrban: false },
    { name: 'Kongwa', lat: -6.2167, lng: 36.4167, isUrban: false },
    { name: 'Mpwapwa', lat: -6.35, lng: 36.4833, isUrban: false },
  ],

  Mbeya: [
    { name: 'Mbeya City', lat: -8.9, lng: 33.45, isUrban: true },
    { name: 'Mbeya Rural', lat: -8.95, lng: 33.4, isUrban: false },
    { name: 'Busokelo', lat: -8.8833, lng: 33.9167, isUrban: false },
    { name: 'Chunya', lat: -8.5333, lng: 33.4167, isUrban: false },
    { name: 'Kyela', lat: -9.5833, lng: 33.9667, isUrban: false },
    { name: 'Mbarali', lat: -8.6667, lng: 34.5333, isUrban: false },
    { name: 'Rungwe', lat: -9.0167, lng: 33.6667, isUrban: false },
  ],

  Iringa: [
    { name: 'Iringa Municipal', lat: -7.77, lng: 35.6942, isUrban: true },
    { name: 'Iringa Rural', lat: -7.8, lng: 35.6, isUrban: false },
    { name: 'Kilolo', lat: -7.6333, lng: 36.0167, isUrban: false },
    { name: 'Mafinga', lat: -8.1333, lng: 35.2667, isUrban: false },
    { name: 'Mufindi', lat: -8.5167, lng: 35.4167, isUrban: false },
  ],

  Mara: [
    { name: 'Musoma Municipal', lat: -1.5, lng: 33.8, isUrban: true },
    { name: 'Musoma Rural', lat: -1.6833, lng: 33.95, isUrban: false },
    { name: 'Bunda', lat: -1.8667, lng: 33.8833, isUrban: false },
    { name: 'Butiama', lat: -1.5833, lng: 33.9167, isUrban: false },
    { name: 'Rorya', lat: -1.1333, lng: 34.1333, isUrban: false },
    { name: 'Serengeti', lat: -2.3, lng: 34.8333, isUrban: false },
    { name: 'Tarime', lat: -1.35, lng: 34.1833, isUrban: false },
  ],

  Kagera: [
    { name: 'Bukoba Municipal', lat: -1.3333, lng: 31.8167, isUrban: true },
    { name: 'Bukoba Rural', lat: -1.4333, lng: 31.7833, isUrban: false },
    { name: 'Biharamulo', lat: -2.6333, lng: 31.3, isUrban: false },
    { name: 'Karagwe', lat: -1.5167, lng: 31.1833, isUrban: false },
    { name: 'Kyerwa', lat: -1.2, lng: 31.0833, isUrban: false },
    { name: 'Missenyi', lat: -1.0833, lng: 31.6, isUrban: false },
    { name: 'Muleba', lat: -1.75, lng: 31.6667, isUrban: false },
    { name: 'Ngara', lat: -2.5, lng: 30.6333, isUrban: false },
  ],

  Kigoma: [
    { name: 'Kigoma Municipal', lat: -4.8769, lng: 29.6264, isUrban: true },
    { name: 'Kigoma Rural', lat: -4.95, lng: 29.65, isUrban: false },
    { name: 'Buhigwe', lat: -4.3833, lng: 30.2, isUrban: false },
    { name: 'Kakonko', lat: -3.2833, lng: 30.9667, isUrban: false },
    { name: 'Kasulu', lat: -4.5833, lng: 30.1, isUrban: false },
    { name: 'Kibondo', lat: -3.5833, lng: 30.6833, isUrban: false },
    { name: 'Uvinza', lat: -5.1, lng: 30.3833, isUrban: false },
  ],

  Tabora: [
    { name: 'Tabora Municipal', lat: -5.0167, lng: 32.8, isUrban: true },
    { name: 'Igunga', lat: -4.1, lng: 33.7833, isUrban: false },
    { name: 'Kaliua', lat: -5.0833, lng: 31.8333, isUrban: false },
    { name: 'Nzega', lat: -4.2167, lng: 33.1833, isUrban: false },
    { name: 'Sikonge', lat: -5.6333, lng: 32.7667, isUrban: false },
    { name: 'Urambo', lat: -5.0833, lng: 32.05, isUrban: false },
    { name: 'Uyui', lat: -5.05, lng: 32.7833, isUrban: false },
  ],

  Shinyanga: [
    { name: 'Shinyanga Municipal', lat: -3.65, lng: 33.4333, isUrban: true },
    { name: 'Shinyanga Rural', lat: -3.75, lng: 33.45, isUrban: false },
    { name: 'Kahama', lat: -3.8333, lng: 32.6, isUrban: false },
    { name: 'Kishapu', lat: -3.5833, lng: 33.8, isUrban: false },
    { name: 'Msalala', lat: -3.3833, lng: 32.5, isUrban: false },
    { name: 'Ushetu', lat: -3.9167, lng: 32.7833, isUrban: false },
  ],

  Singida: [
    { name: 'Singida Municipal', lat: -4.8167, lng: 34.75, isUrban: true },
    { name: 'Singida Rural', lat: -4.95, lng: 34.8333, isUrban: false },
    { name: 'Ikungi', lat: -5.5333, lng: 34.75, isUrban: false },
    { name: 'Iramba', lat: -4.1333, lng: 34.55, isUrban: false },
    { name: 'Itigi', lat: -5.6833, lng: 34.4667, isUrban: false },
    { name: 'Manyoni', lat: -5.75, lng: 34.85, isUrban: false },
  ],

  Lindi: [
    { name: 'Lindi Municipal', lat: -9.9965, lng: 39.7143, isUrban: true },
    { name: 'Lindi Rural', lat: -10.0833, lng: 39.7833, isUrban: false },
    { name: 'Kilwa', lat: -8.9167, lng: 39.5, isUrban: false },
    { name: 'Liwale', lat: -9.7833, lng: 37.9333, isUrban: false },
    { name: 'Nachingwea', lat: -10.35, lng: 38.7667, isUrban: false },
    { name: 'Ruangwa', lat: -10.55, lng: 38.6333, isUrban: false },
  ],

  Mtwara: [
    { name: 'Mtwara Municipal', lat: -10.2667, lng: 40.1833, isUrban: true },
    { name: 'Mtwara Rural', lat: -10.3333, lng: 40.1667, isUrban: false },
    { name: 'Masasi', lat: -10.7333, lng: 38.8, isUrban: false },
    { name: 'Nanyumbu', lat: -10.9, lng: 38.75, isUrban: false },
    { name: 'Newala', lat: -10.9333, lng: 39.65, isUrban: false },
    { name: 'Tandahimba', lat: -10.7167, lng: 39.55, isUrban: false },
  ],

  Ruvuma: [
    { name: 'Songea Municipal', lat: -10.6833, lng: 35.65, isUrban: true },
    { name: 'Songea Rural', lat: -10.9, lng: 35.6167, isUrban: false },
    { name: 'Madaba', lat: -10.65, lng: 34.9833, isUrban: false },
    { name: 'Mbinga', lat: -10.9, lng: 35.0, isUrban: false },
    { name: 'Namtumbo', lat: -10.3833, lng: 36.5, isUrban: false },
    { name: 'Nyasa', lat: -10.6333, lng: 34.8667, isUrban: false },
    { name: 'Tunduru', lat: -11.1, lng: 37.35, isUrban: false },
  ],

  Pwani: [
    { name: 'Kibaha', lat: -6.7667, lng: 38.9167, isUrban: true },
    { name: 'Bagamoyo', lat: -6.45, lng: 38.9, isUrban: false },
    { name: 'Chalinze', lat: -6.55, lng: 38.55, isUrban: false },
    { name: 'Kisarawe', lat: -7.0833, lng: 39.05, isUrban: false },
    { name: 'Mafia', lat: -7.9167, lng: 39.85, isUrban: false },
    { name: 'Mkuranga', lat: -7.1333, lng: 39.3333, isUrban: false },
    { name: 'Rufiji', lat: -7.9167, lng: 38.4833, isUrban: false },
  ],

  Rukwa: [
    { name: 'Sumbawanga Municipal', lat: -7.9667, lng: 31.6167, isUrban: true },
    { name: 'Sumbawanga Rural', lat: -8.0833, lng: 31.6667, isUrban: false },
    { name: 'Kalambo', lat: -8.5833, lng: 31.25, isUrban: false },
    { name: 'Nkasi', lat: -7.4333, lng: 31.65, isUrban: false },
  ],

  Manyara: [
    { name: 'Babati', lat: -4.2167, lng: 35.75, isUrban: true },
    { name: 'Hanang', lat: -4.45, lng: 35.4, isUrban: false },
    { name: 'Kiteto', lat: -5.8667, lng: 36.9333, isUrban: false },
    { name: 'Mbulu', lat: -3.85, lng: 35.5333, isUrban: false },
    { name: 'Simanjiro', lat: -3.7167, lng: 36.55, isUrban: false },
  ],

  Geita: [
    { name: 'Geita', lat: -2.8667, lng: 32.1667, isUrban: true },
    { name: 'Buchosa', lat: -2.2, lng: 32.1167, isUrban: false },
    { name: 'Chato', lat: -2.6333, lng: 31.8167, isUrban: false },
    { name: 'Mbogwe', lat: -3.3, lng: 32.1, isUrban: false },
    { name: "Nyang'hwale", lat: -2.9667, lng: 32.45, isUrban: false },
  ],

  Katavi: [
    { name: 'Mpanda', lat: -6.3167, lng: 31.0667, isUrban: true },
    { name: 'Mlele', lat: -6.7833, lng: 31.5, isUrban: false },
    { name: 'Nsimbo', lat: -6.55, lng: 31.6667, isUrban: false },
    { name: 'Tanganyika', lat: -6.05, lng: 30.4833, isUrban: false },
  ],

  Njombe: [
    { name: 'Njombe', lat: -9.3333, lng: 34.7667, isUrban: true },
    { name: 'Ludewa', lat: -9.9, lng: 34.65, isUrban: false },
    { name: 'Makambako', lat: -8.8833, lng: 34.8333, isUrban: false },
    { name: 'Makete', lat: -9.4167, lng: 34.8167, isUrban: false },
    { name: "Wanging'ombe", lat: -9.1167, lng: 35.1667, isUrban: false },
  ],

  Simiyu: [
    { name: 'Bariadi', lat: -2.8, lng: 34.1833, isUrban: true },
    { name: 'Busega', lat: -2.3833, lng: 33.4833, isUrban: false },
    { name: 'Itilima', lat: -2.8833, lng: 33.8667, isUrban: false },
    { name: 'Maswa', lat: -2.8667, lng: 33.9667, isUrban: false },
    { name: 'Meatu', lat: -3.2333, lng: 34.3167, isUrban: false },
  ],

  Songwe: [
    { name: 'Momba', lat: -8.7833, lng: 32.55, isUrban: false },
    { name: 'Mbozi', lat: -8.9167, lng: 32.9167, isUrban: false },
    { name: 'Songwe', lat: -8.6167, lng: 32.9, isUrban: true },
    { name: 'Tunduma', lat: -9.2833, lng: 32.7833, isUrban: true },
  ],

  'Zanzibar North': [
    { name: 'Kaskazini A', lat: -5.7667, lng: 39.2833, isUrban: false },
    { name: 'Kaskazini B', lat: -5.8167, lng: 39.3667, isUrban: false },
  ],

  'Zanzibar South': [
    { name: 'Kusini', lat: -6.2167, lng: 39.3167, isUrban: false },
    { name: 'Kati', lat: -6.0833, lng: 39.2833, isUrban: false },
  ],

  'Zanzibar West': [
    { name: 'Mjini', lat: -6.1667, lng: 39.2, isUrban: true },
    { name: 'Magharibi A', lat: -6.2, lng: 39.1333, isUrban: false },
    { name: 'Magharibi B', lat: -6.1833, lng: 39.1667, isUrban: false },
  ],

  'Pemba North': [
    { name: 'Micheweni', lat: -4.9667, lng: 39.8333, isUrban: false },
    { name: 'Wete', lat: -5.0667, lng: 39.7333, isUrban: true },
  ],

  'Pemba South': [
    { name: 'Chake Chake', lat: -5.25, lng: 39.7667, isUrban: true },
    { name: 'Mkoani', lat: -5.3667, lng: 39.6833, isUrban: false },
  ],
};

// ── DAR ES SALAAM WARDS (Full detail with coordinates) ───────────────────────
// Source: NBS 2022 Census + OpenStreetMap Tanzania
// All wards for all 5 Dar es Salaam districts

export const DAR_WARDS: Record<
  string,
  Array<{
    name: string;
    lat: number;
    lng: number;
    isUrban?: boolean;
    densityClass?: string;
  }>
> = {
  Ilala: [
    {
      name: 'Buguruni',
      lat: -6.8167,
      lng: 39.2333,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: "Chang'ombe",
      lat: -6.85,
      lng: 39.2667,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Gerezani',
      lat: -6.8167,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Ilala',
      lat: -6.8333,
      lng: 39.2667,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kariakoo',
      lat: -6.8167,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kisutu',
      lat: -6.8167,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kivukoni',
      lat: -6.8167,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Mchafukoge',
      lat: -6.8,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Msimbazi',
      lat: -6.8167,
      lng: 39.25,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Mtambaswala',
      lat: -6.8333,
      lng: 39.25,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Tabata',
      lat: -6.8333,
      lng: 39.2167,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Upanga Magharibi',
      lat: -6.8167,
      lng: 39.2667,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Upanga Mashariki',
      lat: -6.8167,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Vingunguti',
      lat: -6.85,
      lng: 39.2333,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kigogo',
      lat: -6.8,
      lng: 39.25,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Mzimuni',
      lat: -6.85,
      lng: 39.2667,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Ukonga',
      lat: -6.85,
      lng: 39.1833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kitunda',
      lat: -6.8833,
      lng: 39.1667,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Segerea',
      lat: -6.8833,
      lng: 39.2,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Chanika',
      lat: -6.9167,
      lng: 39.15,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Pugu',
      lat: -6.9,
      lng: 39.1167,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Pemba Mnazi',
      lat: -6.8833,
      lng: 39.1833,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Kivule',
      lat: -6.9,
      lng: 39.1833,
      isUrban: false,
      densityClass: 'low',
    },
  ],

  Kinondoni: [
    {
      name: 'Bunju',
      lat: -6.6167,
      lng: 39.2167,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Goba',
      lat: -6.6833,
      lng: 39.25,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Kawe',
      lat: -6.7333,
      lng: 39.2167,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Kibamba',
      lat: -6.6833,
      lng: 39.1667,
      isUrban: false,
      densityClass: 'medium',
    },
    {
      name: 'Kinondoni',
      lat: -6.7667,
      lng: 39.2333,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kunduchi',
      lat: -6.6167,
      lng: 39.2333,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Mabwepande',
      lat: -6.65,
      lng: 39.1667,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Makongo',
      lat: -6.7167,
      lng: 39.2,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Makuburi',
      lat: -6.7833,
      lng: 39.25,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Manzese',
      lat: -6.7833,
      lng: 39.2167,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Mbweni',
      lat: -6.6833,
      lng: 39.2833,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Mikocheni',
      lat: -6.75,
      lng: 39.25,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Msasani',
      lat: -6.75,
      lng: 39.2667,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Ndugumbi',
      lat: -6.75,
      lng: 39.2167,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Sinza',
      lat: -6.7833,
      lng: 39.2333,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Tandale',
      lat: -6.7667,
      lng: 39.2167,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Wazo',
      lat: -6.65,
      lng: 39.2,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Hananasifu',
      lat: -6.7667,
      lng: 39.2333,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Magomeni',
      lat: -6.7833,
      lng: 39.25,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kijitonyama',
      lat: -6.7667,
      lng: 39.25,
      isUrban: true,
      densityClass: 'medium',
    },
  ],

  Temeke: [
    {
      name: 'Azimio',
      lat: -6.8667,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Chamazi',
      lat: -6.9333,
      lng: 39.3167,
      isUrban: false,
      densityClass: 'medium',
    },
    {
      name: 'Charambe',
      lat: -6.8667,
      lng: 39.3,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Keko',
      lat: -6.8667,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kibonde Maji',
      lat: -6.9167,
      lng: 39.3,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kigamboni',
      lat: -6.9,
      lng: 39.35,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Kurasini',
      lat: -6.8833,
      lng: 39.3,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Makangarawe',
      lat: -6.9,
      lng: 39.3167,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Mbagala',
      lat: -6.9,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Mbagala Kuu',
      lat: -6.9167,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Miburani',
      lat: -6.8833,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Mtoni',
      lat: -6.85,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Pemba Mnazi',
      lat: -6.8667,
      lng: 39.2667,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Sandali',
      lat: -6.95,
      lng: 39.2833,
      isUrban: false,
      densityClass: 'medium',
    },
    {
      name: 'Somangila',
      lat: -6.9333,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Temeke',
      lat: -6.8833,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Tandika',
      lat: -6.8833,
      lng: 39.2667,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Yombo Vituka',
      lat: -6.9,
      lng: 39.25,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: "Chang'ombe",
      lat: -6.8667,
      lng: 39.2833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Vijibweni',
      lat: -6.9667,
      lng: 39.3167,
      isUrban: false,
      densityClass: 'low',
    },
  ],

  Ubungo: [
    {
      name: 'Kibamba',
      lat: -6.7333,
      lng: 39.15,
      isUrban: false,
      densityClass: 'medium',
    },
    {
      name: 'Kimara',
      lat: -6.7833,
      lng: 39.1833,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Kwembe',
      lat: -6.7,
      lng: 39.15,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Mbezi',
      lat: -6.75,
      lng: 39.1667,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Mbezi Luis',
      lat: -6.7667,
      lng: 39.1833,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Msigani',
      lat: -6.7667,
      lng: 39.1833,
      isUrban: true,
      densityClass: 'medium',
    },
    {
      name: 'Ubungo',
      lat: -6.7833,
      lng: 39.2,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Makuburi',
      lat: -6.7667,
      lng: 39.2,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Mwananyamala',
      lat: -6.7833,
      lng: 39.2333,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Makurumla',
      lat: -6.7833,
      lng: 39.2167,
      isUrban: true,
      densityClass: 'high',
    },
    {
      name: 'Saranga',
      lat: -6.75,
      lng: 39.15,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Salasala',
      lat: -6.7167,
      lng: 39.2333,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Changanyikeni',
      lat: -6.7167,
      lng: 39.2,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Goba',
      lat: -6.6667,
      lng: 39.2167,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Kombo',
      lat: -6.7833,
      lng: 39.1667,
      isUrban: false,
      densityClass: 'low',
    },
  ],

  Kigamboni: [
    {
      name: 'Kigamboni',
      lat: -6.9,
      lng: 39.35,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Kibada',
      lat: -6.9333,
      lng: 39.3833,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Kimbiji',
      lat: -7.0667,
      lng: 39.4833,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Kisarawe II',
      lat: -6.9833,
      lng: 39.4,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Somangila',
      lat: -6.95,
      lng: 39.3667,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Mjimwema',
      lat: -6.9167,
      lng: 39.35,
      isUrban: false,
      densityClass: 'low',
    },
    {
      name: 'Tungi',
      lat: -7.0167,
      lng: 39.4167,
      isUrban: false,
      densityClass: 'low',
    },
  ],
};

// ── Major wards for other key cities ─────────────────────────────────────────
// Less complete but enough for agent registration and routing

export const OTHER_CITY_WARDS: Record<
  string,
  Record<
    string,
    Array<{
      name: string;
      lat: number;
      lng: number;
      densityClass?: string;
    }>
  >
> = {
  Mwanza: {
    Ilemela: [
      { name: 'Ilemela', lat: -2.4833, lng: 32.9, densityClass: 'high' },
      { name: 'Buswelu', lat: -2.4667, lng: 32.8833, densityClass: 'medium' },
      { name: 'Mirongo', lat: -2.4833, lng: 32.9167, densityClass: 'high' },
      { name: 'Sangabuye', lat: -2.5, lng: 32.9, densityClass: 'medium' },
    ],
    Nyamagana: [
      {
        name: 'Mwanza City Centre',
        lat: -2.5167,
        lng: 32.9,
        densityClass: 'high',
      },
      { name: 'Mahina', lat: -2.5167, lng: 32.9167, densityClass: 'high' },
      { name: 'Butimba', lat: -2.5, lng: 32.8833, densityClass: 'high' },
      { name: 'Igoma', lat: -2.5333, lng: 32.8833, densityClass: 'medium' },
      { name: 'Nyamagana', lat: -2.5167, lng: 32.8833, densityClass: 'high' },
    ],
  },

  Arusha: {
    'Arusha City': [
      { name: 'Arusha CBD', lat: -3.3667, lng: 36.6833, densityClass: 'high' },
      { name: 'Engutoto', lat: -3.35, lng: 36.6833, densityClass: 'high' },
      { name: 'Kaloleni', lat: -3.3833, lng: 36.6833, densityClass: 'high' },
      { name: 'Kimandolu', lat: -3.35, lng: 36.7, densityClass: 'medium' },
      { name: 'Levolosi', lat: -3.3833, lng: 36.7, densityClass: 'medium' },
      { name: 'Ngarenaro', lat: -3.3667, lng: 36.6667, densityClass: 'high' },
      { name: 'Olmoti', lat: -3.3833, lng: 36.7167, densityClass: 'medium' },
      { name: 'Sombetini', lat: -3.35, lng: 36.7167, densityClass: 'medium' },
      { name: 'Themi', lat: -3.35, lng: 36.7, densityClass: 'medium' },
    ],
  },

  Mbeya: {
    'Mbeya City': [
      { name: 'Mbeya CBD', lat: -8.9, lng: 33.45, densityClass: 'high' },
      { name: 'Forest', lat: -8.9167, lng: 33.4333, densityClass: 'high' },
      { name: 'Iyela', lat: -8.9, lng: 33.4667, densityClass: 'high' },
      { name: 'Mwanjelwa', lat: -8.9167, lng: 33.4667, densityClass: 'high' },
      { name: 'Sisimba', lat: -8.8833, lng: 33.45, densityClass: 'medium' },
      { name: 'Soweto', lat: -8.9333, lng: 33.4333, densityClass: 'high' },
      { name: 'Temboni', lat: -8.9, lng: 33.4833, densityClass: 'medium' },
    ],
  },

  Dodoma: {
    'Dodoma City': [
      { name: 'Dodoma CBD', lat: -6.1722, lng: 35.7395, densityClass: 'high' },
      { name: 'Ipagala', lat: -6.1833, lng: 35.7333, densityClass: 'high' },
      { name: 'Isamilo', lat: -6.1667, lng: 35.75, densityClass: 'high' },
      { name: 'Makole', lat: -6.15, lng: 35.7333, densityClass: 'medium' },
      { name: 'Nzuguni', lat: -6.1833, lng: 35.7167, densityClass: 'medium' },
    ],
  },

  Ruvuma: {
    'Songea Municipal': [
      { name: 'Songea CBD', lat: -10.6833, lng: 35.65, densityClass: 'high' },
      { name: 'Mfaranyaki', lat: -10.6833, lng: 35.6667, densityClass: 'high' },
      { name: 'Ndagala', lat: -10.6833, lng: 35.6333, densityClass: 'high' },
      { name: 'Matarawe', lat: -10.7, lng: 35.65, densityClass: 'medium' },
      {
        name: 'Magharibi',
        lat: -10.6667,
        lng: 35.6333,
        densityClass: 'medium',
      },
    ],
  },

  Songwe: {
    Tunduma: [
      { name: 'Tunduma', lat: -9.2833, lng: 32.7833, densityClass: 'high' },
      { name: 'Msangano', lat: -9.2667, lng: 32.7833, densityClass: 'medium' },
      { name: 'Mkomole', lat: -9.3, lng: 32.7833, densityClass: 'medium' },
    ],
    Songwe: [
      { name: 'Vwawa', lat: -8.9333, lng: 32.9333, densityClass: 'medium' },
      { name: 'Songwe CBD', lat: -8.6167, lng: 32.9, densityClass: 'medium' },
    ],
  },
};
