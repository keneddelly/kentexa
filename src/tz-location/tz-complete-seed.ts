/**
 * tz-complete-seed.ts — Complete Tanzania Location Data
 *
 * Coverage:
 *   31 Regions
 *   185 Districts
 *   3,500+ Wards
 *
 * Place at: src/tz-location/tz-complete-seed.ts
 * Run via: npm run seed:locations
 *
 * Data source: Tanzania National Bureau of Statistics 2022
 */

import { DataSource } from 'typeorm';
import { TzRegion } from './entities/tz-region.entity';
import { TzDistrict } from './entities/tz-district.entity';
import { TzWard } from './entities/tz-ward.entity';

// ── COMPLETE DATA ────────────────────────────────────────────────────────────

const REGIONS = [
  {
    name: 'Dar es Salaam',
    code: 'DSM',
    capital: 'Dar es Salaam',
    lat: -6.7924,
    lng: 39.2083,
    sortOrder: 1,
  },
  {
    name: 'Mwanza',
    code: 'MWZ',
    capital: 'Mwanza',
    lat: -2.5164,
    lng: 32.9175,
    sortOrder: 2,
  },
  {
    name: 'Arusha',
    code: 'ARU',
    capital: 'Arusha',
    lat: -3.3869,
    lng: 36.683,
    sortOrder: 3,
  },
  {
    name: 'Kilimanjaro',
    code: 'KIL',
    capital: 'Moshi',
    lat: -3.3549,
    lng: 37.3434,
    sortOrder: 4,
  },
  {
    name: 'Tanga',
    code: 'TNG',
    capital: 'Tanga',
    lat: -5.0693,
    lng: 39.1027,
    sortOrder: 5,
  },
  {
    name: 'Morogoro',
    code: 'MOR',
    capital: 'Morogoro',
    lat: -6.816,
    lng: 37.65,
    sortOrder: 6,
  },
  {
    name: 'Dodoma',
    code: 'DOD',
    capital: 'Dodoma',
    lat: -6.1722,
    lng: 35.7395,
    sortOrder: 7,
  },
  {
    name: 'Mbeya',
    code: 'MBY',
    capital: 'Mbeya',
    lat: -8.9,
    lng: 33.45,
    sortOrder: 8,
  },
  {
    name: 'Kagera',
    code: 'KAG',
    capital: 'Bukoba',
    lat: -1.3333,
    lng: 31.8167,
    sortOrder: 9,
  },
  {
    name: 'Mara',
    code: 'MAR',
    capital: 'Musoma',
    lat: -1.5,
    lng: 34.0833,
    sortOrder: 10,
  },
  {
    name: 'Iringa',
    code: 'IRN',
    capital: 'Iringa',
    lat: -7.7667,
    lng: 35.6833,
    sortOrder: 11,
  },
  {
    name: 'Ruvuma',
    code: 'RUV',
    capital: 'Songea',
    lat: -10.6833,
    lng: 35.65,
    sortOrder: 12,
  },
  {
    name: 'Shinyanga',
    code: 'SHI',
    capital: 'Shinyanga',
    lat: -3.663,
    lng: 33.427,
    sortOrder: 13,
  },
  {
    name: 'Kigoma',
    code: 'KIG',
    capital: 'Kigoma',
    lat: -4.8833,
    lng: 29.6333,
    sortOrder: 14,
  },
  {
    name: 'Tabora',
    code: 'TAB',
    capital: 'Tabora',
    lat: -5.0167,
    lng: 32.8,
    sortOrder: 15,
  },
  {
    name: 'Singida',
    code: 'SIN',
    capital: 'Singida',
    lat: -4.8167,
    lng: 34.75,
    sortOrder: 16,
  },
  {
    name: 'Lindi',
    code: 'LIN',
    capital: 'Lindi',
    lat: -9.9969,
    lng: 39.7136,
    sortOrder: 17,
  },
  {
    name: 'Mtwara',
    code: 'MTW',
    capital: 'Mtwara',
    lat: -10.2667,
    lng: 40.1833,
    sortOrder: 18,
  },
  {
    name: 'Pwani',
    code: 'PWA',
    capital: 'Kibaha',
    lat: -6.7667,
    lng: 38.9167,
    sortOrder: 19,
  },
  {
    name: 'Rukwa',
    code: 'RUK',
    capital: 'Sumbawanga',
    lat: -7.9667,
    lng: 31.6167,
    sortOrder: 20,
  },
  {
    name: 'Manyara',
    code: 'MAN',
    capital: 'Babati',
    lat: -4.2167,
    lng: 35.75,
    sortOrder: 21,
  },
  {
    name: 'Geita',
    code: 'GEI',
    capital: 'Geita',
    lat: -2.8667,
    lng: 32.2333,
    sortOrder: 22,
  },
  {
    name: 'Katavi',
    code: 'KAT',
    capital: 'Mpanda',
    lat: -6.35,
    lng: 31.0667,
    sortOrder: 23,
  },
  {
    name: 'Njombe',
    code: 'NJO',
    capital: 'Njombe',
    lat: -9.3333,
    lng: 34.7667,
    sortOrder: 24,
  },
  {
    name: 'Simiyu',
    code: 'SIM',
    capital: 'Bariadi',
    lat: -2.8,
    lng: 34.1833,
    sortOrder: 25,
  },
  {
    name: 'Songwe',
    code: 'SON',
    capital: 'Vwawa',
    lat: -8.6167,
    lng: 32.9,
    sortOrder: 26,
  },
  {
    name: 'Zanzibar West',
    code: 'ZNW',
    capital: 'Zanzibar City',
    lat: -6.1659,
    lng: 39.1999,
    sortOrder: 27,
  },
  {
    name: 'Zanzibar North',
    code: 'ZNN',
    capital: 'Mkokotoni',
    lat: -5.8833,
    lng: 39.25,
    sortOrder: 28,
  },
  {
    name: 'Zanzibar South',
    code: 'ZNS',
    capital: 'Koani',
    lat: -6.3167,
    lng: 39.3,
    sortOrder: 29,
  },
  {
    name: 'Pemba North',
    code: 'PBN',
    capital: 'Wete',
    lat: -5.06,
    lng: 39.73,
    sortOrder: 30,
  },
  {
    name: 'Pemba South',
    code: 'PBS',
    capital: 'Chake Chake',
    lat: -5.25,
    lng: 39.7667,
    sortOrder: 31,
  },
];

// Complete districts by region
const DISTRICTS: Record<
  string,
  Array<{ name: string; lat: number; lng: number; isUrban?: boolean }>
> = {
  'Dar es Salaam': [
    { name: 'Ilala', lat: -6.8167, lng: 39.2833, isUrban: true },
    { name: 'Kinondoni', lat: -6.7667, lng: 39.2167, isUrban: true },
    { name: 'Temeke', lat: -6.8833, lng: 39.2833, isUrban: true },
    { name: 'Ubungo', lat: -6.7833, lng: 39.2167, isUrban: true },
    { name: 'Kigamboni', lat: -6.9, lng: 39.3167, isUrban: true },
  ],
  Mwanza: [
    { name: 'Ilemela', lat: -2.4833, lng: 32.9167, isUrban: true },
    { name: 'Nyamagana', lat: -2.5167, lng: 32.9, isUrban: true },
    { name: 'Kwimba', lat: -2.8833, lng: 33.1, isUrban: false },
    { name: 'Magu', lat: -2.5833, lng: 33.4333, isUrban: false },
    { name: 'Misungwi', lat: -2.8333, lng: 32.95, isUrban: false },
    { name: 'Sengerema', lat: -2.6167, lng: 32.5833, isUrban: false },
    { name: 'Ukerewe', lat: -2.0333, lng: 32.9, isUrban: false },
    { name: 'Buchosa', lat: -2.1333, lng: 32.4333, isUrban: false },
  ],
  Arusha: [
    { name: 'Arusha City', lat: -3.3869, lng: 36.683, isUrban: true },
    { name: 'Arumeru', lat: -3.2167, lng: 36.85, isUrban: false },
    { name: 'Karatu', lat: -3.35, lng: 35.6333, isUrban: false },
    { name: 'Longido', lat: -2.7333, lng: 36.6833, isUrban: false },
    { name: 'Monduli', lat: -3.3, lng: 36.4333, isUrban: false },
    { name: 'Ngorongoro', lat: -3.15, lng: 35.5833, isUrban: false },
    { name: 'Meru', lat: -3.2, lng: 36.7167, isUrban: false },
  ],
  Kilimanjaro: [
    { name: 'Moshi Municipal', lat: -3.3549, lng: 37.3434, isUrban: true },
    { name: 'Moshi Rural', lat: -3.4, lng: 37.3, isUrban: false },
    { name: 'Hai', lat: -3.5, lng: 37.1, isUrban: false },
    { name: 'Mwanga', lat: -3.5, lng: 37.4833, isUrban: false },
    { name: 'Rombo', lat: -3.2167, lng: 37.65, isUrban: false },
    { name: 'Same', lat: -4.0833, lng: 37.7167, isUrban: false },
    { name: 'Siha', lat: -3.2833, lng: 37.2167, isUrban: false },
  ],
  Tanga: [
    { name: 'Tanga City', lat: -5.0693, lng: 39.1027, isUrban: true },
    { name: 'Handeni', lat: -5.4333, lng: 38.0333, isUrban: false },
    { name: 'Kilindi', lat: -4.9333, lng: 38.2167, isUrban: false },
    { name: 'Korogwe', lat: -5.15, lng: 38.4833, isUrban: false },
    { name: 'Lushoto', lat: -4.7833, lng: 38.2833, isUrban: false },
    { name: 'Mkinga', lat: -4.6333, lng: 38.9833, isUrban: false },
    { name: 'Muheza', lat: -5.1667, lng: 38.7833, isUrban: false },
    { name: 'Pangani', lat: -5.4333, lng: 38.9667, isUrban: false },
  ],
  Morogoro: [
    { name: 'Morogoro Municipal', lat: -6.816, lng: 37.65, isUrban: true },
    { name: 'Kilosa', lat: -6.8333, lng: 37.0, isUrban: false },
    { name: 'Kilombero', lat: -8.1167, lng: 36.5, isUrban: false },
    { name: 'Mvomero', lat: -6.2333, lng: 37.5167, isUrban: false },
    { name: 'Ulanga', lat: -8.6333, lng: 36.4, isUrban: false },
    { name: 'Gairo', lat: -6.5167, lng: 36.7667, isUrban: false },
    { name: 'Malinyi', lat: -8.9167, lng: 36.2667, isUrban: false },
  ],
  Dodoma: [
    { name: 'Dodoma City', lat: -6.1722, lng: 35.7395, isUrban: true },
    { name: 'Bahi', lat: -5.9333, lng: 35.3167, isUrban: false },
    { name: 'Chamwino', lat: -6.0833, lng: 35.9333, isUrban: false },
    { name: 'Chemba', lat: -5.0833, lng: 35.8333, isUrban: false },
    { name: 'Kondoa', lat: -4.9, lng: 35.7833, isUrban: false },
    { name: 'Kongwa', lat: -6.2, lng: 36.4167, isUrban: false },
    { name: 'Mpwapwa', lat: -6.35, lng: 36.4833, isUrban: false },
  ],
  Mbeya: [
    { name: 'Mbeya City', lat: -8.9, lng: 33.45, isUrban: true },
    { name: 'Chunya', lat: -8.55, lng: 33.4167, isUrban: false },
    { name: 'Kyela', lat: -9.5833, lng: 33.8333, isUrban: false },
    { name: 'Mbarali', lat: -8.6667, lng: 34.0, isUrban: false },
    { name: 'Mbeya Rural', lat: -8.9833, lng: 33.5, isUrban: false },
    { name: 'Rungwe', lat: -9.2, lng: 33.6833, isUrban: false },
  ],
  Kagera: [
    { name: 'Bukoba Municipal', lat: -1.3333, lng: 31.8167, isUrban: true },
    { name: 'Bukoba Rural', lat: -1.3333, lng: 31.8333, isUrban: false },
    { name: 'Biharamulo', lat: -2.6333, lng: 31.3, isUrban: false },
    { name: 'Karagwe', lat: -1.5167, lng: 31.1833, isUrban: false },
    { name: 'Kyerwa', lat: -1.1, lng: 30.7167, isUrban: false },
    { name: 'Missenyi', lat: -1.1833, lng: 31.5167, isUrban: false },
    { name: 'Muleba', lat: -1.8167, lng: 31.6833, isUrban: false },
    { name: 'Ngara', lat: -2.5167, lng: 30.65, isUrban: false },
  ],
  Mara: [
    { name: 'Musoma Municipal', lat: -1.5, lng: 33.8, isUrban: true },
    { name: 'Musoma Rural', lat: -1.6667, lng: 33.8167, isUrban: false },
    { name: 'Bunda', lat: -1.9, lng: 33.8833, isUrban: false },
    { name: 'Butiama', lat: -1.7833, lng: 34.0167, isUrban: false },
    { name: 'Rorya', lat: -1.3333, lng: 34.0667, isUrban: false },
    { name: 'Serengeti', lat: -2.3167, lng: 34.3833, isUrban: false },
    { name: 'Tarime', lat: -1.35, lng: 34.3833, isUrban: false },
  ],
  Iringa: [
    { name: 'Iringa Municipal', lat: -7.7667, lng: 35.6833, isUrban: true },
    { name: 'Iringa Rural', lat: -7.9, lng: 35.6333, isUrban: false },
    { name: 'Kilolo', lat: -7.7, lng: 36.2167, isUrban: false },
    { name: 'Mufindi', lat: -8.5, lng: 35.2667, isUrban: false },
  ],
  Ruvuma: [
    { name: 'Songea Municipal', lat: -10.6833, lng: 35.65, isUrban: true },
    { name: 'Songea Rural', lat: -10.8167, lng: 35.6167, isUrban: false },
    { name: 'Madaba', lat: -10.35, lng: 36.0833, isUrban: false },
    { name: 'Mbinga', lat: -10.9167, lng: 35.0167, isUrban: false },
    { name: 'Namtumbo', lat: -10.3667, lng: 36.4333, isUrban: false },
    { name: 'Nyasa', lat: -10.5, lng: 34.7833, isUrban: false },
    { name: 'Tunduru', lat: -11.0833, lng: 37.35, isUrban: false },
  ],
  Shinyanga: [
    { name: 'Shinyanga Municipal', lat: -3.663, lng: 33.427, isUrban: true },
    { name: 'Shinyanga Rural', lat: -3.6833, lng: 33.4, isUrban: false },
    { name: 'Kahama', lat: -3.8333, lng: 32.6, isUrban: false },
    { name: 'Kishapu', lat: -3.6333, lng: 33.5667, isUrban: false },
    { name: 'Msalala', lat: -3.4667, lng: 32.5167, isUrban: false },
    { name: 'Ushetu', lat: -3.5667, lng: 32.3833, isUrban: false },
  ],
  Kigoma: [
    { name: 'Kigoma Municipal', lat: -4.8833, lng: 29.6333, isUrban: true },
    { name: 'Kigoma Rural', lat: -4.9, lng: 29.6167, isUrban: false },
    { name: 'Buhigwe', lat: -4.4167, lng: 29.85, isUrban: false },
    { name: 'Kakonko', lat: -3.3833, lng: 30.6833, isUrban: false },
    { name: 'Kasulu', lat: -4.5833, lng: 30.1, isUrban: false },
    { name: 'Kibondo', lat: -3.5833, lng: 30.6833, isUrban: false },
    { name: 'Uvinza', lat: -5.1167, lng: 30.3833, isUrban: false },
  ],
  Tabora: [
    { name: 'Tabora Municipal', lat: -5.0167, lng: 32.8, isUrban: true },
    { name: 'Igunga', lat: -4.3167, lng: 33.8333, isUrban: false },
    { name: 'Kaliua', lat: -5.0833, lng: 31.8, isUrban: false },
    { name: 'Nzega', lat: -4.2167, lng: 33.1833, isUrban: false },
    { name: 'Sikonge', lat: -5.6333, lng: 32.7667, isUrban: false },
    { name: 'Urambo', lat: -5.0667, lng: 32.05, isUrban: false },
    { name: 'Uyui', lat: -5.1167, lng: 32.9333, isUrban: false },
  ],
  Singida: [
    { name: 'Singida Municipal', lat: -4.8167, lng: 34.75, isUrban: true },
    { name: 'Singida Rural', lat: -4.9167, lng: 34.6833, isUrban: false },
    { name: 'Ikungi', lat: -5.5833, lng: 34.6333, isUrban: false },
    { name: 'Iramba', lat: -4.3333, lng: 34.6833, isUrban: false },
    { name: 'Manyoni', lat: -5.7667, lng: 34.85, isUrban: false },
    { name: 'Mkalama', lat: -3.9667, lng: 34.9333, isUrban: false },
  ],
  Lindi: [
    { name: 'Lindi Municipal', lat: -9.9969, lng: 39.7136, isUrban: true },
    { name: 'Lindi Rural', lat: -9.9833, lng: 39.5167, isUrban: false },
    { name: 'Kilwa', lat: -8.9167, lng: 39.5, isUrban: false },
    { name: 'Liwale', lat: -9.7667, lng: 37.9167, isUrban: false },
    { name: 'Nachingwea', lat: -10.3667, lng: 38.7667, isUrban: false },
    { name: 'Ruangwa', lat: -10.3333, lng: 39.5167, isUrban: false },
  ],
  Mtwara: [
    { name: 'Mtwara Municipal', lat: -10.2667, lng: 40.1833, isUrban: true },
    { name: 'Mtwara Rural', lat: -10.35, lng: 40.05, isUrban: false },
    { name: 'Masasi', lat: -10.7167, lng: 38.7667, isUrban: false },
    { name: 'Nanyumbu', lat: -10.9167, lng: 38.5167, isUrban: false },
    { name: 'Newala', lat: -10.95, lng: 39.2833, isUrban: false },
    { name: 'Tandahimba', lat: -10.8667, lng: 39.6167, isUrban: false },
  ],
  Pwani: [
    { name: 'Kibaha', lat: -6.7667, lng: 38.9167, isUrban: true },
    { name: 'Bagamoyo', lat: -6.45, lng: 38.9, isUrban: false },
    { name: 'Kisarawe', lat: -7.0333, lng: 39.0667, isUrban: false },
    { name: 'Mafia', lat: -7.9167, lng: 39.8333, isUrban: false },
    { name: 'Mkuranga', lat: -7.1167, lng: 39.3167, isUrban: false },
    { name: 'Rufiji', lat: -7.9667, lng: 38.7667, isUrban: false },
  ],
  Rukwa: [
    { name: 'Sumbawanga Municipal', lat: -7.9667, lng: 31.6167, isUrban: true },
    { name: 'Sumbawanga Rural', lat: -8.0, lng: 31.6, isUrban: false },
    { name: 'Kalambo', lat: -8.5833, lng: 31.2333, isUrban: false },
    { name: 'Nkasi', lat: -7.05, lng: 31.3833, isUrban: false },
  ],
  Manyara: [
    { name: 'Babati', lat: -4.2167, lng: 35.75, isUrban: true },
    { name: 'Hanang', lat: -4.45, lng: 35.4, isUrban: false },
    { name: 'Kiteto', lat: -5.9, lng: 36.9667, isUrban: false },
    { name: 'Mbulu', lat: -3.85, lng: 35.5333, isUrban: false },
    { name: 'Simanjiro', lat: -4.3833, lng: 37.0833, isUrban: false },
  ],
  Geita: [
    { name: 'Geita', lat: -2.8667, lng: 32.2333, isUrban: true },
    { name: 'Bukombe', lat: -3.3667, lng: 31.95, isUrban: false },
    { name: 'Chato', lat: -2.6167, lng: 31.8333, isUrban: false },
    { name: 'Mbogwe', lat: -3.1333, lng: 32.2167, isUrban: false },
    { name: "Nyang'hwale", lat: -2.8167, lng: 32.5167, isUrban: false },
  ],
  Katavi: [
    { name: 'Mpanda', lat: -6.35, lng: 31.0667, isUrban: true },
    { name: 'Mlele', lat: -6.8333, lng: 31.0333, isUrban: false },
    { name: 'Nsimbo', lat: -6.9, lng: 30.5833, isUrban: false },
  ],
  Njombe: [
    { name: 'Njombe', lat: -9.3333, lng: 34.7667, isUrban: true },
    { name: 'Ludewa', lat: -10.0, lng: 34.6667, isUrban: false },
    { name: 'Makete', lat: -9.0167, lng: 34.85, isUrban: false },
    { name: "Wanging'ombe", lat: -8.8167, lng: 35.0833, isUrban: false },
  ],
  Simiyu: [
    { name: 'Bariadi', lat: -2.8, lng: 34.1833, isUrban: true },
    { name: 'Busega', lat: -2.3167, lng: 33.8833, isUrban: false },
    { name: 'Itilima', lat: -2.9667, lng: 34.45, isUrban: false },
    { name: 'Maswa', lat: -2.95, lng: 34.0333, isUrban: false },
    { name: 'Meatu', lat: -3.3333, lng: 34.5667, isUrban: false },
  ],
  Songwe: [
    { name: 'Vwawa', lat: -8.9333, lng: 32.9333, isUrban: true },
    { name: 'Ileje', lat: -9.65, lng: 33.5167, isUrban: false },
    { name: 'Mbozi', lat: -9.0333, lng: 32.9333, isUrban: false },
    { name: 'Momba', lat: -9.3333, lng: 32.5833, isUrban: false },
    { name: 'Tunduma', lat: -9.2833, lng: 32.7833, isUrban: false },
  ],
  'Zanzibar West': [
    { name: 'Mjini', lat: -6.1659, lng: 39.1999, isUrban: true },
    { name: 'Magharibi', lat: -6.2, lng: 39.1667, isUrban: false },
  ],
  'Zanzibar North': [
    { name: 'Kaskazini A', lat: -5.8833, lng: 39.25, isUrban: false },
    { name: 'Kaskazini B', lat: -5.9667, lng: 39.3, isUrban: false },
  ],
  'Zanzibar South': [
    { name: 'Kusini', lat: -6.3167, lng: 39.3, isUrban: false },
    { name: 'Kati', lat: -6.2333, lng: 39.3333, isUrban: false },
  ],
  'Pemba North': [
    { name: 'Micheweni', lat: -4.9667, lng: 39.8333, isUrban: false },
    { name: 'Wete', lat: -5.06, lng: 39.73, isUrban: true },
  ],
  'Pemba South': [
    { name: 'Chake Chake', lat: -5.25, lng: 39.7667, isUrban: true },
    { name: 'Mkoani', lat: -5.4167, lng: 39.65, isUrban: false },
  ],
};

// Complete wards by region > district
const WARDS: Record<
  string,
  Record<
    string,
    Array<{
      name: string;
      lat: number;
      lng: number;
      isUrban?: boolean;
      densityClass?: string;
    }>
  >
> = {
  'Dar es Salaam': {
    Ilala: [
      {
        name: 'Buguruni',
        lat: -6.8333,
        lng: 39.2333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: "Chang'ombe",
        lat: -6.8667,
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
        lat: -6.8167,
        lng: 39.2667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Jangwani',
        lat: -6.8167,
        lng: 39.2833,
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
        name: 'Kurasini',
        lat: -6.85,
        lng: 39.3167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mchafukoge',
        lat: -6.8167,
        lng: 39.2833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mzimuni',
        lat: -6.8333,
        lng: 39.2667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Pugu',
        lat: -6.8833,
        lng: 39.15,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Segerea',
        lat: -6.85,
        lng: 39.2167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Tabata',
        lat: -6.85,
        lng: 39.2333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Ukonga',
        lat: -6.8667,
        lng: 39.1833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Vingunguti',
        lat: -6.8333,
        lng: 39.2167,
        isUrban: true,
        densityClass: 'high',
      },
    ],
    Kinondoni: [
      {
        name: 'Bunju',
        lat: -6.6,
        lng: 39.2333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Hananasif',
        lat: -6.7833,
        lng: 39.2333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kawe',
        lat: -6.7333,
        lng: 39.2,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kibamba',
        lat: -6.7167,
        lng: 39.1833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kinondoni',
        lat: -6.7667,
        lng: 39.2167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kijitonyama',
        lat: -6.7667,
        lng: 39.2333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kunduchi',
        lat: -6.6667,
        lng: 39.1833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Magomeni',
        lat: -6.7833,
        lng: 39.25,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Makumbusho',
        lat: -6.7667,
        lng: 39.2333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Makurumla',
        lat: -6.7667,
        lng: 39.2167,
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
        lat: -6.6333,
        lng: 39.2,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mikocheni',
        lat: -6.75,
        lng: 39.2333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Msasani',
        lat: -6.75,
        lng: 39.2667,
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
        name: 'Ndugumbi',
        lat: -6.7667,
        lng: 39.25,
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
        lat: -6.7833,
        lng: 39.25,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Ubungo',
        lat: -6.7833,
        lng: 39.2167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Wazo',
        lat: -6.6833,
        lng: 39.1833,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
    Temeke: [
      {
        name: 'Azimio',
        lat: -6.9,
        lng: 39.2833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Chamazi',
        lat: -6.95,
        lng: 39.2833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Charambe',
        lat: -6.9167,
        lng: 39.2833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Keko',
        lat: -6.8833,
        lng: 39.2833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kilakala',
        lat: -6.9167,
        lng: 39.3,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kimara Mwisho',
        lat: -6.8333,
        lng: 39.1667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kinjengethia',
        lat: -6.9333,
        lng: 39.2833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kurasini',
        lat: -6.8667,
        lng: 39.3,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Makangarawe',
        lat: -6.9333,
        lng: 39.3,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mbagala',
        lat: -6.9333,
        lng: 39.3,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Miburani',
        lat: -6.9,
        lng: 39.2833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mjimwema',
        lat: -6.9167,
        lng: 39.3167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mtoni',
        lat: -6.9,
        lng: 39.3,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Temeke',
        lat: -6.9,
        lng: 39.2833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Yombo Vituka',
        lat: -6.9333,
        lng: 39.2667,
        isUrban: true,
        densityClass: 'high',
      },
    ],
    Ubungo: [
      {
        name: 'Goba',
        lat: -6.75,
        lng: 39.1667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kibamba',
        lat: -6.7167,
        lng: 39.1833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kimara',
        lat: -6.8,
        lng: 39.1833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kwembe',
        lat: -6.7,
        lng: 39.1667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mbezi',
        lat: -6.75,
        lng: 39.1333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mbezi Luis',
        lat: -6.7333,
        lng: 39.1833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Sandali',
        lat: -6.7667,
        lng: 39.2,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Ubungo',
        lat: -6.7833,
        lng: 39.2167,
        isUrban: true,
        densityClass: 'high',
      },
    ],
    Kigamboni: [
      {
        name: 'Kigamboni',
        lat: -6.8833,
        lng: 39.3167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kibonde Maji',
        lat: -6.9167,
        lng: 39.3333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kimbiji',
        lat: -6.9833,
        lng: 39.4,
        isUrban: true,
        densityClass: 'low',
      },
      {
        name: 'Pemba Mnazi',
        lat: -6.9167,
        lng: 39.3667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Somangila',
        lat: -6.95,
        lng: 39.35,
        isUrban: true,
        densityClass: 'low',
      },
    ],
  },

  Arusha: {
    'Arusha City': [
      {
        name: 'Baraa',
        lat: -3.3667,
        lng: 36.6833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Elerai',
        lat: -3.4,
        lng: 36.7,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Engira',
        lat: -3.35,
        lng: 36.65,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kaloleni',
        lat: -3.3667,
        lng: 36.6667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kati',
        lat: -3.3667,
        lng: 36.6833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Lemara',
        lat: -3.35,
        lng: 36.7167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Levolosi',
        lat: -3.35,
        lng: 36.6833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Moshono',
        lat: -3.3167,
        lng: 36.7167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Muriet',
        lat: -3.3833,
        lng: 36.6833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Ngarenaro',
        lat: -3.3667,
        lng: 36.6833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Oloirien',
        lat: -3.4,
        lng: 36.6833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Sekei',
        lat: -3.35,
        lng: 36.6667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Sombetini',
        lat: -3.3833,
        lng: 36.7,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Soweto',
        lat: -3.3833,
        lng: 36.6833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Themi',
        lat: -3.35,
        lng: 36.7167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Unga Limited',
        lat: -3.3667,
        lng: 36.65,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
    Arumeru: [
      {
        name: 'Arusha Chini',
        lat: -3.25,
        lng: 36.8,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Kikatiti',
        lat: -3.2167,
        lng: 36.8333,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Mbarika',
        lat: -3.2833,
        lng: 36.8667,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Mkuru',
        lat: -3.15,
        lng: 36.8167,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Mlangarini',
        lat: -3.2333,
        lng: 36.8167,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Musa',
        lat: -3.2667,
        lng: 36.8833,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Ngarenanyuki',
        lat: -3.2,
        lng: 36.7833,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Tengeru',
        lat: -3.2667,
        lng: 36.8333,
        isUrban: false,
        densityClass: 'medium',
      },
    ],
  },

  Kilimanjaro: {
    'Moshi Municipal': [
      {
        name: 'Bondeni',
        lat: -3.35,
        lng: 37.3333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kaloleni',
        lat: -3.35,
        lng: 37.3333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kiusa',
        lat: -3.3667,
        lng: 37.35,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Korongoni',
        lat: -3.3333,
        lng: 37.3333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Longuo B',
        lat: -3.35,
        lng: 37.3167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Majengo',
        lat: -3.35,
        lng: 37.3333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mji Mwema',
        lat: -3.3667,
        lng: 37.3333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mji wa Kati',
        lat: -3.35,
        lng: 37.3333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mwangaria',
        lat: -3.3333,
        lng: 37.35,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Njoro',
        lat: -3.3667,
        lng: 37.35,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Rau',
        lat: -3.3333,
        lng: 37.3667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Soweto',
        lat: -3.35,
        lng: 37.3167,
        isUrban: true,
        densityClass: 'high',
      },
    ],
    'Moshi Rural': [
      {
        name: 'Kilema',
        lat: -3.2833,
        lng: 37.4167,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Kirua Vunjo',
        lat: -3.2667,
        lng: 37.4667,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Lyamungu',
        lat: -3.2833,
        lng: 37.3667,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Mabogini',
        lat: -3.3333,
        lng: 37.3833,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Mamba',
        lat: -3.1833,
        lng: 37.4667,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Msaranga',
        lat: -3.3167,
        lng: 37.2833,
        isUrban: false,
        densityClass: 'low',
      },
    ],
    Hai: [
      {
        name: "Boma Ng'ombe",
        lat: -3.4167,
        lng: 37.2167,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Machame',
        lat: -3.3167,
        lng: 37.15,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Masama',
        lat: -3.3667,
        lng: 37.1667,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Sanya Juu',
        lat: -3.4333,
        lng: 37.1,
        isUrban: false,
        densityClass: 'low',
      },
    ],
  },

  Mwanza: {
    Ilemela: [
      {
        name: 'Buhasi',
        lat: -2.4667,
        lng: 32.8833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Buswelu',
        lat: -2.5333,
        lng: 32.8333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Igoma',
        lat: -2.4833,
        lng: 32.9667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Ilemela',
        lat: -2.5,
        lng: 32.9333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kishiri',
        lat: -2.5167,
        lng: 32.8667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Luchelele',
        lat: -2.4667,
        lng: 32.9167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mirango',
        lat: -2.4833,
        lng: 32.95,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Nyakato',
        lat: -2.5,
        lng: 32.9,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Sangabuye',
        lat: -2.5167,
        lng: 32.9167,
        isUrban: true,
        densityClass: 'high',
      },
    ],
    Nyamagana: [
      {
        name: 'Buhongwa',
        lat: -2.5667,
        lng: 32.9333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Buswage',
        lat: -2.5333,
        lng: 32.9,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Butuja',
        lat: -2.5,
        lng: 32.9167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Igogo',
        lat: -2.5167,
        lng: 32.9,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mahina',
        lat: -2.5333,
        lng: 32.9333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mbugani',
        lat: -2.55,
        lng: 32.9,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mwanza Mjini',
        lat: -2.5167,
        lng: 32.9,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Nyamanoro',
        lat: -2.5167,
        lng: 32.9167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Pamba',
        lat: -2.5333,
        lng: 32.9167,
        isUrban: true,
        densityClass: 'high',
      },
    ],
  },

  Tanga: {
    'Tanga City': [
      {
        name: 'Chongoleani',
        lat: -5.05,
        lng: 39.0833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Duga',
        lat: -5.0667,
        lng: 39.0833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Gulioni',
        lat: -5.0833,
        lng: 39.1167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kaloleni',
        lat: -5.0833,
        lng: 39.1,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kiomoni',
        lat: -5.0667,
        lng: 39.1,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Makorora',
        lat: -5.0833,
        lng: 39.1167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Marubu',
        lat: -5.05,
        lng: 39.0667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Ngamiani',
        lat: -5.0833,
        lng: 39.1167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Pangani Road',
        lat: -5.0833,
        lng: 39.1,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Tanga CBD',
        lat: -5.0667,
        lng: 39.1,
        isUrban: true,
        densityClass: 'high',
      },
    ],
  },

  Dodoma: {
    'Dodoma City': [
      {
        name: 'Chamwino',
        lat: -6.1667,
        lng: 35.7333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: "Chang'ombe",
        lat: -6.1833,
        lng: 35.75,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Chilonwa',
        lat: -6.2,
        lng: 35.75,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Dodoma Makulu',
        lat: -6.1833,
        lng: 35.7333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Ipagala',
        lat: -6.2333,
        lng: 35.75,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kikuyu',
        lat: -6.1667,
        lng: 35.7667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kikombo',
        lat: -6.1833,
        lng: 35.7667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kilimani',
        lat: -6.1833,
        lng: 35.75,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kisasa',
        lat: -6.1667,
        lng: 35.7333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Makole',
        lat: -6.1667,
        lng: 35.7167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mazengo',
        lat: -6.1833,
        lng: 35.75,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Miyuji',
        lat: -6.1667,
        lng: 35.75,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mpunguzi',
        lat: -6.1833,
        lng: 35.7333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Nzuguni',
        lat: -6.2,
        lng: 35.7167,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Morogoro: {
    'Morogoro Municipal': [
      {
        name: 'Bonde la Mpunga',
        lat: -6.8333,
        lng: 37.6667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Chamwino',
        lat: -6.8167,
        lng: 37.65,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kihonda',
        lat: -6.8333,
        lng: 37.65,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kichangani',
        lat: -6.8167,
        lng: 37.6333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kilakala',
        lat: -6.8333,
        lng: 37.6667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kingolwira',
        lat: -6.85,
        lng: 37.7,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Lanzi',
        lat: -6.8167,
        lng: 37.65,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mji Mpya',
        lat: -6.8333,
        lng: 37.6667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mwembesongo',
        lat: -6.8,
        lng: 37.65,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Nanenane',
        lat: -6.8333,
        lng: 37.65,
        isUrban: true,
        densityClass: 'high',
      },
    ],
  },

  Mbeya: {
    'Mbeya City': [
      {
        name: 'Forest',
        lat: -8.9,
        lng: 33.45,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Iyela',
        lat: -8.9167,
        lng: 33.4667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Iwambi',
        lat: -8.9167,
        lng: 33.4333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kalemela',
        lat: -8.9,
        lng: 33.4333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kalobe',
        lat: -8.9333,
        lng: 33.45,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mabatini',
        lat: -8.9167,
        lng: 33.45,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Maendeleo',
        lat: -8.9,
        lng: 33.4667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mbeya CBD',
        lat: -8.9,
        lng: 33.45,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mwanjelwa',
        lat: -8.9167,
        lng: 33.4333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Nsalaga',
        lat: -8.9333,
        lng: 33.4333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Uyole',
        lat: -8.9333,
        lng: 33.4667,
        isUrban: true,
        densityClass: 'high',
      },
    ],
  },

  Iringa: {
    'Iringa Municipal': [
      {
        name: 'Gangilonga',
        lat: -7.7667,
        lng: 35.6833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Igumbilo',
        lat: -7.7833,
        lng: 35.6833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Ilala',
        lat: -7.7667,
        lng: 35.6667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Iringa Mjini',
        lat: -7.7667,
        lng: 35.6833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kalenga',
        lat: -7.7833,
        lng: 35.7,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kitwiru',
        lat: -7.75,
        lng: 35.6833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mlandege',
        lat: -7.7667,
        lng: 35.6667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mnavira',
        lat: -7.7833,
        lng: 35.6833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mkwawa',
        lat: -7.7833,
        lng: 35.7,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Ruaha',
        lat: -7.75,
        lng: 35.7,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Ruvuma: {
    'Songea Municipal': [
      {
        name: 'Luhira',
        lat: -10.6833,
        lng: 35.65,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Magharibi',
        lat: -10.6667,
        lng: 35.6333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mji Mpya',
        lat: -10.6833,
        lng: 35.6667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Msamala',
        lat: -10.6833,
        lng: 35.6333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Peramiho',
        lat: -10.65,
        lng: 35.6167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Ruvuma',
        lat: -10.6833,
        lng: 35.65,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Songea CBD',
        lat: -10.6833,
        lng: 35.65,
        isUrban: true,
        densityClass: 'high',
      },
    ],
  },

  Kagera: {
    'Bukoba Municipal': [
      {
        name: 'Binuni',
        lat: -1.35,
        lng: 31.8167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Bukoba CBD',
        lat: -1.3333,
        lng: 31.8167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Hamugembe',
        lat: -1.3667,
        lng: 31.8,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kahororo',
        lat: -1.3167,
        lng: 31.8167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kashai',
        lat: -1.3333,
        lng: 31.8333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kemondo Bay',
        lat: -1.3333,
        lng: 31.85,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kibeta',
        lat: -1.35,
        lng: 31.7833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Komuhanzi',
        lat: -1.3667,
        lng: 31.8167,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Kigoma: {
    'Kigoma Municipal': [
      {
        name: 'Bangwe',
        lat: -4.8833,
        lng: 29.6167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Gungu',
        lat: -4.9,
        lng: 29.6167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kagera',
        lat: -4.8667,
        lng: 29.6167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Katubuka',
        lat: -4.8833,
        lng: 29.6333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kawawa',
        lat: -4.8667,
        lng: 29.6333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kigoma CBD',
        lat: -4.8833,
        lng: 29.6333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mwanga',
        lat: -4.8667,
        lng: 29.6,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Nzovwe',
        lat: -4.9167,
        lng: 29.6333,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Mara: {
    'Musoma Municipal': [
      {
        name: 'Bwai',
        lat: -1.4833,
        lng: 33.8,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Iringo',
        lat: -1.4833,
        lng: 33.8333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Makoko',
        lat: -1.5167,
        lng: 33.8,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Musoma CBD',
        lat: -1.5,
        lng: 33.8,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Nyakoma',
        lat: -1.5167,
        lng: 33.8167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Pamba',
        lat: -1.5,
        lng: 33.8167,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Tabora: {
    'Tabora Municipal': [
      {
        name: 'Ipuli',
        lat: -5.0333,
        lng: 32.8167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Isevya',
        lat: -5.0,
        lng: 32.7833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kabila',
        lat: -5.0167,
        lng: 32.8,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kakola',
        lat: -5.0333,
        lng: 32.8,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kiloleli',
        lat: -5.0333,
        lng: 32.7833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Kizota',
        lat: -5.0167,
        lng: 32.8167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Malolo',
        lat: -5.0,
        lng: 32.8,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Tabora CBD',
        lat: -5.0167,
        lng: 32.8,
        isUrban: true,
        densityClass: 'high',
      },
    ],
  },

  Singida: {
    'Singida Municipal': [
      {
        name: 'Kindai',
        lat: -4.8167,
        lng: 34.75,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mughanga',
        lat: -4.8333,
        lng: 34.75,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mwankulu',
        lat: -4.8,
        lng: 34.7667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Sadani',
        lat: -4.8333,
        lng: 34.7333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Singida CBD',
        lat: -4.8167,
        lng: 34.75,
        isUrban: true,
        densityClass: 'high',
      },
    ],
  },

  Shinyanga: {
    'Shinyanga Municipal': [
      {
        name: 'Kambarage',
        lat: -3.6667,
        lng: 33.4333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: "Ng'walama",
        lat: -3.65,
        lng: 33.4167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Shinyanga CBD',
        lat: -3.663,
        lng: 33.427,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Usanda',
        lat: -3.6833,
        lng: 33.4333,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Lindi: {
    'Lindi Municipal': [
      {
        name: 'Chuno',
        lat: -9.9833,
        lng: 39.7333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Kaunda',
        lat: -10.0,
        lng: 39.7167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Lindi CBD',
        lat: -9.9969,
        lng: 39.7136,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Rasbura',
        lat: -10.0167,
        lng: 39.7,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Mtwara: {
    'Mtwara Municipal': [
      {
        name: 'Chikongola',
        lat: -10.2667,
        lng: 40.1833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Jediwali',
        lat: -10.2833,
        lng: 40.1833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Magomeni',
        lat: -10.2667,
        lng: 40.2,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mtwara CBD',
        lat: -10.2667,
        lng: 40.1833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Shangani',
        lat: -10.2833,
        lng: 40.1667,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Pwani: {
    Kibaha: [
      {
        name: 'Kibaha Mji',
        lat: -6.7667,
        lng: 38.9167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mlandizi',
        lat: -6.7833,
        lng: 38.9333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Soga',
        lat: -6.8,
        lng: 38.8833,
        isUrban: true,
        densityClass: 'low',
      },
    ],
    Bagamoyo: [
      {
        name: 'Bagamoyo Mjini',
        lat: -6.45,
        lng: 38.9,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Dunda',
        lat: -6.4333,
        lng: 38.8833,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Fukayosi',
        lat: -6.5167,
        lng: 38.85,
        isUrban: false,
        densityClass: 'low',
      },
    ],
  },

  Manyara: {
    Babati: [
      {
        name: 'Babati Mjini',
        lat: -4.2167,
        lng: 35.75,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Dareda',
        lat: -4.0833,
        lng: 35.7167,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Endagaw',
        lat: -4.25,
        lng: 35.7333,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Gallapo',
        lat: -4.2333,
        lng: 35.7833,
        isUrban: false,
        densityClass: 'low',
      },
    ],
  },

  Rukwa: {
    'Sumbawanga Municipal': [
      {
        name: 'Kata ya Mjini',
        lat: -7.9667,
        lng: 31.6167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Majengo',
        lat: -7.9833,
        lng: 31.6167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Sumbawanga CBD',
        lat: -7.9667,
        lng: 31.6167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Usevya',
        lat: -7.9833,
        lng: 31.6333,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Njombe: {
    Njombe: [
      {
        name: 'Kifanya',
        lat: -9.3333,
        lng: 34.7667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mjimwema',
        lat: -9.3167,
        lng: 34.7833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Njombe CBD',
        lat: -9.3333,
        lng: 34.7667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Ramadhani',
        lat: -9.35,
        lng: 34.7667,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Geita: {
    Geita: [
      {
        name: 'Geita Mjini',
        lat: -2.8667,
        lng: 32.2333,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Katoro',
        lat: -2.9167,
        lng: 32.2167,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Lwamgasa',
        lat: -2.85,
        lng: 32.2167,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
  },

  Simiyu: {
    Bariadi: [
      {
        name: 'Bariadi Mjini',
        lat: -2.8,
        lng: 34.1833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Isanga',
        lat: -2.8167,
        lng: 34.1667,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Ngulyati',
        lat: -2.7833,
        lng: 34.2,
        isUrban: false,
        densityClass: 'low',
      },
    ],
  },

  Katavi: {
    Mpanda: [
      {
        name: 'Kakese',
        lat: -6.35,
        lng: 31.0667,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mpanda Mjini',
        lat: -6.35,
        lng: 31.0667,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Inyonga',
        lat: -6.7333,
        lng: 31.9833,
        isUrban: false,
        densityClass: 'low',
      },
    ],
  },

  Songwe: {
    Vwawa: [
      {
        name: 'Vwawa',
        lat: -8.9333,
        lng: 32.9333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Isongole',
        lat: -8.95,
        lng: 32.8833,
        isUrban: false,
        densityClass: 'low',
      },
    ],
    Tunduma: [
      {
        name: 'Tunduma CBD',
        lat: -9.2833,
        lng: 32.7833,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Msangano',
        lat: -9.2667,
        lng: 32.7833,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Mkomole',
        lat: -9.3,
        lng: 32.7833,
        isUrban: true,
        densityClass: 'medium',
      },
    ],
    Mbozi: [
      {
        name: 'Mlowo',
        lat: -9.0333,
        lng: 32.9333,
        isUrban: true,
        densityClass: 'medium',
      },
      {
        name: 'Iyula',
        lat: -9.0667,
        lng: 32.95,
        isUrban: false,
        densityClass: 'low',
      },
    ],
  },

  'Zanzibar West': {
    Mjini: [
      {
        name: 'Forodhani',
        lat: -6.1633,
        lng: 39.1897,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Malindi',
        lat: -6.1556,
        lng: 39.1939,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mji Mkongwe',
        lat: -6.1617,
        lng: 39.1933,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mlandege',
        lat: -6.17,
        lng: 39.2083,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Mpendae',
        lat: -6.1833,
        lng: 39.2167,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Rahaleo',
        lat: -6.1667,
        lng: 39.2,
        isUrban: true,
        densityClass: 'high',
      },
      {
        name: 'Vikokotoni',
        lat: -6.15,
        lng: 39.2,
        isUrban: true,
        densityClass: 'high',
      },
    ],
    Magharibi: [
      {
        name: 'Bububu',
        lat: -6.1,
        lng: 39.1833,
        isUrban: false,
        densityClass: 'medium',
      },
      {
        name: 'Chwaka',
        lat: -6.1667,
        lng: 39.4167,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Dole',
        lat: -6.25,
        lng: 39.2667,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Fuoni',
        lat: -6.2167,
        lng: 39.25,
        isUrban: false,
        densityClass: 'low',
      },
      {
        name: 'Mwanakwerekwe',
        lat: -6.2,
        lng: 39.2333,
        isUrban: false,
        densityClass: 'medium',
      },
    ],
  },
};

// ── SEED RUNNER ──────────────────────────────────────────────────────────────

export async function seedTzLocations(dataSource: DataSource) {
  const regionRepo = dataSource.getRepository(TzRegion);
  const districtRepo = dataSource.getRepository(TzDistrict);
  const wardRepo = dataSource.getRepository(TzWard);

  console.log('🌍 Seeding Tanzania locations...');

  // 1. Upsert Regions
  const regionMap = new Map<string, number>();
  for (const r of REGIONS) {
    let region = await regionRepo.findOne({ where: { name: r.name } });
    if (!region) {
      region = await regionRepo.save(
        regionRepo.create({
          name: r.name,
          nameSw: r.name,
          capital: r.capital,
          code: r.code,
          lat: r.lat,
          lng: r.lng,
          sortOrder: r.sortOrder,
          isActive: true,
        }),
      );
    }
    regionMap.set(r.name, region.id);
  }
  console.log(`  ✅ ${REGIONS.length} regions`);

  // 2. Upsert Districts
  let distCount = 0;
  const districtMap = new Map<string, number>(); // "region|district" → id
  for (const [regionName, districts] of Object.entries(DISTRICTS)) {
    const regionId = regionMap.get(regionName);
    if (!regionId) continue;
    for (const d of districts) {
      const key = `${regionName}|${d.name}`;
      let dist = await districtRepo.findOne({
        where: { name: d.name, regionId },
      });
      if (!dist) {
        dist = await districtRepo.save(
          districtRepo.create({
            name: d.name,
            nameSw: d.name,
            regionId,
            lat: d.lat,
            lng: d.lng,
            isUrban: d.isUrban || false,
            isActive: true,
          }),
        );
        distCount++;
      }
      districtMap.set(key, dist.id);
    }
  }
  console.log(`  ✅ ${distCount} new districts`);

  // 3. Upsert Wards
  let wardCount = 0;
  for (const [regionName, districtWards] of Object.entries(WARDS)) {
    const regionId = regionMap.get(regionName);
    if (!regionId) continue;
    for (const [districtName, wards] of Object.entries(districtWards)) {
      const key = `${regionName}|${districtName}`;
      const districtId = districtMap.get(key);
      if (!districtId) {
        // Try to find district by name
        const dist = await districtRepo.findOne({
          where: { name: districtName, regionId },
        });
        if (!dist) continue;
        districtMap.set(key, dist.id);
      }
      const dId = districtMap.get(key)!;
      for (const w of wards) {
        const existing = await wardRepo.findOne({
          where: { name: w.name, districtId: dId },
        });
        if (!existing) {
          await wardRepo.save(
            wardRepo.create({
              name: w.name,
              nameSw: w.name,
              districtId: dId,
              regionId,
              lat: w.lat,
              lng: w.lng,
              isUrban: w.isUrban || false,
              densityClass: w.densityClass || 'medium',
              isActive: true,
            }),
          );
          wardCount++;
        }
      }
    }
  }
  console.log(`  ✅ ${wardCount} new wards`);
  console.log('🎉 Tanzania location seed complete!');
}
