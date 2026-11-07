import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildTileGeometry } from '../src/world/osm/tileGeometry.js';

// identity-ish projection: tile units straight to metres, (px, py) -> (x, z)
const project = ( px, py ) => [ px, py ];
const ring = ( ...pts ) => [ ...pts, pts[ 0 ] ].map( ( [ x, y ] ) => ( { x, y } ) ); // closed, like MVT
const GREY = [ 0.5, 0.5, 0.5 ];

function buildingMesh( buildings ) {

	const { buildings: arrays } = buildTileGeometry( { extent: 4096, buildings, roads: [], areas: [] }, project );
	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( arrays.position, 3 ) );
	const mesh = new Mesh( geometry, new MeshBasicMaterial() ); // FrontSide, like the game
	mesh.updateMatrixWorld();
	return mesh;

}

function cast( mesh, origin, direction ) {

	const raycaster = new Raycaster( new Vector3( ...origin ), new Vector3( ...direction ).normalize() );
	return raycaster.intersectObject( mesh )[ 0 ] ?? null;

}

// 10 x 10 m block from (0,0) to (10,10), 20 m tall, in both ring windings
const square = winding => winding === 'cw'
	? ring( [ 0, 0 ], [ 10, 0 ], [ 10, 10 ], [ 0, 10 ] )
	: ring( [ 0, 0 ], [ 0, 10 ], [ 10, 10 ], [ 10, 0 ] );

describe.each( [ 'cw', 'ccw' ] )( 'extruded building (%s ring)', winding => {

	const mesh = buildingMesh( [ { polygons: [ [ square( winding ) ] ], height: 20, minHeight: 0, color: GREY } ] );

	it( 'is hit from outside on every side, with the normal facing back at the ray', () => {

		for ( const [ origin, dir, expected ] of [
			[ [ - 5, 1, 5 ], [ 1, 0, 0 ], [ - 1, 0, 0 ] ],
			[ [ 15, 1, 5 ], [ - 1, 0, 0 ], [ 1, 0, 0 ] ],
			[ [ 5, 1, - 5 ], [ 0, 0, 1 ], [ 0, 0, - 1 ] ],
			[ [ 5, 1, 15 ], [ 0, 0, - 1 ], [ 0, 0, 1 ] ],
		] ) {

			const hit = cast( mesh, origin, dir );
			expect( hit, `ray from ${ origin }` ).not.toBeNull();
			expect( hit.distance ).toBeCloseTo( 5 );
			expect( hit.face.normal.toArray().map( v => Math.round( v ) + 0 ) ).toEqual( expected );

		}

	} );

	it( 'lets a car inside the walls back out (walls are one-sided)', () => {

		expect( cast( mesh, [ 5, 1, 5 ], [ 1, 0, 0 ] ) ).toBeNull();

	} );

	it( 'has a roof facing up at the building height', () => {

		const hit = cast( mesh, [ 5, 100, 5 ], [ 0, - 1, 0 ] );
		expect( hit.point.y ).toBeCloseTo( 20 );
		expect( hit.face.normal.y ).toBeCloseTo( 1 );

	} );

} );

describe( 'building with a courtyard', () => {

	const outer = ring( [ 0, 0 ], [ 30, 0 ], [ 30, 30 ], [ 0, 30 ] );
	const hole = ring( [ 10, 10 ], [ 10, 20 ], [ 20, 20 ], [ 20, 10 ] );
	const mesh = buildingMesh( [ { polygons: [ [ outer, hole ] ], height: 12, minHeight: 0, color: GREY } ] );

	it( 'courtyard walls face into the courtyard', () => {

		const hit = cast( mesh, [ 15, 1, 15 ], [ 1, 0, 0 ] );
		expect( hit.distance ).toBeCloseTo( 5 );
		expect( Math.round( hit.face.normal.x ) ).toBe( - 1 );

	} );

	it( 'the courtyard is open to the sky, the roof is not', () => {

		expect( cast( mesh, [ 15, 100, 15 ], [ 0, - 1, 0 ] ) ).toBeNull();
		expect( cast( mesh, [ 5, 100, 5 ], [ 0, - 1, 0 ] ).point.y ).toBeCloseTo( 12 );

	} );

} );

describe( 'flat layers', () => {

	it( 'roads and parks are upward-facing triangles near y = 0', () => {

		const { flat } = buildTileGeometry( {
			extent: 4096,
			buildings: [],
			roads: [ { lines: [ [ { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 } ] ], width: 8, foot: false } ],
			areas: [ { polygons: [ [ square( 'cw' ) ] ], kind: 'park' } ],
		}, project );

		const p = flat.position;
		expect( p.length ).toBeGreaterThan( 0 );
		for ( let i = 0; i < p.length; i += 9 ) {

			const ux = p[ i + 3 ] - p[ i ], uz = p[ i + 5 ] - p[ i + 2 ];
			const vx = p[ i + 6 ] - p[ i ], vz = p[ i + 8 ] - p[ i + 2 ];
			expect( uz * vx - ux * vz ).toBeGreaterThanOrEqual( 0 ); // normal.y >= 0
			expect( Math.abs( p[ i + 1 ] ) ).toBeLessThan( 0.1 );

		}

	} );

} );
