import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {Group} from 'three';
import {
	AuroraBackdrop,
	BODY_FONT,
	DISPLAY_FONT,
	EASE,
	EnvLight,
	fitDistance,
	lensFov,
	LOOKS,
	PathCamera,
	ShotMusic,
	ShotProps,
	span,
	springAt,
	Stage,
	SunLight,
	useDisplayFont,
	useExtrudedSvg,
	useMoving,
	useScratchMap,
	useShot,
} from '../../kit';

export const filmEndDefaults: ShotProps & {music: ShotMusic} = {
	format: 'wide',
	seconds: 9,
	music: {
		mood: 'resolve',
		// The three faces of the cube and the triangle arrive one after another.
		cues: [1.0, 1.22, 1.44, 1.66].map((at, index) => ({
			sound: 'clank',
			at,
			pitch: 190 + index * 45,
			pan: [0, -0.5, 0.5, 0][index],
			amp: 0.24,
		})),
	},
};

// An isometric cube around a play symbol: three faces and one triangle.
const MARK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
	<path fill="#e2b56c" d="M100 6 L176 50 L100 94 L24 50 Z"/>
	<path fill="#d9dbe1" d="M18 60 L94 104 L94 192 L18 148 Z"/>
	<path fill="#9fa5b2" d="M182 60 L182 148 L106 192 L106 104 Z"/>
	<path fill="#ff7a33" d="M78 96 L78 150 L126 123 Z"/>
</svg>`;

const FROM: [number, number, number][] = [
	[0, 3.2, -1.5],
	[-3.4, -1.6, -1.5],
	[3.4, -1.6, -1.5],
	[0, 0, 3],
];

// Each piece of the mark flies in from its own side, with motion blur.
const Arriving: React.FC<{index: number; scale: number; lift: number; children: React.ReactNode}> = ({
	index,
	scale,
	lift,
	children,
}) => {
	const group = useMoving<Group>((object, time) => {
		const away = 1 - springAt(time - (0.3 + index * 0.22), 'soft');
		object.position.set(
			(FROM[index][0] * away) / scale,
			(-FROM[index][1] * away) / scale,
			(FROM[index][2] * away + lift) / scale,
		);
	});
	return <group ref={group}>{children}</group>;
};

export const ChapterEnd: React.FC = () => {
	useDisplayFont();
	const {time, duration, aspect, width} = useShot();
	const mark = useExtrudedSvg(MARK, {width: 2.2, depth: 0.34, bevel: 0.028});
	const wear = useScratchMap({seed: 31, repeat: [1.2, 1.2], amount: 0.35});
	const look = useMemo(() => LOOKS.brushedMetal, []);
	const fov = lensFov(85, aspect);
	const distance = fitDistance(Math.hypot(mark.width, mark.height) / 2, fov, aspect, 1.72);
	const sweep = span(time, 0.3, duration * 0.8, EASE.glide);
	const lightsUp = span(time, 0.4, 2, EASE.glide);
	const glow = span(time, 2, 3.2, EASE.glide);
	const textIn = span(time, 3, 3.8, EASE.arrive);
	const linkIn = span(time, 3.7, 4.5, EASE.arrive);
	const unit = width / 1920;

	return (
		<AbsoluteFill>
			<Stage
				background="#06070b"
				finish={{
					highlightLimit: 2.4,
					bloom: 0.2,
					bloomThreshold: 1,
					bloomRadius: 0.55,
					contrast: 0.22,
					saturation: 1.08,
					vignette: 0.45,
					grain: 0.028,
					beams: {density: 0.0012, reach: distance * 1.7, anisotropy: 0.55},
				}}
			>
				<AuroraBackdrop colors={['#04050a', '#0e1126', '#3a2030']} intensity={0.7} speed={0.1} seed={5} />
				<EnvLight
					preset="showcase"
					intensity={interpolate(lightsUp, [0, 1], [0.1, 0.95])}
					diffuse={0.08}
					rotate={-60 + sweep * 110}
				/>
				<SunLight
					position={[interpolate(sweep, [0, 1], [-4.5, 3.5]), 1.2, -9]}
					target={[0, 0.4, 0]}
					intensity={7 * lightsUp}
					color="#ffd2a0"
					extent={3.6}
					softness={0.25}
					mapSize={4096}
					far={26}
				/>
				<group
					position={[0, 0.62, 0]}
					rotation={[interpolate(sweep, [0, 1], [0.32, 0.12]), interpolate(sweep, [0, 1], [-0.62, -0.28]), 0]}
				>
					<group scale={[mark.scale, -mark.scale, mark.scale]}>
						{mark.parts.map((part, index) => {
							const glowing = index === 3;
							return (
								<Arriving key={index} index={index} scale={mark.scale} lift={glowing ? 0.3 : 0}>
									<mesh geometry={part.geometry} castShadow receiveShadow>
										<meshPhysicalMaterial
											{...look(`#${part.color.getHexString()}`)}
											roughness={0.42}
											roughnessMap={wear}
											emissive={glowing ? '#ff4a10' : '#000000'}
											emissiveIntensity={glowing ? glow * 1.15 : 0}
										/>
									</mesh>
								</Arriving>
							);
						})}
					</group>
				</group>
				<PathCamera
					fov={fov}
					drift={0.01}
					keys={[
						{position: [0.5, 0.2, distance * 1.12], target: [0, 0, 0]},
						{position: [0, 0, distance], target: [0, 0, 0]},
					]}
				/>
			</Stage>
			<AbsoluteFill
				style={{alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 92 * unit}}
			>
				<div
					style={{
						opacity: textIn,
						transform: `translateY(${(1 - textIn) * 22 * unit}px)`,
						fontFamily: DISPLAY_FONT,
						color: '#f6f3ec',
						fontSize: 96 * unit,
						letterSpacing: '0.04em',
						lineHeight: 1,
					}}
				>
					VIDEO 3D STUDIO
				</div>
				<div
					style={{
						opacity: textIn,
						fontFamily: BODY_FONT,
						color: '#f2efe8',
						fontSize: 31 * unit,
						marginTop: 22 * unit,
					}}
				>
					Every frame of this film was generated from code
				</div>
				<div
					style={{
						opacity: linkIn,
						fontFamily: BODY_FONT,
						color: '#ffc08a',
						fontSize: 27 * unit,
						letterSpacing: '0.06em',
						marginTop: 18 * unit,
					}}
				>
					github.com/OnlyG4BB0/video-3d-studio
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
