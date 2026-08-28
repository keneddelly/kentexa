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
  // Digital-goods category (ebooks, software, etc.) — the seller-side
  // Product Type toggle (physical/digital) filters this list by the flag
  // instead of maintaining a second, separate category tree. Keys here
  // must match orders.service.ts's CATEGORY_COMMISSION digital-goods keys.
  isDigital?: boolean;
}

export const CATEGORIES: Record<string, CategoryDef> = {
  electronics: {
    label: 'Electronics', icon: '📱',
    synonyms: ['phones', 'phone', 'mobile', 'mobiles', 'gadgets', 'tech', 'computers', 'computer'],
    subcategories: {
      hidden_cameras:      { label: 'Hidden Cameras',      specs: ['Resolution', 'Night Vision', 'WiFi', 'Battery Life', 'Storage', 'Motion Detection', 'Dimensions', 'Weight'] },
      cameras:             { label: 'Cameras',             specs: ['Brand', 'Megapixels', 'Type', 'Lens', 'Condition'] },
      voice_recorders:     { label: 'Voice Recorders',     specs: ['Battery Life', 'Storage', 'Microphone Range', 'VOX Mode', 'File Format', 'Dimensions'] },
      gps_trackers:        { label: 'GPS Trackers',        specs: ['Network Support', 'Battery Life', 'Update Interval', 'Waterproof', 'SIM Required', 'Dimensions'] },
      smartphones:         { label: 'Smartphones',         specs: ['Brand', 'RAM', 'Internal Storage', 'Camera', 'Battery', 'OS', 'Screen Size', 'Color'] },
      laptops:             { label: 'Laptops & Computers', specs: ['Brand', 'Processor', 'RAM', 'Storage', 'Screen Size', 'OS', 'Battery', 'Color'] },
      tvs:                 { label: 'TVs & Displays',      specs: ['Screen Size', 'Resolution', 'Smart TV', 'HDMI Ports', 'Brand', 'Refresh Rate'] },
      audio:               { label: 'Audio & Sound',       specs: ['Type', 'Connectivity', 'Battery Life', 'Brand', 'Frequency Response'] },
      printers:            { label: 'Printers',            specs: ['Brand', 'Type', 'Print Technology', 'Connectivity', 'Condition'] },
      chargers_powerbanks: { label: 'Chargers & Power Banks', specs: ['Brand', 'Capacity (mAh)', 'Output', 'Compatible With'] },
      drones:              { label: 'Drones',              specs: ['Brand', 'Camera Resolution', 'Flight Time', 'Range', 'Condition'] },
      networking:          { label: 'Routers & Networking', specs: ['Brand', 'Type', 'Speed', 'Bands', 'Condition'] },
      gaming_consoles:     { label: 'Gaming Consoles',      specs: ['Brand', 'Model', 'Storage', 'Included Accessories', 'Condition'] },
      accessories:         { label: 'Accessories',         specs: ['Compatible With', 'Material', 'Color', 'Brand'] },
      other_electronics:   { label: 'Other Electronics',   specs: ['Brand', 'Model', 'Condition'] },
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
      garden:     { label: 'Garden & Outdoor',  specs: ['Material', 'Dimensions', 'Color', 'Weatherproof'] },
      cleaning:   { label: 'Cleaning Supplies', specs: ['Type', 'Volume', 'Scent', 'Concentrated'] },
    },
  },
  // Promoted out of home_garden's single "appliances" line — a category
  // this large (fridges, washing machines, generators, AC units) deserves
  // its own real subcategory tree, not one entry buried under Home & Garden.
  appliances: {
    label: 'Home Appliances', icon: '🧊',
    synonyms: ['appliance', 'appliances', 'electronics appliances', 'home appliance'],
    subcategories: {
      refrigerators:    { label: 'Refrigerators & Freezers', specs: ['Brand', 'Capacity (L)', 'Power (W)', 'Voltage', 'Energy Rating', 'Condition'] },
      washing_machines: { label: 'Washing Machines',         specs: ['Brand', 'Capacity (kg)', 'Type', 'Power (W)', 'Voltage', 'Condition'] },
      air_conditioners: { label: 'Air Conditioners',         specs: ['Brand', 'Capacity (BTU)', 'Type', 'Power (W)', 'Voltage', 'Condition'] },
      water_heaters:    { label: 'Water Heaters (Geyser)',   specs: ['Brand', 'Capacity (L)', 'Power (W)', 'Voltage', 'Type', 'Condition'] },
      microwaves_ovens: { label: 'Microwaves & Ovens',       specs: ['Brand', 'Capacity (L)', 'Power (W)', 'Voltage', 'Condition'] },
      cookers_stoves:   { label: 'Cookers & Stoves',         specs: ['Brand', 'Fuel Type', 'Burners', 'Dimensions', 'Condition'] },
      blenders_mixers:  { label: 'Blenders & Mixers',        specs: ['Brand', 'Power (W)', 'Capacity (L)', 'Voltage', 'Condition'] },
      fans_coolers:     { label: 'Fans & Air Coolers',       specs: ['Brand', 'Power (W)', 'Type', 'Voltage', 'Condition'] },
      generators:       { label: 'Generators',               specs: ['Brand', 'Power Output (kVA)', 'Fuel Type', 'Voltage', 'Condition'] },
      irons:            { label: 'Irons & Garment Care',     specs: ['Brand', 'Power (W)', 'Type', 'Condition'] },
      vacuum_cleaners:  { label: 'Vacuum Cleaners',          specs: ['Brand', 'Power (W)', 'Type', 'Condition'] },
      water_dispensers: { label: 'Water Dispensers',         specs: ['Brand', 'Type', 'Capacity', 'Power (W)', 'Condition'] },
      sewing_machines:  { label: 'Sewing Machines',          specs: ['Brand', 'Type', 'Stitch Options', 'Power Source', 'Condition'] },
      other_appliances: { label: 'Other Appliances',         specs: ['Brand', 'Power (W)', 'Voltage', 'Condition'] },
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
      cars:         { label: 'Cars',                specs: ['Make', 'Model', 'Year', 'Mileage (km)', 'Fuel Type', 'Transmission', 'Color', 'Engine (cc)', 'Condition'] },
      motorcycles:  { label: 'Motorcycles',          specs: ['Make', 'Model', 'Year', 'Engine (cc)', 'Color', 'Mileage (km)', 'Condition'] },
      trucks_buses: { label: 'Trucks & Buses',       specs: ['Make', 'Model', 'Year', 'Mileage (km)', 'Fuel Type', 'Payload (tons)', 'Condition'] },
      boats:        { label: 'Boats',                specs: ['Type', 'Engine', 'Length', 'Year', 'Condition'] },
      spare_parts:  { label: 'Spare Parts',          specs: ['Compatible With', 'Part Number', 'Brand', 'Condition', 'OEM/Aftermarket'] },
      accessories:  { label: 'Vehicle Accessories',  specs: ['Compatible With', 'Material', 'Color', 'Brand'] },
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
    subcategories: {
      paintings: { label: 'Paintings & Art', specs: ['Medium', 'Dimensions', 'Style', 'Framed', 'Artist'] },
      crafts:    { label: 'Craft Supplies',  specs: ['Type', 'Brand', 'Quantity', 'Material'] },
    },
  },
  // Promoted out of arts.music — deserves its own tree given how much
  // gear (instruments, DJ/sound equipment) this genuinely covers.
  musical_instruments: {
    label: 'Musical Instruments', icon: '🎸',
    synonyms: ['music', 'instruments', 'instrument'],
    subcategories: {
      guitars:              { label: 'Guitars & Strings',      specs: ['Type', 'Brand', 'Material', 'Condition'] },
      keyboards_pianos:     { label: 'Keyboards & Pianos',     specs: ['Type', 'Brand', 'Keys', 'Condition'] },
      drums_percussion:     { label: 'Drums & Percussion',     specs: ['Type', 'Brand', 'Material', 'Condition'] },
      traditional:          { label: 'Traditional Instruments',specs: ['Type', 'Material', 'Origin', 'Condition'] },
      dj_sound_equipment:   { label: 'DJ & Sound Equipment',   specs: ['Brand', 'Power (W)', 'Type', 'Condition'] },
      accessories:          { label: 'Instrument Accessories', specs: ['Compatible With', 'Type', 'Brand'] },
    },
  },
  // Explicit user request — didn't exist in any form previously.
  flowers: {
    label: 'Flowers & Plants', icon: '🌸',
    synonyms: ['flower', 'florist', 'plants', 'bouquet', 'bouquets'],
    subcategories: {
      bouquets:           { label: 'Bouquets & Arrangements', specs: ['Flower Type', 'Occasion', 'Size'] },
      potted_plants:      { label: 'Potted & Indoor Plants',  specs: ['Plant Type', 'Pot Included', 'Size', 'Care Level'] },
      wedding_flowers:    { label: 'Wedding & Event Flowers', specs: ['Flower Type', 'Occasion', 'Quantity'] },
      artificial_flowers: { label: 'Artificial Flowers',      specs: ['Material', 'Type', 'Quantity'] },
      seeds_bulbs:        { label: 'Seeds & Bulbs',           specs: ['Plant Type', 'Quantity', 'Season'] },
      gardening_plants:   { label: 'Garden Plants & Trees',   specs: ['Plant Type', 'Height', 'Age', 'Care Level'] },
      dried_flowers:      { label: 'Dried & Preserved Flowers', specs: ['Flower Type', 'Quantity'] },
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
  // ── Newly added, 2026-08-28 category expansion ──────────────────────────
  jobs: {
    label: 'Jobs & Employment', icon: '💼',
    synonyms: ['job', 'jobs', 'employment', 'vacancy', 'vacancies', 'career', 'hiring'],
    subcategories: {
      full_time:      { label: 'Full-Time Jobs' },
      part_time:      { label: 'Part-Time Jobs' },
      internships:    { label: 'Internships & Trainee' },
      freelance_jobs: { label: 'Freelance & Contract' },
      domestic_help:  { label: 'Domestic Help & Housekeeping' },
      driving_jobs:   { label: 'Driving & Delivery Jobs' },
      hospitality_jobs: { label: 'Hospitality & Restaurant Jobs' },
      other_jobs:     { label: 'Other Jobs' },
    },
  },
  energy: {
    label: 'Solar & Energy', icon: '☀️',
    synonyms: ['solar', 'energy', 'power', 'generator', 'inverter', 'battery'],
    subcategories: {
      solar_panels:       { label: 'Solar Panels',        specs: ['Brand', 'Wattage (W)', 'Voltage', 'Condition'] },
      solar_batteries:    { label: 'Solar & Deep-Cycle Batteries', specs: ['Brand', 'Capacity (Ah)', 'Voltage', 'Condition'] },
      inverters:          { label: 'Inverters',           specs: ['Brand', 'Capacity (VA/W)', 'Voltage', 'Condition'] },
      solar_lights:       { label: 'Solar Lights',        specs: ['Brand', 'Power (W)', 'Battery Life', 'Condition'] },
      generators_energy:  { label: 'Generators',          specs: ['Brand', 'Power Output (kVA)', 'Fuel Type', 'Condition'] },
      energy_accessories: { label: 'Cables & Accessories',specs: ['Compatible With', 'Type', 'Length'] },
    },
  },
  tools_hardware: {
    label: 'Tools & Hardware', icon: '🔧',
    synonyms: ['tools', 'hardware', 'toolbox'],
    subcategories: {
      hand_tools:       { label: 'Hand Tools',       specs: ['Type', 'Brand', 'Material', 'Condition'] },
      power_tools:      { label: 'Power Tools',      specs: ['Brand', 'Power Source', 'Power (W)', 'Condition'] },
      hardware_supplies:{ label: 'Hardware Supplies',specs: ['Type', 'Material', 'Quantity/Unit'] },
      safety_gear:      { label: 'Safety Gear',      specs: ['Type', 'Size', 'Material', 'Certification'] },
      measuring_tools:  { label: 'Measuring & Layout Tools', specs: ['Type', 'Brand', 'Range'] },
      ladders_access:   { label: 'Ladders & Access Equipment', specs: ['Type', 'Material', 'Height', 'Weight Capacity'] },
    },
  },
  weddings_events: {
    label: 'Weddings & Events', icon: '💍',
    synonyms: ['wedding', 'weddings', 'event', 'events', 'party'],
    subcategories: {
      event_planning:   { label: 'Event Planning Services' },
      decorations:      { label: 'Decorations & Balloons' },
      invitations_cards:{ label: 'Invitations & Cards' },
      catering_services:{ label: 'Catering Services' },
      photo_video:      { label: 'Photography & Videography' },
      event_rentals:    { label: 'Chairs, Tents & Rentals' },
      bridal_wear:      { label: 'Bridal & Groom Wear' },
    },
  },
  water_sanitation: {
    label: 'Water & Sanitation', icon: '🚰',
    synonyms: ['water', 'tank', 'tanks', 'pump', 'pumps', 'sanitation'],
    subcategories: {
      water_tanks:          { label: 'Water Tanks',          specs: ['Brand', 'Capacity (L)', 'Material', 'Condition'] },
      water_pumps:          { label: 'Water Pumps',          specs: ['Brand', 'Power (W)', 'Flow Rate', 'Condition'] },
      water_filters:        { label: 'Water Filters & Purifiers', specs: ['Brand', 'Capacity', 'Filter Type', 'Condition'] },
      plumbing_fixtures:    { label: 'Plumbing Fixtures',    specs: ['Type', 'Material', 'Size'] },
      sanitation_equipment: { label: 'Sanitation Equipment', specs: ['Type', 'Material', 'Capacity'] },
    },
  },
  office_supplies: {
    label: 'Office Supplies & Equipment', icon: '🖇️',
    synonyms: ['office', 'stationery'],
    subcategories: {
      office_furniture: { label: 'Office Furniture',      specs: ['Material', 'Dimensions', 'Color', 'Condition'] },
      filing_storage:   { label: 'Filing & Storage',      specs: ['Type', 'Material', 'Dimensions'] },
      office_electronics:{ label: 'Office Electronics',   specs: ['Brand', 'Type', 'Condition'] },
      stationery_supplies:{ label: 'Stationery Supplies', specs: ['Type', 'Brand', 'Quantity'] },
      printing_copying: { label: 'Printing & Copying Services' },
    },
  },
  collectibles: {
    label: 'Antiques & Collectibles', icon: '🏺',
    synonyms: ['antique', 'antiques', 'collectible', 'collectibles', 'vintage'],
    subcategories: {
      antiques:          { label: 'Antiques' },
      coins_stamps:      { label: 'Coins & Stamps' },
      memorabilia:       { label: 'Memorabilia' },
      vintage_items:     { label: 'Vintage Items' },
      collectible_toys:  { label: 'Collectible Toys & Figures' },
    },
  },
  tickets_vouchers: {
    label: 'Tickets & Vouchers', icon: '🎟️',
    synonyms: ['ticket', 'tickets', 'voucher', 'vouchers'],
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
    subcategories: {
      free_items: { label: 'Free Items' },
      giveaways:  { label: 'Giveaways' },
    },
  },
  general: {
    label: 'General', icon: '📦',
    subcategories: {
      other: { label: 'Other', specs: ['Brand', 'Model', 'Condition', 'Color'] },
    },
  },
  // ── Digital goods — shown only when the seller toggles Product Type to
  // Digital; keys match orders.service.ts's CATEGORY_COMMISSION map. ──
  ebooks: {
    label: 'eBooks', icon: '📖', isDigital: true,
    synonyms: ['ebook', 'e-book', 'book pdf'],
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
    subcategories: {
      business:      { label: 'Business & Finance' },
      technology:    { label: 'Technology' },
      health_fitness:{ label: 'Health & Fitness' },
      arts_crafts:   { label: 'Arts & Crafts' },
      language:      { label: 'Language Learning' },
    },
  },
  digital_services: {
    label: 'Digital Services', icon: '🛠️', isDigital: true,
    synonyms: ['freelance', 'gig'],
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
    subcategories: {
      music:         { label: 'Music' },
      video:         { label: 'Video' },
      podcasts:      { label: 'Podcasts' },
      sound_effects: { label: 'Sound Effects' },
    },
  },
  digital_general: {
    label: 'Digital — Other', icon: '🗂️', isDigital: true,
    subcategories: {
      templates: { label: 'Templates & Presets' },
      other:     { label: 'Other Digital' },
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
