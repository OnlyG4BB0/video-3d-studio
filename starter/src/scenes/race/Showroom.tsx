import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Group} from 'three';
import {
	EASE,
	EnvLight,
	GlossyReflection,
	lensFov,
	OrbitCamera,
	ShotMusic,
	ShotProps,
	span,
	Stage,
	SunLight,
	TextReveal,
	useMoving,
	useRadialFade,
	useShot,
} from '../../kit';
import {Car, CarPose} from './Car';

export const raceShowroomDefaults: ShotProps & {music: ShotMusic} = {
	format: 'wide',
	seconds: 20,
	music: {mood: 'anthem'},
};

// The car turns slowly on the spot, wheels still.
const turning = (time: number): CarPose => ({x: 0, z: 0, heading: 0.6 + time * 0.22, distance: 0, steer: 0.18});

// Bars of light that sweep over the car, as in a car launch.
const LightBars: React.FC = () => {
	const group = useMoving<Group>((object, time) => {
		object.children.forEach((bar, i) => {
			bar.position.z = ((time * 1.6 + i * 3.1) % 12) - 6;
		});
	});
	return (
		<group ref={group} position={[0, 3.2, 0]}>
			{[0, 1, 2, 3].map((i) => (
				<mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
					<planeGeometry args={[5.5, 0.12]} />
					<meshBasicMaterial color={[6, 6.2, 6.6]} toneMapped={false} />
				</mesh>
			))}
		</group>
	);
};

export const RaceShowroom: React.FC = () => {
	const {aspect, time, duration} = useShot();
	const fov = lensFov(50, aspect);
	const floorFade = useRadialFade(0.35);
	const lightsUp = span(time, 0.3, 3, EASE.glide);
	return (
		<AbsoluteFill>
			<Stage
				background="#040405"
				finish={{tone: 'neutral', bloom: 0.18, bloomThreshold: 1.4, contrast: 0.28, vignette: 0.42, grain: 0.026, grade: 'clean'}}
			>
				<EnvLight preset="showcase" intensity={0.25 + lightsUp * 0.75} diffuse={0.05} rotate={-40 + time * 6} />
				<SunLight position={[-3, 7, 4]} target={[0, 0.5, 0]} intensity={0.6 + lightsUp * 2.2} softness={1.2} extent={4} mapSize={4096} far={20} />
				<LightBars />
				<Car pose={turning} lights={lightsUp} />
				<GlossyReflection gloss={0.06}>
					<Car pose={turning} lights={lightsUp} castShadow={false} />
				</GlossyReflection>
				<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
					<circleGeometry args={[14, 96]} />
					<meshPhysicalMaterial color="#060607" transparent alphaMap={floorFade} opacity={0.88} roughness={0.35} specularIntensity={0.3} />
				</mesh>
				<OrbitCamera target={[0, 0.55, 0]} distance={aspect < 1 ? 11 : 7.2} endDistance={aspect < 1 ? 10 : 6.2} height={1.1} fromDeg={-25} toDeg={15} fov={fov} drift={0.02} />
			</Stage>
			<TextReveal text={'FLAT-SIX · *3,996 cc* · *510 hp* · *8,750 rpm*'} at={3.5} until={10.5} effect="decode" font="mono" size={32} place="lower-left" accent="#ff9a4d" />
			<TextReveal text={'Made entirely with code\n*video-3d-studio*'} at={duration - 7} until={duration - 0.6} effect="rise" font="display" size={64} place="bottom" accent="#ff9a4d" />
		</AbsoluteFill>
	);
};
