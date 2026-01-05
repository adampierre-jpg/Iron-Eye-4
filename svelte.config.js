import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Vercel adapter options
			runtime: 'edge', // or 'nodejs18.x' for Node.js runtime
			regions: ['iad1'], // Optional: specify regions
			split: false
		}),
		alias: {
			$lib: './src/lib'
		}
	}
};

export default config;
