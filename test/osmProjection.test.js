import { describe, expect, it } from 'vitest';
import { createLocalProjection, createTileProjector, latLonToTile, tileToLatLon } from '../src/world/osm/projection.js';

describe( 'createLocalProjection', () => {

	const proj = createLocalProjection( 14.5541, 121.0242 );

	it( 'uses the same axes as the 3D tiles world: +Z north, -X east', () => {

		const north = proj.toLocal( 14.5541 + 0.001, 121.0242 );
		const east = proj.toLocal( 14.5541, 121.0242 + 0.001 );
		expect( north.z ).toBeCloseTo( 111.3, 0 );
		expect( north.x ).toBeCloseTo( 0, 6 );
		expect( east.x ).toBeCloseTo( - 107.8, 0 );

	} );

	it( 'round-trips lat/lon', () => {

		const { x, z } = proj.toLocal( 14.5641, 121.0042 );
		const back = proj.toLatLon( x, z );
		expect( back.lat ).toBeCloseTo( 14.5641, 9 );
		expect( back.lon ).toBeCloseTo( 121.0042, 9 );

	} );

} );

describe( 'tile math', () => {

	it( 'round-trips through Web Mercator tile coordinates', () => {

		const t = latLonToTile( 40.758, - 73.9855, 14 );
		expect( Math.floor( t.x ) ).toBe( 4824 );
		expect( Math.floor( t.y ) ).toBe( 6157 ); // y = (1 - ln(tan φ + sec φ) / π) / 2 · 2^14 = 6157.2
		const back = tileToLatLon( t.x, t.y, 14 );
		expect( back.lat ).toBeCloseTo( 40.758, 9 );
		expect( back.lon ).toBeCloseTo( - 73.9855, 9 );

	} );

	it( 'maps tile pixels so that +px is east and +py is south', () => {

		const origin = tileToLatLon( 13655, 7592, 14 );
		const project = createTileProjector( { x: 13655, y: 7592, z: 14 }, 4096, createLocalProjection( origin.lat, origin.lon ) );
		const [ x0, z0 ] = project( 0, 0 );
		const [ xe ] = project( 4096, 0 );
		const [ , zs ] = project( 0, 4096 );
		expect( x0 ).toBeCloseTo( 0, 6 );
		expect( z0 ).toBeCloseTo( 0, 6 );
		expect( xe ).toBeLessThan( - 2000 ); // a z14 tile is ~2.4 km wide here, east is -X
		expect( zs ).toBeLessThan( - 2000 ); // south is -Z

	} );

} );
