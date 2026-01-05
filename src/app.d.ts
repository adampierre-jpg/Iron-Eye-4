// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
// ghj
	}
}

declare module '@mediapipe/pose' {
	export class Pose {
		constructor(config: { locateFile: (file: string) => string });
		setOptions(options: {
			modelComplexity?: 0 | 1 | 2;
			smoothLandmarks?: boolean;
			enableSegmentation?: boolean;
			smoothSegmentation?: boolean;
			minDetectionConfidence?: number;
			minTrackingConfidence?: number;
		}): void;
		onResults(callback: (results: PoseResults) => void): void;
		send(inputs: { image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement }): Promise<void>;
		close(): void;
	}

	export interface PoseResults {
		poseLandmarks?: NormalizedLandmark[];
		poseWorldLandmarks?: Landmark[];
		segmentationMask?: ImageData;
	}

	export interface NormalizedLandmark {
		x: number;
		y: number;
		z: number;
		visibility?: number;
	}

	export interface Landmark {
		x: number;
		y: number;
		z: number;
		visibility?: number;
	}
}

declare module '@mediapipe/camera_utils' {
	export class Camera {
		constructor(
			videoElement: HTMLVideoElement,
			config: {
				onFrame: () => Promise<void>;
				width?: number;
				height?: number;
				facingMode?: string;
			}
		);
		start(): Promise<void>;
		stop(): void;
	}
}

declare module '@mediapipe/drawing_utils' {
	export function drawConnectors(
		ctx: CanvasRenderingContext2D,
		landmarks: { x: number; y: number; z: number }[],
		connections: [number, number][],
		style?: { color?: string; lineWidth?: number }
	): void;

	export function drawLandmarks(
		ctx: CanvasRenderingContext2D,
		landmarks: { x: number; y: number; z: number }[],
		style?: { color?: string; lineWidth?: number; radius?: number }
	): void;
}

export {};
