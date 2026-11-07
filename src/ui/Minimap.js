import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ZOOM = 16;
const PAN_INTERVAL = 250; // ms; panning every frame makes Leaflet stutter

/** North-up OSM minimap with a heading arrow. Click anywhere on it to teleport there. */
export class Minimap {

	#map;
	#arrow;
	#lastPan = 0;

	/**
	 * @param {HTMLElement} container
	 * @param {( lat: number, lon: number ) => void} onPick
	 */
	constructor( container, onPick ) {

		this.#map = L.map( container, {
			zoomControl: false,
			attributionControl: true,
			keyboard: false,
		} ).setView( [ 0, 0 ], ZOOM );

		L.tileLayer( 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
		} ).addTo( this.#map );
		this.#map.attributionControl.setPrefix( false );

		this.#arrow = L.marker( [ 0, 0 ], {
			icon: L.divIcon( { className: 'car-arrow', html: '<div class="car-arrow-inner"></div>', iconSize: [ 22, 22 ] } ),
			interactive: false,
			keyboard: false,
		} ).addTo( this.#map );

		this.#map.on( 'click', e => onPick( e.latlng.lat, e.latlng.lng ) );

	}

	/** Re-measure the container after it becomes visible or changes size. */
	refresh() {

		this.#map.invalidateSize();

	}

	/** Moves the arrow and follows the car (the user's scroll-zoom level is kept). */
	update( lat, lon, bearing ) {

		this.#arrow.setLatLng( [ lat, lon ] );
		this.#arrow.getElement()?.firstChild?.style.setProperty( 'transform', `rotate(${ bearing }deg)` );

		const now = performance.now();
		if ( now - this.#lastPan > PAN_INTERVAL ) {

			this.#map.panTo( [ lat, lon ], { animate: false } );
			this.#lastPan = now;

		}

	}

	jump( lat, lon ) {

		this.#map.setView( [ lat, lon ], this.#map.getZoom(), { animate: false } );

	}

}
