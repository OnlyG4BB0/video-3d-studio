import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Cue, EASE, EnvLight, ShotMusic, ShotProps, shakeAt, Stage, TextReveal, useShot} from '../../kit';
import {FollowSun, RigCamera, TeamCar} from './common';
import {GRID_SLOTS, Sky, SKIES, Track, TRACK_HALF} from './Track';
import {carPoint, CarState, cutBetween, engineCue, Rig, standingCar, trackPoint} from './world';

// Chapter 1: the grid at sunset. A slow move along the leading car as its engine
// fires, the five red lights come on one by one, go out, and the cars launch.

const SECONDS = 20;
const GO = 13.2;
const FIRST_LIGHT = 8.2;
const CUT_B = 6;
const CUT_C = 16.8;

export const raceGridDefaults: ShotProps = {format: 'wide', seconds: SECONDS};

const FIRE = {hero: 1.8, blue: 2.7, black: 3.4};
const hero = standingCar({grid: GRID_SLOTS[0].s, side: GRID_SLOTS[0].side, go: GO, fire: FIRE.hero, reaction: 0.16});
const blue = standingCar({grid: GRID_SLOTS[1].s, side: GRID_SLOTS[1].side, go: GO, fire: FIRE.blue, reaction: 0.2});
const black = standingCar({grid: GRID_SLOTS[2].s, side: GRID_SLOTS[2].side, go: GO, fire: FIRE.black, reaction: 0.23});

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const progress = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/** Red lights lit on the gantry: one more each second, all out at the start. */
export const lightsAt = (t: number) => (t >= GO || t < FIRST_LIGHT ? 0 : Math.min(5, Math.floor(t - FIRST_LIGHT) + 1));

const rigs = (): Rig => {
	// A: along the leading car's flank, from its nose to its tail, as the engine fires.
	const a: Rig = (t) => {
		const p = hero(t);
		const u = EASE.glide(progress(t, 0, CUT_B));
		const [sx, sy, sz] = shakeAt(t, [{at: FIRE.hero + 0.6, amount: 0.012, length: 0.6}], 5);
		return {
			position: carPoint(p, [lerp(3.3, 3.6, u) + sx, lerp(0.75, 0.95, u) + sy, lerp(3.6, -3.4, u) + sz]),
			target: carPoint(p, [lerp(0.3, 0.0, u), lerp(0.55, 0.7, u), lerp(1.2, -1.5, u)]),
			fov: lerp(34, 38, u),
		};
	};
	// B: low behind the grid, the gantry over the cars; it rises as they leave.
	const b: Rig = (t) => {
		const u = EASE.glide(progress(t, CUT_B, GO));
		const leave = EASE.glide(progress(t, GO + 0.3, CUT_C));
		const from = trackPoint(lerp(-37, -32, u), 0.6, lerp(1.05, 1.3, u) + leave * 2.2);
		const gantry = trackPoint(4, 0, 5.2);
		const chase = carPoint(hero(t), [0, 0.6, 6]);
		const [sx, sy] = shakeAt(t, [{at: GO + 0.25, amount: 0.02, length: 0.8}], 9);
		from.x += sx;
		from.y += sy;
		return {position: from, target: gantry.lerp(chase, leave * 0.85), fov: lerp(30, 34, leave)};
	};
	// C: low by the track near the end of the straight as the cars blast past.
	const spot = trackPoint(150, -(TRACK_HALF + 2.4), 0.5);
	const c: Rig = (t) => {
		const target = carPoint(hero(t - 0.07), [0, 0.65, 0]);
		const distance = target.distanceTo(spot);
		return {position: spot, target, fov: Math.min(54, Math.max(14, (2 * Math.atan(4.4 / distance) * 180) / Math.PI))};
	};
	return cutBetween([
		[0, a],
		[CUT_B, b],
		[CUT_C, c],
	]);
};

export const raceGridMusic = (): ShotMusic => {
	const rig = rigs();
	const cars: [(t: number) => CarState, number, number, number][] = [
		[hero, 1, 1, FIRE.hero],
		[blue, 0.9, 2, FIRE.blue],
		[black, 0.85, 3, FIRE.black],
	];
	const cues: Cue[] = cars.flatMap(([car, amp, seed, fire]) => [
		engineCue(car, rig, {from: 0, to: SECONDS, amp, seed}) as Cue,
		{sound: 'starter', at: fire - 0.75, amp: 0.55 * amp, length: 0.8},
	]);
	// A relay clunk for each red light, and the crowd lifting at the start.
	for (let i = 0; i < 5; i++) {
		cues.push({sound: 'clunk', at: FIRST_LIGHT + i, amp: 0.25});
	}
	// `note` is when the crowd cheers, in seconds from the start of the cue.
	cues.push({sound: 'crowd', at: 0, length: SECONDS, amp: 0.5, note: GO});
	return {mood: 'synthwave', hit: GO / SECONDS, cues};
};

export const RaceGrid: React.FC = () => {
	const {time} = useShot();
	const rig = rigs();
	return (
		<AbsoluteFill>
			<Stage
				background="#000000"
				finish={{tone: 'neutral', grade: 'warm-film', bloom: 0.2, bloomThreshold: 1.2, contrast: 0.32, vignette: 0.42, grain: 0.03}}
			>
				<fog attach="fog" args={['#5d4c5a', 110, 320]} />
				<Sky look={SKIES.dusk} />
				<EnvLight preset="dusk" intensity={1.1} diffuse={0.45} />
				<FollowSun car={hero} direction={[-0.8, 0.16, -0.6]} intensity={2.8} color="#ffbd85" extent={30} softness={0.8} />
				<Track lamps={0.55} startLights={lightsAt(time)} />
				<TeamCar team="hero" pose={hero} lights={0.6} />
				<TeamCar team="blue" pose={blue} lights={0.6} />
				<TeamCar team="black" pose={black} lights={0.6} />
				<RigCamera rig={rig} />
			</Stage>
			<TextReveal text="FLAT OUT" at={0.8} until={5.2} effect="rise" font="display" size={150} place="center" />
		</AbsoluteFill>
	);
};
