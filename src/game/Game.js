import { Timer } from 'three';
import { PRESETS, QUALITY } from '../config.js';
import { getProvider } from '../world/providers.js';
import { CarPhysics } from '../vehicle/CarPhysics.js';
import { CarModel } from '../vehicle/CarModel.js';
import { CarAudio } from '../vehicle/CarAudio.js';
import { reverseGeocode, searchPlaces, snapToRoad } from '../services/geo.js';
import { Hud } from '../ui/Hud.js';
import { Minimap } from '../ui/Minimap.js';
import { SearchBox } from '../ui/SearchBox.js';
import { byId } from '../ui/dom.js';
import { createStage } from './createStage.js';
import { ChaseCamera } from './ChaseCamera.js';
import { Input } from './Input.js';
import { Spawner } from './Spawner.js';
import { StreetNameTracker } from './StreetNameTracker.js';

const MAX_DT = 0.05; // clamp long frames so physics never jumps through walls
const LOCATION_INTERVAL = 200; // ms between lat/lon, minimap and street-name refreshes
const ATTRIBUTION_INTERVAL = 1000;

const asset = path => `${ import.meta.env.BASE_URL }${ path }`;

/** Wires the world, the car and the UI together and runs the frame loop. */
export class Game {

	#stage = createStage( byId( 'app' ) );
	#timer = new Timer();
	#world = null;
	#carModel;
	#car;
	#chase;
	#input = new Input();
	#audio = new CarAudio();
	#hud;
	#minimap;
	#spawner;
	#streetNames;
	#onFatalError;
	#lastLocationUpdate = 0;
	#geo = { lat: 0, lon: 0 };

	/**
	 * Loads the assets, then builds the game.
	 * @param {object} options
	 * @param {( message: string ) => void} options.onFatalError  the tile provider rejected us
	 * @param {() => void} options.onOpenSettings
	 */
	static async create( options ) {

		const carModel = new CarModel();
		await carModel.load( asset( 'models/ferrari.glb' ), asset( 'models/ferrari_ao.png' ) );
		return new Game( { ...options, carModel } );

	}

	/** Use Game.create(), which loads the car model first. */
	constructor( { carModel, onFatalError, onOpenSettings } ) {

		this.#carModel = carModel;
		this.#onFatalError = onFatalError;
		this.#car = new CarPhysics( { onCrash: impact => this.#audio.crash( impact ) } );
		this.#chase = new ChaseCamera( this.#stage.camera, this.#stage.renderer.domElement );

		this.#hud = new Hud( { onOpenSettings } );
		this.#minimap = new Minimap( byId( 'minimap' ), ( lat, lon ) => this.#teleport( lat, lon, this.#car.bearing ) );
		this.#streetNames = new StreetNameTracker( { lookup: reverseGeocode, onName: name => this.#hud.setPlace( name ) } );
		new SearchBox( { search: searchPlaces, onPick: place => this.#teleport( place.lat, place.lon, 0 ) } );

		this.#spawner = new Spawner( {
			car: this.#car,
			snapToRoad,
			onStart: road => this.#onSpawnStart( road ),
			onProgress: progress => this.#hud.showLoading( progress ),
			onDone: ( message, ms ) => {

				this.#hud.hideLoading();
				this.#hud.toast( message, ms );

			},
		} );

		this.#stage.scene.add( this.#carModel.object );
		this.#carModel.setVisible( false );
		this.#bindKeys();

		this.#hud.show();
		this.#minimap.refresh();

		this.#timer.connect( document );
		this.#stage.renderer.setAnimationLoop( time => this.#frame( time ) );
		setInterval( () => this.#world && this.#hud.setAttributions( this.#world.getAttributions() ), ATTRIBUTION_INTERVAL );

	}

	/** (Re)connects to the tile provider in `settings` and drives off from the chosen preset. */
	start( settings ) {

		this.#audio.start();
		this.#connect( settings );
		const preset = PRESETS[ settings.preset ] ?? PRESETS[ 0 ];
		this.#teleport( preset.lat, preset.lon, preset.heading );

	}

	#connect( settings ) {

		const { scene, renderer, camera } = this.#stage;
		if ( this.#world ) {

			scene.remove( this.#world.group );
			this.#world.dispose();

		}

		const provider = getProvider( settings.provider );
		this.#world = provider.createWorld( {
			apiKey: provider.settingsKey ? settings[ provider.settingsKey ] : null,
			errorTarget: QUALITY[ settings.quality ] ?? QUALITY.medium,
			renderer,
			camera,
			onError: err => {

				console.error( err );
				this.#spawner.cancel();
				this.#hud.hideLoading();
				this.#onFatalError( provider.describeError( err?.message || String( err ) ) );

			},
		} );
		scene.add( this.#world.group );
		Object.assign( scene.fog, this.#world.fogRange );
		this.#spawner.setWorld( this.#world );

	}

	#teleport( lat, lon, bearing ) {

		this.#spawner.teleport( lat, lon, bearing );

	}

	#onSpawnStart( road ) {

		this.#chase.reset();
		this.#minimap.jump( road.lat, road.lon );
		this.#hud.setPlace( road.road || 'Loading…' );
		this.#streetNames.reset();

	}

	#frame( time ) {

		this.#timer.update( time );
		const dt = Math.min( this.#timer.getDelta(), MAX_DT );
		const spawning = this.#spawner.isActive;

		this.#input.setEnabled( ! spawning );
		const controls = this.#input.read();

		if ( this.#world ) {

			if ( spawning ) this.#spawner.update( dt );
			else this.#car.update( dt, controls, this.#world );

			this.#chase.update( dt, this.#car, this.#world );
			this.#world.update();
			this.#updateHud();

		}

		this.#carModel.setVisible( ! this.#spawner.isActive );
		this.#carModel.sync( this.#car );
		this.#audio.update( this.#car, controls.throttle );
		this.#stage.renderer.render( this.#stage.scene, this.#stage.camera );

	}

	#updateHud() {

		this.#hud.renderSpeedo( this.#car );

		const now = performance.now();
		if ( now - this.#lastLocationUpdate < LOCATION_INTERVAL || ! this.#world.isReady ) return;
		this.#lastLocationUpdate = now;

		const { lat, lon } = this.#world.toLatLon( this.#car.position, this.#geo );
		this.#minimap.update( lat, lon, this.#car.bearing );
		this.#hud.setPosition( lat, lon, this.#car.bearing );
		if ( ! this.#spawner.isActive ) this.#streetNames.update( this.#car.position, lat, lon, now );

	}

	#bindKeys() {

		const input = this.#input;
		input.on( 'KeyC', () => this.#hud.toast( `Camera: ${ this.#chase.cycle() }` ) );
		input.on( 'KeyR', () => this.#resetToRoad() );
		input.on( 'KeyG', () => this.#hud.toast( this.#car.toggleGhost() ? 'Ghost mode ON – walls ignored' : 'Ghost mode OFF' ) );
		input.on( 'KeyP', () => this.#carModel.cyclePaint() );
		input.on( 'KeyM', () => this.#hud.toast( this.#audio.toggleMute() ? 'Sound off' : 'Sound on' ) );
		input.on( 'KeyH', () => this.#hud.toggleHelp() );

	}

	/** Re-spawns on the nearest road to where the car is now, keeping its heading. */
	#resetToRoad() {

		if ( this.#spawner.isActive || ! this.#world ) return;
		const { lat, lon } = this.#world.toLatLon( this.#car.position, this.#geo );
		this.#teleport( lat, lon, this.#car.bearing );

	}

}
