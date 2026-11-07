import { gearFor } from './gearbox.js';

const MASTER_VOLUME = 0.35;

/** Tiny synthesized engine, tire-screech and crash sounds (no audio files needed). */
export class CarAudio {

	#ctx = null;
	#nodes = null;
	#noise = null;
	#muted = false;

	/** Must be called from a user gesture (browsers block autoplay). Safe to call twice. */
	start() {

		if ( this.#ctx ) return;
		const ctx = this.#ctx = new AudioContext();
		this.#noise = createNoise( ctx );

		const master = ctx.createGain();
		master.gain.value = MASTER_VOLUME;
		master.connect( ctx.destination );

		this.#nodes = { master, ...createEngine( ctx, master ), ...createScreech( ctx, master, this.#noise ) };

	}

	/** Returns true when now muted. */
	toggleMute() {

		this.#muted = ! this.#muted;
		if ( this.#nodes ) this.#nodes.master.gain.value = this.#muted ? 0 : MASTER_VOLUME;
		return this.#muted;

	}

	/** @param {import('./CarPhysics.js').CarPhysics} car */
	update( car, throttle ) {

		if ( ! this.#ctx ) return;
		const t = this.#ctx.currentTime;
		const { osc1, osc2, engineFilter, engineGain, screechGain } = this.#nodes;
		const { rpm } = gearFor( Math.abs( car.forwardSpeed ) );
		const freq = 28 + rpm / 60 * 1.6;

		osc1.frequency.setTargetAtTime( freq, t, 0.05 );
		osc2.frequency.setTargetAtTime( freq * 0.5, t, 0.05 );
		engineFilter.frequency.setTargetAtTime( 400 + throttle * 1400 + rpm * 0.1, t, 0.1 );
		engineGain.gain.setTargetAtTime( 0.06 + throttle * 0.08, t, 0.1 );

		const screech = car.isGrounded && car.slip > 4 ? Math.min( ( car.slip - 4 ) / 10, 1 ) * 0.25 : 0;
		screechGain.gain.setTargetAtTime( screech, t, 0.05 );

	}

	crash( strength ) {

		if ( ! this.#ctx || this.#muted ) return;
		const ctx = this.#ctx;
		const src = ctx.createBufferSource();
		src.buffer = this.#noise;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 900;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime( Math.min( strength / 20, 1 ) * 0.9, ctx.currentTime );
		gain.gain.exponentialRampToValueAtTime( 0.001, ctx.currentTime + 0.5 );
		src.connect( filter ).connect( gain ).connect( this.#nodes.master );
		src.start();
		src.stop( ctx.currentTime + 0.6 );

	}

}

/** Two detuned oscillators through a low-pass filter. */
function createEngine( ctx, output ) {

	const engineFilter = ctx.createBiquadFilter();
	engineFilter.type = 'lowpass';
	engineFilter.frequency.value = 700;
	const engineGain = ctx.createGain();
	engineGain.gain.value = 0.1;
	engineFilter.connect( engineGain ).connect( output );

	const osc1 = ctx.createOscillator();
	osc1.type = 'sawtooth';
	osc1.connect( engineFilter );

	const osc2 = ctx.createOscillator();
	osc2.type = 'square';
	const sub = ctx.createGain();
	sub.gain.value = 0.5;
	osc2.connect( sub ).connect( engineFilter );

	osc1.start();
	osc2.start();
	return { osc1, osc2, engineFilter, engineGain };

}

/** Looping band-passed noise for tire squeal. */
function createScreech( ctx, output, noise ) {

	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.value = 1800;
	filter.Q.value = 6;
	const screechGain = ctx.createGain();
	screechGain.gain.value = 0;

	const src = ctx.createBufferSource();
	src.buffer = noise;
	src.loop = true;
	src.connect( filter ).connect( screechGain ).connect( output );
	src.start();
	return { screechGain };

}

function createNoise( ctx ) {

	const buffer = ctx.createBuffer( 1, ctx.sampleRate * 2, ctx.sampleRate );
	const data = buffer.getChannelData( 0 );
	for ( let i = 0; i < data.length; i ++ ) data[ i ] = Math.random() * 2 - 1;
	return buffer;

}
