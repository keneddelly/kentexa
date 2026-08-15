// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for Product + Classified categories/subcategories.
//
// Before this file, categories were hardcoded independently in ~5 frontend
// files (each with a slightly different list) plus a strict Postgres enum
// on Classified and no validation at all on Product. Everything — the
// GET /categories endpoint, Product/Classified DTO validation, and the AI
// listing/search prompts — now reads from here.
// ─────────────────────────────────────────────────────────────────────────

export interface SubcategoryDef {
  label: string;
  specs?: string[];
}

export interface CategoryDef {
  label: string;
  icon: string;
  // Alternate terms an AI search query might use that should still resolve
  // to this category (see resolveCategoryKey below).
  synonyms?: string[];
  subcategories: Record<string, SubcategoryDef>;
}

export const CATEGORIES: Record<string, CategoryDef> = {
  electronics: {
    label: 'Electronics', icon: '📱',
    synonyms: ['phones', 'phone', 'mobile', 'mobiles', 'gadgets', 'tech', 'computers', 'computer'],
    subcategories: {
      hidden_cameras:    { label: 'Hidden Cameras',      specs: ['Resolution', 'Night Vision', 'WiFi', 'Battery Life', 'Storage', 'Motion Detection', 'Dimensions', 'Weight'] },
      voice_recorders:   { label: 'Voice Recorders',     specs: ['Battery Life', 'Storage', 'Microphone Range', 'VOX Mode', 'File Format', 'Dimensions'] },
      gps_trackers:      { label: 'GPS Trackers',        specs: ['Network Support', 'Battery Life', 'Update Interval', 'Waterproof', 'SIM Required', 'Dimensions'] },
      smartphones:       { label: 'Smartphones',         specs: ['Brand', 'RAM', 'Internal Storage', 'Camera', 'Battery', 'OS', 'Screen Size', 'Color'] },
      laptops:           { label: 'Laptops & Computers', specs: ['Brand', 'Processor', 'RAM', 'Storage', 'Screen Size', 'OS', 'Battery', 'Color'] },
      tvs:               { label: 'TVs & Displays',      specs: ['Screen Size', 'Resolution', 'Smart TV', 'HDMI Ports', 'Brand', 'Refresh Rate'] },
      audio:             { label: 'Audio & Sound',       specs: ['Type', 'Connectivity', 'Battery Life', 'Brand', 'Frequency Response'] },
      accessories:       { label: 'Accessories',         specs: ['Compatible With', 'Material', 'Color', 'Brand'] },
      other_electronics: { label: 'Other Electronics',   specs: ['Brand', 'Model', 'Condition'] },
    },
  },
  fashion: {
    label: 'Fashion', icon: '👗',
    synonyms: ['clothes', 'clothing', 'apparel'],
    subcategories: {
      mens_clothing:   { label: "Men's Clothing",   specs: ['Size', 'Material', 'Color', 'Brand', 'Occasion'] },
      womens_clothing: { label: "Women's Clothing", specs: ['Size', 'Material', 'Color', 'Brand', 'Occasion'] },
      kids_clothing:   { label: "Kids' Clothing",   specs: ['Age Range', 'Size', 'Material', 'Color', 'Gender'] },
      shoes:           { label: 'Shoes',            specs: ['Size (EU/UK)', 'Material', 'Color', 'Gender', 'Brand', 'Sole Material'] },
      bags:            { label: 'Bags & Handbags',  specs: ['Material', 'Color', 'Dimensions', 'Brand', 'Closure Type'] },
      watches:         { label: 'Watches',          specs: ['Brand', 'Movement Type', 'Water Resistance', 'Strap Material', 'Case Size'] },
      jewelry:         { label: 'Jewelry',          specs: ['Material', 'Color', 'Size', 'Brand', 'Occasion'] },
    },
  },
  home_garden: {
    label: 'Home & Garden', icon: '🏠',
    synonyms: ['furniture', 'home', 'garden'],
    subcategories: {
      furniture:  { label: 'Furniture',         specs: ['Material', 'Dimensions', 'Color', 'Weight Capacity', 'Assembly Required'] },
      bedding:    { label: 'Bedding & Pillows', specs: ['Size', 'Material', 'Color', 'Thread Count'] },
      kitchen:    { label: 'Kitchen & Dining',  specs: ['Material', 'Capacity', 'Brand', 'Dishwasher Safe'] },
      appliances: { label: 'Home Appliances',   specs: ['Brand', 'Power (W)', 'Voltage', 'Dimensions', 'Weight', 'Warranty'] },
      garden:     { label: 'Garden & Outdoor',  specs: ['Material', 'Dimensions', 'Color', 'Weatherproof'] },
      cleaning:   { label: 'Cleaning Supplies', specs: ['Type', 'Volume', 'Scent', 'Concentrated'] },
    },
  },
  health_beauty: {
    label: 'Health & Beauty', icon: '💄',
    synonyms: ['cosmetics', 'skincare', 'makeup'],
    subcategories: {
      skincare:    { label: 'Skincare',           specs: ['Skin Type', 'Volume (ml)', 'Brand', 'Key Ingredients', 'SPF'] },
      haircare:    { label: 'Hair Care',          specs: ['Hair Type', 'Volume (ml)', 'Brand', 'Key Ingredients'] },
      cosmetics:   { label: 'Cosmetics',          specs: ['Shade', 'Brand', 'Volume/Weight', 'Finish'] },
      supplements: { label: 'Health Supplements', specs: ['Type', 'Quantity', 'Brand', 'Expiry Date', 'Dosage'] },
      medical:     { label: 'Medical Equipment',  specs: ['Brand', 'Model', 'Certification', 'Power Source'] },
    },
  },
  food: {
    label: 'Food & Beverages', icon: '🍎',
    synonyms: ['groceries', 'drinks'],
    subcategories: {
      fresh_food: { label: 'Fresh Food',     specs: ['Weight (kg)', 'Origin', 'Expiry Date', 'Organic'] },
      packaged:   { label: 'Packaged Food',  specs: ['Weight', 'Brand', 'Expiry Date', 'Ingredients', 'Allergens'] },
      beverages:  { label: 'Beverages',      specs: ['Volume (ml)', 'Brand', 'Type', 'Flavour'] },
      spices:     { label: 'Spices & Herbs', specs: ['Weight', 'Origin', 'Brand', 'Organic'] },
    },
  },
  baby_kids: {
    label: 'Baby & Kids', icon: '🧸',
    synonyms: ['toys', 'baby', 'kids'],
    subcategories: {
      toys:      { label: 'Toys & Games',    specs: ['Age Range', 'Material', 'Brand', 'Safety Certified', 'Battery Required'] },
      baby_care: { label: 'Baby Care',       specs: ['Age Range', 'Volume/Weight', 'Brand', 'Ingredients'] },
      school:    { label: 'School Supplies', specs: ['Grade Level', 'Brand', 'Quantity', 'Color'] },
    },
  },
  sports: {
    label: 'Sports & Fitness', icon: '⚽',
    synonyms: ['fitness', 'gym', 'exercise'],
    subcategories: {
      gym:        { label: 'Gym Equipment', specs: ['Weight Capacity', 'Material', 'Dimensions', 'Brand', 'Weight (kg)'] },
      outdoor:    { label: 'Outdoor Sports', specs: ['Material', 'Size', 'Brand', 'Waterproof'] },
      sportswear: { label: 'Sportswear',     specs: ['Size', 'Material', 'Color', 'Gender', 'Brand'] },
      cycling:    { label: 'Cycling',        specs: ['Frame Size', 'Material', 'Gears', 'Brand', 'Wheel Size'] },
    },
  },
  agriculture: {
    label: 'Agriculture', icon: '🌾',
    synonyms: ['farming', 'farm'],
    subcategories: {
      seeds:       { label: 'Seeds & Seedlings',  specs: ['Crop Type', 'Weight', 'Planting Season', 'Origin', 'Germination Rate'] },
      tools:       { label: 'Farming Tools',      specs: ['Material', 'Brand', 'Dimensions', 'Weight'] },
      fertilizers: { label: 'Fertilizers',        specs: ['Type', 'Weight (kg)', 'NPK Ratio', 'Organic', 'Application Method'] },
      livestock:   { label: 'Livestock Products', specs: ['Type', 'Quantity', 'Origin', 'Breed'] },
    },
  },
  security: {
    label: 'Security', icon: '🔒',
    subcategories: {
      cctv:   { label: 'CCTV Cameras',   specs: ['Resolution', 'Night Vision', 'Indoor/Outdoor', 'Storage', 'Brand', 'Power Source', 'Viewing Angle'] },
      alarms: { label: 'Alarm Systems',  specs: ['Type', 'Coverage Area', 'Brand', 'Power Source', 'GSM Compatible'] },
      access: { label: 'Access Control', specs: ['Type', 'Brand', 'User Capacity', 'Connectivity'] },
      safes:  { label: 'Safes & Locks',  specs: ['Material', 'Dimensions', 'Lock Type', 'Brand', 'Fire Resistant'] },
    },
  },
  vehicles: {
    label: 'Vehicles & Parts', icon: '🚗',
    synonyms: ['cars', 'car', 'automobile', 'motors', 'motorcycle', 'motorbike'],
    subcategories: {
      cars:        { label: 'Cars',                specs: ['Make', 'Model', 'Year', 'Mileage (km)', 'Fuel Type', 'Transmission', 'Color', 'Engine (cc)', 'Condition'] },
      motorcycles: { label: 'Motorcycles',          specs: ['Make', 'Model', 'Year', 'Engine (cc)', 'Color', 'Mileage (km)', 'Condition'] },
      spare_parts: { label: 'Spare Parts',          specs: ['Compatible With', 'Part Number', 'Brand', 'Condition', 'OEM/Aftermarket'] },
      accessories: { label: 'Vehicle Accessories',  specs: ['Compatible With', 'Material', 'Color', 'Brand'] },
    },
  },
  books: {
    label: 'Books & Education', icon: '📚',
    synonyms: ['education', 'textbooks'],
    subcategories: {
      textbooks:  { label: 'Textbooks',        specs: ['Subject', 'Grade/Level', 'Author', 'Publisher', 'Edition', 'Language', 'Condition'] },
      fiction:    { label: 'Fiction & Novels', specs: ['Author', 'Publisher', 'Language', 'Pages', 'Genre', 'Condition'] },
      stationery: { label: 'Stationery',       specs: ['Type', 'Brand', 'Quantity', 'Color'] },
    },
  },
  arts: {
    label: 'Arts & Crafts', icon: '🎨',
    synonyms: ['music', 'instruments'],
    subcategories: {
      paintings: { label: 'Paintings & Art',     specs: ['Medium', 'Dimensions', 'Style', 'Framed', 'Artist'] },
      crafts:    { label: 'Craft Supplies',      specs: ['Type', 'Brand', 'Quantity', 'Material'] },
      music:     { label: 'Musical Instruments', specs: ['Type', 'Brand', 'Material', 'Condition', 'Key/Tuning'] },
    },
  },
  property: {
    label: 'Property', icon: '🏡',
    synonyms: ['real estate', 'houses', 'house', 'land', 'apartment', 'apartments', 'rent'],
    subcategories: {
      houses_sale:  { label: 'Houses for Sale',    specs: ['Bedrooms', 'Bathrooms', 'Size (sqm)', 'Location', 'Title Deed'] },
      houses_rent:  { label: 'Houses for Rent',    specs: ['Bedrooms', 'Bathrooms', 'Size (sqm)', 'Location', 'Rent Period'] },
      apartments:   { label: 'Apartments & Flats', specs: ['Bedrooms', 'Bathrooms', 'Floor', 'Furnished', 'Location'] },
      land:         { label: 'Land',               specs: ['Size (acres/sqm)', 'Location', 'Title Deed', 'Zoning'] },
      commercial:   { label: 'Commercial Property',specs: ['Size (sqm)', 'Location', 'Type', 'Parking'] },
    },
  },
  services: {
    label: 'Services (Listings)', icon: '🧾',
    subcategories: {
      home_services:   { label: 'Home Services',        specs: ['Type', 'Availability'] },
      repair:          { label: 'Repair & Maintenance', specs: ['Type', 'Warranty'] },
      professional:    { label: 'Professional Services',specs: ['Type', 'Experience'] },
      events:          { label: 'Events & Rentals',     specs: ['Type', 'Capacity'] },
      other_services:  { label: 'Other Services',       specs: ['Type'] },
    },
  },
  pets: {
    label: 'Pets & Animals', icon: '🐾',
    synonyms: ['pet', 'animals', 'dog', 'dogs', 'cat', 'cats'],
    subcategories: {
      pet_supplies: { label: 'Pet Supplies',   specs: ['Type', 'Brand', 'Size', 'For Animal'] },
      pets_sale:    { label: 'Pets for Sale',  specs: ['Species', 'Breed', 'Age', 'Vaccinated'] },
      aquariums:    { label: 'Aquariums & Fish', specs: ['Size (litres)', 'Type', 'Included Equipment'] },
    },
  },
  construction: {
    label: 'Building & Construction', icon: '🧱',
    synonyms: ['building', 'materials', 'hardware'],
    subcategories: {
      materials: { label: 'Building Materials',  specs: ['Type', 'Quantity/Unit', 'Brand'] },
      tools:     { label: 'Construction Tools',  specs: ['Type', 'Brand', 'Power Source'] },
      plumbing:  { label: 'Plumbing',            specs: ['Type', 'Material', 'Size'] },
      electrical:{ label: 'Electrical Supplies', specs: ['Type', 'Rating', 'Brand'] },
      paint:     { label: 'Paint & Finishing',   specs: ['Type', 'Volume (L)', 'Color', 'Brand'] },
    },
  },
  industrial: {
    label: 'Industrial & Business', icon: '🏭',
    synonyms: ['machinery', 'equipment', 'commercial equipment'],
    subcategories: {
      machinery:  { label: 'Machinery',           specs: ['Type', 'Brand', 'Power', 'Condition'] },
      office:     { label: 'Office Equipment',    specs: ['Type', 'Brand', 'Condition'] },
      restaurant: { label: 'Restaurant Equipment',specs: ['Type', 'Brand', 'Capacity', 'Power Source'] },
    },
  },
  general: {
    label: 'General', icon: '📦',
    subcategories: {
      other: { label: 'Other', specs: ['Brand', 'Model', 'Condition', 'Color'] },
    },
  },
};

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
