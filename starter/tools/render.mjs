// Renders a shot to an MP4.
//
//   node tools/render.mjs ProductOrbit --set format=vertical --out out/bottle.mp4
//   node tools/render.mjs ProductOrbit --quality draft

import fs from 'node:fs';
import path from 'node:path';
import {renderMedia} from '@remotion/renderer';
import {
	defaultConcurrency,
	fail,
	parseArguments,
	PROJECT_ROOT,
	readProps,
	TIMEOUT_MS,
	withRenderer,
} from './lib.mjs';

const QUALITY = {
	draft: {scale: 0.5, crf: 26, imageFormat: 'jpeg', jpegQuality: 85},
	final: {scale: 1, crf: 19, imageFormat: 'jpeg', jpegQuality: 96},
};

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

	await withRenderer({id, inputProps, flags}, (context) =>
		renderMedia({
			...context,
			...quality,
			codec: 'h264',
			pixelFormat: 'yuv420p',
			colorSpace: 'bt709',
			inputProps,
			outputLocation,
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
		}),
	);

	const seconds = Math.round((Date.now() - startedAt) / 1000);
	const size = (fs.statSync(outputLocation).size / 1_000_000).toFixed(1);
	console.log(`Done in ${seconds} s: ${outputLocation} (${size} MB)`);
};

main().catch(fail);
