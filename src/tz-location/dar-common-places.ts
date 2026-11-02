/**
 * Common Dar es Salaam places people actually say (owner 2026-11-02: "some common places
 * are missing in location; add many common places in Dar es Salaam so the engine can be
 * more realistic").
 *
 * The official wards (tz-complete-seed.ts) are too coarse: a customer says "Mwenge",
 * "Posta", "Tabata Relini" or "Kimara Korogwe", not the ward. Each place here:
 *   - becomes searchable in the place picker (a row in tz_ward under its district, added
 *     by migration 1794300000000; the base seed stays the official wards only), and
 *   - belongs to one delivery zone (src/boda-rates/dar-boda-zones.ts reads this list),
 *     so the delivery fee follows it.
 *
 * Coordinates are left empty on purpose: KenteXa does not invent a map point.
 * Generic words are written with their area ("Tabata Bima", not "Bima").
 * Districts follow today's councils (Ubungo split from Kinondoni in 2016).
 */
export type DarDistrict = 'Ilala' | 'Kinondoni' | 'Temeke' | 'Ubungo' | 'Kigamboni';

export interface DarCommonPlace {
  name: string;
  district: DarDistrict;
  /** The delivery zone key (road_ring) in dar-boda-zones.ts. */
  zone: string;
}

const P = (zone: string, district: DarDistrict, names: string[]): DarCommonPlace[] =>
  names.map((name) => ({ name, district, zone }));

export const DAR_COMMON_PLACES: readonly DarCommonPlace[] = Object.freeze([
  // Kati (city centre)
  ...P('kati_0', 'Ilala', [
    'Posta', 'Posta Mpya', 'Posta ya Zamani', 'Upanga', 'Upanga Magharibi', 'Upanga Mashariki', 'Mnazi Mmoja',
    'Fire', 'Msimbazi', 'Kamata', 'Karume', 'Muhimbili', 'Kariakoo Sokoni', 'Ilala Boma', 'Ilala Bungoni',
    'Sharif Shamba', 'Mchikichini', 'Lumumba', 'City Centre', 'Kisutu Sokoni', 'Bandari ya Dar',
  ]),

  // Barabara ya Bagamoyo
  ...P('bagamoyo_1', 'Kinondoni', [
    'Kinondoni Mkwajuni', 'Mkwajuni', 'Biafra', 'Morocco', 'Kinondoni Shamba', 'Kinondoni Moscow',
    'Oysterbay', 'Sea Cliff', 'Coco Beach', 'Slipway', 'Masaki', 'Msasani', 'Namanga', 'Mwananyamala Kisiwani',
  ]),
  ...P('bagamoyo_2', 'Kinondoni', [
    'Mwenge', 'Shoppers Plaza', 'Victoria', 'Kijitonyama', 'Mikocheni A', 'Mikocheni B', 'Kawe', 'Kawe Beach',
    'Lugalo', 'Makongo', 'Makongo Juu', 'Mlalakuwa', 'Survey', 'Rose Garden',
  ]),
  ...P('bagamoyo_3', 'Kinondoni', [
    'Mbezi Beach', 'Africana', 'Tegeta', 'Tegeta Nyuki', 'Tegeta Kibaoni', 'Kunduchi', 'Kunduchi Mtongani',
    'Salasala', 'Wazo', 'Kilongawima', 'Ununio', 'Tangi Bovu', 'Madale', 'Mivumoni',
  ]),
  ...P('bagamoyo_4', 'Kinondoni', ['Bunju', 'Bunju A', 'Bunju B', 'Mbweni', 'Mbweni JKT', 'Boko', 'Boko Magengeni']),

  // Barabara ya Morogoro
  ...P('morogoro_1', 'Kinondoni', ['Magomeni Mapipa', 'Magomeni Mikumi', 'Mwembechai', 'Kigogo', 'Mzimuni', 'Kagera Magomeni']),
  ...P('morogoro_1', 'Ubungo', ['Manzese', 'Manzese Tip Top', 'Tandale', 'Mabibo', 'Mabibo Hostel', 'Mburahati', 'Makurumla']),
  ...P('morogoro_2', 'Ubungo', [
    'Sinza Mori', 'Sinza Kijiweni', 'Sinza Afrikasana', 'Sinza Madukani', 'Shekilango', 'Ubungo Kibo',
    'Ubungo Riverside', 'Ubungo Maji', 'Ubungo Terminal', 'Makuburi', 'Ubungo External', 'Kimara Baruti',
    'Mlimani City', 'Chuo Kikuu', 'Mlimani', 'Changanyikeni',
  ]),
  ...P('morogoro_3', 'Ubungo', [
    'Kimara Korogwe', 'Kimara Stop Over', 'Kimara Temboni', 'Kimara Suka', 'Kimara Bucha', 'Kimara Mwisho',
    'Mbezi Louis', 'Mbezi Mwisho', 'Stendi ya Magufuli', 'Goba', 'Goba Kunguru', 'Saranga', 'Msakuzi',
    'Msigani', 'Malamba Mawili',
  ]),
  ...P('morogoro_4', 'Ubungo', ['Kibamba', 'Kibamba CCM', 'Kiluvya', 'Mpiji', 'Mpiji Magoe', 'Kwembe', 'Luguruni']),

  // Barabara ya Nyerere / Pugu
  ...P('nyerere_1', 'Ilala', [
    'Buguruni', 'Buguruni Rozana', 'Vingunguti', 'Tabata', 'Tabata Relini', 'Tabata Bima', 'Tabata Kimanga',
    'Tabata Mawenzi', 'Kiwalani', 'Mnyamani', 'Karakata', 'Tazara',
  ]),
  ...P('nyerere_2', 'Ilala', [
    'Segerea', 'Tabata Segerea', 'Kipawa', 'Airport', 'Uwanja wa Ndege', 'Ukonga', 'Banana', 'Kisukuru',
    'Liwiti', 'Bonyokwa',
  ]),
  ...P('nyerere_3', 'Ilala', [
    'Kinyerezi', 'Gongo la Mboto', 'Kitunda', 'Kitunda Relini', 'Moshi Bar', 'Majohe', 'Kifuru', 'Mwanagati',
  ]),
  ...P('nyerere_4', 'Ilala', ['Pugu', 'Pugu Kajiungeni', 'Chanika', 'Kivule', 'Msongola', 'Zingiziwa', 'Buyuni']),

  // Barabara ya Kilwa
  ...P('kilwa_1', 'Temeke', [
    'Temeke', 'Temeke Mwisho', "Chang'ombe", 'Keko', 'Keko Juu', 'Kurasini', 'Mivinjeni', 'Miburani',
    'Uwanja wa Taifa', 'Sabasaba', 'Mgulani',
  ]),
  ...P('kilwa_2', 'Temeke', [
    'Mtoni', 'Mtoni Mtongani', 'Mtoni Kijichi', 'Tandika', 'Tandika Mwembeyanga', 'Yombo', 'Yombo Vituka',
    'Yombo Dovya', 'Azimio', 'Sandali', 'Kilakala', 'Makangarawe',
  ]),
  ...P('kilwa_3', 'Temeke', [
    'Mbagala', 'Mbagala Rangi Tatu', 'Rangi Tatu', 'Mbagala Zakhem', 'Zakhem', 'Kijichi', 'Kiburugwa',
    'Charambe', 'Kibonde Maji', 'Buza', 'Kizuiani', 'Maji Matitu',
  ]),
  ...P('kilwa_4', 'Temeke', ['Kongowe', 'Chamazi', 'Mbagala Kuu', 'Mzinga']),

  // Kigamboni
  ...P('kigamboni_1', 'Kigamboni', ['Kigamboni', 'Kigamboni Feri', 'Vijibweni', 'Tungi']),
  ...P('kigamboni_2', 'Kigamboni', ['Kibada', 'Kibugumo']),
  ...P('kigamboni_3', 'Kigamboni', ['Mjimwema', 'Kisota', 'Somangila', 'Gezaulole', 'Kisarawe II']),
  ...P('kigamboni_4', 'Kigamboni', ['Kimbiji', 'Pemba Mnazi', 'Mwasonga']),
]);
