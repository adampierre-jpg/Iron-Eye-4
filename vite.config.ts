import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		exclude: ['@mediapipe/pose', '@mediapipe/camera_utils', '@mediapipe/drawing_utils']
	},
	server: {
		host: true,
		port: 5173
	}
});
