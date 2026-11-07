import { describe, expect, it, vi } from 'vitest';
import { CarPhysics } from '../src/vehicle/CarPhysics.js';
import { Spawner } from '../src/game/Spawner.js';

const GROUND_Y = 42;

function setup( { groundFound = true } = {} ) {

	const world = {
		setOrigin: vi.fn(),
		loadProgress: 1,
		cast: () => ( groundFound ? { point: { y: GROUND_Y }, distance: 0, normal: { y: 1 } } : null ),
	};
	const car = new CarPhysics();
	const events = { onStart: vi.fn(), onProgress: vi.fn(), onDone: vi.fn() };
	const snapToRoad = vi.fn( async ( lat, lon ) => ( { lat: lat + 0.001, lon, road: 'Ayala Avenue' } ) );
	const spawner = new Spawner( { car, snapToRoad, ...events } );
	spawner.setWorld( world );
	return { world, car, events, snapToRoad, spawner };

}

const run = ( spawner, seconds ) => {

	for ( let t = 0; t < seconds; t += 1 / 60 ) spawner.update( 1 / 60 );

};

describe( 'Spawner', () => {

	it( 're-centres on the snapped road, waits for stable ground, then releases the car', async () => {

		const { world, car, events, spawner } = setup();
		await spawner.teleport( 14.55, 121.02, 124 );

		expect( world.setOrigin ).toHaveBeenCalledWith( 14.551, 121.02 );
		expect( events.onStart ).toHaveBeenCalledWith( expect.objectContaining( { road: 'Ayala Avenue' } ) );
		expect( spawner.isActive ).toBe( true );

		run( spawner, 1 );
		expect( spawner.isActive ).toBe( true ); // too early: minimum spawn time not reached

		run( spawner, 1 );
		expect( spawner.isActive ).toBe( false );
		expect( events.onDone ).toHaveBeenCalledWith( 'Go! 🚗', 1500 );
		expect( car.position.y ).toBe( GROUND_Y );
		expect( car.bearing ).toBeCloseTo( 124 );

	} );

	it( 'gives up after the timeout when no tiles ever appear', async () => {

		const { events, spawner } = setup( { groundFound: false } );
		await spawner.teleport( 0, 0 );
		run( spawner, 26 );
		expect( spawner.isActive ).toBe( false );
		expect( events.onDone ).toHaveBeenCalledWith( expect.stringContaining( 'No 3D tiles' ), 4000 );

	} );

	it( 'ignores an older teleport that resolves after a newer one started', async () => {

		const { world, spawner, snapToRoad } = setup();
		let resolveFirst;
		snapToRoad.mockImplementationOnce( () => new Promise( r => resolveFirst = r ) );

		const first = spawner.teleport( 1, 1 );
		await spawner.teleport( 2, 2 );
		resolveFirst( { lat: 1, lon: 1, road: 'old' } );
		await first;

		expect( world.setOrigin ).toHaveBeenCalledTimes( 1 );
		expect( world.setOrigin ).toHaveBeenCalledWith( 2.001, 2 );

	} );

	it( 'cancel() stops a spawn in progress', async () => {

		const { events, spawner } = setup();
		await spawner.teleport( 0, 0 );
		spawner.cancel();
		run( spawner, 3 );
		expect( spawner.isActive ).toBe( false );
		expect( events.onDone ).not.toHaveBeenCalled();

	} );

} );
