// Downloads, decodes and triangulates one vector tile off the main thread,
// then hands back transferable typed arrays.
import { buildTileGeometry, decodeTile } from './tileGeometry.js';
import { createLocalProjection, createTileProjector } from './projection.js';

self.onmessage = async ( { data: { id, url, tile, origin } } ) => {

	try {

		const res = await fetch( url );
		if ( ! res.ok ) throw new Error( `HTTP ${ res.status }` );
		const decoded = decodeTile( await res.arrayBuffer() );
		const project = createTileProjector( tile, decoded.extent, createLocalProjection( origin.lat, origin.lon ) );
		const geometry = buildTileGeometry( decoded, project );

		const buffers = [ geometry.buildings, geometry.flat ]
			.flatMap( g => [ g.position, g.normal, g.color ] )
			.filter( Boolean )
			.map( a => a.buffer );
		self.postMessage( { id, geometry }, buffers );

	} catch ( err ) {

		self.postMessage( { id, error: err.message || String( err ) } );

	}

};
