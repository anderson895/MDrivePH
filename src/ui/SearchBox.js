import { byId } from './dom.js';

/** Place search: runs on Enter (never per keystroke) and lists results to pick from. */
export class SearchBox {

	#input = byId( 'search-input' );
	#list = byId( 'search-results' );
	#search;
	#onPick;

	/**
	 * @param {object} options
	 * @param {( query: string ) => Promise<Array<{ name: string, lat: number, lon: number }>>} options.search
	 * @param {( place: { name: string, lat: number, lon: number } ) => void} options.onPick
	 */
	constructor( { search, onPick } ) {

		this.#search = search;
		this.#onPick = onPick;

		byId( 'search' ).addEventListener( 'submit', e => {

			e.preventDefault();
			this.#run( this.#input.value.trim() );

		} );
		this.#input.addEventListener( 'keydown', e => {

			if ( e.key === 'Escape' ) this.#close();

		} );

	}

	async #run( query ) {

		if ( ! query ) return;
		this.#showMessage( 'Searching…' );

		try {

			const results = await this.#search( query );
			if ( ! results.length ) return this.#showMessage( 'No results' );
			this.#list.replaceChildren( ...results.map( place => this.#createItem( place ) ) );

		} catch ( err ) {

			this.#showMessage( `Search failed: ${ err.message }` );

		}

	}

	#createItem( place ) {

		const li = document.createElement( 'li' );
		li.textContent = place.name;
		li.addEventListener( 'click', () => {

			this.#close();
			this.#onPick( place );

		} );
		return li;

	}

	#showMessage( text ) {

		const li = document.createElement( 'li' );
		li.className = 'empty';
		li.textContent = text;
		this.#list.replaceChildren( li );
		this.#list.hidden = false;

	}

	#close() {

		this.#list.hidden = true;
		this.#input.blur();

	}

}
