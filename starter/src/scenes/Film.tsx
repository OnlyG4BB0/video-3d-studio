import React from 'react';
import {Chapters, FilmProps, ShotMusic} from '../kit';
import {SCENES} from './registry';

const EXAMPLE_CHAPTERS = [
	'FilmTitle',
	'FilmLight',
	'FilmModels',
	'FilmMaterials',
	'FilmMotion',
	'FilmShaders',
	'FilmMechanics',
	'FilmEnd',
];

// The example film. A different film only needs a different list of chapters,
// which can also come from a JSON file with --props-file, with no code at all.
export const filmDefaults: FilmProps = {
	format: 'wide',
	dissolve: 0.8,
	chapters: EXAMPLE_CHAPTERS.map((scene) => ({
		scene,
		seconds: SCENES[scene].defaults.seconds,
		music: SCENES[scene].defaults.music as ShotMusic | undefined,
	})),
};

export const Film: React.FC<FilmProps> = (props) => (
	<Chapters {...props} scenes={SCENES} />
);
