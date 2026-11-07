import {
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	MultiplyBlending,
	PlaneGeometry,
	TextureLoader,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const PAINTS = [ 0xc4000c, 0xffc000, 0x0a3d91, 0x111111, 0xf2f2f2, 0x1e8a4c, 0xff5a1f ];

const WHEEL_NAMES = [ 'fl', 'fr', 'rl', 'rr' ];
const FRONT_WHEELS = new Set( [ 'fl', 'fr' ] );

/** The visible Ferrari: loads the glTF, owns its materials and mirrors a CarPhysics state each frame. */
export class CarModel {

	#object = new Group();
	#wheels = {};
	#bodyMaterial = null;
	#paintIndex = 0;

	/** Scene node to add to the scene graph. */
	get object() {

		return this.#object;

	}

	async load( modelUrl, shadowUrl ) {

		const loader = new GLTFLoader().setDRACOLoader( new DRACOLoader() );
		const [ gltf, shadowTexture ] = await Promise.all( [
			loader.loadAsync( modelUrl ),
			new TextureLoader().loadAsync( shadowUrl ),
		] );

		const model = gltf.scene.children[ 0 ];
		this.#applyMaterials( model );
		this.#collectWheels( model );
		model.add( createContactShadow( shadowTexture ) );

		// the model's nose points to -Z; turn it so +Z is forward
		const pivot = new Group();
		pivot.rotation.y = Math.PI;
		pivot.add( model );
		this.#object.add( pivot );

	}

	cyclePaint() {

		this.#paintIndex = ( this.#paintIndex + 1 ) % PAINTS.length;
		this.#bodyMaterial?.color.setHex( PAINTS[ this.#paintIndex ] );

	}

	setVisible( visible ) {

		this.#object.visible = visible;

	}

	/** @param {import('./CarPhysics.js').CarPhysics} physics */
	sync( physics ) {

		this.#object.position.copy( physics.position );
		this.#object.quaternion.copy( physics.quaternion );

		for ( const [ name, wheel ] of Object.entries( this.#wheels ) ) {

			// the model is rotated 180°, so forward spin is negative around its axle
			wheel.rotation.x = wheel.userData.baseX - physics.wheelSpin;
			if ( FRONT_WHEELS.has( name ) ) wheel.rotation.y = - physics.steer;

		}

	}

	#applyMaterials( model ) {

		this.#bodyMaterial = new MeshPhysicalMaterial( {
			color: PAINTS[ this.#paintIndex ],
			metalness: 0.9,
			roughness: 0.35,
			clearcoat: 1,
			clearcoatRoughness: 0.03,
		} );
		const chrome = new MeshStandardMaterial( { color: 0xffffff, metalness: 1, roughness: 0.3 } );
		const glass = new MeshPhysicalMaterial( {
			color: 0x0b0d10,
			metalness: 0.2,
			roughness: 0.05,
			transparent: true,
			opacity: 0.55,
		} );

		model.getObjectByName( 'body' ).material = this.#bodyMaterial;
		model.getObjectByName( 'glass' ).material = glass;
		model.getObjectByName( 'trim' ).material = chrome;
		for ( const name of WHEEL_NAMES ) model.getObjectByName( `rim_${ name }` ).material = chrome;

	}

	#collectWheels( model ) {

		for ( const name of WHEEL_NAMES ) {

			const wheel = model.getObjectByName( `wheel_${ name }` );
			wheel.rotation.order = 'YXZ'; // steer around Y after spinning around the axle
			wheel.userData.baseX = wheel.rotation.x;
			this.#wheels[ name ] = wheel;

		}

	}

}

/** Baked ambient-occlusion "shadow" plane under the car. */
function createContactShadow( texture ) {

	const shadow = new Mesh(
		new PlaneGeometry( 0.655 * 4, 1.3 * 4 ),
		new MeshBasicMaterial( {
			map: texture,
			blending: MultiplyBlending,
			premultipliedAlpha: true,
			toneMapped: false,
			transparent: true,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: - 4,
		} ),
	);
	shadow.rotation.x = - Math.PI / 2;
	shadow.position.y = 0.02;
	shadow.renderOrder = 2;
	return shadow;

}
