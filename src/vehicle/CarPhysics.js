import { Euler, MathUtils, Quaternion, Vector2, Vector3 } from 'three';

// Dimensions of the Ferrari 458 model (metres), measured from the glTF file.
const WHEELBASE = 2.65;
const FRONT_AXLE = 1.155;
const REAR_AXLE = - 1.496;
const HALF_TRACK = 0.835;
const HALF_LENGTH = 2.26;
const HALF_WIDTH = 0.98;
const WHEEL_RADIUS = 0.358;

// Arcade handling.
const TOP_SPEED = 62; // m/s (~220 km/h)
const BOOST_SPEED = 88; // m/s (~315 km/h)
const BOOST_ACCEL = 1.6;
const ENGINE_ACCEL = 10;
const BRAKE_DECEL = 18;
const HANDBRAKE_DECEL = 7;
const REVERSE_ACCEL = 6;
const REVERSE_SPEED = 14;
const ROLLING_DRAG = 0.5;
const AIR_DRAG = 0.0005;
const MAX_STEER = 0.6; // rad
const MAX_LATERAL_ACCEL = 15; // limits steering at high speed
const GRIP = 12;
const DRIFT_GRIP = 1.3;
const GRAVITY = 14; // a bit heavier than real for snappier jumps

// Collision probing.
const STEP_HEIGHT = 1.4; // how high above the car ground rays start (curbs and slopes are climbable)
const BUMPER_HEIGHT = 0.75;
const WALL_NORMAL_Y = 0.55; // surfaces steeper than this count as walls
const RESTITUTION = 0.25;
const CRASH_IMPACT = 4; // m/s into a wall before onCrash fires
const BUMPER_PROBES = 5; // wall rays across the leading bumper, corners included

const WHEELS = [
	[ HALF_TRACK, FRONT_AXLE ],
	[ - HALF_TRACK, FRONT_AXLE ],
	[ HALF_TRACK, REAR_AXLE ],
	[ - HALF_TRACK, REAR_AXLE ],
];

const _down = new Vector3( 0, - 1, 0 );
const _origin = new Vector3();
const _dir = new Vector3();
const _euler = new Euler( 0, 0, 0, 'YXZ' );

/**
 * @typedef {object} Controls
 * @property {number} throttle 0..1
 * @property {number} brake 0..1 (reverses once stopped)
 * @property {number} steer -1 (left) .. 1 (right)
 * @property {boolean} handbrake
 * @property {boolean} boost
 */

/**
 * @typedef {object} RayCaster  anything that can answer ray queries, e.g. World
 * @property {( origin: Vector3, direction: Vector3, far: number ) =>
 *   ( { point: Vector3, distance: number, normal: Vector3 } | null )} cast
 */

/**
 * Arcade vehicle simulation. It knows nothing about rendering or input devices: it reads a
 * Controls snapshot, asks the world for ray hits, and exposes its state through read-only getters.
 *
 * Frame: +Y up, yaw 0 faces +Z (north). Car-local axes are x = left, y = up, z = forward.
 */
export class CarPhysics {

	#position = new Vector3();
	#quaternion = new Quaternion();
	#velocity = new Vector2(); // horizontal velocity in (x, z)
	#yaw = 0;
	#vy = 0;
	#steer = 0;
	#pitch = 0;
	#roll = 0;
	#wheelSpin = 0;
	#grounded = true;
	#ghost = false;
	#boosting = false;
	#slip = 0;
	#onCrash;

	/** @param {{ onCrash?: ( impact: number ) => void }} [options] */
	constructor( { onCrash = () => {} } = {} ) {

		this.#onCrash = onCrash;

	}

	/** Treat as read-only; returned by reference to avoid per-frame allocations. */
	get position() {

		return this.#position;

	}

	/** Body orientation (yaw, pitch and roll). Treat as read-only. */
	get quaternion() {

		return this.#quaternion;

	}

	get yaw() {

		return this.#yaw;

	}

	/** Compass heading in degrees (0 = north, 90 = east). */
	get bearing() {

		return MathUtils.euclideanModulo( - this.#yaw * MathUtils.RAD2DEG, 360 );

	}

	get speed() {

		return this.#velocity.length();

	}

	/** Signed speed along the heading (negative when reversing). */
	get forwardSpeed() {

		return this.#velocity.x * Math.sin( this.#yaw ) + this.#velocity.y * Math.cos( this.#yaw );

	}

	/** Direction of motion when driving forward at speed, otherwise the heading. */
	get travelYaw() {

		if ( this.speed > 3 && this.forwardSpeed > 0 ) return Math.atan2( this.#velocity.x, this.#velocity.y );
		return this.#yaw;

	}

	/** Front-wheel steering angle in radians (positive = right). */
	get steer() {

		return this.#steer;

	}

	/** Accumulated wheel rotation in radians. */
	get wheelSpin() {

		return this.#wheelSpin;

	}

	/** Sideways sliding speed in m/s. */
	get slip() {

		return this.#slip;

	}

	get isGrounded() {

		return this.#grounded;

	}

	get isBoosting() {

		return this.#boosting;

	}

	get isGhost() {

		return this.#ghost;

	}

	/** Ghost mode ignores walls. Returns the new state. */
	toggleGhost() {

		this.#ghost = ! this.#ghost;
		return this.#ghost;

	}

	/** Puts the car at rest at `position`, facing `bearing` degrees. */
	place( position, bearing ) {

		this.#position.copy( position );
		this.#yaw = - bearing * MathUtils.DEG2RAD;
		this.#velocity.set( 0, 0 );
		this.#vy = 0;
		this.#steer = 0;
		this.#pitch = 0;
		this.#roll = 0;
		this.#grounded = true;
		this.#updateQuaternion();

	}

	/** Converts a car-local point (x = left, y = up, z = forward) to world space. */
	localToWorld( local, target = new Vector3() ) {

		return target.copy( local ).applyQuaternion( this.#quaternion ).add( this.#position );

	}

	/**
	 * @param {number} dt seconds
	 * @param {Controls} controls
	 * @param {RayCaster} world
	 */
	update( dt, controls, world ) {

		const sinY = Math.sin( this.#yaw );
		const cosY = Math.cos( this.#yaw );

		// split velocity into heading-aligned and sideways parts
		let forward = this.#velocity.x * sinY + this.#velocity.y * cosY;
		let lateral = this.#velocity.x * cosY - this.#velocity.y * sinY;

		this.#boosting = controls.boost && controls.throttle > 0 && forward >= 0;

		if ( this.#grounded ) {

			forward = this.#applyDrive( forward, controls, dt );
			( { forward, lateral } = this.#applyGrip( forward, lateral, controls.handbrake, dt ) );

		}

		this.#slip = Math.abs( lateral );

		// back to world space using the heading from *before* steering: the velocity keeps
		// its direction for this frame, which is what lets the car slide
		this.#velocity.set( forward * sinY + lateral * cosY, forward * cosY - lateral * sinY );

		this.#applySteering( forward, controls, dt );
		this.#moveHorizontally( dt, world );
		this.#followGround( dt, world );

		this.#wheelSpin += ( this.forwardSpeed * dt ) / WHEEL_RADIUS;
		this.#updateQuaternion();

	}

	/** Engine, brakes, reverse and drag along the heading. */
	#applyDrive( forward, controls, dt ) {

		const top = this.#boosting ? BOOST_SPEED : TOP_SPEED;
		const accelBoost = this.#boosting ? BOOST_ACCEL : 1;

		if ( controls.throttle > 0 ) {

			if ( forward < - 0.5 ) forward += BRAKE_DECEL * controls.throttle * dt;
			else forward += ENGINE_ACCEL * accelBoost * controls.throttle * Math.max( 0, 1 - ( forward / top ) ** 2 ) * dt;

		}

		if ( controls.brake > 0 ) {

			if ( forward > 0.5 ) forward -= BRAKE_DECEL * controls.brake * dt;
			else forward -= REVERSE_ACCEL * controls.brake * Math.max( 0, 1 + forward / REVERSE_SPEED ) * dt;

		}

		if ( controls.handbrake ) forward = approachZero( forward, HANDBRAKE_DECEL * dt );

		// rolling resistance + air drag
		return approachZero( forward, ( ROLLING_DRAG + AIR_DRAG * forward * forward ) * dt );

	}

	/**
	 * Tires turn sideways motion back into forward motion. The handbrake lets the rear
	 * step out and scrubs most of that speed off instead.
	 */
	#applyGrip( forward, lateral, handbrake, dt ) {

		const grip = handbrake ? DRIFT_GRIP : GRIP;
		const lateralNext = lateral * Math.exp( - grip * dt );
		if ( Math.abs( forward ) > 2 ) {

			const transfer = handbrake ? 0.2 : 0.9;
			forward = Math.sign( forward ) * Math.sqrt( forward * forward + ( lateral * lateral - lateralNext * lateralNext ) * transfer );

		}

		return { forward, lateral: lateralNext };

	}

	/** Bicycle model: steering angle is limited by speed so lateral g stays sane. */
	#applySteering( forward, controls, dt ) {

		const absV = Math.abs( forward );
		const maxSteer = Math.min( MAX_STEER, Math.atan( MAX_LATERAL_ACCEL * WHEELBASE / Math.max( absV * absV, 1e-3 ) ) );
		const targetSteer = controls.steer * maxSteer;
		const steerRate = Math.abs( targetSteer ) < Math.abs( this.#steer ) ? 6 : 3;
		this.#steer += MathUtils.clamp( targetSteer - this.#steer, - steerRate * dt, steerRate * dt );

		if ( this.#grounded ) {

			const drift = controls.handbrake ? 1.5 : 1;
			this.#yaw -= ( forward / WHEELBASE ) * Math.tan( this.#steer ) * drift * dt;

		}

	}

	#moveHorizontally( dt, world ) {

		const move = this.#velocity.length() * dt;
		if ( move <= 1e-5 ) return;

		const allowed = this.#ghost ? move : this.#collideWalls( world, move );
		const scale = allowed / move;
		this.#position.x += this.#velocity.x * dt * scale;
		this.#position.z += this.#velocity.y * dt * scale;

	}

	/** Probes ahead from the bumper corners. On a hit, slides along the wall and returns how far the car may move. */
	#collideWalls( world, move ) {

		const length = this.#velocity.length();
		const dirX = this.#velocity.x / length;
		const dirZ = this.#velocity.y / length;
		_dir.set( dirX, 0, dirZ );

		const back = 0.6; // start slightly inside the car so thin walls are not skipped
		let best = null;
		for ( const probe of this.#leadingProbes( dirX, dirZ ) ) {

			_origin.set(
				this.#position.x + probe.x - dirX * back,
				this.#position.y + BUMPER_HEIGHT,
				this.#position.z + probe.z - dirZ * back,
			);
			const hit = world.cast( _origin, _dir, move + back + 0.15 );
			if ( hit && hit.normal.y < WALL_NORMAL_Y && ( ! best || hit.distance < best.distance ) ) best = hit;

		}

		if ( ! best ) return move;

		// remove (and bounce) the velocity going into the wall
		const normal = new Vector2( best.normal.x, best.normal.z );
		if ( normal.lengthSq() < 1e-6 ) return 0;
		normal.normalize();

		const into = this.#velocity.dot( normal );
		if ( into < 0 ) {

			this.#velocity.addScaledVector( normal, - into * ( 1 + RESTITUTION ) );
			this.#velocity.multiplyScalar( 0.85 );
			if ( - into > CRASH_IMPACT ) this.#onCrash( - into );

		}

		return Math.max( 0, best.distance - back - 0.1 );

	}

	/**
	 * World-space probe origins spread along the leading bumper. A building corner poking in
	 * between two probes can overlap the bumper by at most half the probe spacing (~0.25 m).
	 */
	#leadingProbes( dirX, dirZ ) {

		const [ a, b ] = this.#leadingCorners( dirX, dirZ );
		return Array.from( { length: BUMPER_PROBES }, ( _, i ) => {

			const t = i / ( BUMPER_PROBES - 1 );
			return { x: a.x + ( b.x - a.x ) * t, z: a.z + ( b.z - a.z ) * t };

		} );

	}

	/** World-space offsets of the two bumper corners facing the direction of travel. */
	#leadingCorners( dirX, dirZ ) {

		const corners = [];
		for ( const sx of [ - 1, 1 ] ) {

			for ( const sz of [ - 1, 1 ] ) {

				const { x, z } = this.#toWorldOffset( sx * HALF_WIDTH, sz * HALF_LENGTH );
				corners.push( { x, z, lead: x * dirX + z * dirZ } );

			}

		}

		return corners.sort( ( a, b ) => b.lead - a.lead ).slice( 0, 2 );

	}

	/** Ground height under each wheel drives ride height, jumps and body tilt. */
	#followGround( dt, world ) {

		const heights = this.#sampleWheelHeights( world );
		const hits = heights.filter( h => h !== null );

		// nothing below (tiles still streaming, or inside a building in ghost mode): hold height
		if ( hits.length === 0 ) {

			this.#vy = 0;
			this.#grounded = true;
			return;

		}

		const groundY = hits.reduce( ( a, b ) => a + b, 0 ) / hits.length;
		const prevY = this.#position.y;

		if ( this.#grounded && groundY > prevY - 0.6 ) {

			// stick to the road; smoothing hides noise in the photogrammetry mesh
			this.#position.y = MathUtils.damp( prevY, groundY, 20, dt );
			this.#vy = MathUtils.clamp( ( this.#position.y - prevY ) / dt, - 20, 12 );

		} else {

			this.#fall( groundY, dt );

		}

		this.#tiltToGround( heights, groundY, dt );

	}

	/** Airborne: drove off a ramp, a roof or a bridge. */
	#fall( groundY, dt ) {

		this.#grounded = false;
		this.#vy -= GRAVITY * dt;
		this.#position.y += this.#vy * dt;
		if ( this.#position.y <= groundY ) {

			if ( this.#vy < - 9 ) this.#onCrash( - this.#vy * 0.6 );
			this.#position.y = groundY;
			this.#vy = 0;
			this.#grounded = true;

		}

	}

	/** Ray-cast ground heights under [fl, fr, rl, rr]; null where nothing was hit. */
	#sampleWheelHeights( world ) {

		const startY = this.#position.y + STEP_HEIGHT;
		return WHEELS.map( ( [ lx, lz ] ) => {

			const { x, z } = this.#toWorldOffset( lx, lz );
			_origin.set( this.#position.x + x, startY, this.#position.z + z );
			const hit = world.cast( _origin, _down, STEP_HEIGHT + 300 );
			return hit ? hit.point.y : null;

		} );

	}

	#tiltToGround( [ hfl, hfr, hrl, hrr ], groundY, dt ) {

		// a wheel without a hit borrows its neighbour on the same axle
		const fill = ( a, b ) => a ?? b ?? groundY;
		const fl = fill( hfl, hfr ), fr = fill( hfr, hfl ), rl = fill( hrl, hrr ), rr = fill( hrr, hrl );

		const targetPitch = Math.atan2( ( fl + fr ) / 2 - ( rl + rr ) / 2, WHEELBASE );
		const targetRoll = Math.atan2( ( fl + rl ) / 2 - ( fr + rr ) / 2, HALF_TRACK * 2 );
		const k = this.#grounded ? 12 : 1.5;
		this.#pitch = MathUtils.damp( this.#pitch, MathUtils.clamp( targetPitch, - 0.5, 0.5 ), k, dt );
		this.#roll = MathUtils.damp( this.#roll, MathUtils.clamp( targetRoll, - 0.4, 0.4 ), k, dt );

	}

	/** Car-local horizontal offset (x = left, z = forward) to a world-space offset. */
	#toWorldOffset( lx, lz ) {

		const sinY = Math.sin( this.#yaw );
		const cosY = Math.cos( this.#yaw );
		return { x: lx * cosY + lz * sinY, z: - lx * sinY + lz * cosY };

	}

	#updateQuaternion() {

		_euler.set( - this.#pitch, this.#yaw, this.#roll, 'YXZ' );
		this.#quaternion.setFromEuler( _euler );

	}

}

/** Moves `value` toward 0 by at most `amount`, never past it. */
function approachZero( value, amount ) {

	return value - Math.sign( value ) * Math.min( Math.abs( value ), amount );

}
