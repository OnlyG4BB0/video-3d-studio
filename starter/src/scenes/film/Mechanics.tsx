import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {ExtrudeGeometry, NoColorSpace, Path, Shape} from 'three';
import {
	Caption,
	EnvLight,
	lensFov,
	LOOKS,
	PathCamera,
	scatter,
	ShotMusic,
	ShotProps,
	SkyLight,
	softenBevels,
	Stage,
	SunLight,
	useBrushedMap,
	useCanvasTexture,
	useLathe,
	useShot,
} from '../../kit';
import {FOOTER} from './common';

export const filmMechanicsDefaults: ShotProps & {music: ShotMusic} = {
	format: 'wide',
	seconds: 11,
	music: {mood: 'drive'},
};

const MODULE = 0.075;
const BRASS = '#d7ae63';
const STEEL = '#d5d7dc';

type Spec = {
	teeth: number;
	layer: number;
	metal: string;
	spokes: number;
	/** Meshes with this gear, placed at `angle` degrees from it. */
	meshes?: number;
	angle?: number;
	/** Fixed to this gear, on the same axle. */
	sharing?: number;
};

const TRAIN: Spec[] = [
	{teeth: 56, layer: 0, metal: BRASS, spokes: 6},
	{teeth: 14, layer: 0, metal: STEEL, spokes: 0, meshes: 0, angle: 16},
	{teeth: 44, layer: 1, metal: BRASS, spokes: 5, sharing: 1},
	{teeth: 12, layer: 1, metal: STEEL, spokes: 0, meshes: 2, angle: -28},
	{teeth: 38, layer: 0, metal: BRASS, spokes: 5, sharing: 3},
	{teeth: 12, layer: 0, metal: STEEL, spokes: 0, meshes: 4, angle: 62},
	{teeth: 30, layer: 2, metal: BRASS, spokes: 4, sharing: 5},
];

type Placed = {x: number; y: number; ratio: number; phase: number};

// Works out where each gear sits and how it turns, so that the teeth really engage:
// a gear's angle follows from its neighbour's by the ratio of their tooth counts.
const placeTrain = () => {
	const placed: Placed[] = [];
	TRAIN.forEach((gear, index) => {
		if (index === 0) {
			placed.push({x: -3.4, y: -0.55, ratio: 1, phase: 0});
			return;
		}
		if (gear.sharing !== undefined) {
			const axle = placed[gear.sharing];
			placed.push({...axle});
			return;
		}
		const parent = placed[gear.meshes!];
		const partner = TRAIN[gear.meshes!];
		const alpha = (gear.angle! * Math.PI) / 180;
		const reach = (MODULE * (partner.teeth + gear.teeth)) / 2;
		const scale = partner.teeth / gear.teeth;
		placed.push({
			x: parent.x + Math.cos(alpha) * reach,
			y: parent.y + Math.sin(alpha) * reach,
			ratio: -parent.ratio * scale,
			phase: alpha + Math.PI - Math.PI / gear.teeth + (alpha - parent.phase) * scale,
		});
	});
	return placed;
};

const buildGear = (teeth: number, spokes: number) => {
	const pitch = (MODULE * teeth) / 2;
	const tip = pitch + MODULE;
	const root = pitch - MODULE * 1.25;
	const step = (Math.PI * 2) / teeth;
	const profile: [number, number][] = [
		[root, -0.5],
		[root, -0.33],
		[pitch, -0.25],
		[tip, -0.15],
		[tip, 0.15],
		[pitch, 0.25],
		[root, 0.33],
	];
	const shape = new Shape();
	for (let i = 0; i < teeth; i++) {
		for (const [radius, offset] of profile) {
			const angle = (i + offset) * step;
			const x = Math.cos(angle) * radius;
			const y = Math.sin(angle) * radius;
			if (i === 0 && offset === -0.5) {
				shape.moveTo(x, y);
			} else {
				shape.lineTo(x, y);
			}
		}
	}
	shape.closePath();

	if (spokes > 0) {
		const outer = root * 0.82;
		const inner = Math.max(root * 0.3, 0.26);
		const gap = 0.17;
		for (let i = 0; i < spokes; i++) {
			const start = (i / spokes) * Math.PI * 2 + gap;
			const end = ((i + 1) / spokes) * Math.PI * 2 - gap;
			const window = new Path();
			window.absarc(0, 0, outer, start, end, false);
			window.absarc(0, 0, inner, end, start, true);
			window.closePath();
			shape.holes.push(window);
		}
	}

	const depth = 0.11;
	const geometry = new ExtrudeGeometry(shape, {
		depth,
		curveSegments: 40,
		bevelEnabled: true,
		bevelThickness: 0.012,
		bevelSize: 0.012,
		bevelOffset: -0.006,
		bevelSegments: 4,
	});
	geometry.translate(0, 0, -depth / 2);
	return softenBevels(geometry);
};

const layerZ = (layer: number) => 0.2 + layer * 0.26;

// Fine rings around the centre of a gear, the mark left by turning it on a lathe.
// Flat faces have UVs in scene units, so the map is scaled to the gear's radius.
const useTurnedMap = (radius: number) => {
	const map = useCanvasTexture(
		(context, size) => {
			context.fillStyle = '#c4c4c4';
			context.fillRect(0, 0, size, size);
			for (let i = 0; i < 260; i++) {
				const value = 110 + Math.floor(scatter(5, i) * 145);
				context.strokeStyle = `rgb(${value},${value},${value})`;
				context.lineWidth = 1 + scatter(6, i) * 2.5;
				context.beginPath();
				context.arc(size / 2, size / 2, ((i + 0.5) / 260) * (size / 2), 0, Math.PI * 2);
				context.stroke();
			}
		},
		{
			size: 2048,
			repeat: [0.5 / radius, 0.5 / radius],
			colorSpace: NoColorSpace,
			key: `${radius}`,
		},
	);
	useLayoutEffect(() => {
		map.offset.set(0.5, 0.5);
	}, [map]);
	return map;
};

const Gear: React.FC<{spec: Spec; place: Placed}> = ({spec, place}) => {
	const {time} = useShot();
	const geometry = useMemo(() => buildGear(spec.teeth, spec.spokes), [spec.teeth, spec.spokes]);
	const wear = useTurnedMap((MODULE * spec.teeth) / 2 + MODULE * 1.5);
	// The train multiplies speed by 46 at its far end, so the input turns very slowly.
	const angle = place.phase + time * 0.06 * place.ratio;
	return (
		<mesh
			geometry={geometry}
			position={[place.x, place.y, layerZ(spec.layer)]}
			rotation={[0, 0, angle]}
			castShadow
			receiveShadow
		>
			<meshPhysicalMaterial
				{...LOOKS.brushedMetal(spec.metal)}
				roughness={spec.metal === BRASS ? 0.46 : 0.4}
				roughnessMap={wear}
				bumpMap={wear}
				bumpScale={0.05}
			/>
		</mesh>
	);
};

const Axle: React.FC<{place: Placed; top: number}> = ({place, top}) => {
	const seat = useLathe(
		[
			[0, 0],
			[0.13, 0, 0.01],
			[0.13, top, 0.012],
			[0.1, top + 0.02, 0.01],
			[0, top + 0.02],
		],
		{segments: 64},
	);
	const jewel = useLathe(
		[
			[0, 0],
			[0.075, 0, 0.01],
			[0.06, 0.03, 0.02],
			[0, 0.042],
		],
		{segments: 48},
	);
	return (
		<group position={[place.x, place.y, 0]}>
			<mesh geometry={seat} rotation={[Math.PI / 2, 0, 0]} scale={[1, -1, 1]} castShadow receiveShadow>
				<meshPhysicalMaterial {...LOOKS.chrome('#e9eaee')} roughness={0.16} side={2} />
			</mesh>
			<mesh geometry={jewel} position={[0, 0, top + 0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[1, -1, 1]}>
				<meshPhysicalMaterial color="#a30a23" roughness={0.08} clearcoat={1} clearcoatRoughness={0.03} side={2} />
			</mesh>
		</group>
	);
};

const Plate: React.FC = () => {
	const brushed = useBrushedMap({repeat: [1, 3]});
	const stripes = useCanvasTexture(
		(context, size) => {
			const bands = 12;
			const band = size / bands;
			for (let i = 0; i < bands; i++) {
				const gradient = context.createLinearGradient(0, i * band, 0, (i + 1) * band);
				gradient.addColorStop(0, '#6a6a6a');
				gradient.addColorStop(0.5, '#ffffff');
				gradient.addColorStop(1, '#6a6a6a');
				context.fillStyle = gradient;
				context.fillRect(0, i * band, size, band);
			}
		},
		{size: 1024, repeat: [2, 1], colorSpace: NoColorSpace},
	);
	return (
		<mesh position={[0, 0, -0.02]} receiveShadow rotation={[0, 0, 0.18]}>
			<planeGeometry args={[26, 16]} />
			<meshPhysicalMaterial
				{...LOOKS.brushedMetal('#6d7079')}
				roughness={0.55}
				roughnessMap={brushed}
				bumpMap={stripes}
				bumpScale={0.8}
			/>
		</mesh>
	);
};

export const ChapterMechanics: React.FC = () => {
	const {aspect, progress} = useShot();
	const places = useMemo(placeTrain, []);
	const fov = lensFov(70, aspect);
	const axles = TRAIN.map((spec, index) => ({spec, index})).filter(
		({spec, index}) =>
			spec.sharing === undefined &&
			!TRAIN.some((other) => other.sharing === index),
	);
	const shared = TRAIN.map((spec, index) => ({spec, index})).filter(
		({spec}) => spec.sharing !== undefined,
	);

	return (
		<AbsoluteFill>
			<Stage
				background="#0c0d11"
				finish={{
					tone: 'neutral',
					bloom: 0.07,
					bloomThreshold: 1.5,
					contrast: 0.26,
					saturation: 1.08,
					vignette: 0.4,
					grain: 0.024,
					highlightLimit: 2.5,
					focus: {target: [0.3, 0.3, 0.45], aperture: 0.045},
				}}
			>
				<EnvLight preset="showcase" intensity={0.42} diffuse={0.08} rotate={-22 + progress * 44} />
				<SkyLight intensity={0.8} centre={[0, 0, 0]} axis={[0, 0.4, 1]} spread={60} extent={9} />
				<SunLight
					position={[-7, 8, 6.5]}
					target={[0, 0, 0]}
					intensity={2.7}
					color="#fff0dc"
					extent={9}
					softness={0.7}
					mapSize={4096}
					far={30}
				/>
				<Plate />
				{TRAIN.map((spec, index) => (
					<Gear key={index} spec={spec} place={places[index]} />
				))}
				{axles.map(({spec, index}) => (
					<Axle key={index} place={places[index]} top={layerZ(spec.layer) + 0.1} />
				))}
				{shared.map(({spec, index}) => (
					<Axle key={index} place={places[index]} top={layerZ(spec.layer) + 0.1} />
				))}
				<PathCamera
					fov={fov}
					drift={0.012}
					keys={[
						{position: [-3.4, -2.6, aspect < 1 ? 13 : 8.7], target: [-1.1, -0.3, 0.2]},
						{position: [1.3, -0.4, aspect < 1 ? 13.3 : 8.9], target: [0.7, 0.2, 0.2]},
					]}
				/>
			</Stage>
			<Caption footer={FOOTER} index="06" title="MECHANICS" note="Seven gears that really engage: every angle comes from the tooth counts" />
		</AbsoluteFill>
	);
};
