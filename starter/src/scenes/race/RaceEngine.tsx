import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Color} from 'three';
import {Cue, EnvLight, ShotMusic, ShotProps, Stage, SunLight, TextReveal, useShot} from '../../kit';
import {atOrigin, CarFrame, keyedPath, RigCamera, TeamCar} from './common';
import {Engine} from './Engine';
import {Sky, SKIES, Track} from './Track';
import {crankClock, flyingCar, lapTimeAt} from './world';

// Chapter 4: into the engine. The camera chases the car out of the hairpin, the
// body turns to x-ray, and the camera drops into the flat-six as time slows down
// until every firing can be seen, in order: 1, 6, 2, 4, 3, 5.

const SECONDS = 22;
/** Revs in slow motion: a firing every sixteenth note at 120 bpm. */
const SLOW = 160;
const SLOW_FROM = 4.5;
const SLOW_UNTIL = 9;
/** The engine's place in the car: crank centre, behind the rear axle. */
const ENGINE_AT: [number, number, number] = [0, 0.42, -1.56];

export const raceEngineDefaults: ShotProps = {format: 'wide', seconds: SECONDS};

const hero = flyingCar({phase: lapTimeAt(352)});
const rpmAt = (t: number) => {
	if (t < SLOW_FROM) return hero(t).rpm;
	const from = hero(SLOW_FROM).rpm;
	const u = Math.min(1, (t - SLOW_FROM) / (SLOW_UNTIL - SLOW_FROM));
	return SLOW + (from - SLOW) * (1 - u) ** 4;
};
const clock = crankClock(rpmAt, SECONDS + 1, SLOW_UNTIL);

const E = ENGINE_AT;
const at = (x: number, y: number, z: number): [number, number, number] => [E[0] + x, E[1] + y, E[2] + z];
const rig = keyedPath([
	{at: 0, position: [0, 1.7, -7.2], target: [0, 0.7, -0.6], fov: 34},
	{at: 3, position: [0.25, 1.4, -4.0], target: [0, 0.6, -1.4], fov: 36},
	{at: 5, position: at(0.1, 0.62, -0.62), target: at(0, 0.03, 0), fov: 42},
	{at: 7.2, position: at(0.16, 0.42, -0.5), target: at(0, 0, 0), fov: 44},
	{at: 9.5, position: at(0.42, 0.22, -0.3), target: at(0.15, 0, -0.02), fov: 42},
	{at: 13, position: at(0.32, 0.13, 0.34), target: at(0.16, 0, -0.03), fov: 42},
	{at: 16.5, position: at(0, 0.27, 0.24), target: at(-0.1, 0, 0), fov: 44},
	{at: 19.5, position: at(-0.42, 0.2, -0.26), target: at(-0.16, 0, 0.03), fov: 42},
	{at: SECONDS, position: at(-0.44, 0.17, 0.0), target: at(-0.2, 0, 0.03), fov: 40},
]);

const smooth = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

export const raceEngineMusic = (): ShotMusic => {
	const rate = 60;
	const cue: Cue = {sound: 'engine', at: 0, rate, rpm: [], load: [], gain: [], side: [], delay: [], squeal: [], road: [], scale: [], turns: [], mech: 0.9, seed: 4, amp: 1};
	for (let k = 0; k <= SECONDS * rate; k++) {
		const t = k / rate;
		const state = hero(t);
		const rpm = rpmAt(t);
		const inside = smooth(SLOW_FROM, 8, t);
		cue.rpm!.push(Math.round(rpm));
		cue.turns!.push(Math.round((clock.angle(t) / (2 * Math.PI)) * 10000) / 10000);
		cue.load!.push(Math.round((t < SLOW_FROM ? state.throttle : 0.75) * 100) / 100);
		cue.gain!.push(Math.round((0.75 + 0.25 * inside) * 1000) / 1000);
		cue.side!.push(0);
		cue.delay!.push(0.006);
		cue.squeal!.push(0);
		cue.road!.push(Math.round((1 - inside) * Math.min(1, (state.speed / 70) ** 2) * 700) / 1000);
		cue.scale!.push(Math.round((t < SLOW_FROM ? 1 : Math.min(1, Math.max(0.22, Math.sqrt(rpm / 6000)))) * 1000) / 1000);
	}
	return {
		mood: 'industrial',
		cues: [cue, {sound: 'whoosh', at: 3.7, length: 1.8, amp: 0.2}, {sound: 'boom', at: SLOW_UNTIL, amp: 0.35}],
	};
};

export const RaceEngine: React.FC = () => {
	const {time} = useShot();
	const outside = 1 - smooth(3.8, 6.8, time);
	const ghost = smooth(3.2, 5.2, time);
	const sweep = time > 2.9 && time < 4.6 ? 2.4 - ((time - 2.9) / 1.7) * 4.8 : undefined;
	const view = rig(time);
	const inside = smooth(5, 7.5, time);
	const fogColour = new Color('#cdd6db').lerp(new Color('#020203'), 1 - outside);
	return (
		<AbsoluteFill>
			<Stage
				background="#020203"
				finish={{
					tone: 'neutral',
					grade: 'teal-orange',
					bloom: 0.14 + inside * 0.06,
					bloomThreshold: 1.3,
					contrast: 0.34,
					vignette: 0.42,
					grain: 0.03,
					focus: inside > 0 ? {target: [view.target.x, view.target.y, view.target.z], aperture: 0.0016 * inside} : undefined,
				}}
			>
				<fog attach="fog" args={[fogColour, 2 + outside * 78, 5 + outside * 295]} />
				<Sky look={SKIES.day} power={outside} />
				{/* Daylight outside; a dark studio inside, switched while the light is down. */}
				{time < 5 ? (
					<EnvLight preset="daylight" intensity={0.9 * (1 - smooth(3.6, 5, time))} diffuse={0.25} />
				) : (
					<EnvLight preset="studio" intensity={0.75 * smooth(5, 6.5, time)} diffuse={0.12} rotate={-30 + time * 6} />
				)}
				<SunLight position={[-18, 28, -22]} target={[0, 0.5, -1]} intensity={3.2 * outside} extent={6} softness={0.5} />
				<SunLight position={[1.1, 2.4, -0.9]} target={E} intensity={2.2 * inside} extent={0.7} softness={0.06} far={6} mapSize={4096} />
				<pointLight position={[-0.7, 1.1, -2.2]} color="#9cc4ff" intensity={inside * 0.7} distance={3} decay={2} />
				{outside > 0.01 && (
					<CarFrame car={hero}>
						<Track />
					</CarFrame>
				)}
				<TeamCar team="hero" pose={atOrigin(hero)} xray ghost={ghost} sweep={sweep} glow={1 - 0.9 * inside} castShadow={false}>
					<group position={E}>
						<Engine crank={clock.angle} heat={0.85} flashLights />
					</group>
				</TeamCar>
				<RigCamera rig={rig} near={0.01} />
			</Stage>
			<TextReveal text={'FIRING ORDER\n*1 · 6 · 2 · 4 · 3 · 5*'} at={10} until={14.6} effect="decode" font="mono" size={30} place="lower-left" accent="#ff9a4d" />
			<TextReveal text={'BORE *102 mm* · STROKE *81.5 mm*\n*3,996 cc* FLAT-SIX'} at={16} until={21.2} effect="type" font="mono" size={28} place="lower-left" accent="#ff9a4d" />
		</AbsoluteFill>
	);
};
