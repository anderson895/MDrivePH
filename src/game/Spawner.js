import { Vector3 } from 'three';

const SPAWN_TIMEOUT = 25; // seconds before we give up waiting for full detail
const SKY_HEIGHT = 3000; // the ground probe starts this far above the car
const SETTLE_TIME = 0.75; // ground height must hold steady this long (LOD refinement)
const MIN_SPAWN_TIME = 1.5;

const ORIGIN = new Vector3();
const DOWN = new Vector3( 0, - 1, 0 );
const _probe = new Vector3();
const _spawnAt = new Vector3();

/**
 * @typedef {object} SpawnProgress
 * @property {string} title
 * @property {number} progress 0..1
 * @property {string} detail
 */

/**
 * Teleport flow: snap the target to a road, re-centre the world there, then hold the car
 * until the tiles under it have streamed in at full detail and the ground height is stable.
 */
export class Spawner {

	#world = null;
	#car;
	#snapToRoad;
	#onStart;
	#onProgress;
	#onDone;
	#state = null;

	/**
	 * @param {object} options
	 * @param {import('../vehicle/CarPhysics.js').CarPhysics} options.car
	 * @param {( lat: number, lon: number ) => Promise<{ lat: number, lon: number, road: string }>} options.snapToRoad
	 * @param {( road: { lat: number, lon: number, road: string } ) => void} options.onStart  world re-centred on the road
	 * @param {( progress: SpawnProgress ) => void} options.onProgress
	 * @param {( message: string, durationMs: number ) => void} options.onDone  car released (or gave up)
	 */
	constructor( { car, snapToRoad, onStart, onProgress, onDone } ) {

		this.#car = car;
		this.#snapToRoad = snapToRoad;
		this.#onStart = onStart;
		this.#onProgress = onProgress;
		this.#onDone = onDone;

	}

	/** The world is recreated when settings change; any spawn in flight is dropped. */
	setWorld( world ) {

		this.#world = world;
		this.#state = null;

	}

	get isActive() {

		return this.#state !== null;

	}

	cancel() {

		this.#state = null;

	}

	async teleport( lat, lon, bearing = 0 ) {

		const state = { t: 0, found: false, settled: 0, lastY: null, bearing, ready: false };
		this.#state = state;
		this.#onProgress( { title: 'Finding the nearest road…', progress: 0, detail: '' } );

		const road = await this.#snapToRoad( lat, lon );
		if ( this.#state !== state ) return; // superseded by a newer teleport, or cancelled

		this.#world.setOrigin( road.lat, road.lon );
		this.#car.place( ORIGIN, bearing );
		state.ready = true;
		this.#onStart( road );
		this.#onProgress( { title: 'Loading 3D city…', progress: 0, detail: '' } );

	}

	update( dt ) {

		const state = this.#state;
		if ( ! state?.ready ) return;
		state.t += dt;

		this.#probeGround( state, dt );

		const progress = this.#world.loadProgress;
		this.#onProgress( state.found
			? { title: 'Loading 3D city…', progress, detail: `${ Math.round( progress * 100 ) }% of visible tiles` }
			: { title: 'Connecting to 3D tiles…', progress: 0.05, detail: '' } );

		const detailed = progress >= 0.999 && state.settled > SETTLE_TIME && state.t > MIN_SPAWN_TIME;
		if ( state.found && ( detailed || state.t > SPAWN_TIMEOUT ) ) this.#finish( 'Go! 🚗', 1500 );
		else if ( ! state.found && state.t > SPAWN_TIMEOUT ) this.#finish( 'No 3D tiles here yet – try another place', 4000 );

	}

	/** Drops a ray from high above the spawn point and keeps the car on whatever it hits. */
	#probeGround( state, dt ) {

		_probe.set( 0, this.#car.position.y + SKY_HEIGHT, 0 );
		const hit = this.#world.cast( _probe, DOWN, SKY_HEIGHT * 2 );
		if ( ! hit ) return;

		const y = hit.point.y;
		state.found = true;
		state.settled = state.lastY !== null && Math.abs( y - state.lastY ) < 0.05 ? state.settled + dt : 0;
		state.lastY = y;
		this.#car.place( _spawnAt.set( 0, y, 0 ), state.bearing );

	}

	#finish( message, durationMs ) {

		this.#state = null;
		this.#onDone( message, durationMs );

	}

}
