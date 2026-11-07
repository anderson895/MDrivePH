// Virtual gearbox shared by the engine sound and the HUD gear readout.
// Each entry is the top speed (m/s) of that gear.
const GEAR_TOP_SPEEDS = [ 0, 13, 23, 34, 46, 60, 76, 100 ];
const IDLE_RPM = 900;
const REDLINE_RPM = 7500;

/** @returns {{ gear: number, rpm: number }} for a forward speed in m/s */
export function gearFor( speed ) {

	for ( let g = 1; g < GEAR_TOP_SPEEDS.length; g ++ ) {

		if ( speed < GEAR_TOP_SPEEDS[ g ] ) {

			const t = ( speed - GEAR_TOP_SPEEDS[ g - 1 ] ) / ( GEAR_TOP_SPEEDS[ g ] - GEAR_TOP_SPEEDS[ g - 1 ] );
			return { gear: g, rpm: IDLE_RPM + ( REDLINE_RPM - IDLE_RPM ) * t };

		}

	}

	return { gear: GEAR_TOP_SPEEDS.length - 1, rpm: REDLINE_RPM };

}
