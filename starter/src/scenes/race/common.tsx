import {useThree} from '@react-three/fiber';
import React, {useLayoutEffect, useMemo} from 'react';
import {AdditiveBlending, BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute, Group, PerspectiveCamera, Vector3} from 'three';
import {Key, MONO_FONT, span, SunLight, track, useMotion, useMoving, useShot} from '../../kit';
import {Car, CarPose} from './Car';
import {carPoint, CarState, CameraShot, Rig} from './world';

/** The three cars of the film: colours and race numbers. */
export const TEAMS = {
	hero: {body: '#e9e7e2', accent: '#d5202b', number: '23', rim: '#2b2c30'},
	blue: {body: '#1b2b4f', accent: '#f0b21b', number: '7', rim: '#c9ccd1'},
	black: {body: '#161719', accent: '#a8dc1c', number: '12', rim: '#3a3c40'},
};
export type Team = keyof typeof TEAMS;

/** A car of one of the teams. */
export const TeamCar: React.FC<{
	team: Team;
	pose: (t: number) => CarPose;
	lights?: number;
	castShadow?: boolean;
	xray?: boolean;
	ghost?: number;
	sweep?: number;
	glow?: number;
	beams?: number;
	children?: React.ReactNode;
}> = ({team, pose, lights = 0, castShadow = true, xray, ghost, sweep, glow, beams, children}) => (
	<Car pose={pose} {...TEAMS[team]} lights={lights} castShadow={castShadow} xray={xray} ghost={ghost} sweep={sweep} glow={glow} beams={beams}>
		{children}
	</Car>
);

/** The same car standing still at the origin, wheels turning: for shots in the car's own frame. */
export const atOrigin =
	(car: (t: number) => CarState) =>
	(time: number): CarPose => {
		const p = car(time);
		return {x: 0, z: 0, heading: 0, distance: p.distance, steer: p.steer, brake: p.brake, pitch: 0, roll: 0};
	};

/** Moves the world past a car that stays at the origin: everything inside rides along with motion blur. */
export const CarFrame: React.FC<{car: (t: number) => CarState; children: React.ReactNode}> = ({car, children}) => {
	const group = useMoving<Group>((object, time) => {
		const p = car(time);
		const a = -p.heading;
		const c = Math.cos(a);
		const s = Math.sin(a);
		object.rotation.set(0, a, 0);
		object.position.set(-p.x * c - p.z * s, 0, p.x * s - p.z * c);
	});
	return <group ref={group}>{children}</group>;
};

export type PathKey = {at: number; position: [number, number, number]; target: [number, number, number]; fov: number};

/** A smooth camera move through keys, each passed at its own second. */
export const keyedPath = (keys: PathKey[]): Rig => {
	const positions = new CatmullRomCurve3(keys.map((key) => new Vector3(...key.position)), false, 'centripetal');
	const targets = new CatmullRomCurve3(keys.map((key) => new Vector3(...key.target)), false, 'centripetal');
	const timing: Key[] = keys.map((key, i) => [key.at, i]);
	return (time: number): CameraShot => {
		const segment = Math.min(keys.length - 1, Math.max(0, track(time, timing)));
		const u = segment / (keys.length - 1);
		const i = Math.min(Math.floor(segment), keys.length - 2);
		const f = segment - i;
		return {
			position: positions.getPoint(u),
			target: targets.getPoint(u),
			fov: keys[i].fov + (keys[i + 1].fov - keys[i].fov) * f,
		};
	};
};

/** Moves the camera along a rig, with motion blur. `near` brings the near clip in, for close-ups. */
export const RigCamera: React.FC<{rig: Rig; near?: number}> = ({rig, near}) => {
	const camera = useThree((state) => state.camera) as PerspectiveCamera;
	useLayoutEffect(() => {
		if (near !== undefined) {
			camera.near = near;
			camera.updateProjectionMatrix();
		}
	}, [camera, near]);
	const {aspect} = useShot();
	useMotion((time) => {
		const shot = rig(time);
		// The rigs are framed for 16:9. In a tall frame, keep most of that width and
		// gain height, instead of cropping the sides away.
		const half = (shot.fov * Math.PI) / 360;
		camera.fov =
			aspect < 1 ? (Math.atan((Math.tan(half) * (16 / 9) * 0.8) / aspect) * 360) / Math.PI : shot.fov;
		camera.position.copy(shot.position);
		camera.up.set(0, 1, 0);
		camera.lookAt(shot.target);
		if (shot.roll) {
			camera.rotateZ(shot.roll);
		}
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld();
	});
	return null;
};

/** One car function made of several, each used from its start time on. */
export const piecewise =
	(parts: [number, (t: number) => CarState][]) =>
	(time: number): CarState => {
		let current = parts[0][1];
		for (const [at, part] of parts) {
			if (time >= at) current = part;
		}
		return current(time);
	};

/** A sun that keeps its shadows on the car it follows. */
export const FollowSun: React.FC<{
	car: (t: number) => CarState;
	direction: [number, number, number];
	intensity: number;
	color?: string;
	extent?: number;
	softness?: number;
}> = ({car, direction, intensity, color = '#fff2e0', extent = 16, softness = 0.6}) => {
	const {time} = useShot();
	const p = car(time);
	const [dx, dy, dz] = direction;
	const length = Math.hypot(dx, dy, dz);
	const reach = 60 / length;
	return (
		<SunLight
			position={[p.x + dx * reach, dy * reach, p.z + dz * reach]}
			target={[p.x, 0.5, p.z]}
			intensity={intensity}
			color={color}
			softness={softness}
			extent={extent}
			mapSize={4096}
			far={140}
		/>
	);
};

/** Race telemetry in a corner: number, speed, gear and a rev bar with shift lights. */
export const Telemetry: React.FC<{
	car: (t: number) => CarState;
	team: Team;
	from: number;
	to: number;
}> = ({car, team, from, to}) => {
	const {time, height, width} = useShot();
	const show = span(time, from, from + 0.4) * (1 - span(time, to - 0.4, to));
	if (show <= 0) {
		return null;
	}
	const state = car(time);
	const unit = Math.min(width, height) / 1080;
	const revs = Math.min(1, Math.max(0, (state.rpm - 3000) / 5750));
	const segments = 14;
	const {accent, number} = TEAMS[team];
	return (
		<div
			style={{
				position: 'absolute',
				left: 64 * unit,
				bottom: 64 * unit,
				opacity: show,
				transform: `translateY(${(1 - show) * 16 * unit}px)`,
				fontFamily: MONO_FONT,
				color: '#f4f2ee',
				textShadow: '0 2px 12px rgba(0,0,0,0.55)',
			}}
		>
			<div style={{display: 'flex', gap: 3 * unit, marginBottom: 10 * unit}}>
				{Array.from({length: segments}, (_, i) => {
					const lit = revs * segments > i;
					const colour = i < 8 ? '#3fd47a' : i < 12 ? '#ffb020' : '#ff3a3a';
					return (
						<div
							key={i}
							style={{
								width: 14 * unit,
								height: 8 * unit,
								borderRadius: 2 * unit,
								background: lit ? colour : 'rgba(255,255,255,0.14)',
								boxShadow: lit ? `0 0 ${8 * unit}px ${colour}` : 'none',
							}}
						/>
					);
				})}
			</div>
			<div style={{display: 'flex', alignItems: 'baseline', gap: 18 * unit}}>
				<div
					style={{
						fontSize: 26 * unit,
						fontWeight: 700,
						background: accent,
						color: '#ffffff',
						padding: `${2 * unit}px ${10 * unit}px`,
						borderRadius: 4 * unit,
					}}
				>
					{number}
				</div>
				<div style={{fontSize: 64 * unit, fontWeight: 700, letterSpacing: -1 * unit, minWidth: 130 * unit, textAlign: 'right'}}>
					{Math.round(state.speed * 3.6)}
				</div>
				<div style={{fontSize: 22 * unit, opacity: 0.75}}>km/h</div>
				<div style={{fontSize: 44 * unit, fontWeight: 700, marginLeft: 12 * unit}}>{state.gear > 0 ? state.gear : 'N'}</div>
				<div style={{fontSize: 22 * unit, opacity: 0.75}}>{Math.round(state.rpm / 10) * 10} rpm</div>
			</div>
		</div>
	);
};

/** Long-exposure light trails behind the tail lights and headlights of cars. */
export const Trails: React.FC<{cars: ((t: number) => CarState)[]; length?: number; strength?: number; heads?: boolean}> = ({
	cars,
	length = 1.2,
	strength = 1,
	heads = true,
}) => {
	const {time} = useShot();
	const geometry = useMemo(() => new BufferGeometry(), []);
	const steps = 48;
	const lamps: {local: [number, number, number]; colour: [number, number, number]}[] = [
		{local: [0.62, 0.8, -2.29], colour: [4, 0.25, 0.2]},
		{local: [-0.62, 0.8, -2.29], colour: [4, 0.25, 0.2]},
		...(heads
			? ([
					{local: [0.66, 0.6, 1.96], colour: [3, 3.2, 3.6]},
					{local: [-0.66, 0.6, 1.96], colour: [3, 3.2, 3.6]},
				] as {local: [number, number, number]; colour: [number, number, number]}[])
			: []),
	];
	const positions: number[] = [];
	const colours: number[] = [];
	const index: number[] = [];
	for (const car of cars) {
		const poses = Array.from({length: steps + 1}, (_, k) => car(time - (length * k) / steps));
		for (const lamp of lamps) {
			const first = positions.length / 3;
			poses.forEach((pose, k) => {
				const p = carPoint(pose, lamp.local);
				const fade = (1 - k / steps) ** 1.6 * strength;
				positions.push(p.x, p.y - 0.025, p.z, p.x, p.y + 0.025, p.z);
				colours.push(lamp.colour[0] * fade, lamp.colour[1] * fade, lamp.colour[2] * fade, lamp.colour[0] * fade, lamp.colour[1] * fade, lamp.colour[2] * fade);
				if (k < steps) {
					const a = first + k * 2;
					index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
				}
			});
		}
	}
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
	geometry.setIndex(index);
	geometry.computeBoundingSphere();
	return (
		<mesh geometry={geometry} frustumCulled={false} renderOrder={8}>
			<meshBasicMaterial vertexColors transparent blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
		</mesh>
	);
};

/** A rev counter in a corner: big number, a bar to 9,000 rpm and the red line. */
export const Tach: React.FC<{rpm: (t: number) => number; from: number; to: number; label?: string}> = ({rpm, from, to, label = 'RPM'}) => {
	const {time, height, width} = useShot();
	const show = span(time, from, from + 0.5) * (1 - span(time, to - 0.4, to));
	if (show <= 0) {
		return null;
	}
	const value = rpm(time);
	const unit = Math.min(width, height) / 1080;
	const segments = 30;
	const lit = (value / 9000) * segments;
	return (
		<div
			style={{
				position: 'absolute',
				right: 72 * unit,
				bottom: 70 * unit,
				opacity: show,
				fontFamily: MONO_FONT,
				color: '#f4f2ee',
				textAlign: 'right',
				textShadow: '0 2px 14px rgba(0,0,0,0.6)',
			}}
		>
			<div style={{fontSize: 92 * unit, fontWeight: 700, letterSpacing: -2 * unit, lineHeight: 1}}>
				{Math.round(value / 10) * 10 >= 1000 ? (Math.round(value / 10) * 10).toLocaleString('en-US') : Math.round(value / 10) * 10}
				<span style={{fontSize: 26 * unit, opacity: 0.7, marginLeft: 12 * unit}}>{label}</span>
			</div>
			<div style={{display: 'flex', gap: 3 * unit, justifyContent: 'flex-end', marginTop: 12 * unit}}>
				{Array.from({length: segments}, (_, i) => {
					const red = i >= (8750 / 9000) * segments - 1;
					const amber = i >= (7500 / 9000) * segments;
					const colour = red ? '#ff3a3a' : amber ? '#ffb020' : '#e9e7e2';
					const on = i < lit;
					return (
						<div
							key={i}
							style={{
								width: 9 * unit,
								height: (14 + i * 0.9) * unit,
								alignSelf: 'flex-end',
								borderRadius: 2 * unit,
								background: on ? colour : 'rgba(255,255,255,0.13)',
								boxShadow: on && (red || amber) ? `0 0 ${10 * unit}px ${colour}` : 'none',
							}}
						/>
					);
				})}
			</div>
		</div>
	);
};
