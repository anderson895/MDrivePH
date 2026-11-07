import { defineConfig } from 'vite';

export default defineConfig( {
	// relative asset paths so the build also works from a sub-folder (GitHub Pages, etc.)
	base: './',
	build: {
		target: 'es2022',
		chunkSizeWarningLimit: 2000,
	},
	// the OSM tile worker is an ES module (it imports three and the tile builder)
	worker: {
		format: 'es',
	},
	test: {
		environment: 'node',
		include: [ 'test/**/*.test.js' ],
	},
} );
