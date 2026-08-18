/**
 * SEARCH_TERM_SYNONYM_GROUPS — Swahili/English marketplace term equivalents
 * Place at: src/search/search-term-dictionary.data.ts
 *
 * Data only — deliberately NOT baked into SQL. search-term-normalizer.util.ts
 * turns a raw query into a set of match terms by looking words up here; the
 * WHERE clause itself is built generically from however many terms come out
 * (search-query.util.ts), so growing this list never means touching a query
 * builder. Multi-word entries (e.g. "kinasa sauti") are matched as phrases
 * against the query text; single words are matched per-token. Extend this
 * list freely — it's the one place new vocabulary belongs. A later AI-backed
 * normalizer can layer on top of this (e.g. for typos/rare terms) without
 * changing how callers consume normalizeSearchQuery().
 */

export const SEARCH_TERM_SYNONYM_GROUPS: string[][] = [
  ['camera', 'cameras', 'kamera', 'kameras'],
  ['voice recorder', 'voice recorders', 'kinasa sauti', 'sauti ya kinasa', 'audio recorder', 'audio recorders', 'recorder', 'recorders'],
  ['phone', 'phones', 'mobile phone', 'mobile phones', 'smartphone', 'smartphones', 'simu', 'simu za mkononi', 'simu ya mkononi'],
  ['computer', 'computers', 'kompyuta', 'laptop', 'laptops', 'kompyuta mpakato'],
  ['car', 'cars', 'vehicle', 'vehicles', 'gari', 'magari'],
  ['fridge', 'fridges', 'refrigerator', 'refrigerators', 'friji'],
  ['printer', 'printers', 'printa'],
  ['charger', 'chargers', 'chaja'],
  ['headphones', 'earphones', 'headset', 'headsets', 'earbuds', 'vipokea sauti', 'vipokea sikio'],
  ['television', 'tv', 'tvs', 'runinga', 'televisheni'],
  ['fan', 'fans', 'feni'],
  ['iron', 'irons', 'pasi'],
  ['generator', 'generators', 'jenereta'],
  ['solar panel', 'solar panels', 'jua paneli', 'paneli ya jua'],
  ['bag', 'bags', 'mkoba', 'mikoba'],
  ['shoe', 'shoes', 'kiatu', 'viatu'],
  ['watch', 'watches', 'saa'],
  ['bed', 'beds', 'kitanda', 'vitanda'],
  ['sofa', 'sofas', 'kochi', 'makochi'],
  ['gps', 'gps tracker', 'gps trackers', 'kifuatiliaji', 'tafuta gari'],
  ['spy camera', 'spy cameras', 'hidden camera', 'hidden cameras', 'kamera ya siri', 'kamera za siri'],
  ['motorcycle', 'motorcycles', 'boda', 'pikipiki'],
  ['bicycle', 'bicycles', 'baiskeli'],
  ['washing machine', 'washing machines', 'mashine ya kufulia'],
  ['microwave', 'microwaves', 'maikrowevu'],
  ['blender', 'blenders', 'blenda'],
  ['speaker', 'speakers', 'spika'],
  ['tablet', 'tablets', 'kompyuta kibao'],
  ['router', 'routers', 'ruta'],
  ['sim card', 'sim cards', 'laini'],
  ['drone', 'drones', 'ndege isiyo na rubani'],
  ['furniture', 'samani', 'fanicha'],
  ['mattress', 'mattresses', 'godoro', 'magodoro'],
  ['clothes', 'clothing', 'nguo'],
  ['tracksuit', 'tracksuits', 'trekiseti'],
  ['plumber', 'plumbing', 'fundi bomba'],
  ['electrician', 'fundi umeme'],
  ['tailor', 'tailoring', 'mshonaji', 'ushonaji'],
  ['courier', 'delivery', 'usafirishaji', 'utoaji'],
];
