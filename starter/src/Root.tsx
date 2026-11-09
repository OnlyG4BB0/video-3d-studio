import React from 'react';
import {Composition} from 'remotion';
import {fitFilm, fitShot, ShotProps} from './kit';
import {Film, filmDefaults} from './scenes/Film';
import {SCENES} from './scenes/registry';

// Every shot gets its size and length from its props, so one composition serves
// all three formats. New scenes go in scenes/registry.ts and appear here by themselves.
export const Root: React.FC = () => (
	<>
		<Composition
			id="Film"
			component={Film}
			defaultProps={filmDefaults}
			calculateMetadata={fitFilm}
		/>
		{Object.entries(SCENES).map(([id, {component, defaults}]) => (
			<Composition
				key={id}
				id={id}
				component={component as React.FC<ShotProps>}
				defaultProps={defaults as ShotProps}
				calculateMetadata={fitShot}
			/>
		))}
	</>
);
