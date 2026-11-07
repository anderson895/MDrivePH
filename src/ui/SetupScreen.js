import { getProvider, isMissingKey } from '../world/providers.js';
import { byId } from './dom.js';

/**
 * Key + location form shown before driving (and from the ⚙ button).
 * Field values map onto settings through each input's `data-setting` attribute.
 */
export class SetupScreen {

	#root = byId( 'setup' );
	#form = byId( 'setup-form' );
	#error = byId( 'setup-error' );
	#onSubmit;

	/**
	 * @param {object} options
	 * @param {Array<{ name: string }>} options.presets
	 * @param {object} options.settings  initial values
	 * @param {( settings: object ) => void} options.onSubmit  called with validated settings
	 */
	constructor( { presets, settings, onSubmit } ) {

		this.#onSubmit = onSubmit;

		const presetSelect = byId( 'preset' );
		presets.forEach( ( p, i ) => presetSelect.add( new Option( p.name, i ) ) );

		this.#fill( settings );
		this.#form.addEventListener( 'change', () => this.#showProviderFields() );
		this.#form.addEventListener( 'submit', e => {

			e.preventDefault();
			this.#submit();

		} );

	}

	/** Shows the screen, optionally with an error explaining why. */
	show( errorMessage = '' ) {

		this.#error.textContent = errorMessage;
		this.#error.hidden = ! errorMessage;
		this.#root.hidden = false;

	}

	hide() {

		this.#root.hidden = true;
		this.#error.hidden = true;

	}

	#fill( settings ) {

		this.#form.provider.value = settings.provider;
		for ( const el of this.#fields() ) el.value = settings[ el.dataset.setting ] ?? '';
		this.#showProviderFields();

	}

	#read() {

		const settings = { provider: this.#form.provider.value };
		for ( const el of this.#fields() ) settings[ el.dataset.setting ] = el.value.trim();
		settings.preset = Number( settings.preset );
		return settings;

	}

	#submit() {

		const settings = this.#read();
		const provider = getProvider( settings.provider );
		if ( isMissingKey( provider, settings ) ) return this.show( provider.missingKeyMessage );

		this.hide();
		this.#onSubmit( settings );

	}

	#showProviderFields() {

		const active = this.#form.provider.value;
		// data-provider may list several ids, e.g. "google ion"
		this.#form.querySelectorAll( '[data-provider]' ).forEach( el => el.hidden = ! el.dataset.provider.split( ' ' ).includes( active ) );

	}

	#fields() {

		return this.#form.querySelectorAll( '[data-setting]' );

	}

}
