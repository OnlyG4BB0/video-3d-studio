// Renders review images of a shot, so that it can be checked before the video.
//
//   node tools/stills.mjs ProductOrbit --set format=wide --count 5
//   node tools/stills.mjs ProductOrbit --frames 0,30,179 --scale 1
//   node tools/stills.mjs Film --dissolves

import fs from 'node:fs';
import path from 'node:path';
import {renderStill} from '@remotion/renderer';
import {
	fail,
	parseArguments,
	PROJECT_ROOT,
	readProps,
	samplesFor,
	TIMEOUT_MS,
	withRenderer,
} from './lib.mjs';

const main = async () => {
	const {positional, flags, sets} = parseArguments(process.argv.slice(2));
	const id = positional[0];
	if (!id) {
		throw new Error('Name a shot, for example: node tools/stills.mjs ProductOrbit');
	}
	const inputProps = readProps(flags, sets);
	const count = Number(flags.count ?? 4);
	const scale = Number(flags.scale ?? 0.5);
	const folder = path.join(PROJECT_ROOT, 'out', 'review');
	fs.mkdirSync(folder, {recursive: true});
	for (const name of fs.readdirSync(folder)) {
		if (name.startsWith(`${id}-`)) {
			fs.rmSync(path.join(folder, name));
		}
	}

	await withRenderer({id, inputProps, flags}, async (context, gl) => {
		const renderProps = {
			...inputProps,
			renderSamples: samplesFor({gl, flags, fallback: 24}),
		};
		const last = context.composition.durationInFrames - 1;
		const timeline = context.composition.props.timeline;
		if (flags.dissolves && !timeline) {
			throw new Error('--dissolves only applies to a film.');
		}
		// The middle of each dissolve, where both chapters are on screen.
		const dissolves = (timeline ?? [])
			.slice(1)
			.map((slot, i) =>
				Math.round((slot.from + timeline[i].from + timeline[i].frames) / 2),
			);
		const frames = flags.dissolves
			? dissolves
			: flags.frames
				? flags.frames.split(',').map(Number)
				: Array.from({length: count}, (_, i) =>
						count === 1 ? 0 : Math.round((i * last) / (count - 1)),
					);

		for (const frame of frames) {
			if (!Number.isInteger(frame) || frame < 0 || frame > last) {
				throw new Error(`Frame ${frame} is outside this shot (0-${last}).`);
			}
			const output = path.join(
				folder,
				`${id}-${String(frame).padStart(4, '0')}.jpg`,
			);
			await renderStill({
				...context,
				inputProps: renderProps,
				frame,
				output,
				imageFormat: 'jpeg',
				jpegQuality: 88,
				scale,
				overwrite: true,
				logLevel: 'error',
				timeoutInMilliseconds: TIMEOUT_MS,
			});
			console.log(output);
		}
	});
};

main().catch(fail);
