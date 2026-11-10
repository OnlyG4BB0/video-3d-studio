import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Cue, ShotMusic, ShotProps, Stage, useShot} from '../../kit';
import {atOrigin, CarFrame, keyedPath, RigCamera, TeamCar, Trails} from './common';
import {Engine} from './Engine';
import {NightSky, TowerLights} from './night';
import {Track} from './Track';
import {carPoint, CameraShot, crankClock, engineCue, flyingCar, lapTimeAt, Rig} from './world';

// Chapter 6: the way back out. From the crank of the running engine the camera
// pulls back through the cut-away block, out through the x-ray body as it turns
// solid again, and up over the circuit at night.

const SECONDS = 18;
const ENGINE_AT: [number, number, number] = [0, 0.42, -1.56];

export const racePullOutDefaults: ShotProps = {format: 'wide', seconds: SECONDS};

const hero = flyingCar({phase: lapTimeAt(100) - SECONDS});
const blue = flyingCar({phase: lapTimeAt(100) - SECONDS, gap: [[0, -14]]});
const black = flyingCar({phase: lapTimeAt(100) - SECONDS, gap: [[0, -32]]});
const clock = crankClock((t) => hero(t).rpm, SECONDS + 1);

const E = ENGINE_AT;
const at = (x: number, y: number, z: number): [number, number, number] => [E[0] + x, E[1] + y, E[2] + z];
/** The camera in the car's own frame: the car stays at the origin and the world moves. */
const local = keyedPath([
	{at: 0, position: at(0.2, 0.07, 0.1), target: at(0.04, 0, 0.02), fov: 42},
	{at: 3, position: at(0.42, 0.3, -0.36), target: at(0, 0, 0), fov: 44},
	{at: 6.2, position: [1.6, 1.25, -3.6], target: [0, 0.6, -1.3], fov: 42},
	{at: 9.5, position: [3.6, 2.7, -8.2], target: [0, 0.5, 0], fov: 40},
	{at: 13, position: [6, 8, -15], target: [0, 0.3, 5], fov: 44},
	{at: SECONDS, position: [6, 13, -21], target: [0, 0, 32], fov: 46},
]);
/** The same camera in the world, for working out what it hears. */
const world: Rig = (t): CameraShot => {
	const shot = local(t);
	const p = hero(t);
	return {
		position: carPoint(p, [shot.position.x, shot.position.y, shot.position.z]),
		target: carPoint(p, [shot.target.x, shot.target.y, shot.target.z]),
		fov: shot.fov,
	};
};

const smooth = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

export const racePullOutMusic = (): ShotMusic => {
	const cues: Cue[] = [
		engineCue(hero, world, {to: SECONDS, amp: 1, seed: 1}) as Cue,
		engineCue(blue, world, {to: SECONDS, amp: 0.9, seed: 2}) as Cue,
		engineCue(black, world, {to: SECONDS, amp: 0.85, seed: 3}) as Cue,
		{sound: 'swell', at: 9, length: 4, amp: 0.16},
	];
	return {mood: 'ascent', hit: 9 / SECONDS, cues};
};

export const RacePullOut: React.FC = () => {
	const {time} = useShot();
	const ghost = 1 - smooth(4.6, 9, time);
	const cut = time < 3 ? 0.004 : 0.004 + smooth(3, 7.5, time) * 0.4;
	const outside = smooth(4, 8, time);
	return (
		<AbsoluteFill>
			<Stage
				background="#020306"
				finish={{tone: 'neutral', grade: 'night', bloom: 0.26, bloomThreshold: 1.1, contrast: 0.34, vignette: 0.45, grain: 0.035}}
			>
				<NightSky />
				<pointLight position={[0.9, 1.2, -2.4]} color="#ffb070" intensity={(1 - outside) * 1.4} distance={3} decay={2} />
				<CarFrame car={hero}>
					<TowerLights stretch={[620, 260]} power={260 * (0.25 + 0.75 * outside)} />
					<Track wet={0.6} lamps={1} />
					<TeamCar team="blue" pose={blue} lights={1} beams={1} />
					<TeamCar team="black" pose={black} lights={1} />
					<Trails cars={[hero, blue, black]} length={0.9} strength={outside} />
				</CarFrame>
				<TeamCar team="hero" pose={atOrigin(hero)} lights={1} beams={1} xray ghost={ghost} glow={0.08 + 0.92 * smooth(4.2, 6.5, time)} castShadow={ghost < 0.5}>
					<group position={E}>
						<Engine crank={clock.angle} heat={0.9} cut={cut} />
					</group>
				</TeamCar>
				<RigCamera rig={local} near={0.01} />
			</Stage>
		</AbsoluteFill>
	);
};
