// Renders a shot to an MP4.
//
//   node tools/render.mjs ProductOrbit --set format=vertical --out out/bottle.mp4
//   node tools/render.mjs ProductOrbit --quality draft
//   node tools/render.mjs Film --music
//   node tools/render.mjs ProductOrbit --music warm
//   node tools/render.mjs Film --range 0-299 --quality draft
//   node tools/render.mjs ProductOrbit --shutter 0

import fs from 'node:fs';
import path from 'node:path';
import {renderMedia} from '@remotion/renderer';
import {
	addSoundtrack,
	defaultConcurrency,
	fail,
	parseArguments,
	PROJECT_ROOT,
	readProps,
	samplesFor,
	shutterFor,
	TIMEOUT_MS,
	withRenderer,
} from './lib.mjs';
import {makeSoundtrack} from './sound.mjs';

const QUALITY = {
	draft: {scale: 0.5, crf: 26, imageFormat: 'jpeg', jpegQuality: 85},
	final: {scale: 1, crf: 19, imageFormat: 'jpeg', jpegQuality: 96},
};
const SAMPLES = {draft: 12, final: 64};

const main = async () => {
	const {positional, flags, sets} = parseArguments(process.argv.slice(2));
	const id = positional[0];
	if (!id) {
		throw new Error('Name a shot, for example: node tools/render.mjs ProductOrbit');
	}
	const quality = QUALITY[flags.quality ?? 'final'];
	if (!quality) {
		throw new Error(`--quality must be one of: ${Object.keys(QUALITY).join(', ')}`);
	}
	const inputProps = readProps(flags, sets);
	const outputLocation = path.resolve(
		PROJECT_ROOT,
		flags.out ?? path.join('out', `${id}.mp4`),
	);
	fs.mkdirSync(path.dirname(outputLocation), {recursive: true});
	const concurrency = Number(flags.concurrency ?? defaultConcurrency());
	const startedAt = Date.now();
	let lastPercent = -10;

	const wantsMusic = flags.music !== undefined;
	const name = path.parse(outputLocation).name;
	const wavLocation = path.resolve(PROJECT_ROOT, 'out', 'music', `${name}.wav`);
	const pictureLocation = wantsMusic
		? path.join(path.dirname(outputLocation), `${name}.no-sound.mp4`)
		: outputLocation;

	await withRenderer({id, inputProps, flags}, async (context, gl) => {
		// The music takes seconds and the picture can take minutes, so a mistake
		// in the score should stop things before the long part begins.
		if (wantsMusic) {
			makeSoundtrack({composition: context.composition, flags, output: wavLocation});
		}
		await renderMedia({
			...context,
			...quality,
			codec: 'h264',
			pixelFormat: 'yuv420p',
			colorSpace: 'bt709',
			inputProps: {
				...inputProps,
				renderSamples: samplesFor({
					gl,
					flags,
					fallback: SAMPLES[flags.quality ?? 'final'],
				}),
				...shutterFor(flags),
			},
			// Only part of the shot, as first-last frame, for a quick look at one moment.
			frameRange: flags.range ? flags.range.split('-').map(Number) : null,
			outputLocation: pictureLocation,
			concurrency,
			overwrite: true,
			logLevel: 'error',
			timeoutInMilliseconds: TIMEOUT_MS,
			onProgress: ({progress}) => {
				const percent = Math.floor(progress * 100);
				if (percent >= lastPercent + 10) {
					lastPercent = percent;
					console.log(`${percent}%`);
				}
			},
		});
	});

	if (wantsMusic) {
		addSoundtrack(pictureLocation, wavLocation, outputLocation);
		fs.rmSync(pictureLocation);
	}

	const seconds = Math.round((Date.now() - startedAt) / 1000);
	const size = (fs.statSync(outputLocation).size / 1_000_000).toFixed(1);
	console.log(`Done in ${seconds} s: ${outputLocation} (${size} MB)`);
};

main().catch(fail);
