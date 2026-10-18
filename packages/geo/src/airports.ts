/**
 * Table des codes IATA → ville, pays et coordonnées.
 *
 * Les routeurs de backbone portent presque toujours un code d'aéroport dans leur
 * PTR (`be3184.ccr42.par01.atlas.cogentco.com` → `par01` = Paris,
 * `sw02-te2-san.trellian.com` → `san` = San Diego). C'est un signal bien plus
 * fiable que la base GeoIP pour ces équipements.
 *
 * Les coordonnées sont celles des centres-villes (utile pour le calcul de distance).
 * Source des codes : nomenclatures IATA publiques. Les valeurs sont des faits.
 */

export interface CityRef {
  code: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

function row(code: string, city: string, country: string, lat: number, lon: number): CityRef {
  return { code, city, country, lat, lon };
}

export const AIRPORTS: readonly CityRef[] = [
  // Europe
  row('PAR', 'Paris', 'FR', 48.8566, 2.3522),
  row('FRA', 'Frankfort-sur-le-main', 'DE', 50.1109, 8.6821),
  row('MRS', 'Marseille', 'FR', 43.2965, 5.3698),
  row('NCE', 'Nice', 'FR', 43.7102, 7.262),
  row('NIM', 'Nîmes', 'FR', 43.8367, 4.3601),
  row('LYS', 'Lyon', 'FR', 45.764, 4.8357),
  row('TLS', 'Toulouse', 'FR', 43.6047, 1.4442),
  row('BOD', 'Bordeaux', 'FR', 44.8378, -0.5792),
  row('LIL', 'Lille', 'FR', 50.6292, 3.0573),
  row('RNS', 'Rennes', 'FR', 48.1173, -1.6778),
  row('CDG', 'Paris', 'FR', 49.0097, 2.5479),
  row('AMS', 'Amsterdam', 'NL', 52.3676, 4.9041),
  row('BRU', 'Bruxelles', 'BE', 50.8503, 4.3517),
  row('LON', 'Londres', 'GB', 51.5074, -0.1278),
  row('LHR', 'Londres', 'GB', 51.5074, -0.1278),
  row('MAD', 'Madrid', 'ES', 40.4168, -3.7038),
  row('BCN', 'Barcelone', 'ES', 41.3874, 2.1686),
  row('LIS', 'Lisbonne', 'PT', 38.7223, -9.1393),
  row('DUB', 'Dublin', 'IE', 53.3498, -6.2603),
  row('DUS', 'Düsseldorf', 'DE', 51.2277, 6.7735),
  row('MUC', 'Munich', 'DE', 48.1351, 11.582),
  row('BER', 'Berlin', 'DE', 52.52, 13.405),
  row('HAM', 'Hambourg', 'DE', 53.5511, 9.9937),
  row('VIE', 'Vienne', 'AT', 48.2082, 16.3738),
  row('ZRH', 'Zurich', 'CH', 47.3769, 8.5417),
  row('GVA', 'Genève', 'CH', 46.2044, 6.1432),
  row('MXP', 'Milan', 'IT', 45.4642, 9.19),
  row('FCO', 'Rome', 'IT', 41.9028, 12.4964),
  row('CPH', 'Copenhague', 'DK', 55.6761, 12.5683),
  row('ARN', 'Stockholm', 'SE', 59.3293, 18.0686),
  row('OSL', 'Oslo', 'NO', 59.9139, 10.7522),
  row('HEL', 'Helsinki', 'FI', 60.1699, 24.9384),
  row('WAW', 'Varsovie', 'PL', 52.2297, 21.0122),
  row('PRG', 'Prague', 'CZ', 50.0755, 14.4378),
  row('BUD', 'Budapest', 'HU', 47.4979, 19.0402),
  row('OTP', 'Bucarest', 'RO', 44.4268, 26.1025),
  row('ATH', 'Athènes', 'GR', 37.9838, 23.7275),
  row('IST', 'Istanbul', 'TR', 41.0082, 28.9784),
  row('SVO', 'Moscou', 'RU', 55.7558, 37.6173),
  // Amériques
  row('NYC', 'New York', 'US', 40.7128, -74.006),
  row('JFK', 'New York', 'US', 40.6413, -73.7781),
  row('DCA', 'Washington', 'US', 38.9072, -77.0369),
  row('IAD', 'Ashburn', 'US', 38.9531, -77.4565),
  row('ATL', 'Atlanta', 'US', 33.749, -84.388),
  row('JAN', 'Jackson', 'US', 32.2988, -90.1848),
  row('DFW', 'Dallas', 'US', 32.7767, -96.797),
  row('ELP', 'El Paso', 'US', 31.7619, -106.485),
  row('PHX', 'Phoenix', 'US', 33.4484, -112.074),
  row('SAN', 'San Diego', 'US', 32.7157, -117.1611),
  row('LAX', 'Los Angeles', 'US', 34.0522, -118.2437),
  row('SFO', 'San Francisco', 'US', 37.7749, -122.4194),
  row('SEA', 'Seattle', 'US', 47.6062, -122.3321),
  row('ORD', 'Chicago', 'US', 41.8781, -87.6298),
  row('MIA', 'Miami', 'US', 25.7617, -80.1918),
  row('DEN', 'Denver', 'US', 39.7392, -104.9903),
  row('IAH', 'Houston', 'US', 29.7604, -95.3698),
  row('BOS', 'Boston', 'US', 42.3601, -71.0589),
  row('YYZ', 'Toronto', 'CA', 43.6532, -79.3832),
  row('YUL', 'Montréal', 'CA', 45.5017, -73.5673),
  row('YVR', 'Vancouver', 'CA', 49.2827, -123.1207),
  row('GRU', 'São Paulo', 'BR', -23.5505, -46.6333),
  row('EZE', 'Buenos Aires', 'AR', -34.6037, -58.3816),
  row('SCL', 'Santiago', 'CL', -33.4489, -70.6693),
  row('BOG', 'Bogota', 'CO', 4.711, -74.0721),
  row('MEX', 'Mexico', 'MX', 19.4326, -99.1332),
  // Afrique / Moyen-Orient
  row('JNB', 'Johannesburg', 'ZA', -26.2041, 28.0473),
  row('CPT', 'Le Cap', 'ZA', -33.9249, 18.4241),
  row('LOS', 'Lagos', 'NG', 6.5244, 3.3792),
  row('NBO', 'Nairobi', 'KE', -1.2921, 36.8219),
  row('CAI', 'Le Caire', 'EG', 30.0444, 31.2357),
  row('DXB', 'Dubaï', 'AE', 25.2048, 55.2708),
  row('MRU', 'Port-louis', 'MU', -20.1619, 57.5012),
  // Asie / Océanie
  row('BOM', 'Mumbai', 'IN', 19.076, 72.8777),
  row('DEL', 'Delhi', 'IN', 28.7041, 77.1025),
  row('SIN', 'Singapour', 'SG', 1.3521, 103.8198),
  row('HKG', 'Hong Kong', 'HK', 22.3193, 114.1694),
  row('NRT', 'Tokyo', 'JP', 35.6762, 139.6503),
  row('ICN', 'Séoul', 'KR', 37.5665, 126.978),
  row('PEK', 'Pékin', 'CN', 39.9042, 116.4074),
  row('PVG', 'Shanghai', 'CN', 31.2304, 121.4737),
  row('SYD', 'Sydney', 'AU', -33.8688, 151.2093),
  row('MEL', 'Melbourne', 'AU', -37.8136, 144.9631),
  row('BEA', 'Beaumaris', 'AU', -37.9833, 145.0333),
  row('AKL', 'Auckland', 'NZ', -36.8485, 174.7633),
];

/**
 * Surcharges de POP operateur : certains routeurs portent un code interne
 * (pas un code IATA). Le site de reference les cartographie ; on reproduit
 * les cas connus, et la table reste editable.
 */
export const POP_OVERRIDES: Readonly<Record<string, CityRef>> = {
  nimar: { code: 'NIMAR', city: 'Antibes', country: 'FR', lat: 43.581, lon: 7.125 },
};

/**
 * Sites techniques par ASN : les grandes bases GeoIP s'arretent a la ville,
 * alors que l'equipement est dans une commune voisine. Ces correspondances
 * (ASN + ville GeoIP -> commune reelle) descendent a la granularite commune.
 */
export interface FacilityOverride {
  asn: number;
  city: string;
  to: string;
  lat: number;
  lon: number;
}

export const FACILITY_OVERRIDES: readonly FacilityOverride[] = [
  { asn: 3215, city: 'Paris', to: 'Châtillon', lat: 48.8022, lon: 2.2901 },
  { asn: 45102, city: 'Sterling', to: 'Leesburg', lat: 39.1157, lon: -77.5636 },
  { asn: 45102, city: 'Washington', to: 'Leesburg', lat: 39.1157, lon: -77.5636 },
];

/** Commune d'enregistrement -> ville du POP (ancre). */
export const ANCHOR_OVERRIDES: Readonly<Record<string, CityRef>> = {
  'Le Rouret': { code: 'RRT', city: 'Cannes', country: 'FR', lat: 43.551, lon: 7.013 },
};

const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

/** Mots fréquents des noms d'équipements : ne doivent jamais être pris pour un code. */
export const HOSTNAME_STOPWORDS: ReadonlySet<string> = new Set([
  'atlas',
  'cogent',
  'cogentco',
  'level3',
  'telia',
  'gtt',
  'zayo',
  'lumen',
  'orange',
  'verizon',
  'telefonica',
  'deutsche',
  'bouygues',
  'trellian',
  'above',
  'cloud',
  'server',
  'network',
  'router',
  'core',
  'edge',
  'backbone',
  'transit',
  'border',
  'host',
  'hosted',
  'bundle',
]);

/** Index par nom de ville normalisé (`san diego` → ville). */
const BY_NAME = new Map(
  AIRPORTS.map((a) => [a.city.toLowerCase().replace(/[^a-z]/g, ''), a]),
);

/** Recherche par code IATA exact. */
export function cityByCode(code: string): CityRef | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** Recherche par nom de ville (normalisé). */
export function cityByName(name: string): CityRef | undefined {
  return BY_NAME.get(name.toLowerCase().replace(/[^a-z]/g, ''));
}

/** Nombre de villes connues (utile aux tests et au diagnostic). */
export const AIRPORT_COUNT = AIRPORTS.length;
