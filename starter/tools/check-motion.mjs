// Renders every frame at tiny size and reports flashes and jumps between frames.
// Review stills can miss these, because a flash may last only a few frames.
//
//   node tools/check-motion.mjs LogoReveal --set format=square

import zlib from 'node:zlib';
import {renderFrames} from '@remotion/renderer';
import {
	defaultConcurrency,
	fail,
	parseArguments,
	readProps,
	TIMEOUT_MS,
	withRenderer,
} from './lib.mjs';

// Average change in brightness between two frames, on a scale of 0 to 255.
// Fast but ordinary movement in the example scenes stays below 9.
const SUDDEN_CHANGE = 15;

const CHANNELS = {0: 1, 2: 3, 4: 2, 6: 4};

const paeth = (a, b, c) => {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	return pb <= pc ? b : c;
};

/** Reads an 8-bit PNG and returns its brightness values. */
const pngBrightness = (png) => {
	let offset = 8;
	let width = 0;
	let height = 0;
	let channels = 0;
	const compressed = [];
	while (offset < png.length) {
		const length = png.readUInt32BE(offset);
		const type = png.toString('latin1', offset + 4, offset + 8);
		const data = png.subarray(offset + 8, offset + 8 + length);
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			channels = CHANNELS[data[9]];
			if (data[8] !== 8 || !channels || data[12] !== 0) {
				throw new Error('Unexpected PNG format from the renderer.');
			}
		} else if (type === 'IDAT') {
			compressed.push(data);
		}
		offset += length + 12;
	}

	const raw = zlib.inflateSync(Buffer.concat(compressed));
	const stride = width * channels;
	const previous = new Uint8Array(stride);
	const row = new Uint8Array(stride);
	const brightness = new Float32Array(width * height);

	for (let y = 0; y < height; y++) {
		const start = y * (stride + 1);
		const filter = raw[start];
		for (let x = 0; x < stride; x++) {
			const value = raw[start + 1 + x];
			const left = x >= channels ? row[x - channels] : 0;
			const up = previous[x];
			const upLeft = x >= channels ? previous[x - channels] : 0;
			const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
			row[x] = (value + predicted) & 255;
		}
		for (let x = 0; x < width; x++) {
			const at = x * channels;
			brightness[y * width + x] =
				channels >= 3
					? 0.2126 * row[at] + 0.7152 * row[at + 1] + 0.0722 * row[at + 2]
					: row[at];
		}
		previous.set(row);
	}
	return brightness;
};

const averageDifference = (a, b) => {
	let total = 0;
	for (let i = 0; i < a.length; i++) {
		total += Math.abs(a[i] - b[i]);
	}
	return total / a.length;
};

const groupFrames = (frames) => {
	const groups = [];
	for (const frame of frames) {
		const last = groups.at(-1);
		if (last && frame <= last[1] + 2) {
			last[1] = frame;
		} else {
			groups.push([frame, frame]);
		}
	}
	return groups.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`));
};

const main = async () => {
	const {positional, flags, sets} = parseArguments(process.argv.slice(2));
	const id = positional[0];
	if (!id) {
		throw new Error('Name a shot, for example: node tools/check-motion.mjs ProductOrbit');
	}
	const inputProps = readProps(flags, sets);
	const brightness = new Map();

	await withRenderer({id, inputProps, flags}, ({puppeteerInstance: _shared, ...context}) =>
		renderFrames({
			...context,
			inputProps,
			imageFormat: 'png',
			outputDir: null,
			scale: 0.1,
			concurrency: Number(flags.concurrency ?? defaultConcurrency()),
			logLevel: 'error',
			timeoutInMilliseconds: TIMEOUT_MS,
			onStart: () => undefined,
			onFrameUpdate: () => undefined,
			onFrameBuffer: (buffer, frame) => {
				brightness.set(frame, pngBrightness(buffer));
			},
		}),
	);

	const frames = [...brightness.keys()].sort((a, b) => a - b);
	const changes = frames.slice(1).map((frame, index) => ({
		frame,
		change: averageDifference(brightness.get(frames[index]), brightness.get(frame)),
	}));
	const largest = Math.max(0, ...changes.map(({change}) => change));
	const flagged = changes
		.filter(({change}) => change >= SUDDEN_CHANGE)
		.map(({frame}) => frame);

	console.log(`Compared ${changes.length} frame pairs. Largest change: ${largest.toFixed(1)} (limit ${SUDDEN_CHANGE}).`);
	if (flagged.length === 0) {
		console.log('OK: no flashes or sudden jumps.');
		return;
	}
	const list = groupFrames(flagged).join(', ');
	console.log(`CHECK: sudden changes at frames ${list}.`);
	console.log(`Look at them with: node tools/stills.mjs ${id} --frames ${flagged.slice(0, 6).join(',')}`);
};

main().catch(fail);
