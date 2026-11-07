// Free OSM-based services. All are shared public servers: requests are user-triggered
// or throttled, never per frame.

const OSRM = 'https://router.project-osrm.org';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

async function fetchJSON( url, timeout = 6000 ) {

	const ctrl = new AbortController();
	const timer = setTimeout( () => ctrl.abort(), timeout );
	try {

		const res = await fetch( url, { signal: ctrl.signal, headers: { 'Accept-Language': 'en' } } );
		if ( ! res.ok ) throw new Error( `${ res.status } ${ res.statusText }` );
		return await res.json();

	} finally {

		clearTimeout( timer );

	}

}

/** Snaps a point to the nearest drivable road. Falls back to the input point if OSRM is unreachable. */
export async function snapToRoad( lat, lon ) {

	try {

		const data = await fetchJSON( `${ OSRM }/nearest/v1/driving/${ lon },${ lat }?number=1` );
		const wp = data.waypoints?.[ 0 ];
		if ( wp && wp.distance < 400 ) return { lat: wp.location[ 1 ], lon: wp.location[ 0 ], road: wp.name, snapped: true };

	} catch ( e ) {

		console.warn( 'Road snapping unavailable:', e.message );

	}

	return { lat, lon, road: '', snapped: false };

}

/** Place search (geocoding). Call on submit, not on every keystroke. */
export async function searchPlaces( query ) {

	const params = new URLSearchParams( { q: query, format: 'json', limit: '6' } );
	const results = await fetchJSON( `${ NOMINATIM }/search?${ params }` );
	return results.map( r => ( {
		name: r.display_name,
		lat: parseFloat( r.lat ),
		lon: parseFloat( r.lon ),
	} ) );

}

let lastReverse = 0;

/** Short "street, city" label for a point. Throttled to Nominatim's 1 request/second policy. */
export async function reverseGeocode( lat, lon ) {

	const now = Date.now();
	if ( now - lastReverse < 1500 ) return null;
	lastReverse = now;

	const params = new URLSearchParams( { lat, lon, format: 'json', zoom: '17' } );
	const r = await fetchJSON( `${ NOMINATIM }/reverse?${ params }` );
	const a = r.address || {};
	const street = a.road || a.pedestrian || a.neighbourhood || '';
	const area = a.suburb || a.city_district || a.city || a.town || a.village || a.municipality || '';
	return [ street, area ].filter( Boolean ).join( ', ' ) || r.display_name;

}
