import { MathUtils, Matrix4, Raycaster, Vector3 } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer';
import {
	GLTFExtensionsPlugin,
	ReorientationPlugin,
	TileCompressionPlugin,
	TilesFadePlugin,
	UnloadTilesPlugin,
} from '3d-tiles-renderer/plugins';
import { disposeBVH, markForLazyBVH } from './lazyBvh.js';

const _inv = new Matrix4();
const _vec = new Vector3();
const _cart = {};

/**
 * Streams the Google Photorealistic 3D Tiles and gives the game what it needs from them:
 * ray queries against the city mesh and conversions between the local driving frame
 * and latitude / longitude.
 *
 * Local frame (set by ReorientationPlugin): origin on the ellipsoid at the spawn
 * point, +Y up, +Z north, +X west.
 */
export class World {

	#tiles;
	#reorientation;
	#raycaster = new Raycaster();
	#camera;
	#renderer;
	#attributionLabel;

	/**
	 * @param {object} options
	 * @param {object} options.authPlugin  3d-tiles-renderer auth plugin (Google or Cesium ion)
	 * @param {string} options.attributionLabel  data owner shown in bold before the credits
	 * @param {number} options.errorTarget  screen-space error in px; lower = sharper and heavier
	 * @param {import('three').WebGLRenderer} options.renderer
	 * @param {import('three').PerspectiveCamera} options.camera
	 * @param {( error: Error ) => void} [options.onError]  the root tileset failed (bad key, quota…)
	 */
	constructor( { authPlugin, attributionLabel, errorTarget, renderer, camera, onError = () => {} } ) {

		const tiles = new TilesRenderer();
		tiles.registerPlugin( authPlugin );
		tiles.registerPlugin( new GLTFExtensionsPlugin( { dracoLoader: new DRACOLoader() } ) );
		tiles.registerPlugin( new TileCompressionPlugin() );
		tiles.registerPlugin( new TilesFadePlugin() );
		tiles.registerPlugin( new UnloadTilesPlugin() );

		this.#reorientation = new ReorientationPlugin( { lat: 0, lon: 0, recenter: true } );
		tiles.registerPlugin( this.#reorientation );

		// the auth plugins apply their own recommended errorTarget once the root loads
		tiles.addEventListener( 'load-root-tileset', () => tiles.errorTarget = errorTarget );
		tiles.addEventListener( 'load-model', ( { scene } ) => markForLazyBVH( scene ) );
		tiles.addEventListener( 'dispose-model', ( { scene } ) => disposeBVH( scene ) );
		tiles.addEventListener( 'load-error', ( { error, url } ) => {

			// only the root failing is fatal (bad key, API not enabled, quota); single tiles retry later
			if ( url === tiles.rootURL || ! tiles.root ) onError( error );

		} );

		tiles.setCamera( camera );
		tiles.setResolutionFromRenderer( camera, renderer );

		this.#tiles = tiles;
		this.#camera = camera;
		this.#renderer = renderer;
		this.#attributionLabel = attributionLabel;
		this.#raycaster.firstHitOnly = true;

	}

	/** Scene node holding the tiles. */
	get group() {

		return this.#tiles.group;

	}

	/** True once the root tileset has loaded, so the lat/lon conversions are valid. */
	get isReady() {

		return Boolean( this.#tiles.root );

	}

	/** 0..1 for the tiles currently needed by the camera. */
	get loadProgress() {

		return this.#tiles.loadProgress;

	}

	/** Photogrammetry stays sharp far away, so the haze can start late. */
	get fogRange() {

		return { near: 2500, far: 18000 };

	}

	/** @returns {Array<{ type: string, value: string }>} data credits that must be displayed */
	getAttributions() {

		return [ { type: 'label', value: this.#attributionLabel }, ...this.#tiles.getAttributions() ];

	}

	/** Call once per frame, after the camera has moved. */
	update() {

		this.#camera.updateMatrixWorld();
		this.#tiles.setResolutionFromRenderer( this.#camera, this.#renderer );
		this.#tiles.update();

	}

	/** Moves the tileset so (lat, lon) in degrees sits at the local origin. */
	setOrigin( lat, lon ) {

		const reorientation = this.#reorientation;
		reorientation.lat = lat * MathUtils.DEG2RAD;
		reorientation.lon = lon * MathUtils.DEG2RAD;
		// applies now, and again automatically when the root tileset arrives
		reorientation.transformLatLonHeightToOrigin( reorientation.lat, reorientation.lon );

	}

	/** First hit along a ray, with the face normal converted to world space. */
	cast( origin, direction, far ) {

		const raycaster = this.#raycaster;
		raycaster.set( origin, direction );
		raycaster.far = far;

		const hit = raycaster.intersectObject( this.group, true )[ 0 ];
		if ( ! hit ) return null;

		const normal = hit.face
			? hit.face.normal.clone().transformDirection( hit.object.matrixWorld )
			: new Vector3( 0, 1, 0 );

		return { point: hit.point, distance: hit.distance, normal };

	}

	/** Local position -> { lat, lon, height } in degrees / metres above the ellipsoid. */
	toLatLon( position, target = {} ) {

		this.group.updateMatrixWorld();
		_inv.copy( this.group.matrixWorld ).invert();
		_vec.copy( position ).applyMatrix4( _inv );
		this.#tiles.ellipsoid.getPositionToCartographic( _vec, _cart );

		target.lat = _cart.lat * MathUtils.RAD2DEG;
		target.lon = _cart.lon * MathUtils.RAD2DEG;
		target.height = _cart.height;
		return target;

	}

	/** Lat / lon in degrees -> local position at the given ellipsoid height. */
	fromLatLon( lat, lon, height = 0, target = new Vector3() ) {

		this.group.updateMatrixWorld();
		this.#tiles.ellipsoid.getCartographicToPosition( lat * MathUtils.DEG2RAD, lon * MathUtils.DEG2RAD, height, target );
		return target.applyMatrix4( this.group.matrixWorld );

	}

	dispose() {

		this.#tiles.dispose();

	}

}
