import {useMemo} from 'react';
import {
	CanvasTexture,
	DataTexture,
	LinearFilter,
	LinearMipmapLinearFilter,
	NoColorSpace,
	RepeatWrapping,
	RGBAFormat,
	SRGBColorSpace,
} from 'three';

const seededRandom = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const fade = (t: number) => t * t * (3 - 2 * t);

/** Noise that repeats without seams, as values in roughly 0..1. */
const tileableNoise = (size: number, seed: number, periods: number[]) => {
	const random = seededRandom(seed);
	const output = new Float32Array(size * size);
	let totalWeight = 0;

	periods.forEach((period, octave) => {
		const grid = new Float32Array(period * period);
		for (let i = 0; i < grid.length; i++) {
			grid[i] = random();
		}
		const weight = 1 / (octave + 1);
		totalWeight += weight;
		for (let y = 0; y < size; y++) {
			const gy = (y / size) * period;
			const y0 = Math.floor(gy) % period;
			const y1 = (y0 + 1) % period;
			const ty = fade(gy - Math.floor(gy));
			for (let x = 0; x < size; x++) {
				const gx = (x / size) * period;
				const x0 = Math.floor(gx) % period;
				const x1 = (x0 + 1) % period;
				const tx = fade(gx - Math.floor(gx));
				const a = grid[y0 * period + x0] * (1 - tx) + grid[y0 * period + x1] * tx;
				const b = grid[y1 * period + x0] * (1 - tx) + grid[y1 * period + x1] * tx;
				output[y * size + x] += (a * (1 - ty) + b * ty) * weight;
			}
		}
	});

	for (let i = 0; i < output.length; i++) {
		output[i] /= totalWeight;
	}
	return output;
};

export type NoiseOptions = {
	seed?: number;
	size?: number;
	repeat?: [number, number];
	/** Finer periods give finer grain. */
	periods?: number[];
	contrast?: number;
};

/** Grey noise for bumpMap or roughnessMap, so surfaces do not look like plastic. */
export const useNoiseTexture = ({
	seed = 1,
	size = 256,
	repeat = [4, 4],
	periods = [8, 16, 32, 64, 128],
	contrast = 1.6,
}: NoiseOptions = {}) =>
	useMemo(() => {
		const noise = tileableNoise(size, seed, periods);
		const data = new Uint8Array(size * size * 4);
		for (let i = 0; i < noise.length; i++) {
			const value = Math.min(
				255,
				Math.max(0, ((noise[i] - 0.5) * contrast + 0.5) * 255),
			);
			data[i * 4] = value;
			data[i * 4 + 1] = value;
			data[i * 4 + 2] = value;
			data[i * 4 + 3] = 255;
		}
		const texture = new DataTexture(data, size, size, RGBAFormat);
		texture.wrapS = RepeatWrapping;
		texture.wrapT = RepeatWrapping;
		texture.repeat.set(repeat[0], repeat[1]);
		texture.magFilter = LinearFilter;
		texture.minFilter = LinearMipmapLinearFilter;
		texture.generateMipmaps = true;
		texture.anisotropy = 8;
		texture.colorSpace = NoColorSpace;
		texture.needsUpdate = true;
		return texture;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seed, size, repeat[0], repeat[1], periods.join(','), contrast]);

/**
 * White centre fading to black at the edge. Use as alphaMap on a circle so that
 * a floor dissolves into the background instead of ending in a horizon line.
 */
export const useRadialFade = (solidUntil = 0.5) =>
	useMemo(() => {
		const size = 512;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext('2d')!;
		const gradient = context.createRadialGradient(
			size / 2,
			size / 2,
			(size / 2) * solidUntil,
			size / 2,
			size / 2,
			size / 2,
		);
		gradient.addColorStop(0, '#ffffff');
		gradient.addColorStop(1, '#000000');
		context.fillStyle = gradient;
		context.fillRect(0, 0, size, size);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = NoColorSpace;
		return texture;
	}, [solidUntil]);

export type PlankOptions = {
	seed?: number;
	base?: string;
	planks?: number;
	repeat?: [number, number];
};

/** Painted timber floor colour map. */
export const usePlankTexture = ({
	seed = 7,
	base = '#9b7450',
	planks = 8,
	repeat = [2, 2],
}: PlankOptions = {}) =>
	useMemo(() => {
		const size = 1024;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext('2d')!;
		const random = seededRandom(seed);
		const plankHeight = size / planks;

		for (let row = 0; row < planks; row++) {
			const shade = 0.82 + random() * 0.3;
			context.fillStyle = base;
			context.fillRect(0, row * plankHeight, size, plankHeight);
			context.fillStyle = shade > 1 ? 'rgba(255,240,215,1)' : 'rgba(25,14,6,1)';
			context.globalAlpha = Math.abs(shade - 1) * 0.9;
			context.fillRect(0, row * plankHeight, size, plankHeight);
			context.globalAlpha = 1;

			for (let streak = 0; streak < 70; streak++) {
				const y = row * plankHeight + random() * plankHeight;
				context.strokeStyle = `rgba(40,22,10,${0.03 + random() * 0.09})`;
				context.lineWidth = 0.6 + random() * 2.2;
				context.beginPath();
				context.moveTo(0, y);
				context.bezierCurveTo(
					size * 0.3,
					y + (random() - 0.5) * 12,
					size * 0.7,
					y + (random() - 0.5) * 12,
					size,
					y,
				);
				context.stroke();
			}

			context.fillStyle = 'rgba(16,9,4,0.75)';
			context.fillRect(0, row * plankHeight, size, 2.5);
			const seam = random() * size;
			context.fillRect(seam, row * plankHeight, 2.5, plankHeight);
		}

		const texture = new CanvasTexture(canvas);
		texture.wrapS = RepeatWrapping;
		texture.wrapT = RepeatWrapping;
		texture.repeat.set(repeat[0], repeat[1]);
		texture.anisotropy = 8;
		texture.colorSpace = SRGBColorSpace;
		return texture;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seed, base, planks, repeat[0], repeat[1]]);
