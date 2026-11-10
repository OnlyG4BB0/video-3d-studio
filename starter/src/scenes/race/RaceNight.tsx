import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Vector3} from 'three';
import {Cue, EASE, ShotMusic, ShotProps, Stage, TextReveal, useShot, wobble} from '../../kit';
import {piecewise, RigCamera, TeamCar, Trails} from './common';
import {NightSky, TowerLights} from './night';
import {Track, TRACK_HALF} from './Track';
import {carPoint, cutBetween, engineCue, flyingCar, lapTimeAt, Rig, trackPoint} from './world';

// Chapter 7: racing at night on a wet track. Headlights cut through the dark, the
// floodlights shine back off the asphalt and the tail lights leave long trails.

const SECONDS = 22;
const CUT_B = 8;
const CUT_C = 15;

export const raceNightDefaults: ShotProps = {format: 'wide', seconds: SECONDS};

// A: alongside the leader down the main straight.
const phaseA = lapTimeAt(-60 + 899.2) - 27.6;
const heroA = flyingCar({phase: phaseA, lane: [[0, 1.2]]});
const blueA = flyingCar({phase: phaseA, gap: [[0, -9], [8, -5]], lane: [[0, -1.6]]});
const blackA = flyingCar({phase: phaseA, gap: [[0, -26]]});
// B: low on the outside of the final corner as they come through.
const phaseB = lapTimeAt(828) - 11.3;
const heroB = flyingCar({phase: phaseB});
const blueB = flyingCar({phase: phaseB, gap: [[0, -8]]});
const blackB = flyingCar({phase: phaseB, gap: [[0, -21]]});
// C: high over the start line as they cross it.
const phaseC = 27.6 - 19.2;
const heroC = flyingCar({phase: phaseC, lane: [[0, 1.4]]});
const blueC = flyingCar({phase: phaseC, gap: [[0, -6]], lane: [[0, -1.8]]});
const blackC = flyingCar({phase: phaseC, gap: [[0, -19]]});

const hero = piecewise([[0, heroA], [CUT_B, heroB], [CUT_C, heroC]]);
const blue = piecewise([[0, blueA], [CUT_B, blueB], [CUT_C, blueC]]);
const black = piecewise([[0, blackA], [CUT_B, blackB], [CUT_C, blackC]]);

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const progress = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));

const rigs = (): Rig => {
	const a: Rig = (t) => {
		const p = heroA(t);
		const u = EASE.glide(progress(t, 0, CUT_B));
		return {
			position: carPoint(p, [lerp(2.4, 2.0, u), lerp(0.48, 0.62, u) + wobble(2, t, 9) * 0.006, lerp(4.6, -3.2, u)]),
			target: carPoint(p, [lerp(-0.2, -1.4, u), 0.6, lerp(0.6, -3.5, u)]),
			fov: lerp(34, 30, u),
			roll: lerp(0.04, -0.02, u),
		};
	};
	const spot = trackPoint(842, -(TRACK_HALF + 3), 0.5);
	const b: Rig = (t) => {
		const target = carPoint(heroB(t - 0.07), [0, 0.6, 0]);
		const distance = target.distanceTo(spot);
		return {position: spot, target, fov: Math.min(52, Math.max(13, (2 * Math.atan(4.6 / distance) * 180) / Math.PI))};
	};
	const c: Rig = (t) => {
		const u = EASE.glide(progress(t, CUT_C, SECONDS));
		const line = trackPoint(0, 0, 0);
		return {
			position: new Vector3(line.x - lerp(26, 22, u), lerp(15, 11, u), line.z - lerp(42, 30, u)),
			target: new Vector3(line.x, 0.5, line.z + lerp(-8, 6, u)),
			fov: 36,
		};
	};
	return cutBetween([
		[0, a],
		[CUT_B, b],
		[CUT_C, c],
	]);
};

export const raceNightMusic = (): ShotMusic => {
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
	const cues: Cue[] = shots.flatMap(([from, to]) => cars.map(([car, amp, seed]) => engineCue(car, rig, {from, to, amp, seed}) as Cue));
	cues.push({sound: 'rain', at: 0, length: SECONDS, amp: 0.025});
	return {mood: 'nightdrive', cues};
};

export const RaceNight: React.FC = () => {
	const {time} = useShot();
	const rig = rigs();
	const p = hero(time);
	const stretch: [number, number] = time < CUT_B ? [790, 260] : time < CUT_C ? [700, 60] : [760, 200];
	return (
		<AbsoluteFill>
			<Stage
				background="#020306"
				finish={{tone: 'neutral', grade: 'night', bloom: 0.3, bloomThreshold: 1.0, contrast: 0.34, vignette: 0.45, grain: 0.035}}
			>
				<NightSky around={[p.x, 0, p.z]} />
				<TowerLights stretch={stretch} power={100} />
				<Track wet={0.75} lamps={1} />
				<TeamCar team="hero" pose={hero} lights={1} beams={1} />
				<TeamCar team="blue" pose={blue} lights={1} beams={1} />
				<TeamCar team="black" pose={black} lights={1} />
				{time >= CUT_B && <Trails cars={[hero, blue, black]} length={time < CUT_C ? 0.6 : 1.4} strength={time < CUT_C ? 0.5 : 1} />}
				<RigCamera rig={rig} />
			</Stage>
			<TextReveal text={'NIGHT · WET · *8,750 rpm*'} at={CUT_C + 1} until={SECONDS - 0.6} effect="decode" font="mono" size={30} place="lower-left" accent="#8fb8ff" />
		</AbsoluteFill>
	);
};
