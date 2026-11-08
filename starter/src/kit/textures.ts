import type * as opentype from 'opentype.js';
import {useMemo} from 'react';
import {
	CanvasTexture,
	ColorSpace,
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

const finishTexture = <T extends DataTexture | CanvasTexture>(
	texture: T,
	repeat: [number, number],
	colorSpace: ColorSpace,
) => {
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	texture.repeat.set(repeat[0], repeat[1]);
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = 16;
	texture.colorSpace = colorSpace;
	texture.needsUpdate = true;
	return texture;
};

const rgbaTexture = (
	data: Uint8Array<ArrayBuffer>,
	width: number,
	height: number,
	repeat: [number, number],
	colorSpace: ColorSpace = NoColorSpace,
) =>
	finishTexture(
		new DataTexture(data, width, height, RGBAFormat),
		repeat,
		colorSpace,
	);

const greyTexture = (
	width: number,
	height: number,
	repeat: [number, number],
	value: (x: number, y: number) => number,
) => {
	const data = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const at = (y * width + x) * 4;
			const grey = Math.min(255, Math.max(0, value(x, y) * 255));
			data[at] = grey;
			data[at + 1] = grey;
			data[at + 2] = grey;
			data[at + 3] = 255;
		}
	}
	return rgbaTexture(data, width, height, repeat);
};

const hexToRgb = (hex: string): [number, number, number] => {
	const value = parseInt(hex.replace('#', ''), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** Draw anything with the 2D canvas API and use the result as a texture. */
export const useCanvasTexture = (
	draw: (context: CanvasRenderingContext2D, size: number) => void,
	{
		size = 1024,
		repeat = [1, 1],
		colorSpace = SRGBColorSpace,
		key = '',
	}: {
		size?: number;
		repeat?: [number, number];
		colorSpace?: ColorSpace;
		/** Change this when what is drawn should change. */
		key?: string;
	} = {},
) =>
	useMemo(() => {
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		draw(canvas.getContext('2d')!, size);
		return finishTexture(new CanvasTexture(canvas), repeat, colorSpace);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [size, repeat[0], repeat[1], colorSpace, key]);

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
		return greyTexture(
			size,
			size,
			repeat,
			(x, y) => (noise[y * size + x] - 0.5) * contrast + 0.5,
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seed, size, repeat[0], repeat[1], periods.join(','), contrast]);

/**
 * For roughnessMap: faint fingerprints and hairline scratches. Highlights break
 * up slightly across the surface, which is what makes metal look handled and real.
 */
export const useScratchMap = ({
	seed = 3,
	repeat = [1, 1],
	amount = 1,
}: {seed?: number; repeat?: [number, number]; amount?: number} = {}) =>
	useCanvasTexture(
		(context, size) => {
			const random = seededRandom(seed);
			context.fillStyle = 'rgb(205,205,205)';
			context.fillRect(0, 0, size, size);
			for (let i = 0; i < 44; i++) {
				const x = random() * size;
				const y = random() * size;
				const radius = 40 + random() * 190;
				const shade = random() > 0.5 ? 255 : 130;
				const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
				gradient.addColorStop(
					0,
					`rgba(${shade},${shade},${shade},${(0.05 + random() * 0.12) * amount})`,
				);
				gradient.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
				context.fillStyle = gradient;
				context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
			}
			for (let i = 0; i < 700; i++) {
				const x = random() * size;
				const y = random() * size;
				const angle = random() * Math.PI * 2;
				const length = 12 + random() * 150;
				context.strokeStyle = `rgba(255,255,255,${(0.08 + random() * 0.3) * amount})`;
				context.lineWidth = 0.5 + random() * 0.8;
				context.beginPath();
				context.moveTo(x, y);
				context.lineTo(
					x + Math.cos(angle) * length,
					y + Math.sin(angle) * length,
				);
				context.stroke();
			}
		},
		{repeat, colorSpace: NoColorSpace, key: `${seed}:${amount}`},
	);

/** For roughnessMap or bumpMap: fine lines running along the texture's U direction. */
export const useBrushedMap = ({
	seed = 5,
	repeat = [1, 1],
	size = 512,
}: {seed?: number; repeat?: [number, number]; size?: number} = {}) =>
	useMemo(() => {
		const random = seededRandom(seed);
		const rows = Array.from({length: size}, () => random());
		return greyTexture(
			8,
			size,
			repeat,
			(_x, y) =>
				0.68 +
				0.2 * rows[y] +
				0.12 * rows[(y + 1) % size] * rows[(y + 7) % size],
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seed, repeat[0], repeat[1], size]);

/** For bumpMap: ridges around a turned part, such as the grip on a bottle cap. */
export const useRidgeMap = (count: number) =>
	useMemo(
		() =>
			greyTexture(count * 8, 4, [1, 1], (x) =>
				Math.abs(Math.sin((x / 8 + 0.0625) * Math.PI)),
			),
		[count],
	);

/** For bumpMap: the over-and-under texture of woven cloth. */
export const useWeaveMap = ({
	seed = 9,
	repeat = [20, 20],
}: {seed?: number; repeat?: [number, number]} = {}) =>
	useMemo(() => {
		const size = 256;
		const noise = tileableNoise(size, seed, [32, 64, 128]);
		const threads = 16;
		return greyTexture(size, size, repeat, (x, y) => {
			const u = (x / size) * threads * Math.PI * 2;
			const v = (y / size) * threads * Math.PI * 2;
			const warp = Math.sin(u) * 0.5 + 0.5;
			const weft = Math.sin(v) * 0.5 + 0.5;
			const over =
				(Math.floor((x / size) * threads) +
					Math.floor((y / size) * threads)) %
					2 ===
				0;
			return (over ? warp : weft) * 0.8 + noise[y * size + x] * 0.2;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seed, repeat[0], repeat[1]]);

/** Colour map of stone or glaze with flecks, such as terrazzo or speckled ceramic. */
export const useSpeckleMap = ({
	seed = 13,
	base = '#b9b3a7',
	flecks = ['#6d675d', '#e8e2d6', '#3b3833'],
	density = 900,
	maxSize = 9,
	repeat = [1, 1],
}: {
	seed?: number;
	base?: string;
	flecks?: string[];
	density?: number;
	maxSize?: number;
	repeat?: [number, number];
} = {}) =>
	useCanvasTexture(
		(context, size) => {
			const random = seededRandom(seed);
			context.fillStyle = base;
			context.fillRect(0, 0, size, size);
			for (let i = 0; i < density; i++) {
				const x = random() * size;
				const y = random() * size;
				const radius = 0.8 + random() * random() * maxSize;
				context.fillStyle = flecks[Math.floor(random() * flecks.length)];
				context.globalAlpha = 0.45 + random() * 0.55;
				context.beginPath();
				context.ellipse(
					x,
					y,
					radius,
					radius * (0.5 + random() * 0.5),
					random() * Math.PI,
					0,
					Math.PI * 2,
				);
				context.fill();
			}
			context.globalAlpha = 1;
		},
		{repeat, key: `${seed}:${base}:${flecks.join()}:${density}:${maxSize}`},
	);

/**
 * White centre fading to black at the edge. Use as alphaMap on a circle so that
 * a floor dissolves into the background instead of ending in a horizon line.
 */
export const useRadialFade = (solidUntil = 0.5) =>
	useCanvasTexture(
		(context, size) => {
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
		},
		{size: 512, colorSpace: NoColorSpace, key: `${solidUntil}`},
	);

/**
 * Text or a mark printed on a surface, on a transparent background. Put it on a
 * thin sleeve just above the object, using `transparent` on the material.
 */
export const usePrintMap = (
	font: opentype.Font | null,
	lines: {text: string; size: number; y: number; tracking?: number}[],
	color = '#f2efe8',
) =>
	useCanvasTexture(
		(context, size) => {
			if (!font) {
				return;
			}
			for (const line of lines) {
				const px = line.size * size;
				const tracking = (line.tracking ?? 0) * px;
				const glyphs = font.stringToGlyphs(line.text);
				const advance = glyphs.map(
					(glyph) => ((glyph.advanceWidth ?? 0) / font.unitsPerEm) * px + tracking,
				);
				let x = size / 2 - (advance.reduce((a, b) => a + b, 0) - tracking) / 2;
				glyphs.forEach((glyph, index) => {
					const path = glyph.getPath(x, line.y * size, px);
					path.fill = color;
					path.draw(context);
					x += advance[index];
				});
			}
		},
		{key: `${font ? 'ready' : 'loading'}:${JSON.stringify(lines)}:${color}`},
	);

export type TimberOptions = {
	seed?: number;
	light?: string;
	dark?: string;
	planks?: number;
	repeat?: [number, number];
};

/** Timber boards: returns map, roughnessMap and bumpMap to spread onto a material. */
export const useTimber = ({
	seed = 7,
	light = '#b98a5c',
	dark = '#6f4a2c',
	planks = 7,
	repeat = [2, 2],
}: TimberOptions = {}) =>
	useMemo(() => {
		const size = 1024;
		const broad = tileableNoise(size, seed, [4, 8, 16, 32]);
		const fine = tileableNoise(size, seed + 1, [64, 128, 256, 512]);
		const random = seededRandom(seed + 2);
		const boards = Array.from({length: planks}, () => ({
			shade: 0.82 + random() * 0.32,
			shift: Math.floor(random() * size),
			joint: Math.floor(random() * size),
			phase: random() * 40,
		}));
		const lightRgb = hexToRgb(light);
		const darkRgb = hexToRgb(dark);
		const boardHeight = size / planks;

		const colour = new Uint8Array(size * size * 4);
		const rough = new Uint8Array(size * size * 4);
		const bump = new Uint8Array(size * size * 4);

		for (let y = 0; y < size; y++) {
			const row = Math.min(planks - 1, Math.floor(y / boardHeight));
			const board = boards[row];
			const across = y - row * boardHeight;
			const local = across / boardHeight;
			for (let x = 0; x < size; x++) {
				const sx = (x + board.shift) % size;
				// Noise sampled with X stretched keeps the grain running along the board.
				const large = broad[y * size + (sx >> 4)];
				const fibre = fine[y * size + (sx >> 5)];
				const rings =
					0.5 + 0.5 * Math.sin((local * 7 + large * 2.2 + board.phase) * Math.PI * 2);
				const grain = Math.min(1, rings * 0.32 + fibre * 0.85);

				const seam = Math.min(across, boardHeight - across);
				const butt = Math.abs(((x - board.joint + size * 1.5) % size) - size / 2);
				const groove = Math.min(1, Math.min(seam, butt) / 2.2);

				const at = (y * size + x) * 4;
				for (let c = 0; c < 3; c++) {
					const value =
						(darkRgb[c] + (lightRgb[c] - darkRgb[c]) * grain) * board.shade;
					colour[at + c] = Math.min(255, value * (0.3 + 0.7 * groove));
				}
				const roughness = 150 + (1 - grain) * 90 + (1 - groove) * 40;
				rough[at] = rough[at + 1] = rough[at + 2] = Math.min(255, roughness);
				const height = groove * (205 + fibre * 50);
				bump[at] = bump[at + 1] = bump[at + 2] = height;
				colour[at + 3] = rough[at + 3] = bump[at + 3] = 255;
			}
		}

		return {
			map: rgbaTexture(colour, size, size, repeat, SRGBColorSpace),
			roughnessMap: rgbaTexture(rough, size, size, repeat),
			bumpMap: rgbaTexture(bump, size, size, repeat),
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seed, light, dark, planks, repeat[0], repeat[1]]);
