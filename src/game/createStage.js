import {
	CanvasTexture,
	DirectionalLight,
	EquirectangularReflectionMapping,
	Fog,
	HemisphereLight,
	PerspectiveCamera,
	PMREMGenerator,
	Scene,
	SRGBColorSpace,
	WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const HORIZON = 0xc4d7e6;
const MAX_PIXEL_RATIO = 1.5;

/**
 * Renderer, scene and camera with sky, haze and car lighting. The photogrammetry tiles
 * are unlit, so the lights and environment map only affect the car.
 *
 * @param {HTMLElement} container
 */
export function createStage( container ) {

	const renderer = new WebGLRenderer( { antialias: true, logarithmicDepthBuffer: true } );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, MAX_PIXEL_RATIO ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	container.appendChild( renderer.domElement );

	const scene = new Scene();
	scene.background = createSkyTexture();
	scene.fog = new Fog( HORIZON, 2500, 18000 );

	scene.add( new HemisphereLight( 0xe4f0ff, 0x6b5f4f, 1.4 ) );
	const sun = new DirectionalLight( 0xfff4e0, 2.4 );
	sun.position.set( - 60, 100, 40 );
	scene.add( sun );
	scene.environment = new PMREMGenerator( renderer ).fromScene( new RoomEnvironment(), 0.04 ).texture;
	scene.environmentIntensity = 0.8;

	const camera = new PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.25, 20000 );

	window.addEventListener( 'resize', () => {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize( window.innerWidth, window.innerHeight );

	} );

	return { renderer, scene, camera };

}

/** Vertical gradient used as an equirectangular sky; its horizon matches the fog colour. */
function createSkyTexture() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 4;
	canvas.height = 512;
	const ctx = canvas.getContext( '2d' );
	const g = ctx.createLinearGradient( 0, 0, 0, 512 );
	g.addColorStop( 0, '#2f6fc0' );
	g.addColorStop( 0.38, '#7fb0de' );
	g.addColorStop( 0.5, '#' + HORIZON.toString( 16 ) );
	g.addColorStop( 1, '#9fb2c2' );
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, 4, 512 );

	const texture = new CanvasTexture( canvas );
	texture.mapping = EquirectangularReflectionMapping;
	texture.colorSpace = SRGBColorSpace;
	return texture;

}
