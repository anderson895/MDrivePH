import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { CarPhysics } from '../src/vehicle/CarPhysics.js';
import { createFakeWorld, drive } from './fakeWorld.js';

const HALF_LENGTH = 2.26;
const kmh = car => car.forwardSpeed * 3.6;

describe( 'CarPhysics', () => {

	let world;
	let onCrash;
	let car;

	beforeEach( () => {

		world = createFakeWorld();
		onCrash = vi.fn();
		car = new CarPhysics( { onCrash } );

	} );

	const placeAt = ( x, z, bearing = 0 ) => car.place( new Vector3( x, 0, z ), bearing );

	it( 'accelerates to roughly 95 km/h in 3 seconds', () => {

		placeAt( 0, - 200 );
		drive( car, world, 3, { throttle: 1 } );
		expect( kmh( car ) ).toBeGreaterThan( 80 );
		expect( kmh( car ) ).toBeLessThan( 110 );
		expect( car.position.y ).toBeCloseTo( 0, 5 );

	} );

	it( 'tops out near 200 km/h, and boost goes faster', () => {

		placeAt( 600, - 1500 );
		drive( car, world, 20, { throttle: 1 } );
		const top = kmh( car );
		expect( top ).toBeGreaterThan( 185 );
		expect( top ).toBeLessThan( 215 );

		drive( car, world, 10, { throttle: 1, boost: true } );
		expect( kmh( car ) ).toBeGreaterThan( top + 40 );

	} );

	it( 'stops at a wall instead of passing through it, and reports the crash', () => {

		placeAt( 0, 0 );
		drive( car, world, 9, { throttle: 1 } );
		const frontBumper = car.position.z + HALF_LENGTH;
		expect( frontBumper ).toBeLessThanOrEqual( 80 );
		expect( frontBumper ).toBeGreaterThan( 79 );
		expect( onCrash ).toHaveBeenCalled();

	} );

	it( 'stops at a building corner that points between the bumper corners', () => {

		const tip = 100 - 2 * Math.SQRT2;
		placeAt( 300, 50 );
		drive( car, world, 6, { throttle: 1 } );
		// the car slides along the 45° faces after impact; the tip may sit between two bumper
		// probes, so allow up to half the probe spacing of overlap, never more
		const overlap = car.position.z + HALF_LENGTH - tip;
		expect( overlap ).toBeLessThan( 0.3 );
		expect( overlap ).toBeGreaterThan( - 1 );
		expect( onCrash ).toHaveBeenCalled();

	} );

	it( 'drives through the wall in ghost mode', () => {

		expect( car.toggleGhost() ).toBe( true );
		placeAt( 0, 0 );
		drive( car, world, 9, { throttle: 1 } );
		expect( car.position.z ).toBeGreaterThan( 85 );
		expect( onCrash ).not.toHaveBeenCalled();

	} );

	it( 'steering right turns clockwise (north → east)', () => {

		placeAt( 300, 0, 0 );
		drive( car, world, 1.5, { throttle: 1, steer: 1 } );
		expect( car.bearing ).toBeGreaterThan( 45 );
		expect( car.bearing ).toBeLessThan( 270 );
		expect( car.position.x ).toBeLessThan( 300 ); // east is -X in the local frame

	} );

	it( 'brakes to a stop, then reverses while brake is held', () => {

		placeAt( 500, - 600 );
		drive( car, world, 4, { throttle: 1 } );
		drive( car, world, 6, { brake: 1 } );
		expect( car.forwardSpeed ).toBeLessThan( 0 );
		expect( kmh( car ) ).toBeGreaterThan( - 51 ); // reverse speed limit (14 m/s)

	} );

	it( 'slides sideways with the handbrake', () => {

		placeAt( 700, - 600 );
		drive( car, world, 4, { throttle: 1 } );
		drive( car, world, 0.8, { throttle: 1, steer: 1, handbrake: true } );
		expect( car.slip ).toBeGreaterThan( 5 );

	} );

	it( 'climbs a ramp and gets airborne off the end', () => {

		placeAt( - 100, - 20 );
		const { maxY, wasAirborne } = drive( car, world, 4.7, { throttle: 1 } );
		expect( maxY ).toBeGreaterThan( 3 );
		expect( wasAirborne ).toBe( true );

	} );

	it( 'holds its height when there is no ground below (tiles still streaming)', () => {

		const empty = createFakeWorld( { ground: false } );
		car.place( new Vector3( 500, 12, 500 ), 0 );
		drive( car, empty, 2, { throttle: 1 } );
		expect( car.position.y ).toBe( 12 );
		expect( car.isGrounded ).toBe( true );

	} );

	it( 'place() resets motion and sets the heading', () => {

		placeAt( 0, - 200 );
		drive( car, world, 2, { throttle: 1, steer: 0.5 } );
		car.place( new Vector3( 1, 2, 3 ), 90 );
		expect( car.speed ).toBe( 0 );
		expect( car.bearing ).toBeCloseTo( 90 );
		expect( car.position.toArray() ).toEqual( [ 1, 2, 3 ] );

	} );

	it( 'localToWorld maps car-forward onto the heading', () => {

		car.place( new Vector3( 10, 0, 10 ), 90 ); // facing east (-X)
		const ahead = car.localToWorld( new Vector3( 0, 0, 5 ) );
		expect( ahead.x ).toBeCloseTo( 5 );
		expect( ahead.z ).toBeCloseTo( 10 );

	} );

} );
