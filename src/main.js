import './style.css';
import { PRESETS, loadSettings, saveSettings } from './config.js';
import { Game } from './game/Game.js';
import { SetupScreen } from './ui/SetupScreen.js';

let game = null;

const setup = new SetupScreen( {
	presets: PRESETS,
	settings: loadSettings(),
	onSubmit: async settings => {

		saveSettings( settings );
		try {

			game ??= await Game.create( {
				onFatalError: message => setup.show( message ),
				onOpenSettings: () => setup.show(),
			} );
			game.start( settings );

		} catch ( err ) {

			console.error( err );
			setup.show( `Could not start: ${ err.message }` );

		}

	},
} );
