// Composes original music for a shot or a film and saves it as a WAV.
// To render a video with its music in one step, use render.mjs with --music.
//
//   node tools/music.mjs Film
//   node tools/music.mjs ProductOrbit --mood warm --seed 2 --out out/music/bottle.wav

import path from 'node:path';
import {
	fail,
	parseArguments,
	PROJECT_ROOT,
	readProps,
	withRenderer,
} from './lib.mjs';
import {makeSoundtrack} from './sound.mjs';

const main = async () => {
	const {positional, flags, sets} = parseArguments(process.argv.slice(2));
	const id = positional[0];
	if (!id) {
		throw new Error('Name a shot, for example: node tools/music.mjs Film');
	}
	const inputProps = readProps(flags, sets);
	const output = path.resolve(
		PROJECT_ROOT,
		flags.out ?? path.join('out', 'music', `${id}.wav`),
	);
	await withRenderer({id, inputProps, flags}, ({composition}) => {
		makeSoundtrack({composition, flags, output});
		console.log(output);
	});
};

main().catch(fail);
