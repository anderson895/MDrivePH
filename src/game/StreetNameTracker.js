const MIN_MOVE = 120; // metres driven before asking again
const MIN_INTERVAL = 4000; // ms between lookups (Nominatim allows ~1 request/second)

/** Looks up the street name now and then while driving, never per frame. */
export class StreetNameTracker {

	#lookup;
	#onName;
	#lastPosition = null;
	#lastTime = 0;

	/**
	 * @param {object} options
	 * @param {( lat: number, lon: number ) => Promise<string | null>} options.lookup  e.g. reverseGeocode
	 * @param {( name: string ) => void} options.onName
	 */
	constructor( { lookup, onName } ) {

		this.#lookup = lookup;
		this.#onName = onName;

	}

	/** Forget the last position so the next update looks up right away (after a teleport). */
	reset() {

		this.#lastPosition = null;

	}

	update( position, lat, lon, now = performance.now() ) {

		const moved = this.#lastPosition ? this.#lastPosition.distanceTo( position ) : Infinity;
		if ( moved <= MIN_MOVE || now - this.#lastTime <= MIN_INTERVAL ) return;

		this.#lastTime = now;
		this.#lastPosition = position.clone();
		this.#lookup( lat, lon )
			.then( name => name && this.#onName( name ) )
			.catch( () => {} ); // a missing street name is not worth interrupting the drive

	}

}
