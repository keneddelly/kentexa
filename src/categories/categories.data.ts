// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for Product + Classified categories/subcategories.
//
// Before this file, categories were hardcoded independently in ~5 frontend
// files (each with a slightly different list) plus a strict Postgres enum
// on Classified and no validation at all on Product. Everything — the
// GET /categories endpoint, Product/Classified DTO validation, and the AI
// listing/search prompts — now reads from here.
//
// 2026-08-28 category-aware product creation: subcategories used to carry
// just `specs: string[]` — field NAMES only, no type, no required/
// filterable/variant metadata, and there was nowhere to say "a T-shirt
// needs 3+ photos, a car needs 6+". This file now defines a real
// AttributeDef per field (type, required, filterable, isVariantAttribute,
// displayOrder, allowedValues, unit) plus per-category MediaRules — still
// a code file (not a DB table), matching the existing pattern exactly, so
// GET /categories, Product/Classified validation, and search/filter can
// all keep reading from this one place with zero new admin surface.
// ─────────────────────────────────────────────────────────────────────────

export type AttributeType = 'text' | 'number' | 'select' | 'multiselect' | 'boolean';

export interface AttributeDef {
  key: string;
  label: string;
  type: AttributeType;
  required?: boolean;
  filterable?: boolean;
  // Flags this as a field that COULD become a variant axis (e.g. Color,
  // Size, Storage) — informational only for now. Consumed by the deferred
  // product-variant phase (ProductVariant entity, seller variant-builder
  // UI, checkout/cart/POS rewiring); this phase doesn't build variants,
  // it just makes sure the metadata is captured once so that phase never
  // needs a second schema pass over every category.
  isVariantAttribute?: boolean;
  displayOrder?: number;
  allowedValues?: string[];
  unit?: string;
}

export interface MediaRules {
  minImages: number;
  recommendedImages: number;
  maxImages: number;
  guidanceText: string;
}

export interface SubcategoryDef {
  label: string;
  attributes?: AttributeDef[];
}

export interface CategoryDef {
  label: string;
  icon: string;
  // Alternate terms an AI search query might use that should still resolve
  // to this category (see resolveCategoryKey below).
  synonyms?: string[];
  subcategories: Record<string, SubcategoryDef>;
  mediaRules: MediaRules;
  // Digital-goods category (ebooks, software, etc.) — the seller-side
  // Product Type toggle (physical/digital) filters this list by the flag
  // instead of maintaining a second, separate category tree. Keys here
  // must match orders.service.ts's CATEGORY_COMMISSION digital-goods keys.
  isDigital?: boolean;
}

// ── Media rule presets — per user spec section 4 ──────────────────────────
const FASHION_MEDIA: MediaRules = {
  minImages: 3, recommendedImages: 10, maxImages: 10,
  guidanceText: 'Show front, back, side, close-up detail, and every color you have in stock.',
};
const ELECTRONICS_MEDIA: MediaRules = {
  minImages: 4, recommendedImages: 10, maxImages: 10,
  guidanceText: 'For better buyer confidence, upload clear photos of the front, back, sides, and model/serial label.',
};
const VEHICLE_MEDIA: MediaRules = {
  minImages: 6, recommendedImages: 12, maxImages: 20,
  guidanceText: 'Show front, rear, both sides, interior, dashboard, and engine bay.',
};
const DEFAULT_MEDIA: MediaRules = {
  minImages: 2, recommendedImages: 6, maxImages: 10,
  guidanceText: 'Clear photos from multiple angles help buyers trust your listing.',
};
const DIGITAL_MEDIA: MediaRules = {
  minImages: 1, recommendedImages: 3, maxImages: 5,
  guidanceText: 'Add a cover image or screenshots that represent this item.',
};
const SERVICE_MEDIA: MediaRules = {
  minImages: 1, recommendedImages: 5, maxImages: 10,
  guidanceText: 'Photos of past work, your team, or your premises help buyers trust this listing.',
};

// ── Mechanical spec→attribute conversion ──────────────────────────────────
// Applied to every category below that doesn't warrant a hand-crafted,
// richer attribute list (see fashion/appliances/electronics.smartphones+
// laptops/vehicles further down, which are written out directly instead).
// A small set of keyword rules covers the field names that recur across
// dozens of categories (Color, Brand, Condition, Gender, ...); anything
// that doesn't match a known rule safely falls back to a plain filterable
// text field — never mislabeled, never blocks listing creation.
const CONDITION_VALUES = ['New', 'Used', 'Refurbished'];
const GENDER_VALUES = ['Male', 'Female', 'Unisex'];
const NUMERIC_UNITS = /^(kg|g|l|ml|cc|w|kva|va|ah|mah|km|m|cm|mm|sqm|btu|acres\/sqm)$/i;

const KNOWN_FIELD_RULES: Record<string, Partial<AttributeDef>> = {
  color: { type: 'multiselect', isVariantAttribute: true, filterable: true },
  brand: { type: 'text', filterable: true },
  model: { type: 'text', filterable: true },
  'model number': { type: 'text', filterable: true },
  condition: { type: 'select', allowedValues: CONDITION_VALUES, filterable: true },
  gender: { type: 'select', allowedValues: GENDER_VALUES, filterable: true },
  material: { type: 'text', filterable: true },
  type: { type: 'text', filterable: true },
  origin: { type: 'text', filterable: true },
  breed: { type: 'text', filterable: true },
  species: { type: 'text', filterable: true },
  organic: { type: 'boolean' },
  waterproof: { type: 'boolean' },
  'dishwasher safe': { type: 'boolean' },
  vaccinated: { type: 'boolean' },
  'assembly required': { type: 'boolean' },
  'fire resistant': { type: 'boolean' },
  'safety certified': { type: 'boolean' },
  'battery required': { type: 'boolean' },
  framed: { type: 'boolean' },
  furnished: { type: 'boolean' },
  concentrated: { type: 'boolean' },
  'gsm compatible': { type: 'boolean' },
  'title deed': { type: 'boolean' },
};

function specsToAttributes(specs: string[]): AttributeDef[] {
  return specs.map((raw, i) => {
    const unitMatch = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const baseLabel = (unitMatch ? unitMatch[1] : raw).trim();
    const unit = unitMatch ? unitMatch[2].trim() : undefined;
    const key = baseLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const rule = KNOWN_FIELD_RULES[baseLabel.toLowerCase()];
    const isNumericUnit = !!unit && NUMERIC_UNITS.test(unit);
    return {
      key,
      label: baseLabel,
      type: rule?.type || (isNumericUnit ? 'number' : 'text'),
      filterable: rule?.filterable ?? false,
      displayOrder: i,
      ...(rule?.allowedValues ? { allowedValues: rule.allowedValues } : {}),
      ...(rule?.isVariantAttribute ? { isVariantAttribute: true } : {}),
      ...(unit ? { unit } : {}),
    } as AttributeDef;
  });
}

export const CATEGORIES: Record<string, CategoryDef> = {
  electronics: {
    label: 'Electronics', icon: '📱',
    synonyms: ['phones', 'phone', 'mobile', 'mobiles', 'gadgets', 'tech', 'computers', 'computer'],
    mediaRules: ELECTRONICS_MEDIA,
    subcategories: {
      hidden_cameras:  { label: 'Hidden Cameras',  attributes: specsToAttributes(['Resolution', 'Night Vision', 'WiFi', 'Battery Life', 'Storage', 'Motion Detection', 'Dimensions', 'Weight']) },
      cameras:         { label: 'Cameras',         attributes: specsToAttributes(['Brand', 'Megapixels', 'Type', 'Lens', 'Condition']) },
      voice_recorders: { label: 'Voice Recorders', attributes: specsToAttributes(['Battery Life', 'Storage', 'Microphone Range', 'VOX Mode', 'File Format', 'Dimensions']) },
      gps_trackers:    { label: 'GPS Trackers',    attributes: specsToAttributes(['Network Support', 'Battery Life', 'Update Interval', 'Waterproof', 'SIM Required', 'Dimensions']) },
      // Hand-crafted — the user's own "Hisense refrigerator"-style example
      // applies just as directly to phones (RAM/Storage/Color as real
      // filterable, variant-capable fields, not free text).
      smartphones: {
        label: 'Smartphones',
        attributes: [
          { key: 'brand', label: 'Brand', type: 'text', required: true, filterable: true, displayOrder: 0 },
          { key: 'ram', label: 'RAM', type: 'select', filterable: true, displayOrder: 1, allowedValues: ['2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB'] },
          { key: 'internal_storage', label: 'Internal Storage', type: 'select', filterable: true, isVariantAttribute: true, displayOrder: 2, allowedValues: ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB'] },
          { key: 'camera', label: 'Camera', type: 'text', displayOrder: 3 },
          { key: 'battery', label: 'Battery', type: 'number', unit: 'mAh', displayOrder: 4 },
          { key: 'os', label: 'OS', type: 'select', filterable: true, displayOrder: 5, allowedValues: ['Android', 'iOS', 'Other'] },
          { key: 'screen_size', label: 'Screen Size', type: 'number', unit: 'in', displayOrder: 6 },
          { key: 'color', label: 'Color', type: 'multiselect', filterable: true, isVariantAttribute: true, displayOrder: 7 },
          { key: 'condition', label: 'Condition', type: 'select', filterable: true, allowedValues: CONDITION_VALUES, displayOrder: 8 },
        ],
      },
      laptops: {
        label: 'Laptops & Computers',
        attributes: [
          { key: 'brand', label: 'Brand', type: 'text', required: true, filterable: true, displayOrder: 0 },
          { key: 'processor', label: 'Processor', type: 'text', filterable: true, displayOrder: 1 },
          { key: 'ram', label: 'RAM', type: 'select', filterable: true, displayOrder: 2, allowedValues: ['4GB', '8GB', '16GB', '32GB', '64GB'] },
          { key: 'storage', label: 'Storage', type: 'select', filterable: true, isVariantAttribute: true, displayOrder: 3, allowedValues: ['128GB', '256GB', '512GB', '1TB', '2TB'] },
          { key: 'screen_size', label: 'Screen Size', type: 'number', unit: 'in', displayOrder: 4 },
          { key: 'os', label: 'OS', type: 'select', filterable: true, displayOrder: 5, allowedValues: ['Windows', 'macOS', 'Linux', 'ChromeOS', 'Other'] },
          { key: 'battery', label: 'Battery', type: 'text', displayOrder: 6 },
          { key: 'color', label: 'Color', type: 'multiselect', filterable: true, isVariantAttribute: true, displayOrder: 7 },
          { key: 'condition', label: 'Condition', type: 'select', filterable: true, allowedValues: CONDITION_VALUES, displayOrder: 8 },
        ],
      },
      tvs:                 { label: 'TVs & Displays',        attributes: specsToAttributes(['Screen Size', 'Resolution', 'Smart TV', 'HDMI Ports', 'Brand', 'Refresh Rate']) },
      audio:               { label: 'Audio & Sound',         attributes: specsToAttributes(['Type', 'Connectivity', 'Battery Life', 'Brand', 'Frequency Response']) },
      printers:            { label: 'Printers',              attributes: specsToAttributes(['Brand', 'Type', 'Print Technology', 'Connectivity', 'Condition']) },
      chargers_powerbanks: { label: 'Chargers & Power Banks',attributes: specsToAttributes(['Brand', 'Capacity (mAh)', 'Output', 'Compatible With']) },
      drones:              { label: 'Drones',                attributes: specsToAttributes(['Brand', 'Camera Resolution', 'Flight Time', 'Range', 'Condition']) },
      networking:          { label: 'Routers & Networking',  attributes: specsToAttributes(['Brand', 'Type', 'Speed', 'Bands', 'Condition']) },
      gaming_consoles:     { label: 'Gaming Consoles',       attributes: specsToAttributes(['Brand', 'Model', 'Storage', 'Included Accessories', 'Condition']) },
      accessories:         { label: 'Accessories',           attributes: specsToAttributes(['Compatible With', 'Material', 'Color', 'Brand']) },
      other_electronics:   { label: 'Other Electronics',     attributes: specsToAttributes(['Brand', 'Model', 'Condition']) },
    },
  },
  // Hand-crafted — clothing is the user's own lead example (T-shirt,
  // Color/Size as real variant-capable select/multiselect fields).
  fashion: {
    label: 'Fashion', icon: '👗',
    synonyms: ['clothes', 'clothing', 'apparel'],
    mediaRules: FASHION_MEDIA,
    subcategories: {
      mens_clothing:   { label: "Men's Clothing",   attributes: clothingAttrs() },
      womens_clothing: { label: "Women's Clothing", attributes: clothingAttrs() },
      kids_clothing:   { label: "Kids' Clothing",   attributes: clothingAttrs(true) },
      shoes: {
        label: 'Shoes',
        attributes: [
          { key: 'size', label: 'Size (EU)', type: 'select', filterable: true, isVariantAttribute: true, displayOrder: 0, allowedValues: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'] },
          { key: 'material', label: 'Material', type: 'text', filterable: true, displayOrder: 1 },
          { key: 'color', label: 'Color', type: 'multiselect', filterable: true, isVariantAttribute: true, displayOrder: 2 },
          { key: 'gender', label: 'Gender', type: 'select', filterable: true, allowedValues: GENDER_VALUES, displayOrder: 3 },
          { key: 'brand', label: 'Brand', type: 'text', filterable: true, displayOrder: 4 },
          { key: 'sole_material', label: 'Sole Material', type: 'text', displayOrder: 5 },
        ],
      },
      bags:    { label: 'Bags & Handbags', attributes: specsToAttributes(['Material', 'Color', 'Dimensions', 'Brand', 'Closure Type']) },
      watches: { label: 'Watches',         attributes: specsToAttributes(['Brand', 'Movement Type', 'Water Resistance', 'Strap Material', 'Case Size']) },
      jewelry: { label: 'Jewelry',         attributes: specsToAttributes(['Material', 'Color', 'Size', 'Brand', 'Occasion']) },
    },
  },
  home_garden: {
    label: 'Home & Garden', icon: '🏠',
    synonyms: ['furniture', 'home', 'garden'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      furniture:  { label: 'Furniture',         attributes: specsToAttributes(['Material', 'Dimensions', 'Color', 'Weight Capacity', 'Assembly Required']) },
      bedding:    { label: 'Bedding & Pillows', attributes: specsToAttributes(['Size', 'Material', 'Color', 'Thread Count']) },
      kitchen:    { label: 'Kitchen & Dining',  attributes: specsToAttributes(['Material', 'Capacity', 'Brand', 'Dishwasher Safe']) },
      garden:     { label: 'Garden & Outdoor',  attributes: specsToAttributes(['Material', 'Dimensions', 'Color', 'Weatherproof']) },
      cleaning:   { label: 'Cleaning Supplies', attributes: specsToAttributes(['Type', 'Volume', 'Scent', 'Concentrated']) },
    },
  },
  // Hand-crafted — the user's own second lead example (Hisense HFK100
  // refrigerator: Brand/Model/Capacity/Color as structured fields).
  appliances: {
    label: 'Home Appliances', icon: '🧊',
    synonyms: ['appliance', 'appliances', 'electronics appliances', 'home appliance'],
    mediaRules: ELECTRONICS_MEDIA,
    subcategories: {
      refrigerators:    { label: 'Refrigerators & Freezers', attributes: applianceAttrs('L') },
      washing_machines: { label: 'Washing Machines',         attributes: applianceAttrs('kg') },
      air_conditioners: { label: 'Air Conditioners',         attributes: applianceAttrs('BTU') },
      water_heaters:    { label: 'Water Heaters (Geyser)',   attributes: applianceAttrs('L') },
      microwaves_ovens: { label: 'Microwaves & Ovens',       attributes: applianceAttrs('L') },
      cookers_stoves:   { label: 'Cookers & Stoves',         attributes: specsToAttributes(['Brand', 'Fuel Type', 'Burners', 'Dimensions', 'Condition']) },
      blenders_mixers:  { label: 'Blenders & Mixers',        attributes: applianceAttrs('L') },
      fans_coolers:     { label: 'Fans & Air Coolers',       attributes: applianceAttrs() },
      generators:       { label: 'Generators',               attributes: specsToAttributes(['Brand', 'Power Output (kVA)', 'Fuel Type', 'Voltage', 'Condition']) },
      irons:            { label: 'Irons & Garment Care',     attributes: applianceAttrs() },
      vacuum_cleaners:  { label: 'Vacuum Cleaners',          attributes: applianceAttrs() },
      water_dispensers: { label: 'Water Dispensers',         attributes: applianceAttrs() },
      sewing_machines:  { label: 'Sewing Machines',          attributes: specsToAttributes(['Brand', 'Type', 'Stitch Options', 'Power Source', 'Condition']) },
      other_appliances: { label: 'Other Appliances',         attributes: applianceAttrs() },
    },
  },
  health_beauty: {
    label: 'Health & Beauty', icon: '💄',
    synonyms: ['cosmetics', 'skincare', 'makeup'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      skincare:    { label: 'Skincare',           attributes: specsToAttributes(['Skin Type', 'Volume (ml)', 'Brand', 'Key Ingredients', 'SPF']) },
      haircare:    { label: 'Hair Care',          attributes: specsToAttributes(['Hair Type', 'Volume (ml)', 'Brand', 'Key Ingredients']) },
      cosmetics:   { label: 'Cosmetics',          attributes: specsToAttributes(['Shade', 'Brand', 'Volume/Weight', 'Finish']) },
      supplements: { label: 'Health Supplements', attributes: specsToAttributes(['Type', 'Quantity', 'Brand', 'Expiry Date', 'Dosage']) },
      medical:     { label: 'Medical Equipment',  attributes: specsToAttributes(['Brand', 'Model', 'Certification', 'Power Source']) },
    },
  },
  food: {
    label: 'Food & Beverages', icon: '🍎',
    synonyms: ['groceries', 'drinks'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      fresh_food: { label: 'Fresh Food',     attributes: specsToAttributes(['Weight (kg)', 'Origin', 'Expiry Date', 'Organic']) },
      packaged:   { label: 'Packaged Food',  attributes: specsToAttributes(['Weight', 'Brand', 'Expiry Date', 'Ingredients', 'Allergens']) },
      beverages:  { label: 'Beverages',      attributes: specsToAttributes(['Volume (ml)', 'Brand', 'Type', 'Flavour']) },
      spices:     { label: 'Spices & Herbs', attributes: specsToAttributes(['Weight', 'Origin', 'Brand', 'Organic']) },
    },
  },
  baby_kids: {
    label: 'Baby & Kids', icon: '🧸',
    synonyms: ['toys', 'baby', 'kids'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      toys:      { label: 'Toys & Games',    attributes: specsToAttributes(['Age Range', 'Material', 'Brand', 'Safety Certified', 'Battery Required']) },
      baby_care: { label: 'Baby Care',       attributes: specsToAttributes(['Age Range', 'Volume/Weight', 'Brand', 'Ingredients']) },
      school:    { label: 'School Supplies', attributes: specsToAttributes(['Grade Level', 'Brand', 'Quantity', 'Color']) },
    },
  },
  sports: {
    label: 'Sports & Fitness', icon: '⚽',
    synonyms: ['fitness', 'gym', 'exercise'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      gym:        { label: 'Gym Equipment', attributes: specsToAttributes(['Weight Capacity', 'Material', 'Dimensions', 'Brand', 'Weight (kg)']) },
      outdoor:    { label: 'Outdoor Sports', attributes: specsToAttributes(['Material', 'Size', 'Brand', 'Waterproof']) },
      sportswear: { label: 'Sportswear',     attributes: specsToAttributes(['Size', 'Material', 'Color', 'Gender', 'Brand']) },
      cycling:    { label: 'Cycling',        attributes: specsToAttributes(['Frame Size', 'Material', 'Gears', 'Brand', 'Wheel Size']) },
    },
  },
  agriculture: {
    label: 'Agriculture', icon: '🌾',
    synonyms: ['farming', 'farm'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      seeds:       { label: 'Seeds & Seedlings',  attributes: specsToAttributes(['Crop Type', 'Weight', 'Planting Season', 'Origin', 'Germination Rate']) },
      tools:       { label: 'Farming Tools',      attributes: specsToAttributes(['Material', 'Brand', 'Dimensions', 'Weight']) },
      fertilizers: { label: 'Fertilizers',        attributes: specsToAttributes(['Type', 'Weight (kg)', 'NPK Ratio', 'Organic', 'Application Method']) },
      livestock:   { label: 'Livestock Products', attributes: specsToAttributes(['Type', 'Quantity', 'Origin', 'Breed']) },
    },
  },
  security: {
    label: 'Security', icon: '🔒',
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      cctv:   { label: 'CCTV Cameras',   attributes: specsToAttributes(['Resolution', 'Night Vision', 'Indoor/Outdoor', 'Storage', 'Brand', 'Power Source', 'Viewing Angle']) },
      alarms: { label: 'Alarm Systems',  attributes: specsToAttributes(['Type', 'Coverage Area', 'Brand', 'Power Source', 'GSM Compatible']) },
      access: { label: 'Access Control', attributes: specsToAttributes(['Type', 'Brand', 'User Capacity', 'Connectivity']) },
      safes:  { label: 'Safes & Locks',  attributes: specsToAttributes(['Material', 'Dimensions', 'Lock Type', 'Brand', 'Fire Resistant']) },
    },
  },
  // Hand-crafted — the user's own fourth lead example (Make/Model/Year/
  // Transmission/Fuel Type/Mileage/Engine/Color/Condition).
  vehicles: {
    label: 'Vehicles & Parts', icon: '🚗',
    synonyms: ['cars', 'car', 'automobile', 'motors', 'motorcycle', 'motorbike'],
    mediaRules: VEHICLE_MEDIA,
    subcategories: {
      cars:         { label: 'Cars',          attributes: vehicleAttrs('km') },
      motorcycles:  { label: 'Motorcycles',   attributes: vehicleAttrs('km', true) },
      trucks_buses: { label: 'Trucks & Buses',attributes: specsToAttributes(['Make', 'Model', 'Year', 'Mileage (km)', 'Fuel Type', 'Payload (tons)', 'Condition']).map(a => a.key === 'make' || a.key === 'model' || a.key === 'fuel_type' || a.key === 'condition' ? { ...a, filterable: true } : a) },
      boats:        { label: 'Boats',         attributes: specsToAttributes(['Type', 'Engine', 'Length', 'Year', 'Condition']) },
      spare_parts:  { label: 'Spare Parts',   attributes: specsToAttributes(['Compatible With', 'Part Number', 'Brand', 'Condition', 'OEM/Aftermarket']) },
      accessories:  { label: 'Vehicle Accessories', attributes: specsToAttributes(['Compatible With', 'Material', 'Color', 'Brand']) },
    },
  },
  books: {
    label: 'Books & Education', icon: '📚',
    synonyms: ['education', 'textbooks'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      textbooks:  { label: 'Textbooks',        attributes: specsToAttributes(['Subject', 'Grade/Level', 'Author', 'Publisher', 'Edition', 'Language', 'Condition']) },
      fiction:    { label: 'Fiction & Novels', attributes: specsToAttributes(['Author', 'Publisher', 'Language', 'Pages', 'Genre', 'Condition']) },
      stationery: { label: 'Stationery',       attributes: specsToAttributes(['Type', 'Brand', 'Quantity', 'Color']) },
    },
  },
  arts: {
    label: 'Arts & Crafts', icon: '🎨',
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      paintings: { label: 'Paintings & Art', attributes: specsToAttributes(['Medium', 'Dimensions', 'Style', 'Framed', 'Artist']) },
      crafts:    { label: 'Craft Supplies',  attributes: specsToAttributes(['Type', 'Brand', 'Quantity', 'Material']) },
    },
  },
  musical_instruments: {
    label: 'Musical Instruments', icon: '🎸',
    synonyms: ['music', 'instruments', 'instrument'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      guitars:            { label: 'Guitars & Strings',       attributes: specsToAttributes(['Type', 'Brand', 'Material', 'Condition']) },
      keyboards_pianos:   { label: 'Keyboards & Pianos',      attributes: specsToAttributes(['Type', 'Brand', 'Keys', 'Condition']) },
      drums_percussion:   { label: 'Drums & Percussion',      attributes: specsToAttributes(['Type', 'Brand', 'Material', 'Condition']) },
      traditional:        { label: 'Traditional Instruments', attributes: specsToAttributes(['Type', 'Material', 'Origin', 'Condition']) },
      dj_sound_equipment: { label: 'DJ & Sound Equipment',    attributes: specsToAttributes(['Brand', 'Power (W)', 'Type', 'Condition']) },
      accessories:        { label: 'Instrument Accessories',  attributes: specsToAttributes(['Compatible With', 'Type', 'Brand']) },
    },
  },
  flowers: {
    label: 'Flowers & Plants', icon: '🌸',
    synonyms: ['flower', 'florist', 'plants', 'bouquet', 'bouquets'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      bouquets:           { label: 'Bouquets & Arrangements',   attributes: specsToAttributes(['Flower Type', 'Occasion', 'Size']) },
      potted_plants:      { label: 'Potted & Indoor Plants',    attributes: specsToAttributes(['Plant Type', 'Pot Included', 'Size', 'Care Level']) },
      wedding_flowers:    { label: 'Wedding & Event Flowers',   attributes: specsToAttributes(['Flower Type', 'Occasion', 'Quantity']) },
      artificial_flowers: { label: 'Artificial Flowers',        attributes: specsToAttributes(['Material', 'Type', 'Quantity']) },
      seeds_bulbs:        { label: 'Seeds & Bulbs',             attributes: specsToAttributes(['Plant Type', 'Quantity', 'Season']) },
      gardening_plants:   { label: 'Garden Plants & Trees',     attributes: specsToAttributes(['Plant Type', 'Height', 'Age', 'Care Level']) },
      dried_flowers:      { label: 'Dried & Preserved Flowers', attributes: specsToAttributes(['Flower Type', 'Quantity']) },
    },
  },
  property: {
    label: 'Property', icon: '🏡',
    synonyms: ['real estate', 'houses', 'house', 'land', 'apartment', 'apartments', 'rent'],
    mediaRules: { minImages: 4, recommendedImages: 12, maxImages: 20, guidanceText: 'Show every room, the exterior, and the surrounding area.' },
    subcategories: {
      houses_sale: { label: 'Houses for Sale',    attributes: specsToAttributes(['Bedrooms', 'Bathrooms', 'Size (sqm)', 'Location', 'Title Deed']) },
      houses_rent: { label: 'Houses for Rent',    attributes: specsToAttributes(['Bedrooms', 'Bathrooms', 'Size (sqm)', 'Location', 'Rent Period']) },
      apartments:  { label: 'Apartments & Flats', attributes: specsToAttributes(['Bedrooms', 'Bathrooms', 'Floor', 'Furnished', 'Location']) },
      land:        { label: 'Land',               attributes: specsToAttributes(['Size (acres/sqm)', 'Location', 'Title Deed', 'Zoning']) },
      commercial:  { label: 'Commercial Property',attributes: specsToAttributes(['Size (sqm)', 'Location', 'Type', 'Parking']) },
    },
  },
  services: {
    label: 'Services (Listings)', icon: '🧾',
    mediaRules: SERVICE_MEDIA,
    subcategories: {
      home_services:  { label: 'Home Services',         attributes: specsToAttributes(['Type', 'Availability']) },
      repair:         { label: 'Repair & Maintenance',  attributes: specsToAttributes(['Type', 'Warranty']) },
      professional:   { label: 'Professional Services', attributes: specsToAttributes(['Type', 'Experience']) },
      events:         { label: 'Events & Rentals',      attributes: specsToAttributes(['Type', 'Capacity']) },
      other_services: { label: 'Other Services',        attributes: specsToAttributes(['Type']) },
    },
  },
  pets: {
    label: 'Pets & Animals', icon: '🐾',
    synonyms: ['pet', 'animals', 'dog', 'dogs', 'cat', 'cats'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      pet_supplies: { label: 'Pet Supplies',     attributes: specsToAttributes(['Type', 'Brand', 'Size', 'For Animal']) },
      pets_sale:    { label: 'Pets for Sale',    attributes: specsToAttributes(['Species', 'Breed', 'Age', 'Vaccinated']) },
      aquariums:    { label: 'Aquariums & Fish', attributes: specsToAttributes(['Size (litres)', 'Type', 'Included Equipment']) },
    },
  },
  construction: {
    label: 'Building & Construction', icon: '🧱',
    synonyms: ['building', 'materials', 'hardware'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      materials:  { label: 'Building Materials',  attributes: specsToAttributes(['Type', 'Quantity/Unit', 'Brand']) },
      tools:      { label: 'Construction Tools',  attributes: specsToAttributes(['Type', 'Brand', 'Power Source']) },
      plumbing:   { label: 'Plumbing',            attributes: specsToAttributes(['Type', 'Material', 'Size']) },
      electrical: { label: 'Electrical Supplies', attributes: specsToAttributes(['Type', 'Rating', 'Brand']) },
      paint:      { label: 'Paint & Finishing',   attributes: specsToAttributes(['Type', 'Volume (L)', 'Color', 'Brand']) },
    },
  },
  industrial: {
    label: 'Industrial & Business', icon: '🏭',
    synonyms: ['machinery', 'equipment', 'commercial equipment'],
    mediaRules: ELECTRONICS_MEDIA,
    subcategories: {
      machinery:  { label: 'Machinery',            attributes: specsToAttributes(['Type', 'Brand', 'Power', 'Condition']) },
      office:     { label: 'Office Equipment',     attributes: specsToAttributes(['Type', 'Brand', 'Condition']) },
      restaurant: { label: 'Restaurant Equipment', attributes: specsToAttributes(['Type', 'Brand', 'Capacity', 'Power Source']) },
    },
  },
  // ── 2026-08-28 category expansion ────────────────────────────────────────
  jobs: {
    label: 'Jobs & Employment', icon: '💼',
    synonyms: ['job', 'jobs', 'employment', 'vacancy', 'vacancies', 'career', 'hiring'],
    mediaRules: { minImages: 0, recommendedImages: 1, maxImages: 3, guidanceText: 'A company logo or workplace photo is optional but helps applicants trust the listing.' },
    subcategories: {
      full_time:        { label: 'Full-Time Jobs' },
      part_time:        { label: 'Part-Time Jobs' },
      internships:      { label: 'Internships & Trainee' },
      freelance_jobs:   { label: 'Freelance & Contract' },
      domestic_help:    { label: 'Domestic Help & Housekeeping' },
      driving_jobs:     { label: 'Driving & Delivery Jobs' },
      hospitality_jobs: { label: 'Hospitality & Restaurant Jobs' },
      other_jobs:       { label: 'Other Jobs' },
    },
  },
  energy: {
    label: 'Solar & Energy', icon: '☀️',
    synonyms: ['solar', 'energy', 'power', 'generator', 'inverter', 'battery'],
    mediaRules: ELECTRONICS_MEDIA,
    subcategories: {
      solar_panels:       { label: 'Solar Panels',                  attributes: specsToAttributes(['Brand', 'Wattage (W)', 'Voltage', 'Condition']) },
      solar_batteries:    { label: 'Solar & Deep-Cycle Batteries',   attributes: specsToAttributes(['Brand', 'Capacity (Ah)', 'Voltage', 'Condition']) },
      inverters:          { label: 'Inverters',                     attributes: specsToAttributes(['Brand', 'Capacity (VA/W)', 'Voltage', 'Condition']) },
      solar_lights:       { label: 'Solar Lights',                  attributes: specsToAttributes(['Brand', 'Power (W)', 'Battery Life', 'Condition']) },
      generators_energy:  { label: 'Generators',                    attributes: specsToAttributes(['Brand', 'Power Output (kVA)', 'Fuel Type', 'Condition']) },
      energy_accessories: { label: 'Cables & Accessories',          attributes: specsToAttributes(['Compatible With', 'Type', 'Length']) },
    },
  },
  tools_hardware: {
    label: 'Tools & Hardware', icon: '🔧',
    synonyms: ['tools', 'hardware', 'toolbox'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      hand_tools:        { label: 'Hand Tools',                 attributes: specsToAttributes(['Type', 'Brand', 'Material', 'Condition']) },
      power_tools:       { label: 'Power Tools',                attributes: specsToAttributes(['Brand', 'Power Source', 'Power (W)', 'Condition']) },
      hardware_supplies: { label: 'Hardware Supplies',          attributes: specsToAttributes(['Type', 'Material', 'Quantity/Unit']) },
      safety_gear:       { label: 'Safety Gear',                attributes: specsToAttributes(['Type', 'Size', 'Material', 'Certification']) },
      measuring_tools:   { label: 'Measuring & Layout Tools',   attributes: specsToAttributes(['Type', 'Brand', 'Range']) },
      ladders_access:    { label: 'Ladders & Access Equipment', attributes: specsToAttributes(['Type', 'Material', 'Height', 'Weight Capacity']) },
    },
  },
  weddings_events: {
    label: 'Weddings & Events', icon: '💍',
    synonyms: ['wedding', 'weddings', 'event', 'events', 'party'],
    mediaRules: SERVICE_MEDIA,
    subcategories: {
      event_planning:    { label: 'Event Planning Services' },
      decorations:       { label: 'Decorations & Balloons' },
      invitations_cards: { label: 'Invitations & Cards' },
      catering_services: { label: 'Catering Services' },
      photo_video:       { label: 'Photography & Videography' },
      event_rentals:     { label: 'Chairs, Tents & Rentals' },
      bridal_wear:       { label: 'Bridal & Groom Wear', attributes: specsToAttributes(['Size', 'Color', 'Material', 'Condition']) },
    },
  },
  water_sanitation: {
    label: 'Water & Sanitation', icon: '🚰',
    synonyms: ['water', 'tank', 'tanks', 'pump', 'pumps', 'sanitation'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      water_tanks:          { label: 'Water Tanks',              attributes: specsToAttributes(['Brand', 'Capacity (L)', 'Material', 'Condition']) },
      water_pumps:          { label: 'Water Pumps',              attributes: specsToAttributes(['Brand', 'Power (W)', 'Flow Rate', 'Condition']) },
      water_filters:        { label: 'Water Filters & Purifiers',attributes: specsToAttributes(['Brand', 'Capacity', 'Filter Type', 'Condition']) },
      plumbing_fixtures:    { label: 'Plumbing Fixtures',        attributes: specsToAttributes(['Type', 'Material', 'Size']) },
      sanitation_equipment: { label: 'Sanitation Equipment',     attributes: specsToAttributes(['Type', 'Material', 'Capacity']) },
    },
  },
  office_supplies: {
    label: 'Office Supplies & Equipment', icon: '🖇️',
    synonyms: ['office', 'stationery'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      office_furniture:    { label: 'Office Furniture',      attributes: specsToAttributes(['Material', 'Dimensions', 'Color', 'Condition']) },
      filing_storage:      { label: 'Filing & Storage',      attributes: specsToAttributes(['Type', 'Material', 'Dimensions']) },
      office_electronics:  { label: 'Office Electronics',    attributes: specsToAttributes(['Brand', 'Type', 'Condition']) },
      stationery_supplies: { label: 'Stationery Supplies',   attributes: specsToAttributes(['Type', 'Brand', 'Quantity']) },
      printing_copying:    { label: 'Printing & Copying Services' },
    },
  },
  collectibles: {
    label: 'Antiques & Collectibles', icon: '🏺',
    synonyms: ['antique', 'antiques', 'collectible', 'collectibles', 'vintage'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      antiques:         { label: 'Antiques' },
      coins_stamps:     { label: 'Coins & Stamps' },
      memorabilia:      { label: 'Memorabilia' },
      vintage_items:    { label: 'Vintage Items' },
      collectible_toys: { label: 'Collectible Toys & Figures' },
    },
  },
  tickets_vouchers: {
    label: 'Tickets & Vouchers', icon: '🎟️',
    synonyms: ['ticket', 'tickets', 'voucher', 'vouchers'],
    mediaRules: { minImages: 0, recommendedImages: 1, maxImages: 3, guidanceText: 'A photo of the ticket/voucher itself helps confirm it is genuine.' },
    subcategories: {
      event_tickets:  { label: 'Event Tickets' },
      travel_tickets: { label: 'Travel Tickets' },
      gift_vouchers:  { label: 'Gift Vouchers' },
      subscriptions:  { label: 'Subscriptions & Memberships' },
    },
  },
  free_giveaway: {
    label: 'Free Stuff', icon: '🎁',
    synonyms: ['free', 'giveaway', 'giveaways'],
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      free_items: { label: 'Free Items' },
      giveaways:  { label: 'Giveaways' },
    },
  },
  general: {
    label: 'General', icon: '📦',
    mediaRules: DEFAULT_MEDIA,
    subcategories: {
      other: { label: 'Other', attributes: specsToAttributes(['Brand', 'Model', 'Condition', 'Color']) },
    },
  },
  // ── Digital goods — shown only when the seller toggles Product Type to
  // Digital; keys match orders.service.ts's CATEGORY_COMMISSION map. ──
  ebooks: {
    label: 'eBooks', icon: '📖', isDigital: true,
    synonyms: ['ebook', 'e-book', 'book pdf'],
    mediaRules: DIGITAL_MEDIA,
    subcategories: {
      fiction:     { label: 'Fiction' },
      non_fiction: { label: 'Non-Fiction' },
      educational: { label: 'Educational' },
      comics:      { label: 'Comics & Graphic Novels' },
    },
  },
  software: {
    label: 'Software', icon: '💻', isDigital: true,
    synonyms: ['app', 'apps', 'plugin', 'plugins'],
    mediaRules: DIGITAL_MEDIA,
    subcategories: {
      apps:      { label: 'Apps & Tools' },
      games:     { label: 'Games' },
      plugins:   { label: 'Plugins & Extensions' },
      templates: { label: 'Templates & Themes' },
    },
  },
  online_courses: {
    label: 'Online Courses', icon: '🎓', isDigital: true,
    synonyms: ['course', 'courses', 'tutorial', 'training'],
    mediaRules: DIGITAL_MEDIA,
    subcategories: {
      business:       { label: 'Business & Finance' },
      technology:     { label: 'Technology' },
      health_fitness: { label: 'Health & Fitness' },
      arts_crafts:    { label: 'Arts & Crafts' },
      language:       { label: 'Language Learning' },
    },
  },
  digital_services: {
    label: 'Digital Services', icon: '🛠️', isDigital: true,
    synonyms: ['freelance', 'gig'],
    mediaRules: DIGITAL_MEDIA,
    subcategories: {
      design:     { label: 'Design' },
      writing:    { label: 'Writing & Translation' },
      consulting: { label: 'Consulting' },
      marketing:  { label: 'Marketing' },
    },
  },
  music_media: {
    label: 'Music & Media', icon: '🎵', isDigital: true,
    synonyms: ['music', 'audio', 'video', 'podcast'],
    mediaRules: DIGITAL_MEDIA,
    subcategories: {
      music:         { label: 'Music' },
      video:         { label: 'Video' },
      podcasts:      { label: 'Podcasts' },
      sound_effects: { label: 'Sound Effects' },
    },
  },
  digital_general: {
    label: 'Digital — Other', icon: '🗂️', isDigital: true,
    mediaRules: DIGITAL_MEDIA,
    subcategories: {
      templates: { label: 'Templates & Presets' },
      other:     { label: 'Other Digital' },
    },
  },
};

// ── Hand-crafted attribute builders used above ─────────────────────────────
function clothingAttrs(isKids = false): AttributeDef[] {
  return [
    { key: 'size', label: 'Size', type: 'select', filterable: true, isVariantAttribute: true, displayOrder: 0, allowedValues: isKids ? ['0-3m', '3-6m', '6-12m', '1-2y', '2-4y', '4-6y', '6-8y', '8-12y'] : ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { key: 'color', label: 'Color', type: 'multiselect', filterable: true, isVariantAttribute: true, displayOrder: 1 },
    { key: 'material', label: 'Material', type: 'text', filterable: true, displayOrder: 2 },
    { key: 'brand', label: 'Brand', type: 'text', filterable: true, displayOrder: 3 },
    ...(isKids
      ? [{ key: 'gender', label: 'Gender', type: 'select' as AttributeType, filterable: true, allowedValues: GENDER_VALUES, displayOrder: 4 }]
      : [{ key: 'occasion', label: 'Occasion', type: 'text' as AttributeType, displayOrder: 4 }]),
    { key: 'condition', label: 'Condition', type: 'select', filterable: true, allowedValues: CONDITION_VALUES, displayOrder: 5 },
  ];
}

function applianceAttrs(capacityUnit?: string): AttributeDef[] {
  const attrs: AttributeDef[] = [
    { key: 'brand', label: 'Brand', type: 'text', required: true, filterable: true, displayOrder: 0 },
    { key: 'model', label: 'Model', type: 'text', filterable: true, displayOrder: 1 },
  ];
  if (capacityUnit) {
    attrs.push({ key: 'capacity', label: 'Capacity', type: 'number', unit: capacityUnit, filterable: true, displayOrder: 2 });
  }
  attrs.push(
    { key: 'power', label: 'Power', type: 'number', unit: 'W', displayOrder: 3 },
    { key: 'voltage', label: 'Voltage', type: 'select', filterable: true, displayOrder: 4, allowedValues: ['110V', '220V', '12V', '24V'] },
    { key: 'color', label: 'Color', type: 'multiselect', filterable: true, isVariantAttribute: true, displayOrder: 5 },
    { key: 'warranty', label: 'Warranty', type: 'text', displayOrder: 6 },
    { key: 'condition', label: 'Condition', type: 'select', filterable: true, allowedValues: CONDITION_VALUES, displayOrder: 7 },
  );
  return attrs;
}

function vehicleAttrs(mileageUnit: string, isMotorcycle = false): AttributeDef[] {
  return [
    { key: 'make', label: 'Make', type: 'text', required: true, filterable: true, displayOrder: 0 },
    { key: 'model', label: 'Model', type: 'text', required: true, filterable: true, displayOrder: 1 },
    { key: 'year', label: 'Year', type: 'number', filterable: true, displayOrder: 2 },
    { key: 'mileage', label: 'Mileage', type: 'number', unit: mileageUnit, filterable: true, displayOrder: 3 },
    { key: 'fuel_type', label: 'Fuel Type', type: 'select', filterable: true, displayOrder: 4, allowedValues: ['Petrol', 'Diesel', 'Electric', 'Hybrid'] },
    ...(isMotorcycle ? [] : [{ key: 'transmission', label: 'Transmission', type: 'select' as AttributeType, filterable: true, displayOrder: 5, allowedValues: ['Manual', 'Automatic'] }]),
    { key: 'engine_capacity', label: 'Engine Capacity', type: 'number', unit: 'cc', displayOrder: 6 },
    { key: 'color', label: 'Color', type: 'multiselect', filterable: true, displayOrder: 7 },
    { key: 'condition', label: 'Condition', type: 'select', filterable: true, allowedValues: CONDITION_VALUES, displayOrder: 8 },
  ];
}

export const CATEGORY_KEYS: string[] = Object.keys(CATEGORIES);

// Turns a free-text guess (from an AI parse, or any unvalidated input) into
// a canonical category key, or null if nothing matches with confidence.
// Deliberately conservative: a wrong guess should fall back to no category
// filter (broader results), never to a silently-wrong one.
export function resolveCategoryKey(guess?: string | null): string | null {
  if (!guess) return null;
  const norm = guess.trim().toLowerCase();
  if (!norm) return null;
  const snake = norm.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  if (CATEGORY_KEYS.includes(snake)) return snake;

  for (const [key, def] of Object.entries(CATEGORIES)) {
    if (def.label.toLowerCase() === norm) return key;
    if (def.synonyms?.some((s) => s.toLowerCase() === norm)) return key;
  }

  // Loose fallback: does the guess contain (or get contained by) a known
  // synonym/label as a whole word-ish match — e.g. "used cars" -> vehicles.
  for (const [key, def] of Object.entries(CATEGORIES)) {
    const terms = [def.label.toLowerCase(), key, ...(def.synonyms || [])];
    if (terms.some((t) => norm.includes(t) || t.includes(norm))) return key;
  }

  return null;
}

// Checks a submitted specs object against its category/subcategory's
// attribute template — required fields present, allowedValues respected
// (multiselect values are comma-separated within the same
// Record<string,string> specs shape, no schema/column change needed).
// Returns a list of human-readable error strings, or [] if everything is
// valid. This is the ONE place attribute validation lives, per the
// "backend is the source of truth" architectural rule — never hardcode a
// per-category check inside a controller/service.
export function validateAttributes(
  categoryKey: string,
  subcategoryKey: string | null | undefined,
  values: Record<string, string> | null | undefined,
): string[] {
  const cat = CATEGORIES[categoryKey];
  if (!cat) return [];
  const sub = subcategoryKey ? cat.subcategories[subcategoryKey] : undefined;
  const attrs = sub?.attributes || [];
  const vals = values || {};
  const errors: string[] = [];

  for (const attr of attrs) {
    const raw = vals[attr.key];
    const isEmpty = raw === undefined || raw === null || String(raw).trim() === '';
    if (attr.required && isEmpty) {
      errors.push(`${attr.label} is required`);
      continue;
    }
    if (!isEmpty && attr.allowedValues?.length) {
      const provided = attr.type === 'multiselect'
        ? String(raw).split(',').map((v) => v.trim()).filter(Boolean)
        : [String(raw)];
      const invalid = provided.filter((v) => !attr.allowedValues!.includes(v));
      if (invalid.length) {
        errors.push(`${attr.label}: "${invalid.join(', ')}" is not a valid option`);
      }
    }
  }
  return errors;
}
