import { CesiumIonAuthPlugin, GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import { World } from './World.js';
import { OsmWorld } from './osm/OsmWorld.js';

// Google Photorealistic 3D Tiles as hosted on Cesium ion's asset depot.
const ION_GOOGLE_ASSET_ID = '2275207';

/**
 * @typedef {object} WorldOptions
 * @property {string | null} apiKey
 * @property {number} errorTarget  3D tiles detail level (ignored by the OSM world)
 * @property {import('three').WebGLRenderer} renderer
 * @property {import('three').PerspectiveCamera} camera
 * @property {( error: Error ) => void} onError
 */

/**
 * @typedef {object} TileProvider
 * @property {string} id                       matches the setup screen radio value
 * @property {string | null} settingsKey       settings field holding the key; null when none is needed
 * @property {string} [missingKeyMessage]      shown when the key field is empty
 * @property {( options: WorldOptions ) => object} createWorld  returns a World-compatible object
 * @property {( reason: string ) => string} describeError  turns a fatal load error into advice
 */

/**
 * Every source of 3D city data the app can use. Each provider knows how to build its world
 * and how to explain its own failures, so supporting a new one means adding an entry here
 * (and its fields on the setup screen). Nothing else branches on the provider type.
 *
 * @type {Record<string, TileProvider>}
 */
export const PROVIDERS = {

	osm: {
		id: 'osm',
		settingsKey: null,
		createWorld: ( { camera, onError } ) => new OsmWorld( { camera, onError } ),
		describeError: reason => `Could not load OpenStreetMap data (${ reason }). Check your internet connection and try again.`,
	},

	google: {
		id: 'google',
		settingsKey: 'googleKey',
		missingKeyMessage: 'Paste your Google Maps API key.',
		createWorld: ( { apiKey, ...options } ) => new World( {
			...options,
			authPlugin: new GoogleCloudAuthPlugin( { apiToken: requireKey( apiKey, PROVIDERS.google ), autoRefreshToken: true } ),
			attributionLabel: 'Google',
		} ),
		describeError: reason => `Google refused the request (${ reason }). Check that the key is correct, the “Map Tiles API” is enabled, billing is on, and the key’s referrer restrictions allow this site.`,
	},

	ion: {
		id: 'ion',
		settingsKey: 'ionToken',
		missingKeyMessage: 'Paste your Cesium ion access token.',
		createWorld: ( { apiKey, ...options } ) => new World( {
			...options,
			authPlugin: new CesiumIonAuthPlugin( { apiToken: requireKey( apiKey, PROVIDERS.ion ), assetId: ION_GOOGLE_ASSET_ID, autoRefreshToken: true } ),
			attributionLabel: 'Google',
		} ),
		describeError: reason => `Cesium ion refused the request (${ reason }). Check the token and that “Google Photorealistic 3D Tiles” is added to your ion assets.`,
	},

};

export const DEFAULT_PROVIDER = PROVIDERS.osm;

/** @returns {TileProvider} */
export function getProvider( id ) {

	return PROVIDERS[ id ] ?? DEFAULT_PROVIDER;

}

/** True when the settings are missing the key this provider needs. */
export function isMissingKey( provider, settings ) {

	return provider.settingsKey !== null && ! settings[ provider.settingsKey ];

}

function requireKey( key, provider ) {

	if ( ! key ) throw new Error( provider.missingKeyMessage );
	return key;

}
