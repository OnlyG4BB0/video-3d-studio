import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Cue, EnvLight, ShotMusic, ShotProps, Stage, SunLight, TextReveal, useShot} from '../../kit';
import {keyedPath, RigCamera, Tach} from './common';
import {Engine} from './Engine';
import {crankClock} from './world';

// Chapter 5: the valve train in real time. Close over a cylinder head while the
// revs climb from a slow idle to the 8,750 rpm limiter: camshafts, tappets, valves
// and springs blur as they go faster.

const SECONDS = 18;
const LIMIT = 15.5;
const LIFT = 17.2;

export const raceValvesDefaults: ShotProps = {format: 'wide', seconds: SECONDS};

const rpmAt = (t: number) => {
	if (t < 2) return 600;
	if (t < LIMIT) return 600 + 8150 * ((t - 2) / (LIMIT - 2)) ** 2.1;
	if (t < LIFT) return 8600 + 150 * Math.abs(Math.sin(t * 38));
	return 8600 - (8600 - 2400) * Math.min(1, (t - LIFT) / 0.8) ** 0.6;
};
const clock = crankClock(rpmAt, SECONDS + 1);

const rig = keyedPath([
	{at: 0, position: [0.47, 0.2, -0.38], target: [0.3, 0.03, -0.14], fov: 34},
	{at: 6, position: [0.45, 0.15, -0.06], target: [0.3, 0.03, 0.0], fov: 34},
	{at: 11, position: [0.44, 0.17, 0.22], target: [0.3, 0.02, 0.1], fov: 36},
	{at: LIMIT, position: [0.56, 0.33, 0.12], target: [0.26, 0, 0.0], fov: 38},
	{at: SECONDS, position: [0.64, 0.46, 0.06], target: [0.2, 0, 0], fov: 40},
]);

export const raceValvesMusic = (): ShotMusic => {
	const rate = 60;
	const cue: Cue = {sound: 'engine', at: 0, rate, rpm: [], load: [], gain: [], side: [], delay: [], squeal: [], road: [], turns: [], mech: 1, seed: 6, amp: 1};
	for (let k = 0; k <= SECONDS * rate; k++) {
		const t = k / rate;
		cue.rpm!.push(Math.round(rpmAt(t)));
		cue.turns!.push(Math.round((clock.angle(t) / (2 * Math.PI)) * 10000) / 10000);
		cue.load!.push(t < LIFT ? 0.85 : 0);
		cue.gain!.push(0.85);
		cue.side!.push(0);
		cue.delay!.push(0.004);
		cue.squeal!.push(0);
		cue.road!.push(0);
	}
	return {
		mood: 'acid',
		hit: LIMIT / SECONDS,
		cues: [cue, {sound: 'riser', at: LIMIT, length: 5, amp: 0.12}, {sound: 'boom', at: LIFT, amp: 0.4}],
	};
};

export const RaceValves: React.FC = () => {
	const {time} = useShot();
	const view = rig(time);
	return (
		<AbsoluteFill>
			<Stage
				background="#030304"
				finish={{
					tone: 'neutral',
					grade: 'teal-orange',
					bloom: 0.2,
					bloomThreshold: 1.2,
					contrast: 0.36,
					vignette: 0.45,
					grain: 0.03,
					focus: {target: [view.target.x, view.target.y, view.target.z], aperture: 0.0014},
				}}
			>
				<EnvLight preset="studio" intensity={0.8} diffuse={0.12} rotate={-20 + time * 5} />
				<SunLight position={[0.9, 1.6, 0.7]} target={[0.3, 0, 0]} intensity={2.3} extent={0.6} softness={0.06} far={5} mapSize={4096} />
				<pointLight position={[0.2, 0.3, -0.5]} color="#ff9a5a" intensity={0.6} distance={1.5} decay={2} />
				<pointLight position={[0.7, -0.1, 0.4]} color="#8fb8ff" intensity={0.5} distance={1.6} decay={2} />
				<Engine crank={clock.angle} heat={0.4 + 0.5 * Math.min(1, time / LIMIT)} flashLights />
				<RigCamera rig={rig} near={0.01} />
			</Stage>
			<TextReveal text={'4 VALVES PER CYLINDER\n*24* IN ALL'} at={2} until={6.8} effect="decode" font="mono" size={30} place="lower-left" accent="#ff9a4d" />
			<TextReveal text={'RED LINE *8,750 rpm*'} at={LIMIT - 0.3} until={LIFT + 0.4} effect="decode" font="mono" size={30} place="lower-left" accent="#ff3a3a" />
			<Tach rpm={rpmAt} from={0.6} to={SECONDS - 0.3} />
		</AbsoluteFill>
	);
};
