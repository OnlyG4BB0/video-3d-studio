import React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {MeshPhysicalMaterialParameters} from 'three';
import {
	BODY_FONT,
	Caption,
	Cyclorama,
	DISPLAY_FONT,
	EASE,
	EnvLight,
	lensFov,
	LOOKS,
	PathCamera,
	ShotMusic,
	ShotProps,
	SkyLight,
	Stage,
	SunLight,
	useLathe,
	useNoiseTexture,
	useScratchMap,
	useShot,
	useSpeckleMap,
	useWeaveMap,
} from '../../kit';
import {FOOTER} from './common';

const SPACING = 2.2;
const RADIUS = 0.62;
const NAMES = [
	'CHROME',
	'GOLD',
	'ANODIZED',
	'CAR PAINT',
	'PEARL',
	'OIL SLICK',
	'GLASS',
	'CERAMIC',
	'VELVET',
];
const COUNT = NAMES.length;
const BELL_NOTES = [67, 69, 72, 74, 77, 79, 81, 84];

export const filmMaterialsDefaults: ShotProps & {music: ShotMusic} = {
	format: 'wide',
	seconds: 15,
	music: {
		mood: 'groove',
		// One bell each time the focus reaches the next sphere.
		cues: BELL_NOTES.map((note, index) => ({
			sound: 'bell',
			progress: (index + 0.5) / (COUNT - 1),
			note,
			amp: 0.15,
			pan: -0.6 + index * 0.17,
		})),
	},
};

const Orb: React.FC<{
	index: number;
	look: MeshPhysicalMaterialParameters;
	children?: React.ReactNode;
}> = ({index, look, children}) => {
	const pedestal = useLathe(
		[
			[0, 0],
			[0.74, 0, 0.01],
			[0.74, 0.1, 0.02],
			[0.5, 0.11, 0.01],
			[0.46, 0.15, 0.03],
			[0, 0.15],
		],
		{segments: 96},
	);
	return (
		<group position={[index * SPACING, 0, 0]}>
			<mesh geometry={pedestal} castShadow receiveShadow>
				<meshPhysicalMaterial {...LOOKS.powderCoat('#2a2c33')} roughness={0.42} />
			</mesh>
			<mesh position={[0, 0.14 + RADIUS, 0]} castShadow receiveShadow>
				<sphereGeometry args={[RADIUS, 128, 96]} />
				<meshPhysicalMaterial {...look} />
			</mesh>
			{children}
		</group>
	);
};

export const ChapterMaterials: React.FC = () => {
	const {aspect, progress, width} = useShot();
	const fov = lensFov(60, aspect);
	const scratches = useScratchMap({seed: 4, repeat: [1, 1], amount: 0.6});
	const pebble = useNoiseTexture({seed: 3, repeat: [14, 7], periods: [64, 128]});
	const cloth = useWeaveMap({repeat: [24, 12]});
	const glaze = useSpeckleMap({
		base: '#d9c8a8',
		flecks: ['#5a3b24', '#8f6a45', '#2f231a'],
		density: 1800,
		maxSize: 5,
		repeat: [2, 1],
		seed: 27,
	});
	const looks: MeshPhysicalMaterialParameters[] = [
		{...LOOKS.chrome(), roughness: 0.14, roughnessMap: scratches},
		{...LOOKS.gold('#e3b872'), roughness: 0.26, roughnessMap: scratches},
		{...LOOKS.anodized('#2f5fb0'), bumpMap: pebble, bumpScale: 0.12},
		{...LOOKS.carPaint('#a01626'), metalness: 0.5},
		LOOKS.pearl(),
		{...LOOKS.oilSlick(), roughness: 0.16},
		{...LOOKS.glass('#ffffff'), thickness: 1.3, attenuationColor: '#e6f3ff', attenuationDistance: 3},
		{...LOOKS.ceramic(), map: glaze, roughness: 0.3},
		{...LOOKS.velvet('#6b2140'), bumpMap: cloth, bumpScale: 0.5},
	];

	const stepped = progress * (COUNT - 1);
	const before = Math.floor(stepped);
	const fraction = stepped - before;
	const rack = EASE.glide(Math.min(1, Math.max(0, (fraction - 0.3) / 0.4)));
	const focusIndex = before + rack;
	const shown = Math.min(COUNT - 1, rack > 0.5 ? before + 1 : before);
	const nameOpacity = interpolate(Math.abs(rack - 0.5), [0.1, 0.42], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const unit = width / 1920;
	const firstX = -1.15;
	const lastX = (COUNT - 1) * SPACING - 1.15;
	const lookAhead = 1.15;

	return (
		<AbsoluteFill>
			<Stage
				background="#14161b"
				finish={{
					tone: 'neutral',
					bloom: 0.08,
					bloomThreshold: 1.5,
					contrast: 0.22,
					saturation: 1.08,
					vignette: 0.36,
					grain: 0.022,
					highlightLimit: 5,
					focus: {
						target: [focusIndex * SPACING, 0.76, RADIUS * 0.8],
						aperture: 0.06,
					},
				}}
			>
				<EnvLight preset="studio" intensity={1.25} diffuse={0.08} rotate={progress * 150} />
				<SkyLight intensity={1.5} centre={[8.8, 0.5, 0]} extent={12} mapSize={2048} />
				<SunLight
					position={[8.8 - 4, 9, 6]}
					target={[8.8, 0.4, 0]}
					intensity={1.7}
					color="#fff1df"
					extent={14}
					softness={0.9}
					mapSize={4096}
					far={40}
				/>
				<group position={[8.8, 0, 0]}>
					<Cyclorama color="#1b1d23" radius={26} roughness={0.55} />
				</group>
				{looks.map((look, index) => (
					<Orb key={NAMES[index]} index={index} look={look}>
						{/* Something solid inside the glass, to show the refraction. */}
						{NAMES[index] === 'GLASS' ? (
							<mesh position={[0, 0.14 + RADIUS, 0]} rotation={[0.5, progress * 5, 0.2]}>
								<torusKnotGeometry args={[0.2, 0.06, 240, 32]} />
								<meshPhysicalMaterial {...LOOKS.gold('#ecc07a')} roughness={0.2} />
							</mesh>
						) : null}
					</Orb>
				))}
				<PathCamera
					fov={fov}
					easing={EASE.steady}
					drift={0.008}
					keys={[
						{position: [firstX, 1.15, 5.6], target: [firstX + lookAhead, 0.72, 0]},
						{position: [lastX, 1.15, 5.6], target: [lastX + lookAhead, 0.72, 0]},
					]}
				/>
			</Stage>
			<Caption footer={FOOTER} index="03" title="MATERIALS" note="Nine surfaces, with the focus racking from one to the next" />
			<AbsoluteFill
				style={{
					alignItems: 'flex-end',
					justifyContent: 'flex-end',
					padding: `0 ${96 * unit}px ${76 * unit}px 0`,
				}}
			>
				<div style={{opacity: nameOpacity, textAlign: 'right', color: '#f6f3ec', textShadow: '0 2px 26px rgba(0,0,0,0.6)'}}>
					<div style={{fontFamily: BODY_FONT, fontSize: 22 * unit, letterSpacing: '0.32em', opacity: 0.78, marginBottom: 10 * unit}}>
						{`${shown + 1} / ${COUNT}`}
					</div>
					<div style={{fontFamily: DISPLAY_FONT, fontSize: 52 * unit, letterSpacing: '0.04em'}}>{NAMES[shown]}</div>
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
