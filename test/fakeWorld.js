import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster } from 'three';

/**
 * Stand-in for World: a flat ground plane plus a few obstacles, answering the same
 * `cast()` queries the car makes against the real 3D tiles.
 *
 * - wall: 40 m wide, 10 m tall, front face at z = 80 (centred on x = 0)
 * - ramp: lane at x = -100, rising 3 m between z = 40 and z = 55, then a drop
 * - wedge: a 4 m block turned 45° at x = 300 whose corner points south, tip at z = 100 - 2√2
 */
export function createFakeWorld( { ground = true } = {} ) {

	const material = new MeshBasicMaterial();
	const meshes = [];
	const add = ( geometry, setup ) => {

		const mesh = new Mesh( geometry, material );
		setup( mesh );
		mesh.updateMatrixWorld( true );
		meshes.push( mesh );

	};

	if ( ground ) add( new PlaneGeometry( 4000, 4000 ), m => m.rotation.x = - Math.PI / 2 );
	add( new BoxGeometry( 40, 10, 2 ), m => m.position.set( 0, 5, 81 ) );
	add( new BoxGeometry( 8, 0.2, 15.3 ), m => {

		m.position.set( - 100, 1.5, 47.5 );
		m.rotation.x = - Math.atan2( 3, 15 );

	} );

	add( new BoxGeometry( 4, 10, 4 ), m => {

		m.position.set( 300, 5, 100 );
		m.rotation.y = Math.PI / 4;

	} );

	const raycaster = new Raycaster();
	return {
		cast( origin, direction, far ) {

			raycaster.set( origin, direction );
			raycaster.far = far;
			const hit = raycaster.intersectObjects( meshes, false )[ 0 ];
			if ( ! hit ) return null;
			return { point: hit.point, distance: hit.distance, normal: hit.face.normal.clone().transformDirection( hit.object.matrixWorld ) };

		},
	};

}

export const NO_INPUT = Object.freeze( { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false } );

/** Steps the car for `seconds` at 60 Hz with fixed controls; returns the highest y reached. */
export function drive( car, world, seconds, controls = {} ) {

	const c = { ...NO_INPUT, ...controls };
	let maxY = - Infinity;
	let wasAirborne = false;
	for ( let t = 0; t < seconds; t += 1 / 60 ) {

		car.update( 1 / 60, c, world );
		maxY = Math.max( maxY, car.position.y );
		wasAirborne ||= ! car.isGrounded;

	}

	return { maxY, wasAirborne };

}
