import { gearFor } from '../vehicle/gearbox.js';
import { byId, escapeHtml, htmlToText } from './dom.js';

const COMPASS = [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ];

/** Everything drawn over the 3D view: speedometer, location, loading overlay, toasts, credits. */
export class Hud {

	#el = {
		root: byId( 'hud' ),
		speed: byId( 'speed' ),
		gear: byId( 'gear' ),
		flags: byId( 'flags' ),
		place: byId( 'place' ),
		coords: byId( 'coords' ),
		help: byId( 'help' ),
		toast: byId( 'toast' ),
		attribution: byId( 'attribution' ),
		loading: byId( 'loading' ),
		loadingTitle: byId( 'loading-title' ),
		loadingBar: byId( 'loading-bar' ),
		loadingSub: byId( 'loading-sub' ),
	};

	#toastTimer = 0;

	/** @param {{ onOpenSettings: () => void }} options */
	constructor( { onOpenSettings } ) {

		byId( 'settings-btn' ).addEventListener( 'click', onOpenSettings );

	}

	show() {

		this.#el.root.hidden = false;

	}

	/** @param {import('../vehicle/CarPhysics.js').CarPhysics} car */
	renderSpeedo( car ) {

		const { speed, gear, flags } = this.#el;
		const kmh = Math.round( Math.abs( car.forwardSpeed ) * 3.6 );
		speed.textContent = kmh;

		if ( car.forwardSpeed < - 0.5 ) gear.textContent = 'R';
		else gear.textContent = kmh < 1 ? 'N' : gearFor( car.forwardSpeed ).gear;

		flags.textContent = [
			car.isBoosting && 'BOOST',
			car.isGhost && 'GHOST',
			! car.isGrounded && 'AIR',
		].filter( Boolean ).join( ' · ' );

	}

	setPlace( text ) {

		this.#el.place.textContent = text;

	}

	setPosition( lat, lon, bearing ) {

		const heading = `${ COMPASS[ Math.round( bearing / 45 ) % 8 ] } ${ Math.round( bearing ) }°`;
		this.#el.coords.textContent = `${ lat.toFixed( 5 ) }, ${ lon.toFixed( 5 ) } · ${ heading }`;

	}

	/** @param {Array<{ type: 'label' | 'string' | 'html', value: string }>} attributions  labels render bold */
	setAttributions( attributions ) {

		const textOf = type => attributions
			.filter( a => a.type === type || ( type === 'string' && a.type === 'html' ) )
			// plain text only: ion attributions arrive as HTML, so strip the markup rather than inject it
			.map( a => a.type === 'html' ? htmlToText( a.value ) : a.value )
			.filter( Boolean )
			.join( ' · ' );

		const label = textOf( 'label' );
		this.#el.attribution.innerHTML = ( label ? `<span class="label">${ escapeHtml( label ) }</span>` : '' ) + escapeHtml( textOf( 'string' ) );

	}

	/** @param {import('../game/Spawner.js').SpawnProgress} progress */
	showLoading( { title, progress, detail } ) {

		const el = this.#el;
		el.loading.hidden = false;
		el.loadingTitle.textContent = title;
		el.loadingBar.style.width = `${ Math.round( progress * 100 ) }%`;
		el.loadingSub.textContent = detail;

	}

	hideLoading() {

		this.#el.loading.hidden = true;

	}

	toast( text, durationMs = 1800 ) {

		const el = this.#el.toast;
		el.textContent = text;
		el.hidden = false;
		clearTimeout( this.#toastTimer );
		this.#toastTimer = setTimeout( () => el.hidden = true, durationMs );

	}

	toggleHelp() {

		this.#el.help.hidden = ! this.#el.help.hidden;

	}

}
