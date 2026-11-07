import { describe, expect, it } from 'vitest';
import { gearFor } from '../src/vehicle/gearbox.js';

describe( 'gearFor', () => {

	it( 'shifts up as speed rises and keeps rpm between idle and redline', () => {

		let lastGear = 0;
		for ( let speed = 0; speed <= 110; speed += 2 ) {

			const { gear, rpm } = gearFor( speed );
			expect( gear ).toBeGreaterThanOrEqual( lastGear );
			expect( rpm ).toBeGreaterThanOrEqual( 900 );
			expect( rpm ).toBeLessThanOrEqual( 7500 );
			lastGear = gear;

		}

		expect( gearFor( 0 ).gear ).toBe( 1 );
		expect( lastGear ).toBe( 7 );

	} );

} );
