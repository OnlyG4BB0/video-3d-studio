import React from 'react';
import {AbsoluteFill} from 'remotion';
import {EASE, EnvLight, lensFov, ShotMusic, ShotProps, Stage, useShot, wobble} from '../../kit';
import {FollowSun, piecewise, RigCamera, TeamCar, Telemetry} from './common';
import {Sky, SKIES, Track, TRACK_HALF} from './Track';
import {carPoint, cutBetween, engineCue, flyingCar, lapTimeAt, Rig, trackPoint} from './world';

// Chapter 2: at speed. Side by side down the main straight under the gantry, a
// low camera in the esses as the pack flicks past, then a helicopter shot down
// onto the straight.

const SECONDS = 22;
const CUT_B = 7;
const CUT_C = 13.5;

export const raceTrackDefaults: ShotProps = {format: 'wide', seconds: SECONDS};

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const progress = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));

// Shot A: the hero holds the left, the blue car pulls out of its slipstream and draws level.
const heroA = flyingCar({phase: -3.5, lane: [[0, 0], [2.5, 1.5]]});
const blueA = flyingCar({phase: -3.5, gap: [[0, -8], [4.6, -0.6], [7, 1.2]], lane: [[0, 0.2], [1.8, -3.3]]});
const blackA = flyingCar({phase: -3.5, gap: [[0, -24], [7, -19]], lane: [[0, -0.5]]});

// Shot B: the blue car leads through the esses, a low camera on the outside.
const phaseB = lapTimeAt(505) - 10.6;
const heroB = flyingCar({phase: phaseB});
const blueB = flyingCar({phase: phaseB, gap: [[0, 11]]});
const blackB = flyingCar({phase: phaseB, gap: [[0, -15]]});

// Shot C: from a helicopter, down onto the straight out of the final corner.
const phaseC = lapTimeAt(760) - 15.6;
const heroC = flyingCar({phase: phaseC, gap: [[CUT_C, 0], [SECONDS, 3]]});
const blueC = flyingCar({phase: phaseC, gap: [[0, 9]]});
const blackC = flyingCar({phase: phaseC, gap: [[0, -11], [SECONDS, -8]]});

const hero = piecewise([[0, heroA], [CUT_B, heroB], [CUT_C, heroC]]);
const blue = piecewise([[0, blueA], [CUT_B, blueB], [CUT_C, blueC]]);
const black = piecewise([[0, blackA], [CUT_B, blackB], [CUT_C, blackC]]);

const rigs = (aspect: number) => {
	const a: Rig = (t) => {
		const p = heroA(t);
		const u = EASE.glide(progress(t, 0, CUT_B));
		const buzz = 0.006;
		return {
			position: carPoint(p, [lerp(3.1, 2.7, u), lerp(0.5, 0.66, u) + wobble(3, t, 9) * buzz, lerp(-5.2, 7.8, u)]),
			target: carPoint(p, [lerp(-0.6, -1.7, u), 0.62, lerp(1.2, -2.4, u)]),
			fov: lensFov(lerp(22, 28, u), aspect),
			roll: lerp(-0.05, 0.03, u),
		};
	};
	const spot = trackPoint(505, -(TRACK_HALF + 2.6), 0.45);
	const b: Rig = (t) => {
		const p = heroB(t - 0.08);
		const target = carPoint(p, [0, 0.65, 0]);
		const distance = target.distanceTo(spot);
		return {
			position: spot,
			target,
			fov: Math.min(52, Math.max(13, (2 * Math.atan(4.2 / distance) * 180) / Math.PI)) / Math.max(1, aspect / 1.78),
		};
	};
	const c: Rig = (t) => {
		const p = heroC(t);
		const u = EASE.glide(progress(t, CUT_C, SECONDS));
		return {
			position: carPoint(p, [lerp(-8, -2.4, u), lerp(17, 1.25, u), lerp(-26, -8.8, u)]),
			target: carPoint(p, [0, lerp(0.4, 0.75, u), lerp(16, 4, u)]),
			fov: lensFov(lerp(30, 26, u), aspect),
		};
	};
	return cutBetween([
		[0, a],
		[CUT_B, b],
		[CUT_C, c],
	]);
};

export const raceTrackMusic = (): ShotMusic => {
	const rig = rigs(16 / 9);
	const shots: [number, number][] = [
		[0, CUT_B],
		[CUT_B, CUT_C],
		[CUT_C, SECONDS],
	];
	const cars = [
		[hero, 1, 1],
		[blue, 0.92, 2],
		[black, 0.85, 3],
	] as const;
	return {
		mood: 'dnb',
		cues: shots.flatMap(([from, to]) =>
			cars.map(([car, amp, seed]) => engineCue(car, rig, {from, to, amp, seed})),
		),
	};
};

export const RaceTrack: React.FC = () => {
	const {aspect} = useShot();
	const rig = rigs(aspect);
	return (
		<AbsoluteFill>
			<Stage
				background="#000000"
				finish={{tone: 'neutral', grade: 'teal-orange', bloom: 0.12, bloomThreshold: 1.6, contrast: 0.38, vignette: 0.38, grain: 0.03}}
			>
				<fog attach="fog" args={['#cdd6db', 80, 300]} />
				<Sky look={SKIES.day} />
				<EnvLight preset="daylight" intensity={0.9} diffuse={0.3} />
				<FollowSun car={hero} direction={SKIES.day.sun} intensity={3.4} extent={22} />
				<Track />
				<TeamCar team="hero" pose={hero} />
				<TeamCar team="blue" pose={blue} />
				<TeamCar team="black" pose={black} />
				<RigCamera rig={rig} />
			</Stage>
			<Telemetry car={hero} team="hero" from={0.8} to={CUT_B - 0.3} />
		</AbsoluteFill>
	);
};
