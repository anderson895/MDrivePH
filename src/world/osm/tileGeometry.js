import { Color, ShapeUtils, Vector2 } from 'three';
import { VectorTile, classifyRings } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

// OpenMapTiles road classes -> full ribbon width in metres. Classes not listed (rail, ferry…) are skipped.
const ROAD_WIDTH = {
	motorway: 14, trunk: 12, primary: 11, secondary: 9, tertiary: 8,
	minor: 6, service: 4, raceway: 8, busway: 6, track: 3, path: 2,
};
const FOOT_CLASSES = new Set( [ 'path', 'track' ] );
const LANDCOVER_KINDS = { grass: 'grass', wood: 'wood', farmland: 'grass', wetland: 'grass' };

const MIN_BUILDING_HEIGHT = 3;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const JOINT_SEGMENTS = 8;

// Flat layers stack just below the drivable y = 0 plane (and roads sit on it) so they never z-fight.
const LAYER_Y = { grass: - 0.04, wood: - 0.04, park: - 0.035, water: - 0.03, road: 0, foot: 0.005 };

const COLORS = {
	grass: color( '#cfe1b9' ),
	wood: color( '#b6d39e' ),
	park: color( '#c8e0b2' ),
	water: color( '#9cc6e8' ),
	road: color( '#62666d' ),
	foot: color( '#b9b2a6' ),
	building: color( '#d9d2c7' ),
};
const ROOF_SHADE = 0.88;
const WALL_BASE_SHADE = 0.68; // darker wall bottoms read as contact shadow

/** Vertex colours are linear; Color converts from the sRGB hex. */
function color( css ) {

	return new Color( css ).toArray();

}

/**
 * @typedef {{ x: number, y: number }} TilePoint
 * @typedef {object} DecodedTile
 * @property {number} extent
 * @property {Array<{ polygons: TilePoint[][][], height: number, minHeight: number, color: number[] }>} buildings
 * @property {Array<{ lines: TilePoint[][], width: number, foot: boolean }>} roads
 * @property {Array<{ polygons: TilePoint[][][], kind: string }>} areas
 */

/** Pulls the layers the game draws out of an OpenMapTiles vector tile. @returns {DecodedTile} */
export function decodeTile( buffer ) {

	const { layers } = new VectorTile( new PbfReader( new Uint8Array( buffer ) ) );
	const decoded = { extent: 4096, buildings: [], roads: [], areas: [] };

	eachFeature( layers.building, 3, f => {

		if ( f.properties.hide_3d ) return; // outline drawn by its building:part pieces instead
		decoded.buildings.push( {
			polygons: classifyRings( f.loadGeometry() ),
			height: Math.max( Number( f.properties.render_height ) || 0, MIN_BUILDING_HEIGHT ),
			minHeight: Number( f.properties.render_min_height ) || 0,
			color: HEX_COLOR.test( f.properties.colour ) ? color( f.properties.colour ) : COLORS.building,
		} );

	} );

	eachFeature( layers.transportation, 2, f => {

		const width = ROAD_WIDTH[ f.properties.class ];
		if ( ! width || f.properties.brunnel === 'tunnel' ) return;
		decoded.roads.push( { lines: f.loadGeometry(), width, foot: FOOT_CLASSES.has( f.properties.class ) } );

	} );

	eachFeature( layers.water, 3, f => decoded.areas.push( { polygons: classifyRings( f.loadGeometry() ), kind: 'water' } ) );
	eachFeature( layers.park, 3, f => decoded.areas.push( { polygons: classifyRings( f.loadGeometry() ), kind: 'park' } ) );
	eachFeature( layers.landcover, 3, f => {

		const kind = LANDCOVER_KINDS[ f.properties.class ];
		if ( kind ) decoded.areas.push( { polygons: classifyRings( f.loadGeometry() ), kind } );

	} );

	const extent = layers.building?.extent ?? layers.transportation?.extent;
	if ( extent ) decoded.extent = extent;
	return decoded;

}

function eachFeature( layer, type, fn ) {

	if ( ! layer ) return;
	for ( let i = 0; i < layer.length; i ++ ) {

		const feature = layer.feature( i );
		if ( feature.type === type ) fn( feature );

	}

}

/**
 * Turns a decoded tile into flat typed arrays (transferable from a worker).
 * `buildings` is the solid, ray-castable mesh; `flat` holds ground decals (roads, water, parks).
 *
 * @param {DecodedTile} decoded
 * @param {( px: number, py: number ) => [ number, number ]} project  tile grid -> local [x, z]
 */
export function buildTileGeometry( decoded, project ) {

	const solid = new MeshBuffers( true );
	const flat = new MeshBuffers( false );

	for ( const area of decoded.areas ) {

		for ( const polygon of area.polygons ) addFlatPolygon( flat, projectRings( polygon, project ), LAYER_Y[ area.kind ], COLORS[ area.kind ] );

	}

	for ( const road of decoded.roads ) {

		const kind = road.foot ? 'foot' : 'road';
		for ( const line of road.lines ) addRibbon( flat, line.map( p => project( p.x, p.y ) ), road.width, LAYER_Y[ kind ], COLORS[ kind ] );

	}

	for ( const b of decoded.buildings ) {

		const roof = b.color.map( c => c * ROOF_SHADE );
		for ( const polygon of b.polygons ) addBuilding( solid, projectRings( polygon, project ), b.minHeight, b.height, b.color, roof );

	}

	return { buildings: solid.toArrays(), flat: flat.toArrays() };

}

/** Projects rings to [x, z] and drops the closing duplicate point. */
function projectRings( polygon, project ) {

	return polygon.map( ring => {

		const pts = ring.map( p => project( p.x, p.y ) );
		const first = pts[ 0 ], last = pts[ pts.length - 1 ];
		if ( pts.length > 1 && first[ 0 ] === last[ 0 ] && first[ 1 ] === last[ 1 ] ) pts.pop();
		return pts;

	} ).filter( ring => ring.length >= 3 );

}

/** Extrudes one polygon (outer ring + holes) into outward-facing walls and an upward-facing roof. */
export function addBuilding( out, rings, bottom, top, wallColor, roofColor ) {

	if ( rings.length === 0 || top <= bottom ) return;
	rings.forEach( ( ring, i ) => addWalls( out, ring, i > 0, bottom, top, wallColor ) );
	addFlatPolygon( out, rings, top, roofColor );

}

/**
 * Wall quads with their front faces pointing away from the solid. Ray casts use FrontSide,
 * so the car hits walls from outside and can always back out if it ends up inside.
 */
function addWalls( out, ring, isHole, bottom, top, rgb ) {

	const base = rgb.map( c => c * WALL_BASE_SHADE );

	const ccw = signedArea( ring ) > 0;
	// solid is left of travel for a ccw outer ring; flip for cw rings and for holes
	const outwardIsRight = ccw !== isHole;

	for ( let i = 0; i < ring.length; i ++ ) {

		const [ ax, az ] = ring[ i ];
		const [ bx, bz ] = ring[ ( i + 1 ) % ring.length ];
		const dx = bx - ax, dz = bz - az;
		const len = Math.hypot( dx, dz );
		if ( len < 1e-6 ) continue;

		// right perpendicular of (dx, dz) is (dz, -dx)
		const nx = ( outwardIsRight ? dz : - dz ) / len;
		const nz = ( outwardIsRight ? - dx : dx ) / len;
		const a0 = [ ax, bottom, az ], b0 = [ bx, bottom, bz ], b1 = [ bx, top, bz ], a1 = [ ax, top, az ];

		// (a0, b0, b1) faces the left perpendicular; swap the winding when outward is right
		if ( outwardIsRight ) {

			out.triangle( a0, b1, b0, [ nx, 0, nz ], base, rgb, base );
			out.triangle( a0, a1, b1, [ nx, 0, nz ], base, rgb, rgb );

		} else {

			out.triangle( a0, b0, b1, [ nx, 0, nz ], base, base, rgb );
			out.triangle( a0, b1, a1, [ nx, 0, nz ], base, rgb, rgb );

		}

	}

}

/** Triangulates rings ([outer, ...holes]) into an upward-facing surface at height y. */
function addFlatPolygon( out, rings, y, rgb ) {

	if ( rings.length === 0 ) return;
	const contour = rings[ 0 ].map( ( [ x, z ] ) => new Vector2( x, z ) );
	const holes = rings.slice( 1 ).map( ring => ring.map( ( [ x, z ] ) => new Vector2( x, z ) ) );
	const faces = ShapeUtils.triangulateShape( contour, holes ); // may trim duplicate end points in place
	const points = [ ...contour, ...holes.flat() ];

	for ( const [ a, b, c ] of faces ) {

		out.upTriangle( points[ a ], points[ b ], points[ c ], y, rgb );

	}

}

/** Road as a strip of quads plus round joints so corners don't show gaps. */
function addRibbon( out, line, width, y, rgb ) {

	const half = width / 2;
	for ( let i = 0; i < line.length - 1; i ++ ) {

		const [ ax, az ] = line[ i ];
		const [ bx, bz ] = line[ i + 1 ];
		const len = Math.hypot( bx - ax, bz - az );
		if ( len < 1e-3 ) continue;

		const ox = - ( bz - az ) / len * half;
		const oz = ( bx - ax ) / len * half;
		const p1 = { x: ax + ox, y: az + oz }, p2 = { x: ax - ox, y: az - oz };
		const p3 = { x: bx - ox, y: bz - oz }, p4 = { x: bx + ox, y: bz + oz };
		out.upTriangle( p1, p2, p3, y, rgb );
		out.upTriangle( p1, p3, p4, y, rgb );

	}

	for ( const [ x, z ] of line ) addDisc( out, x, z, half, y, rgb );

}

function addDisc( out, cx, cz, r, y, rgb ) {

	const center = { x: cx, y: cz };
	for ( let i = 0; i < JOINT_SEGMENTS; i ++ ) {

		const a0 = i / JOINT_SEGMENTS * Math.PI * 2;
		const a1 = ( i + 1 ) / JOINT_SEGMENTS * Math.PI * 2;
		out.upTriangle(
			center,
			{ x: cx + Math.cos( a0 ) * r, y: cz + Math.sin( a0 ) * r },
			{ x: cx + Math.cos( a1 ) * r, y: cz + Math.sin( a1 ) * r },
			y,
			rgb,
		);

	}

}

/** Shoelace area in the x/z plane (positive = counter-clockwise in x/z). */
function signedArea( ring ) {

	let sum = 0;
	for ( let i = 0; i < ring.length; i ++ ) {

		const [ x1, z1 ] = ring[ i ];
		const [ x2, z2 ] = ring[ ( i + 1 ) % ring.length ];
		sum += x1 * z2 - x2 * z1;

	}

	return sum / 2;

}

/** Growable position / normal / colour arrays for a non-indexed mesh. */
class MeshBuffers {

	#withNormals;
	position = [];
	normal = [];
	color = [];

	constructor( withNormals ) {

		this.#withNormals = withNormals;

	}

	/** Vertex colours default to the first one for a flat-coloured triangle. */
	triangle( a, b, c, n, ca, cb = ca, cc = ca ) {

		this.position.push( ...a, ...b, ...c );
		this.color.push( ...ca, ...cb, ...cc );
		if ( this.#withNormals ) this.normal.push( ...n, ...n, ...n );

	}

	/** Triangle from 2D points ({ x, y } = local x / z) at height y, wound to face +Y. */
	upTriangle( a, b, c, y, rgb ) {

		// y component of (b - a) x (c - a), using x/z coordinates
		const crossY = ( b.y - a.y ) * ( c.x - a.x ) - ( b.x - a.x ) * ( c.y - a.y );
		const [ p, q ] = crossY >= 0 ? [ b, c ] : [ c, b ];
		this.triangle( [ a.x, y, a.y ], [ p.x, y, p.y ], [ q.x, y, q.y ], [ 0, 1, 0 ], rgb );

	}

	toArrays() {

		return {
			position: new Float32Array( this.position ),
			normal: this.#withNormals ? new Float32Array( this.normal ) : null,
			color: new Float32Array( this.color ),
		};

	}

}
