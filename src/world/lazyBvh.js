import { BufferGeometry, Mesh } from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// Tile meshes are large, and a BVH per geometry keeps the per-frame ground and wall rays cheap.
// The BVH is built lazily, the first time a ray actually reaches a tile, so streaming in
// hundreds of distant tiles doesn't stall the main thread.
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = function ( raycaster, intersects ) {

	if ( this.userData.lazyBVH && ! this.geometry.boundsTree ) this.geometry.computeBoundsTree();
	return acceleratedRaycast.call( this, raycaster, intersects );

};

/** Opt a freshly loaded tile scene into lazy BVH building. */
export function markForLazyBVH( scene ) {

	scene.traverse( o => {

		if ( o.isMesh ) o.userData.lazyBVH = true;

	} );

}

/** Frees the BVH memory of an unloaded tile scene. */
export function disposeBVH( scene ) {

	scene.traverse( o => {

		if ( o.isMesh && o.geometry.boundsTree ) o.geometry.disposeBoundsTree();

	} );

}
