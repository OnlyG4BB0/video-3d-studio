import React, {useMemo} from 'react';
import {Object3D} from 'three';
import {EnvLight, SunLight} from '../../kit';
import {Sky, SKIES, TOWERS} from './Track';
import {centreAt, lap} from './world';

// Night lighting for the circuit: moonlight, a dark sky with stars, and the
// floodlight towers nearest the action casting real light onto the track.

/** The towers within reach of a stretch of the lap, from `from` to `to` metres. */
export const towersAlong = (from: number, to: number) => {
	const length = lap().length;
	const inStretch = (s: number) => {
		const a = ((from % length) + length) % length;
		const b = ((to % length) + length) % length;
		return a <= b ? s >= a && s <= b : s >= a || s <= b;
	};
	return TOWERS.map((tower, i) => ({...tower, s: (i + 0.5) * 70})).filter((tower) => inStretch(tower.s));
};

const TowerLight: React.FC<{x: number; z: number; s: number; power: number}> = ({x, z, s, power}) => {
	const target = useMemo(() => new Object3D(), []);
	const c = centreAt(s);
	return (
		<>
			<primitive object={target} position={[c.x, 0, c.z]} />
			<spotLight position={[x, 18.2, z]} target={target} color="#fff1dc" intensity={power} distance={110} angle={0.85} penumbra={0.7} decay={1.5} />
		</>
	);
};

/** The floodlight towers along a stretch of the lap, in world coordinates. */
export const TowerLights: React.FC<{stretch: [number, number]; power?: number}> = ({stretch, power = 260}) => (
	<>
		{towersAlong(stretch[0], stretch[1]).map((tower, i) => (
			<TowerLight key={i} x={tower.x} z={tower.z} s={tower.s} power={power} />
		))}
	</>
);

/** Night sky, haze and moonlight, with the moon's shadows kept round `around`. */
export const NightSky: React.FC<{around?: [number, number, number]; moon?: number}> = ({around = [0, 0, 0], moon = 0.55}) => (
	<>
		<fog attach="fog" args={['#06070c', 60, 260]} />
		<Sky look={SKIES.night} />
		<EnvLight preset="night" intensity={0.8} diffuse={0.28} />
		<SunLight
			position={[around[0] + 40, 60, around[2] + 70]}
			target={around}
			intensity={moon}
			color="#9fb4ff"
			extent={40}
			softness={2}
			mapSize={2048}
			far={200}
		/>
	</>
);
