import type * as opentype from 'opentype.js';
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {
	AdditiveBlending,
	BoxGeometry,
	Color,
	ExtrudeGeometry,
	Matrix4,
	Path,
	Quaternion,
	Shape,
	Vector3,
} from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
	Caption,
	Cyclorama,
	EASE,
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
	useFontFile,
	useLathe,
	useNoiseTexture,
	useRidgeMap,
	useRoundedBox,
	useScratchMap,
	useShot,
	useTimber,
	Vec3,
} from '../../kit';
import {FOOTER} from './common';

export const filmModelsDefaults: ShotProps & {music: ShotMusic} = {
	format: 'wide',
	seconds: 15,
	music: {mood: 'clockwork'},
};

// The strap is one ellipse, seen from the side. The head hides its front.
const STRAP = {centre: -0.75, depth: 1.0, height: 1.6, thickness: 0.075, width: 1.0};
const POLISHED = '#e6e7ea';
const INDEX_GOLD = '#e8c78c';

const drawText = (
	context: CanvasRenderingContext2D,
	font: opentype.Font,
	text: string,
	centreX: number,
	baseline: number,
	size: number,
	tracking: number,
	color: string,
) => {
	const glyphs = font.stringToGlyphs(text);
	const widths = glyphs.map(
		(glyph) => ((glyph.advanceWidth ?? 0) / font.unitsPerEm) * size + tracking * size,
	);
	let x = centreX - (widths.reduce((a, b) => a + b, 0) - tracking * size) / 2;
	glyphs.forEach((glyph, index) => {
		const path = glyph.getPath(x, baseline, size);
		path.fill = color;
		path.draw(context);
		x += widths[index];
	});
};

const useDial = (font: opentype.Font | null) =>
	useCanvasTexture(
		(context, size) => {
			const mid = size / 2;
			const wedges = 1440;
			for (let i = 0; i < wedges; i++) {
				const shade = scatter(9, i);
				const colour = new Color('#142a52').lerp(new Color('#2f5597'), shade);
				context.fillStyle = `#${colour.getHexString()}`;
				context.beginPath();
				context.moveTo(mid, mid);
				context.arc(mid, mid, mid, (i / wedges) * Math.PI * 2, ((i + 1.4) / wedges) * Math.PI * 2);
				context.closePath();
				context.fill();
			}
			const edge = context.createRadialGradient(mid, mid, mid * 0.35, mid, mid, mid);
			edge.addColorStop(0, 'rgba(4,8,20,0)');
			edge.addColorStop(1, 'rgba(4,8,20,0.72)');
			context.fillStyle = edge;
			context.fillRect(0, 0, size, size);

			context.strokeStyle = '#ece7da';
			for (let i = 0; i < 60; i++) {
				const major = i % 5 === 0;
				const angle = (i / 60) * Math.PI * 2;
				const outer = mid * 0.975;
				const inner = mid * (major ? 0.93 : 0.95);
				context.lineWidth = size * (major ? 0.0034 : 0.0016);
				context.beginPath();
				context.moveTo(mid + Math.cos(angle) * inner, mid + Math.sin(angle) * inner);
				context.lineTo(mid + Math.cos(angle) * outer, mid + Math.sin(angle) * outer);
				context.stroke();
			}

			context.fillStyle = '#f2eee3';
			context.fillRect(mid * 1.545, mid * 0.945, mid * 0.14, mid * 0.11);
			if (font) {
				drawText(context, font, 'ORA', mid, mid * 0.66, mid * 0.17, 0.16, '#f4efe2');
				drawText(context, font, 'AUTOMATIC', mid, mid * 1.47, mid * 0.05, 0.3, '#d9d3c4');
				drawText(context, font, '8', mid * 1.615, mid * 1.032, mid * 0.09, 0, '#1a2233');
			}
		},
		{size: 2048, key: font ? 'ready' : 'loading'},
	);

const Hand: React.FC<{
	length: number;
	width: number;
	height: number;
	tail?: number;
	y: number;
	degrees: number;
	color: string;
}> = ({length, width, height, tail = 0.06, y, degrees, color}) => {
	const geometry = useRoundedBox(width, height, length + tail, Math.min(width, height) * 0.4, 3);
	return (
		<group position={[0, y, 0]} rotation={[0, -(degrees * Math.PI) / 180, 0]}>
			<mesh geometry={geometry} position={[0, 0, -(length - tail) / 2]} castShadow>
				<meshPhysicalMaterial color={color} metalness={1} roughness={0.14} />
			</mesh>
		</group>
	);
};

const Index: React.FC<{hour: number}> = ({hour}) => {
	const double = hour === 0;
	const geometry = useRoundedBox(double ? 0.13 : 0.05, 0.022, 0.17, 0.008, 3);
	const angle = (hour / 12) * Math.PI * 2;
	const radius = 0.68;
	return (
		<mesh
			geometry={geometry}
			position={[Math.sin(angle) * radius, 0.415, -Math.cos(angle) * radius]}
			rotation={[0, -angle, 0]}
			castShadow
		>
			<meshPhysicalMaterial {...LOOKS.gold(INDEX_GOLD)} roughness={0.16} />
		</mesh>
	);
};

const Lug: React.FC<{x: number; side: number; brushed: React.ReactNode}> = ({x, side, brushed}) => {
	const geometry = useRoundedBox(0.13, 0.16, 0.46, 0.05, 5);
	return (
		<mesh
			geometry={geometry}
			position={[x, 0.1, side * 1.02]}
			rotation={[side * 0.5, 0, 0]}
			castShadow
			receiveShadow
		>
			{brushed}
		</mesh>
	);
};

const Head: React.FC<{font: opentype.Font | null}> = ({font}) => {
	const {time} = useShot();
	const dial = useDial(font);
	const brushed = useBrushedMap({repeat: [1, 6]});
	const wear = useScratchMap({seed: 8, repeat: [1, 1], amount: 0.6});
	const grip = useRidgeMap(40);

	const caseBody = useLathe(
		[
			[0, 0.02],
			[0.86, 0.02, 0.03],
			[1.0, 0.12, 0.06],
			[1.0, 0.33, 0.05],
			[0.96, 0.39, 0.02],
			[0, 0.39],
		],
		{segments: 200},
	);
	const back = useLathe(
		[
			[0, 0],
			[0.8, 0, 0.01],
			[0.84, 0.04, 0.01],
			[0, 0.04],
		],
		{segments: 120},
	);
	const bezel = useLathe(
		[
			[0, 0.36],
			[0.965, 0.36, 0.01],
			[0.97, 0.47, 0.03],
			[0.905, 0.515, 0.015],
			[0.87, 0.5, 0.008],
			[0.855, 0.385, 0.008],
			[0, 0.385],
		],
		{segments: 200},
	);
	const crystal = useLathe(
		[
			[0, 0.5],
			[0.875, 0.5, 0.004],
			[0.86, 0.555, 0.05],
			[0, 0.585],
		],
		{segments: 160, steps: 12},
	);
	const crown = useLathe(
		[
			[0, 0],
			[0.1, 0, 0.005],
			[0.1, 0.05, 0.005],
			[0.165, 0.055, 0.012],
			[0.165, 0.22, 0.02],
			[0.13, 0.245, 0.03],
			[0, 0.25],
		],
		{segments: 120},
	);
	const hub = useLathe(
		[
			[0, 0],
			[0.05, 0, 0.004],
			[0.05, 0.075, 0.01],
			[0, 0.075],
		],
		{segments: 48},
	);

	const steel = (
		<meshPhysicalMaterial
			{...LOOKS.brushedMetal('#cfd1d6')}
			roughness={0.46}
			roughnessMap={brushed}
		/>
	);
	const shiny = (
		<meshPhysicalMaterial {...LOOKS.chrome(POLISHED)} roughness={0.2} roughnessMap={wear} />
	);

	return (
		<group rotation={[Math.PI / 2, 0, 0]}>
			<mesh geometry={caseBody} castShadow receiveShadow>
				{steel}
			</mesh>
			<mesh geometry={back} castShadow>
				{steel}
			</mesh>
			<mesh geometry={bezel} castShadow receiveShadow>
				{shiny}
			</mesh>

			<mesh position={[0, 0.405, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<circleGeometry args={[0.865, 160]} />
				<meshPhysicalMaterial
					map={dial}
					metalness={0.45}
					roughness={0.36}
					clearcoat={0.25}
					clearcoatRoughness={0.25}
				/>
			</mesh>

			{Array.from({length: 12}, (_, hour) => (
				<Index key={hour} hour={hour} />
			))}

			<Hand length={0.44} width={0.07} height={0.018} y={0.44} degrees={(10 + 10 / 60 + time / 3600) * 30} color={POLISHED} />
			<Hand length={0.66} width={0.05} height={0.018} y={0.455} degrees={(10 + time / 60) * 6} color={POLISHED} />
			<Hand length={0.72} width={0.012} height={0.01} tail={0.2} y={0.472} degrees={(21 + time) * 6} color="#ff6a2b" />
			<mesh geometry={hub} position={[0, 0.41, 0]} castShadow>
				<meshPhysicalMaterial {...LOOKS.chrome(POLISHED)} />
			</mesh>

			{/* Only the reflections of the crystal are drawn, as with real thin glass. */}
			<mesh geometry={crystal}>
				<meshPhysicalMaterial
					color="#000000"
					roughness={0.03}
					ior={1.55}
					blending={AdditiveBlending}
					transparent
					depthWrite={false}
					envMapIntensity={1.6}
				/>
			</mesh>

			<mesh geometry={crown} position={[0.98, 0.21, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow receiveShadow>
				<meshPhysicalMaterial
					{...LOOKS.brushedMetal('#dcdde1')}
					roughness={0.3}
					bumpMap={grip}
					bumpScale={1.6}
				/>
			</mesh>

			{[-1, 1].flatMap((side) =>
				[-0.58, 0.58].map((x) => <Lug key={`${x}${side}`} x={x} side={side} brushed={steel} />),
			)}
		</group>
	);
};

const useStrap = () =>
	useMemo(() => {
		const {depth, height, thickness, width, centre} = STRAP;
		const outer = new Shape();
		outer.absellipse(centre, 0, depth, height, 0, Math.PI * 2, false, 0);
		const inner = new Path();
		inner.absellipse(centre, 0, depth - thickness, height - thickness, 0, Math.PI * 2, true, 0);
		outer.holes.push(inner);
		const geometry = new ExtrudeGeometry(outer, {
			depth: width,
			curveSegments: 200,
			bevelEnabled: true,
			bevelThickness: 0.018,
			bevelSize: 0.018,
			bevelOffset: -0.009,
			bevelSegments: 5,
		});
		geometry.translate(0, 0, -width / 2);
		return softenBevels(geometry);
	}, []);

const useStitches = () =>
	useMemo(() => {
		const {depth, height, centre} = STRAP;
		const parts: BoxGeometry[] = [];
		const count = 230;
		for (const row of [-0.41, 0.41]) {
			for (let i = 0; i < count; i++) {
				const t = (i / count) * Math.PI * 2;
				const z = centre + Math.cos(t) * (depth + 0.004);
				const y = Math.sin(t) * (height + 0.004);
				const tangent = new Vector3(0, Math.cos(t) * height, -Math.sin(t) * depth).normalize();
				const stitch = new BoxGeometry(0.014, 0.028, 0.008);
				stitch.applyMatrix4(
					new Matrix4().compose(
						new Vector3(row, y, z),
						new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tangent),
						new Vector3(1, 1, 1),
					),
				);
				parts.push(stitch);
			}
		}
		return mergeGeometries(parts);
	}, []);

const Strap: React.FC = () => {
	const geometry = useStrap();
	const stitches = useStitches();
	const leather = useNoiseTexture({seed: 31, repeat: [5, 5], periods: [64, 128], size: 512});
	return (
		<group>
			<mesh geometry={geometry} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
				<meshPhysicalMaterial
					color="#8a4f26"
					roughness={0.58}
					clearcoat={0.12}
					clearcoatRoughness={0.5}
					bumpMap={leather}
					bumpScale={0.6}
				/>
			</mesh>
			<mesh geometry={stitches} castShadow>
				<meshStandardMaterial color="#efe2c8" roughness={0.8} />
			</mesh>
		</group>
	);
};

const Plinth: React.FC = () => {
	const walnut = useTimber({
		seed: 12,
		light: '#7a5536',
		dark: '#2c1b10',
		planks: 3,
		repeat: [1, 1],
	});
	const body = useLathe(
		[
			[0, 0],
			[2.4, 0, 0.01],
			[2.4, 0.3, 0.04],
			[0, 0.3],
		],
		{segments: 200, steps: 10},
	);
	return (
		<group>
			<mesh geometry={body} position={[0, -0.3, 0]} castShadow receiveShadow>
				<meshPhysicalMaterial color="#3a261a" roughness={0.42} clearcoat={0.3} clearcoatRoughness={0.3} />
			</mesh>
			{/* A flat disc, so that the grain runs straight across the top. */}
			<mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0.4]} receiveShadow>
				<circleGeometry args={[2.36, 160]} />
				<meshPhysicalMaterial
					{...walnut}
					bumpScale={0.25}
					specularIntensity={0.25}
					clearcoat={0.08}
					clearcoatRoughness={0.45}
				/>
			</mesh>
		</group>
	);
};

const FOCUS: Vec3[] = [
	[1.12, 1.62, 0.24],
	[0.3, 1.72, 0.52],
	[0, 1.7, 0.5],
	[0, 1.55, 0.45],
];

export const ChapterModels: React.FC = () => {
	const {aspect, progress} = useShot();
	const font = useFontFile();
	const fov = lensFov(100, aspect);
	const t = EASE.glide(progress) * (FOCUS.length - 1);
	const index = Math.min(Math.floor(t), FOCUS.length - 2);
	const f = t - index;
	const focus = FOCUS[index].map((value, axis) => value + (FOCUS[index + 1][axis] - value) * f) as Vec3;
	// A tall frame is narrow, so the camera stands further back from the same point.
	const pull = aspect < 1 ? 1.8 : 1;
	const key = (position: Vec3, target: Vec3, amount = pull) => ({
		position: position.map((value, axis) => target[axis] + (value - target[axis]) * amount) as Vec3,
		target,
	});

	return (
		<AbsoluteFill>
			<Stage
				background="#1c1f26"
				finish={{
					tone: 'neutral',
					bloom: 0.07,
					bloomThreshold: 1.5,
					contrast: 0.24,
					saturation: 1.08,
					warmth: 0.01,
					vignette: 0.36,
					grain: 0.022,
					highlightLimit: 4,
					focus: {target: focus, aperture: 0.022},
				}}
			>
				<EnvLight preset="showcase" intensity={1.05} diffuse={0.08} rotate={-40 + progress * 130} />
				<SkyLight intensity={1.4} centre={[0, 1.3, 0]} extent={6} />
				<SunLight
					position={[-5, 9, 7]}
					target={[0, 1.4, 0]}
					intensity={2.1}
					color="#fff0dc"
					extent={4.5}
					softness={0.9}
					mapSize={4096}
				/>
				<Cyclorama color="#232730" />
				<Plinth />
				<group position={[0, 1.6, 0]} rotation={[-0.1, 0, 0]}>
					<Head font={font} />
					<Strap />
				</group>
				<PathCamera
					fov={fov}
					drift={0.006}
					keys={[
						key([3.1, 1.85, 2.0], [1.05, 1.62, 0.24]),
						key([1.2, 2.2, 7.4], [0.3, 1.78, 0.5]),
						key([-1.2, 2.3, 10.4], [0, 1.72, 0.45]),
						key([-4.6, 3.9, 19.5], [0, 1.5, 0], aspect < 1 ? 1.15 : 1),
					]}
				/>
			</Stage>
			<Caption footer={FOOTER} index="02" title="MODELS" note="Every part of this watch is built in code. No 3D files, no textures from disk" />
		</AbsoluteFill>
	);
};
