import React from 'react';
import {Composition} from 'remotion';
import {FilmProps, fitFilm, fitShot, sceneMusic, ShotMusic, ShotProps, withSceneMusic} from './kit';
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
			// Each chapter also gets the sounds its scene works out from its own props.
			calculateMetadata={({props}) => fitFilm({props: withSceneMusic(props as FilmProps, SCENES)})}
		/>
		{Object.entries(SCENES).map(([id, entry]) => (
			<Composition
				key={id}
				id={id}
				component={entry.component as React.FC<ShotProps>}
				defaultProps={entry.defaults as ShotProps}
				calculateMetadata={({props}) => ({
					...fitShot({props}),
					// Sounds that follow the picture are worked out from the shot's actual props.
					props: {
						...props,
						music: sceneMusic(entry, props, entry.music ? (props as {music?: ShotMusic}).music : undefined),
					},
				})}
			/>
		))}
	</>
);
