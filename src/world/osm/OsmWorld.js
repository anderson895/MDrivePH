import {
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	Mesh,
	MeshLambertMaterial,
	PlaneGeometry,
	Raycaster,
	Vector3,
} from 'three';
import { markForLazyBVH } from '../lazyBvh.js';
import { createLocalProjection, latLonToTile, tileToLatLon } from './projection.js';

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const ZOOM = 14; // highest zoom OpenFreeMap serves; ~2 km tiles with every building
const LOAD_RADIUS = 2000; // metres around the camera that must be loaded
const UNLOAD_RADIUS = 3000; // hysteresis so tiles at the edge don't flicker in and out
const SEARCH_TILES = 2; // tiles checked in each direction around the camera's tile
const MAX_IN_FLIGHT = 4;
const RETRY_MS = 5000;
const GROUND_COLOR = 0xe3ded3;
const GROUND_SIZE = 12000;
// The scene lights are tuned for the glossy car; matte map colours need taming to not wash out.
const EXPOSURE = 0.5;

const UP = new Vector3( 0, 1, 0 );

/**
 * Keyless world built from OpenStreetMap data (OpenFreeMap vector tiles): extruded buildings
 * with their mapped heights, plus roads, water and parks on a flat ground plane.
 *
 * Same interface as World, so the car, camera, spawner and HUD don't know which one they use.
 * Local frame: origin at setOrigin(), +Y up, +Z north, +X west.
 */
export class OsmWorld {

	#group = new Group();
	#ground;
	#camera;
	#onError;
	#worker;
	#raycaster = new Raycaster();
	#buildingMaterial = new MeshLambertMaterial( { vertexColors: true, color: new Color().setScalar( EXPOSURE ) } );
	#flatMaterial = new MeshLambertMaterial( { vertexColors: true, color: new Color().setScalar( EXPOSURE ) } );

	#template = null; // tile URL from the TileJSON
	#projection = null;
	#generation = 0; // bumps on setOrigin; late worker results from an older origin are dropped
	#tiles = new Map(); // "x/y" -> { x, y, state: 'idle' | 'loading' | 'ready' | 'failed', meshes, retryAt }
	#requests = new Map(); // request id -> { key, generation }
	#nextRequestId = 0;
	#inFlight = 0;
	#buildingMeshes = [];
	#desired = [];

	/**
	 * @param {object} options
	 * @param {import('three').PerspectiveCamera} options.camera  tiles stream in around it
	 * @param {( error: Error ) => void} [options.onError]  the map service could not be reached
	 * @param {string} [options.tileJsonUrl]
	 */
	constructor( { camera, onError = () => {}, tileJsonUrl = TILEJSON_URL } ) {

		this.#camera = camera;
		this.#onError = onError;

		this.#ground = new Mesh( new PlaneGeometry( GROUND_SIZE, GROUND_SIZE ), new MeshLambertMaterial( { color: new Color( GROUND_COLOR ).multiplyScalar( EXPOSURE ) } ) );
		this.#ground.rotation.x = - Math.PI / 2;
		this.#ground.position.y = - 0.05;
		this.#group.add( this.#ground );

		this.#worker = new Worker( new URL( './osmTile.worker.js', import.meta.url ), { type: 'module' } );
		this.#worker.onmessage = e => this.#onTileBuilt( e.data );
		this.#worker.onerror = e => this.#onError( new Error( e.message || 'tile worker failed' ) );

		this.#loadTileJson( tileJsonUrl );

	}

	get group() {

		return this.#group;

	}

	get isReady() {

		return this.#template !== null && this.#projection !== null;

	}

	/** Share of the tiles around the camera that have finished (or given up) loading. */
	get loadProgress() {

		if ( ! this.isReady || this.#desired.length === 0 ) return 0;
		const done = this.#desired.filter( key => {

			const state = this.#tiles.get( key )?.state;
			return state === 'ready' || state === 'failed';

		} );
		return done.length / this.#desired.length;

	}

	/** Haze that hides where the loaded tiles end. */
	get fogRange() {

		return { near: 700, far: LOAD_RADIUS };

	}

	getAttributions() {

		return [
			{ type: 'label', value: '© OpenStreetMap contributors' },
			{ type: 'string', value: 'OpenFreeMap © OpenMapTiles' },
		];

	}

	setOrigin( lat, lon ) {

		this.#generation ++;
		for ( const key of [ ...this.#tiles.keys() ] ) this.#unload( key );
		this.#desired = [];
		this.#projection = createLocalProjection( lat, lon );

	}

	update() {

		if ( ! this.isReady ) return;
		const cam = this.#camera.position;
		this.#ground.position.set( cam.x, - 0.05, cam.z );

		const wanted = this.#tilesAround( cam );
		this.#desired = wanted.filter( t => t.distance <= LOAD_RADIUS ).map( t => t.key );
		for ( const t of wanted ) {

			if ( t.distance <= LOAD_RADIUS && ! this.#tiles.has( t.key ) ) this.#tiles.set( t.key, { x: t.x, y: t.y, state: 'idle', meshes: [], retryAt: 0 } );

		}

		this.#requestMissing();
		this.#unloadFar( cam );

	}

	/** Nearest hit against the ground plane (y = 0) and the buildings. */
	cast( origin, direction, far ) {

		let best = null;
		if ( direction.y < - 1e-9 && origin.y >= 0 ) {

			const t = - origin.y / direction.y;
			if ( t <= far ) best = { point: origin.clone().addScaledVector( direction, t ), distance: t, normal: UP.clone() };

		}

		const raycaster = this.#raycaster;
		raycaster.firstHitOnly = true;
		raycaster.set( origin, direction );
		raycaster.far = best ? best.distance : far;
		const hit = raycaster.intersectObjects( this.#buildingMeshes, false )[ 0 ];
		if ( hit ) best = { point: hit.point, distance: hit.distance, normal: hit.face.normal.clone() };

		return best;

	}

	toLatLon( position, target = {} ) {

		const { lat, lon } = this.#projection.toLatLon( position.x, position.z );
		target.lat = lat;
		target.lon = lon;
		target.height = position.y;
		return target;

	}

	fromLatLon( lat, lon, height = 0, target = new Vector3() ) {

		const { x, z } = this.#projection.toLocal( lat, lon );
		return target.set( x, height, z );

	}

	dispose() {

		this.#worker.terminate();
		for ( const key of [ ...this.#tiles.keys() ] ) this.#unload( key );
		this.#ground.geometry.dispose();
		this.#ground.material.dispose();
		this.#buildingMaterial.dispose();
		this.#flatMaterial.dispose();

	}

	async #loadTileJson( url ) {

		try {

			const res = await fetch( url );
			if ( ! res.ok ) throw new Error( `HTTP ${ res.status }` );
			const { tiles } = await res.json();
			if ( ! tiles?.[ 0 ] ) throw new Error( 'TileJSON has no tile URL' );
			this.#template = tiles[ 0 ];

		} catch ( err ) {

			this.#onError( err );

		}

	}

	/** Tiles near the camera's tile with their distance from the camera, nearest first. */
	#tilesAround( cam ) {

		const { lat, lon } = this.#projection.toLatLon( cam.x, cam.z );
		const center = latLonToTile( lat, lon, ZOOM );
		const cx = Math.floor( center.x ), cy = Math.floor( center.y );
		const tiles = [];
		for ( let dy = - SEARCH_TILES; dy <= SEARCH_TILES; dy ++ ) {

			for ( let dx = - SEARCH_TILES; dx <= SEARCH_TILES; dx ++ ) {

				const x = cx + dx, y = cy + dy;
				tiles.push( { x, y, key: `${ x }/${ y }`, distance: this.#distanceToTile( x, y, cam ) } );

			}

		}

		return tiles.sort( ( a, b ) => a.distance - b.distance );

	}

	#distanceToTile( x, y, cam ) {

		const nw = tileToLatLon( x, y, ZOOM ), se = tileToLatLon( x + 1, y + 1, ZOOM );
		const a = this.#projection.toLocal( nw.lat, nw.lon ), b = this.#projection.toLocal( se.lat, se.lon );
		const gapX = Math.max( Math.min( a.x, b.x ) - cam.x, 0, cam.x - Math.max( a.x, b.x ) );
		const gapZ = Math.max( Math.min( a.z, b.z ) - cam.z, 0, cam.z - Math.max( a.z, b.z ) );
		return Math.hypot( gapX, gapZ );

	}

	#requestMissing() {

		const now = performance.now();
		for ( const key of this.#desired ) {

			if ( this.#inFlight >= MAX_IN_FLIGHT ) return;
			const tile = this.#tiles.get( key );
			if ( tile.state === 'idle' || ( tile.state === 'failed' && now >= tile.retryAt ) ) this.#request( key, tile );

		}

	}

	#request( key, tile ) {

		const id = this.#nextRequestId ++;
		const url = this.#template.replace( '{z}', ZOOM ).replace( '{x}', tile.x ).replace( '{y}', tile.y );
		const { lat0, lon0 } = this.#projection;
		this.#requests.set( id, { key, generation: this.#generation } );
		this.#inFlight ++;
		tile.state = 'loading';
		this.#worker.postMessage( { id, url, tile: { x: tile.x, y: tile.y, z: ZOOM }, origin: { lat: lat0, lon: lon0 } } );

	}

	#onTileBuilt( { id, geometry, error } ) {

		const request = this.#requests.get( id );
		this.#requests.delete( id );
		this.#inFlight --;
		if ( ! request || request.generation !== this.#generation ) return;

		const tile = this.#tiles.get( request.key );
		if ( ! tile || tile.state !== 'loading' ) return; // unloaded while in flight

		if ( error ) {

			console.warn( `OSM tile ${ request.key } failed: ${ error }` );
			tile.state = 'failed';
			tile.retryAt = performance.now() + RETRY_MS;
			return;

		}

		const buildings = createMesh( geometry.buildings, this.#buildingMaterial );
		const flat = createMesh( geometry.flat, this.#flatMaterial );
		tile.meshes = [ buildings, flat ].filter( Boolean );
		tile.meshes.forEach( m => this.#group.add( m ) );
		if ( buildings ) {

			markForLazyBVH( buildings );
			this.#buildingMeshes.push( buildings );
			tile.buildings = buildings;

		}

		tile.state = 'ready';

	}

	#unloadFar( cam ) {

		for ( const [ key, tile ] of this.#tiles ) {

			if ( this.#distanceToTile( tile.x, tile.y, cam ) > UNLOAD_RADIUS ) this.#unload( key );

		}

	}

	#unload( key ) {

		const tile = this.#tiles.get( key );
		if ( ! tile ) return;
		for ( const mesh of tile.meshes ) {

			this.#group.remove( mesh );
			mesh.geometry.disposeBoundsTree?.();
			mesh.geometry.dispose();

		}

		if ( tile.buildings ) this.#buildingMeshes = this.#buildingMeshes.filter( m => m !== tile.buildings );
		this.#tiles.delete( key );

	}

}

function createMesh( arrays, material ) {

	if ( ! arrays || arrays.position.length === 0 ) return null;
	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( arrays.position, 3 ) );
	geometry.setAttribute( 'color', new BufferAttribute( arrays.color, 3 ) );
	if ( arrays.normal ) geometry.setAttribute( 'normal', new BufferAttribute( arrays.normal, 3 ) );
	else geometry.computeVertexNormals();
	geometry.computeBoundingSphere();
	return new Mesh( geometry, material );

}
