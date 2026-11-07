// Coordinate helpers for the OpenStreetMap world.
// Local frame matches World: origin at the spawn point, +Y up, +Z north, +X west.

const EARTH_RADIUS = 6378137;
const DEG = Math.PI / 180;
const METRES_PER_DEGREE = EARTH_RADIUS * DEG;

/**
 * Flat local tangent plane around (lat0, lon0). Accurate to well under a metre across
 * the few kilometres of tiles that are loaded at once.
 */
export function createLocalProjection( lat0, lon0 ) {

	const lonScale = METRES_PER_DEGREE * Math.cos( lat0 * DEG );
	return {
		lat0,
		lon0,
		toLocal: ( lat, lon ) => ( { x: - ( lon - lon0 ) * lonScale, z: ( lat - lat0 ) * METRES_PER_DEGREE } ),
		toLatLon: ( x, z ) => ( { lat: lat0 + z / METRES_PER_DEGREE, lon: lon0 - x / lonScale } ),
	};

}

/** Web Mercator tile containing (lat, lon), as fractional tile coordinates. */
export function latLonToTile( lat, lon, zoom ) {

	const n = 2 ** zoom;
	const r = lat * DEG;
	return {
		x: ( lon + 180 ) / 360 * n,
		y: ( 1 - Math.log( Math.tan( r ) + 1 / Math.cos( r ) ) / Math.PI ) / 2 * n,
	};

}

/** Inverse of latLonToTile; fractional tile coordinates are allowed. */
export function tileToLatLon( x, y, zoom ) {

	const n = 2 ** zoom;
	return {
		lat: Math.atan( Math.sinh( Math.PI * ( 1 - 2 * y / n ) ) ) / DEG,
		lon: x / n * 360 - 180,
	};

}

/** Maps a point in a vector tile's own grid (0..extent) to local [x, z] metres. */
export function createTileProjector( tile, extent, projection ) {

	return ( px, py ) => {

		const { lat, lon } = tileToLatLon( tile.x + px / extent, tile.y + py / extent, tile.z );
		const { x, z } = projection.toLocal( lat, lon );
		return [ x, z ];

	};

}
