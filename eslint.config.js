import js from '@eslint/js';
import globals from 'globals';

export default [
	{ ignores: [ 'dist/**', 'node_modules/**' ] },
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: globals.browser,
		},
		rules: {
			'no-unused-vars': [ 'error', { args: 'after-used', argsIgnorePattern: '^_' } ],
			eqeqeq: [ 'error', 'always' ],
			'prefer-const': 'error',
			'no-var': 'error',
		},
	},
	{
		files: [ 'test/**', '*.config.js' ],
		languageOptions: { globals: globals.node },
	},
];
