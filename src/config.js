// Starting points. Coordinates are snapped to the nearest road (OSRM) before spawning,
// so they only need to be close to a drivable street. Heading is a compass bearing in degrees.
export const PRESETS = [
	{ name: 'Makati – Ayala Avenue', lat: 14.5560, lon: 121.0223, heading: 124 },
	{ name: 'BGC – 5th Avenue', lat: 14.5468, lon: 121.0462, heading: 18 },
	{ name: 'Manila – Roxas Boulevard', lat: 14.5669, lon: 120.9838, heading: 337 },
	{ name: 'New York – Times Square', lat: 40.7580, lon: - 73.9855, heading: 209 },
	{ name: 'Tokyo – Shibuya Crossing', lat: 35.6595, lon: 139.7005, heading: 0 },
	{ name: 'Paris – Champs-Élysées', lat: 48.8697, lon: 2.3081, heading: 295 },
	{ name: 'Las Vegas – The Strip', lat: 36.1147, lon: - 115.1730, heading: 0 },
	{ name: 'San Francisco – Lombard Street', lat: 37.8020, lon: - 122.4187, heading: 90 },
];

export const QUALITY = {
	low: 40,
	medium: 20,
	high: 10,
};

const STORAGE_KEY = 'mapdrive.settings';

export function loadSettings() {

	let saved = {};
	try {

		saved = JSON.parse( localStorage.getItem( STORAGE_KEY ) ) || {};

	} catch {

		// private mode or blocked storage: fall back to env/defaults

	}

	const envGoogle = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
	const envIon = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

	return {
		provider: saved.provider || ( envGoogle ? 'google' : envIon ? 'ion' : 'osm' ),
		googleKey: saved.googleKey || envGoogle,
		ionToken: saved.ionToken || envIon,
		quality: saved.quality || 'medium',
		preset: saved.preset ?? 0,
	};

}

export function saveSettings( settings ) {

	try {

		localStorage.setItem( STORAGE_KEY, JSON.stringify( settings ) );

	} catch {

		// ignore
	}

}
