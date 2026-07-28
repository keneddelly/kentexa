/**
 * Dar es Salaam zone detection utility
 * Used to determine if a delivery address is within Dar es Salaam
 * and which specific zone it belongs to (for batch delivery routing).
 *
 * Import and use in:
 *   - orders.service.ts  → detect same-city at order creation
 *   - daily-batches.service.ts → detect zone for batch assignment
 *   - checkout API response → tell frontend which methods to show
 */

// All known Dar es Salaam areas/wards/zones
export const DAR_KEYWORDS = [
  // City center
  'Kariakoo',
  'Ilala',
  'Kisutu',
  'Upanga',
  'Gerezani',
  'Kivukoni',
  // Kinondoni
  'Kinondoni',
  'Mikocheni',
  'Mwenge',
  'Sinza',
  'Kijitonyama',
  'Manzese',
  'Tandale',
  'Magomeni',
  'Mwananyamala',
  'Kigogo',
  // Ubungo
  'Ubungo',
  'Kimara',
  'Mbezi',
  'Mbezi Louis',
  'Mbezi Beach',
  'Makuburi',
  'Kibamba',
  // Temeke / South
  'Temeke',
  'Mbagala',
  'Mbagala Kuu',
  'Kigamboni',
  "Chang'ombe",
  'Mtoni',
  'Kurasini',
  'Tandika',
  'Yombo',
  // North / Far
  'Bunju',
  'Bunju A',
  'Bunju B',
  'Mbweni',
  'Tegeta',
  'Boko',
  'Kunduchi',
  'Msasani',
  'Masaki',
  'Oyster Bay',
  // General
  'Dar es Salaam',
  'Dar',
  'DSM',
];

export const BATCH_ZONES: Record<string, string[]> = {
  Mbagala: ['Mbagala', 'Mbagala Kuu', 'Mbagala Kizuiani', 'Yombo', 'Tandika'],
  Bunju: ['Bunju', 'Bunju A', 'Bunju B', 'Mbweni', 'Boko', 'Tegeta'],
  Mbezi: ['Mbezi', 'Mbezi Louis', 'Mbezi Beach', 'Kimara', 'Kibamba'],
  Kigamboni: ['Kigamboni', 'Kurasini', 'Mtoni'],
  Kinondoni: [
    'Kinondoni',
    'Mwenge',
    'Mikocheni',
    'Sinza',
    'Kijitonyama',
    'Msasani',
    'Masaki',
    'Oyster Bay',
  ],
};

/**
 * Returns true if the address is within Dar es Salaam
 */
export function isDarEsSalaam(address: string | null): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  return DAR_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Returns the batch zone name for an address, or null if not in a known zone
 */
export function detectBatchZone(address: string | null): string | null {
  if (!address) return null;
  const lower = address.toLowerCase();
  for (const [zone, keywords] of Object.entries(BATCH_ZONES)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return zone;
    }
  }
  // Default to Kariakoo area if Dar but no specific zone
  if (isDarEsSalaam(address)) return null; // Dar but no batch zone — use boda only
  return null;
}

/**
 * Returns available delivery methods for a given buyer address + seller city
 */
export function getAvailableDeliveryMethods(
  buyerAddress: string | null,
  sellerCity: string | null,
): {
  isSameCity: boolean;
  hasBatchZone: boolean;
  methods: Array<{
    key: string;
    label: string;
    icon: string;
    fee: number | null;
  }>;
} {
  const buyerInDar = isDarEsSalaam(buyerAddress);
  const sellerInDar =
    !sellerCity ||
    isDarEsSalaam(sellerCity) ||
    sellerCity?.toLowerCase().includes('dar');
  const isSameCity = buyerInDar && sellerInDar;
  const batchZone = detectBatchZone(buyerAddress);
  const hasBatchZone = !!batchZone;

  if (!isSameCity) {
    return {
      isSameCity: false,
      hasBatchZone: false,
      methods: [
        { key: 'agent', label: 'KenteXa Super Agent', icon: '🏢', fee: null },
      ],
    };
  }

  const methods: Array<{
    key: string;
    label: string;
    icon: string;
    fee: number | null;
  }> = [
    { key: 'boda', label: 'Boda Boda', icon: '🛵', fee: null }, // fee comes from product.bodaFee
  ];

  if (hasBatchZone) {
    methods.push({
      key: 'kentexa_delivery',
      label: 'KenteXa Delivery',
      icon: '🚐',
      fee: 3000,
    });
  }

  return { isSameCity, hasBatchZone, methods };
}
