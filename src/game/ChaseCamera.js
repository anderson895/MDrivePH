import { MathUtils, Vector3 } from 'three';

export const CAMERA_MODES = [
	{ name: 'Chase', distance: 7.5, height: 2.4, look: 1.2, fov: 60 },
	{ name: 'Far chase', distance: 14, height: 4.5, look: 1.5, fov: 60 },
	{ name: 'Bumper', bumper: true, fov: 72 },
	{ name: 'Drone', distance: 22, height: 32, look: 0, fov: 55 },
];

const BUMPER_EYE = new Vector3( 0, 1.0, 2.35 ); // car-local
const BUMPER_LOOK = new Vector3( 0, 1.0, 30 );
const MIN_DISTANCE = 1.5;

const _target = new Vector3();
const _desired = new Vector3();
const _dir = new Vector3();

/** Third-person camera that trails the car, can be orbited by dragging, and avoids clipping into buildings. */
export class ChaseCamera {

	#camera;
	#modeIndex = 0;
	#yaw = 0;
	#orbitYaw = 0;
	#orbitPitch = 0;
	#dragging = false;
	#snap = true;

	constructor( camera, domElement ) {

		this.#camera = camera;
		this.#bindDrag( domElement );

	}

	/** Jump straight to the target position on the next update (no smoothing). */
	reset() {

		this.#snap = true;

	}

	/** Switches to the next mode and returns its name. */
	cycle() {

		this.#modeIndex = ( this.#modeIndex + 1 ) % CAMERA_MODES.length;
		this.#snap = true;
		return this.#mode.name;

	}

	/**
	 * @param {number} dt
	 * @param {import('../vehicle/CarPhysics.js').CarPhysics} car
	 * @param {{ cast: Function }} world  used to keep the camera out of walls
	 */
	update( dt, car, world ) {

		this.#followTravelDirection( dt, car );
		this.#updateFov( dt, car.speed );

		if ( this.#mode.bumper ) this.#placeOnBumper( car );
		else this.#placeBehind( dt, car, world );

		this.#snap = false;

	}

	get #mode() {

		return CAMERA_MODES[ this.#modeIndex ];

	}

	/** Trails the direction of motion so drifts read well; drag-orbit eases back when released. */
	#followTravelDirection( dt, car ) {

		const travelYaw = car.travelYaw;
		if ( this.#snap ) this.#yaw = travelYaw;
		const delta = MathUtils.euclideanModulo( travelYaw - this.#yaw + Math.PI, Math.PI * 2 ) - Math.PI;
		this.#yaw += delta * ( 1 - Math.exp( - 4 * dt ) );

		if ( ! this.#dragging ) {

			this.#orbitYaw *= Math.exp( - 2 * dt );
			this.#orbitPitch *= Math.exp( - 2 * dt );

		}

	}

	/** Widens the view with speed for a sense of pace. */
	#updateFov( dt, speed ) {

		const camera = this.#camera;
		const mode = this.#mode;
		const fov = mode.fov + ( mode.bumper ? 0 : Math.min( speed * 0.25, 22 ) );
		if ( Math.abs( camera.fov - fov ) > 0.01 ) {

			camera.fov = MathUtils.damp( camera.fov, fov, 4, dt );
			camera.updateProjectionMatrix();

		}

	}

	#placeOnBumper( car ) {

		const camera = this.#camera;
		car.localToWorld( BUMPER_EYE, camera.position );
		camera.up.set( 0, 1, 0 );
		camera.lookAt( car.localToWorld( BUMPER_LOOK, _target ) );

	}

	#placeBehind( dt, car, world ) {

		const camera = this.#camera;
		const mode = this.#mode;
		const yaw = this.#yaw + this.#orbitYaw;
		const pitch = Math.atan2( mode.height, mode.distance ) + this.#orbitPitch;
		const dist = Math.hypot( mode.height, mode.distance );

		_target.copy( car.position );
		_target.y += mode.look;

		_dir.set(
			- Math.sin( yaw ) * Math.cos( pitch ),
			Math.sin( pitch ),
			- Math.cos( yaw ) * Math.cos( pitch ),
		);
		_desired.copy( _target ).addScaledVector( _dir, dist );

		// pull the camera in front of any wall between it and the car
		const hit = world.cast( _target, _dir, dist );
		if ( hit ) _desired.copy( _target ).addScaledVector( _dir, Math.max( MIN_DISTANCE, hit.distance - 0.4 ) );

		if ( this.#snap ) camera.position.copy( _desired );
		else camera.position.lerp( _desired, 1 - Math.exp( - 10 * dt ) );

		camera.up.set( 0, 1, 0 );
		camera.lookAt( _target );

	}

	#bindDrag( domElement ) {

		let lastX = 0;
		let lastY = 0;
		domElement.addEventListener( 'pointerdown', e => {

			this.#dragging = true;
			lastX = e.clientX;
			lastY = e.clientY;
			domElement.setPointerCapture( e.pointerId );

		} );
		domElement.addEventListener( 'pointermove', e => {

			if ( ! this.#dragging ) return;
			this.#orbitYaw -= ( e.clientX - lastX ) * 0.006;
			this.#orbitPitch = MathUtils.clamp( this.#orbitPitch + ( e.clientY - lastY ) * 0.004, - 0.3, 1.1 );
			lastX = e.clientX;
			lastY = e.clientY;

		} );
		const end = () => this.#dragging = false;
		domElement.addEventListener( 'pointerup', end );
		domElement.addEventListener( 'pointercancel', end );

	}

}
