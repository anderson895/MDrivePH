import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { StreetNameTracker } from '../src/game/StreetNameTracker.js';

describe( 'StreetNameTracker', () => {

	const flush = () => new Promise( r => setTimeout( r ) );

	it( 'looks up on the first update, then only after moving far enough and waiting long enough', async () => {

		const lookup = vi.fn( async () => 'Ayala Avenue' );
		const onName = vi.fn();
		const tracker = new StreetNameTracker( { lookup, onName } );

		tracker.update( new Vector3( 0, 0, 0 ), 1, 2, 10_000 );
		await flush();
		expect( lookup ).toHaveBeenCalledTimes( 1 );
		expect( onName ).toHaveBeenCalledWith( 'Ayala Avenue' );

		tracker.update( new Vector3( 50, 0, 0 ), 1, 2, 20_000 ); // waited, but only moved 50 m
		tracker.update( new Vector3( 200, 0, 0 ), 1, 2, 11_000 ); // moved, but too soon
		expect( lookup ).toHaveBeenCalledTimes( 1 );

		tracker.update( new Vector3( 200, 0, 0 ), 1, 2, 20_000 );
		expect( lookup ).toHaveBeenCalledTimes( 2 );

	} );

	it( 'reset() allows an immediate lookup after a teleport, and failures are swallowed', async () => {

		const lookup = vi.fn( async () => {

			throw new Error( 'offline' );

		} );
		const tracker = new StreetNameTracker( { lookup, onName: vi.fn() } );

		tracker.update( new Vector3(), 0, 0, 10_000 );
		tracker.reset();
		tracker.update( new Vector3(), 0, 0, 20_000 );
		await flush();
		expect( lookup ).toHaveBeenCalledTimes( 2 );

	} );

} );
