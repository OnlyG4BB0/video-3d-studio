import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Cue, EASE, EnvLight, ShotMusic, ShotProps, Stage, TextReveal, useShot, wobble} from '../../kit';
import {FollowSun, piecewise, RigCamera, TeamCar} from './common';
import {Sky, SKIES, Track, TRACK_HALF} from './Track';
import {carPoint, cutBetween, engineCue, flyingCar, lapTimeAt, Rig, trackPoint} from './world';

// Chapter 3: the hairpin. Hard braking from 200 km/h with the discs glowing, the
// downshifts, the apex in slow motion over the kerb, and the run out of the corner.

const SECONDS = 18;
const CUT_B = 6;
const CUT_C = 12.5;
/** Slow motion around the apex: a quarter of real speed. */
const SLOW = {from: 8.0, to: 10.4, ramp: 0.5, rate: 0.25};

export const raceCornerDefaults: ShotProps = {format: 'wide', seconds: SECONDS};

const rateAt = (t: number) => {
	const up = Math.min(1, Math.max(0, (t - SLOW.from) / SLOW.ramp));
	const down = Math.min(1, Math.max(0, (t - SLOW.to) / SLOW.ramp));
	const s = (x: number) => x * x * (3 - 2 * x);
	return 1 - (1 - SLOW.rate) * (s(up) - s(down));
};
/** World seconds at a shot second, through the slow motion. */
const clockTable = (() => {
	const step = 1 / 500;
	const values = [0];
	for (let i = 1; i <= SECONDS / step + 2; i++) {
		values.push(values[i - 1] + rateAt((i - 0.5) * step) * step);
	}
	return (t: number) => {
		const f = Math.min(values.length - 2, Math.max(0, t / step));
		const i = Math.floor(f);
		return values[i] + (values[i + 1] - values[i]) * (f - i);
	};
})();

// A: the braking zone, seen from the outside.
const phaseA = lapTimeAt(250) - 4.4;
const heroA = flyingCar({phase: phaseA});
const blueA = flyingCar({phase: phaseA, gap: [[0, -11], [5, -7]], lane: [[2, 0], [5, 2.2]]});
const blackA = flyingCar({phase: phaseA, gap: [[0, -30]]});
// B: the apex, from inside the corner, in slow motion.
const phaseB = lapTimeAt(322) - clockTable(9.2);
const heroB = flyingCar({phase: phaseB}, clockTable);
const blueB = flyingCar({phase: phaseB, gap: [[0, -8]], lane: [[0, 1.6]]}, clockTable);
const blackB = flyingCar({phase: phaseB, gap: [[0, -26]]}, clockTable);
// C: out of the corner, chasing the leader as it lays the power down.
const phaseC = lapTimeAt(345) - clockTable(CUT_C);
const heroC = flyingCar({phase: phaseC}, clockTable);
const blueC = flyingCar({phase: phaseC, gap: [[CUT_C, -9], [SECONDS, -12]]}, clockTable);
const blackC = flyingCar({phase: phaseC, gap: [[0, -27]]}, clockTable);

const hero = piecewise([[0, heroA], [CUT_B, heroB], [CUT_C, heroC]]);
const blue = piecewise([[0, blueA], [CUT_B, blueB], [CUT_C, blueC]]);
const black = piecewise([[0, blackA], [CUT_B, blackB], [CUT_C, blackC]]);

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const progress = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const follow = (spot: ReturnType<typeof trackPoint>, car: typeof hero, lag: number, size: number, max = 54, min = 12): Rig => (t) => {
	const target = carPoint(car(t - lag), [0, 0.6, 0]);
	const distance = target.distanceTo(spot);
	return {position: spot, target, fov: Math.min(max, Math.max(min, (2 * Math.atan(size / distance) * 180) / Math.PI))};
};

const rigs = (): Rig => {
	const a = follow(trackPoint(262, -(TRACK_HALF + 3.2), 0.55), heroA, 0.06, 3.4, 54, 4.5);
	const b = follow(trackPoint(326, TRACK_HALF + 2.6, 0.3), heroB, 0.03, 3.6, 64);
	const c: Rig = (t) => {
		const p = heroC(t);
		const u = EASE.glide(progress(t, CUT_C, SECONDS));
		const buzz = 0.008;
		return {
			position: carPoint(p, [lerp(-1.6, 0.5, u), lerp(0.85, 1.1, u) + wobble(4, t, 8) * buzz, lerp(-6.8, -4.8, u)]),
			target: carPoint(p, [0, 0.62, 1.5]),
			fov: lerp(34, 38, u),
		};
	};
	return cutBetween([
		[0, a],
		[CUT_B, b],
		[CUT_C, c],
	]);
};

export const raceCornerMusic = (): ShotMusic => {
	const rig = rigs();
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
	const cues: Cue[] = shots.flatMap(([from, to]) =>
		cars.map(([car, amp, seed]) => engineCue(car, rig, {from, to, amp, seed, clockRate: rateAt}) as Cue),
	);
	cues.push({sound: 'whoosh', at: SLOW.from + 0.2, length: 1.4, amp: 0.18}, {sound: 'boom', at: SLOW.from + 0.05, amp: 0.3});
	return {mood: 'halftime', cues};
};

export const RaceCorner: React.FC = () => {
	const {time} = useShot();
	const rig = rigs();
	const slow = 1 - rateAt(time);
	return (
		<AbsoluteFill>
			<Stage
				background="#000000"
				finish={{tone: 'neutral', grade: 'teal-orange', bloom: 0.14 + slow * 0.08, bloomThreshold: 1.4, contrast: 0.36, vignette: 0.4 + slow * 0.15, grain: 0.03}}
			>
				<fog attach="fog" args={['#cdd6db', 80, 300]} />
				<Sky look={SKIES.day} />
				<EnvLight preset="daylight" intensity={0.9} diffuse={0.3} />
				<FollowSun car={hero} direction={SKIES.day.sun} intensity={3.4} extent={24} />
				<Track />
				<TeamCar team="hero" pose={hero} />
				<TeamCar team="blue" pose={blue} />
				<TeamCar team="black" pose={black} />
				<RigCamera rig={rig} />
			</Stage>
			<TextReveal text={'BRAKING *203 → 63 km/h*'} at={1.2} until={5.4} effect="decode" font="mono" size={30} place="lower-left" accent="#ff9a4d" />
		</AbsoluteFill>
	);
};
