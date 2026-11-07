const DRIVE_KEYS = new Set( [
	'KeyW', 'KeyA', 'KeyS', 'KeyD',
	'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
	'Space', 'ShiftLeft', 'ShiftRight',
] );

const STICK_DEADZONE = 0.12;

/** Keyboard + gamepad, normalised into a Controls snapshot (see CarPhysics). */
export class Input {

	#keys = new Set();
	#actions = new Map(); // one-shot key handlers: code -> fn
	#enabled = true;
	#controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

	constructor( target = window ) {

		target.addEventListener( 'keydown', e => {

			if ( isTyping( e ) ) return;
			if ( DRIVE_KEYS.has( e.code ) ) e.preventDefault();
			if ( ! e.repeat ) this.#actions.get( e.code )?.();
			this.#keys.add( e.code );

		} );
		target.addEventListener( 'keyup', e => this.#keys.delete( e.code ) );
		target.addEventListener( 'blur', () => this.#keys.clear() );

	}

	/** Runs `fn` once per press of `code` (KeyboardEvent.code). */
	on( code, fn ) {

		this.#actions.set( code, fn );

	}

	/** While disabled, driving controls read as zero (one-shot actions still fire). */
	setEnabled( enabled ) {

		this.#enabled = enabled;

	}

	/**
	 * Polls keyboard and gamepads. Returns the same object every call; treat it as read-only.
	 * @returns {import('../vehicle/CarPhysics.js').Controls}
	 */
	read() {

		const c = this.#controls;
		if ( ! this.#enabled ) {

			Object.assign( c, { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false } );
			return c;

		}

		const k = this.#keys;
		c.throttle = k.has( 'KeyW' ) || k.has( 'ArrowUp' ) ? 1 : 0;
		c.brake = k.has( 'KeyS' ) || k.has( 'ArrowDown' ) ? 1 : 0;
		c.steer = ( k.has( 'KeyD' ) || k.has( 'ArrowRight' ) ? 1 : 0 ) - ( k.has( 'KeyA' ) || k.has( 'ArrowLeft' ) ? 1 : 0 );
		c.handbrake = k.has( 'Space' );
		c.boost = k.has( 'ShiftLeft' ) || k.has( 'ShiftRight' );
		this.#mergeGamepads( c );
		return c;

	}

	/** Standard-mapping gamepad: RT gas, LT brake/reverse, left stick steer, A handbrake, X boost. */
	#mergeGamepads( c ) {

		for ( const pad of navigator.getGamepads?.() ?? [] ) {

			if ( ! pad || pad.mapping !== 'standard' ) continue;
			const stick = pad.axes[ 0 ] ?? 0;
			if ( Math.abs( stick ) > STICK_DEADZONE ) c.steer = stick;
			c.throttle = Math.max( c.throttle, pad.buttons[ 7 ]?.value ?? 0 );
			c.brake = Math.max( c.brake, pad.buttons[ 6 ]?.value ?? 0 );
			c.handbrake ||= pad.buttons[ 0 ]?.pressed;
			c.boost ||= pad.buttons[ 2 ]?.pressed;

		}

	}

}

function isTyping( e ) {

	const t = e.target;
	return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

}
