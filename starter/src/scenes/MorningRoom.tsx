import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {
	CatmullRomCurve3,
	Color,
	FrontSide,
	PlaneGeometry,
	Shape,
	ShapeGeometry,
	Texture,
	TubeGeometry,
	Vector3,
} from 'three';
import {
	EnvLight,
	lensFov,
	LOOKS,
	PathCamera,
	scatter,
	ShotProps,
	SkyLight,
	Stage,
	SunLight,
	useCanvasTexture,
	useLathe,
	useNoiseTexture,
	useRoundedBox,
	useShot,
	useSpeckleMap,
	useTimber,
	useWeaveMap,
	Vec3,
	wobble,
} from '../kit';

export type MorningRoomProps = ShotProps & {
	wall: string;
	accent: string;
};

export const morningRoomDefaults: MorningRoomProps = {
	format: 'wide',
	seconds: 8,
	wall: '#e9e3d8',
	accent: '#b5533c',
};

const WIDTH = 9;
const DEPTH = 9;
const HEIGHT = 3.6;
// Walls run up into the ceiling, so that no sunlight leaks through the joint.
const ROOF = HEIGHT + 0.3;
const WINDOW = {low: 0.7, high: 3.1, back: -2.2, front: 1.4};
const TRIM = '#f5f1e9';

const Block: React.FC<{
	at: Vec3;
	size: Vec3;
	color: string;
	roughness?: number;
	bump?: Texture;
}> = ({at, size, color, roughness = 0.93, bump}) => (
	<mesh position={at} castShadow receiveShadow>
		<boxGeometry args={size} />
		{/* FrontSide shadows stop sunlight leaking along the inside corners. */}
		<meshStandardMaterial
			color={color}
			roughness={roughness}
			bumpMap={bump}
			bumpScale={bump ? 0.5 : 0}
			shadowSide={FrontSide}
		/>
	</mesh>
);

const Curtain: React.FC<{z: number; flip: number}> = ({z, flip}) => {
	const {time} = useShot();
	const cloth = useWeaveMap({repeat: [14, 40]});
	const geometry = useMemo(() => {
		const width = 1.15;
		const height = 3.2;
		const folds = 5;
		const plane = new PlaneGeometry(width, height, 240, 48);
		const position = plane.attributes.position;
		for (let i = 0; i < position.count; i++) {
			const x = position.getX(i);
			const down = 0.5 - position.getY(i) / height;
			const angle = (x / width + 0.5) * folds * Math.PI * 2;
			position.setZ(
				i,
				Math.sin(angle + down * 0.9) * (0.075 + down * 0.05) +
					Math.sin(angle * 2.3 + 1.4) * 0.012,
			);
		}
		plane.computeVertexNormals();
		return plane;
	}, []);
	return (
		<mesh
			geometry={geometry}
			position={[-WIDTH / 2 + 0.3, 1.72, z]}
			rotation={[wobble(flip + 3, time, 0.2) * 0.012, Math.PI / 2, 0]}
			castShadow
			receiveShadow
		>
			<meshPhysicalMaterial
				color="#c9b08c"
				roughness={1}
				sheen={0.6}
				sheenRoughness={0.6}
				sheenColor="#fff4e2"
				bumpMap={cloth}
				bumpScale={0.4}
				side={2}
			/>
		</mesh>
	);
};

const Room: React.FC<{wall: string}> = ({wall}) => {
	const timber = useTimber({repeat: [1.6, 1.6], planks: 12});
	const plaster = useNoiseTexture({seed: 17, repeat: [3, 3], periods: [16, 32, 64, 128]});
	const x = -WIDTH / 2;
	const openingHeight = WINDOW.high - WINDOW.low;
	const openingMiddle = (WINDOW.high + WINDOW.low) / 2;
	const openingWidth = WINDOW.front - WINDOW.back;
	const openingCentre = (WINDOW.front + WINDOW.back) / 2;
	const backLength = WINDOW.back + DEPTH / 2;
	const frontLength = DEPTH / 2 - WINDOW.front;
	const art = useCanvasTexture((context, size) => {
		context.fillStyle = '#e4d9c5';
		context.fillRect(0, 0, size, size);
		context.fillStyle = '#b5533c';
		context.beginPath();
		context.arc(size * 0.42, size * 0.56, size * 0.25, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = '#26384a';
		context.fillRect(size * 0.5, size * 0.2, size * 0.26, size * 0.62);
		context.fillStyle = '#d8a24a';
		context.beginPath();
		context.arc(size * 0.68, size * 0.32, size * 0.12, 0, Math.PI * 2);
		context.fill();
	});

	return (
		<group>
			<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<planeGeometry args={[WIDTH + 2, DEPTH + 2]} />
				<meshPhysicalMaterial
					{...timber}
					bumpScale={0.25}
					roughness={0.92}
					clearcoat={0.18}
					clearcoatRoughness={0.4}
				/>
			</mesh>

			{/* Window wall, built around its opening so the sun comes through it. */}
			<Block at={[x, WINDOW.low / 2, 0]} size={[0.3, WINDOW.low, DEPTH]} color={wall} bump={plaster} />
			<Block
				at={[x, (ROOF + WINDOW.high) / 2, 0]}
				size={[0.3, ROOF - WINDOW.high, DEPTH]}
				color={wall}
				bump={plaster}
			/>
			<Block
				at={[x, openingMiddle, -DEPTH / 2 + backLength / 2]}
				size={[0.3, openingHeight, backLength]}
				color={wall}
				bump={plaster}
			/>
			<Block
				at={[x, openingMiddle, DEPTH / 2 - frontLength / 2]}
				size={[0.3, openingHeight, frontLength]}
				color={wall}
				bump={plaster}
			/>

			{/* Frame, glazing bars and sill. */}
			<Block at={[x + 0.02, WINDOW.high - 0.04, openingCentre]} size={[0.22, 0.08, openingWidth]} color={TRIM} roughness={0.5} />
			<Block at={[x + 0.02, WINDOW.low + 0.04, openingCentre]} size={[0.22, 0.08, openingWidth]} color={TRIM} roughness={0.5} />
			<Block at={[x + 0.02, openingMiddle, WINDOW.back + 0.04]} size={[0.22, openingHeight, 0.08]} color={TRIM} roughness={0.5} />
			<Block at={[x + 0.02, openingMiddle, WINDOW.front - 0.04]} size={[0.22, openingHeight, 0.08]} color={TRIM} roughness={0.5} />
			{[-1.0, 0.2].map((z) => (
				<Block key={z} at={[x + 0.02, openingMiddle, z]} size={[0.12, openingHeight, 0.05]} color={TRIM} roughness={0.5} />
			))}
			<Block at={[x + 0.02, 1.95, openingCentre]} size={[0.12, 0.05, openingWidth]} color={TRIM} roughness={0.5} />
			<Block at={[x + 0.3, WINDOW.low - 0.03, openingCentre]} size={[0.42, 0.06, openingWidth + 0.5]} color={TRIM} roughness={0.42} />

			{/* Curtain rail. */}
			<mesh position={[x + 0.3, 3.34, openingCentre]} rotation={[Math.PI / 2, 0, 0]} castShadow>
				<cylinderGeometry args={[0.016, 0.016, openingWidth + 2.6, 16]} />
				<meshStandardMaterial color="#3a3530" metalness={0.8} roughness={0.35} />
			</mesh>
			<Curtain z={WINDOW.back - 0.68} flip={1} />
			<Curtain z={WINDOW.front + 0.68} flip={2} />

			<Block at={[0, ROOF / 2, -DEPTH / 2]} size={[WIDTH, ROOF, 0.3]} color={wall} bump={plaster} />
			<Block at={[WIDTH / 2, ROOF / 2, 0]} size={[0.3, ROOF, DEPTH]} color={wall} bump={plaster} />

			{/* Skirting, cornice and a picture give the walls some scale. */}
			<Block at={[0, 0.08, -DEPTH / 2 + 0.17]} size={[WIDTH, 0.16, 0.04]} color={TRIM} roughness={0.5} />
			<Block at={[WIDTH / 2 - 0.17, 0.08, 0]} size={[0.04, 0.16, DEPTH]} color={TRIM} roughness={0.5} />
			<Block at={[0, HEIGHT - 0.06, -DEPTH / 2 + 0.18]} size={[WIDTH, 0.12, 0.06]} color={TRIM} roughness={0.6} />
			<Block at={[WIDTH / 2 - 0.18, HEIGHT - 0.06, 0]} size={[0.06, 0.12, DEPTH]} color={TRIM} roughness={0.6} />
			<Block at={[1.1, 1.9, -DEPTH / 2 + 0.18]} size={[1.42, 1.1, 0.05]} color="#2c2621" roughness={0.45} />
			<mesh position={[1.1, 1.9, -DEPTH / 2 + 0.207]}>
				<planeGeometry args={[1.32, 1.0]} />
				<meshStandardMaterial map={art} roughness={0.85} />
			</mesh>

			<Block at={[0, HEIGHT + 0.15, 0]} size={[WIDTH + 1, 0.3, DEPTH + 1]} color="#f4f0e8" bump={plaster} />
		</group>
	);
};

const SkyAndLeaves: React.FC = () => {
	const {time} = useShot();
	const sky = useMemo(() => new Color('#e6f0ff').multiplyScalar(4.5), []);
	const leaves = useMemo(
		() =>
			Array.from({length: 260}, (_, index) => ({
				index,
				position: [
					-6.2 - scatter(3, index) * 2.2,
					1.8 + scatter(5, index) * 2.9,
					-2 + scatter(7, index) * 4.6,
				] as Vec3,
				size: 0.07 + scatter(11, index) * 0.12,
			})),
		[],
	);

	return (
		<group>
			{/*
			  The sky sits between the window and the tree: it hides the leaves from
			  the camera but casts no shadow, so their shadows still reach the room.
			*/}
			<mesh position={[-5.4, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
				<planeGeometry args={[30, 18]} />
				<meshBasicMaterial color={sky} />
			</mesh>
			{leaves.map((leaf) => (
				<mesh
					key={leaf.index}
					castShadow
					position={[
						leaf.position[0],
						leaf.position[1] + wobble(leaf.index, time, 0.55) * 0.05,
						leaf.position[2] + wobble(leaf.index + 90, time, 0.45) * 0.1,
					]}
					rotation={[leaf.index * 1.7, leaf.index * 0.9, 0]}
					scale={[leaf.size, leaf.size * 0.35, leaf.size * 1.5]}
				>
					<sphereGeometry args={[1, 10, 8]} />
					<meshStandardMaterial color="#47603f" roughness={0.8} />
				</mesh>
			))}
		</group>
	);
};

const LEAF_SHAPE = (() => {
	const shape = new Shape();
	shape.moveTo(0, 0);
	shape.bezierCurveTo(0.05, 0.03, 0.05, 0.11, 0, 0.16);
	shape.bezierCurveTo(-0.05, 0.11, -0.05, 0.03, 0, 0);
	return shape;
})();

const Branch: React.FC<{seed: number; lean: number; turn: number; height: number}> = ({
	seed,
	lean,
	turn,
	height,
}) => {
	const {time} = useShot();
	const leaf = useMemo(() => new ShapeGeometry(LEAF_SHAPE, 12), []);
	const {stem, spots} = useMemo(() => {
		const curve = new CatmullRomCurve3([
			new Vector3(0, 0, 0),
			new Vector3(lean * 0.12, height * 0.4, 0.02),
			new Vector3(lean * 0.42, height * 0.75, -0.02),
			new Vector3(lean * 0.95, height, 0.03),
		]);
		const count = 16;
		const placed = Array.from({length: count}, (_, index) => {
			const t = 0.32 + (index / count) * 0.68;
			return {
				index,
				point: curve.getPoint(t),
				side: index % 2 === 0 ? 1 : -1,
				size: (1.25 - t * 0.6) * (0.85 + scatter(seed, index) * 0.4),
				tilt: (scatter(seed + 1, index) - 0.5) * 0.7,
			};
		});
		return {stem: new TubeGeometry(curve, 40, 0.0055, 8, false), spots: placed};
	}, [seed, lean, height]);

	return (
		<group
			rotation={[
				wobble(seed, time, 0.3) * 0.012,
				turn,
				wobble(seed + 7, time, 0.26) * 0.015,
			]}
		>
			<mesh geometry={stem} castShadow>
				<meshStandardMaterial color="#6a5a45" roughness={0.7} />
			</mesh>
			{spots.map((spot) => (
				<mesh
					key={spot.index}
					geometry={leaf}
					position={[spot.point.x, spot.point.y, spot.point.z]}
					rotation={[spot.tilt, spot.side > 0 ? 0.5 : -0.5, spot.side * 1.15]}
					scale={spot.size}
					castShadow
					receiveShadow
				>
					<meshPhysicalMaterial
						color="#74917b"
						roughness={0.55}
						sheen={0.5}
						sheenColor="#c4d8c6"
						side={2}
					/>
				</mesh>
			))}
		</group>
	);
};

const Book: React.FC<{
	at: Vec3;
	turn: number;
	cover: string;
	width: number;
	depth: number;
	thick: number;
}> = ({at, turn, cover, width, depth, thick}) => {
	const shell = useRoundedBox(width, thick, depth, 0.006, 4);
	const paper = useNoiseTexture({seed: 44, repeat: [2, 60], periods: [64, 128]});
	return (
		<group position={at} rotation={[0, turn, 0]}>
			<mesh geometry={shell} scale={[1, 0.16, 1]} position={[0, thick * 0.42, 0]} castShadow receiveShadow>
				<meshStandardMaterial color={cover} roughness={0.62} />
			</mesh>
			<mesh geometry={shell} scale={[1, 0.16, 1]} position={[0, -thick * 0.42, 0]} castShadow receiveShadow>
				<meshStandardMaterial color={cover} roughness={0.62} />
			</mesh>
			<mesh position={[-width / 2 + 0.006, 0, 0]} castShadow>
				<boxGeometry args={[0.014, thick, depth]} />
				<meshStandardMaterial color={cover} roughness={0.62} />
			</mesh>
			<mesh position={[0.006, 0, 0]} castShadow receiveShadow>
				<boxGeometry args={[width - 0.03, thick * 0.72, depth - 0.022]} />
				<meshStandardMaterial color="#efe6d4" roughness={0.9} bumpMap={paper} bumpScale={0.3} />
			</mesh>
		</group>
	);
};

const Table: React.FC<{accent: string}> = ({accent}) => {
	const oak = useTimber({
		seed: 31,
		light: '#c79c6a',
		dark: '#8a6238',
		planks: 4,
		repeat: [1, 1],
	});
	const glaze = useSpeckleMap({
		base: accent,
		flecks: ['#3b1a12', '#e9c9a8'],
		density: 520,
		maxSize: 3.2,
		repeat: [1, 1],
		seed: 19,
	});
	const top = useRoundedBox(2.5, 0.075, 1.4, 0.03);
	const vase = useLathe(
		[
			[0, 0],
			[0.17, 0, 0.03],
			[0.28, 0.26, 0.2],
			[0.2, 0.62, 0.22],
			[0.085, 0.82, 0.08],
			[0.115, 0.98, 0.03],
			[0.09, 0.98, 0.01],
			[0.07, 0.72, 0.05],
			[0, 0.72],
		],
		{steps: 14},
	);
	const bowl = useLathe(
		[
			[0, 0],
			[0.09, 0, 0.02],
			[0.21, 0.13, 0.1],
			[0.215, 0.145, 0.006],
			[0.2, 0.14, 0.008],
			[0.08, 0.03, 0.08],
			[0, 0.02],
		],
		{steps: 12},
	);
	const leg = useLathe(
		[
			[0, 0],
			[0.018, 0, 0.004],
			[0.036, 0.655, 0.004],
			[0, 0.655],
		],
		{segments: 32, steps: 4},
	);
	const legs: [number, number, number, number][] = [
		[-1.08, -0.52, 0.06, 0.06],
		[1.08, -0.52, 0.06, -0.06],
		[-1.08, 0.52, -0.06, 0.06],
		[1.08, 0.52, -0.06, -0.06],
	];

	return (
		<group>
			<mesh geometry={top} position={[0, 0.69, 0]} castShadow receiveShadow>
				<meshPhysicalMaterial {...oak} bumpScale={0.4} clearcoat={0.3} clearcoatRoughness={0.3} />
			</mesh>
			{legs.map(([x, z, tiltX, tiltZ]) => (
				<mesh key={`${x}${z}`} geometry={leg} position={[x, 0, z]} rotation={[tiltX, 0, tiltZ]} castShadow receiveShadow>
					<meshPhysicalMaterial {...oak} bumpScale={0.2} />
				</mesh>
			))}
			<group position={[-0.42, 0.7275, -0.08]}>
				<mesh geometry={vase} castShadow receiveShadow>
					<meshPhysicalMaterial map={glaze} roughness={0.32} clearcoat={0.7} clearcoatRoughness={0.14} />
				</mesh>
				<group position={[0, 0.9, 0]}>
					<Branch seed={2} lean={0.55} turn={0.4} height={0.95} />
					<Branch seed={3} lean={0.42} turn={2.5} height={1.15} />
					<Branch seed={4} lean={0.62} turn={4.4} height={0.82} />
				</group>
			</group>
			<Book at={[0.55, 0.767, 0.16]} turn={0.3} cover="#2c3d4b" width={0.72} depth={0.52} thick={0.076} />
			<Book at={[0.57, 0.84, 0.17]} turn={0.08} cover="#c2ad80" width={0.62} depth={0.46} thick={0.066} />
			<group position={[0.68, 0.7275, -0.38]}>
				<mesh geometry={bowl} castShadow receiveShadow>
					<meshPhysicalMaterial {...LOOKS.ceramic('#efe9de')} />
				</mesh>
			</group>
		</group>
	);
};

const Armchair: React.FC<{accent: string}> = ({accent}) => {
	const cloth = useWeaveMap({repeat: [6, 6]});
	const seat = useRoundedBox(0.98, 0.22, 0.92, 0.1, 8);
	const back = useRoundedBox(0.98, 0.76, 0.2, 0.09, 8);
	const arm = useRoundedBox(0.16, 0.42, 0.92, 0.07, 8);
	const leg = useLathe(
		[
			[0, 0],
			[0.016, 0, 0.004],
			[0.03, 0.26, 0.004],
			[0, 0.26],
		],
		{segments: 24, steps: 4},
	);
	const fabric = (
		<meshPhysicalMaterial
			color={accent}
			roughness={0.95}
			sheen={1}
			sheenRoughness={0.5}
			sheenColor="#f0c8a8"
			bumpMap={cloth}
			bumpScale={0.8}
		/>
	);
	return (
		<group>
			<mesh geometry={seat} position={[0, 0.38, 0]} castShadow receiveShadow>{fabric}</mesh>
			<mesh geometry={back} position={[0, 0.72, -0.4]} rotation={[-0.14, 0, 0]} castShadow receiveShadow>{fabric}</mesh>
			<mesh geometry={arm} position={[-0.55, 0.52, 0]} castShadow receiveShadow>{fabric}</mesh>
			<mesh geometry={arm} position={[0.55, 0.52, 0]} castShadow receiveShadow>{fabric}</mesh>
			{[
				[-0.46, -0.38],
				[0.46, -0.38],
				[-0.46, 0.38],
				[0.46, 0.38],
			].map(([x, z]) => (
				<mesh key={`${x}${z}`} geometry={leg} position={[x, 0, z]} castShadow>
					<meshStandardMaterial color="#6b4a2c" roughness={0.5} />
				</mesh>
			))}
		</group>
	);
};

const Rug: React.FC = () => {
	const weave = useWeaveMap({repeat: [26, 18]});
	const pattern = useCanvasTexture((context, size) => {
		context.fillStyle = '#d8cdb9';
		context.fillRect(0, 0, size, size);
		context.strokeStyle = '#7a5a45';
		context.lineWidth = size * 0.012;
		context.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);
		context.strokeStyle = '#a9927a';
		context.lineWidth = size * 0.006;
		for (let i = -8; i <= 16; i++) {
			const x = (i / 8) * size;
			context.beginPath();
			context.moveTo(x, size * 0.09);
			context.lineTo(x + size * 0.82, size * 0.91);
			context.moveTo(x + size * 0.82, size * 0.09);
			context.lineTo(x, size * 0.91);
			context.stroke();
		}
	});
	return (
		<mesh position={[-0.9, 0.012, -0.7]} rotation={[-Math.PI / 2, 0, 0.22]} receiveShadow>
			<planeGeometry args={[4, 2.9]} />
			<meshStandardMaterial map={pattern} roughness={1} bumpMap={weave} bumpScale={1} />
		</mesh>
	);
};

export const MorningRoom: React.FC<MorningRoomProps> = ({wall, accent}) => {
	const {aspect} = useShot();
	const fov = lensFov(30, aspect);

	return (
		<AbsoluteFill>
			<Stage
				background="#dcecff"
				finish={{
					tone: 'agx',
					exposure: 1.75,
					bloom: 0.06,
					bloomThreshold: 2.2,
					bloomRadius: 0.35,
					contrast: 0.32,
					saturation: 1.14,
					warmth: 0.005,
					vignette: 0.3,
					grain: 0.028,
					beams: {density: 0.007, reach: 13, anisotropy: 0.55},
					focus: {target: [-1.2, 1, -0.8], aperture: 0.012},
				}}
			>
				<EnvLight preset="daylight" intensity={0.5} diffuse={0.05} />
				{/* The sky reaches the room only through the window, as it really does. */}
				<SkyLight
					intensity={10}
					axis={[-1, 0.36, 0.05]}
					spread={40}
					centre={[0, 1.5, 0]}
					extent={8}
					mapSize={2048}
					zenith="#d6e4ff"
					horizon="#f2f4ff"
				/>
				{/* The warm ground colour stands in for sunlight bouncing off the floor. */}
				<hemisphereLight args={['#f6f1e8', '#ecd8bc', 0.62]} />
				<SunLight
					position={[-11, 5.5, 3.2]}
					target={[0, 0, -0.5]}
					intensity={10}
					color="#ffe6c6"
					extent={8}
					mapSize={4096}
					softness={0.3}
					far={40}
				/>

				<Room wall={wall} />
				<SkyAndLeaves />
				<Rug />
				<group position={[-0.9, 0, -0.7]} rotation={[0, 0.22, 0]}>
					<Table accent={accent} />
				</group>
				<group position={[2.2, 0, -3.1]} rotation={[0, -0.5, 0]}>
					<Armchair accent="#8a6a3f" />
				</group>

				<PathCamera
					fov={fov}
					drift={0.02}
					keys={[
						{position: [3.5, 1.3, 3.4], target: [-0.8, 0.95, -1.0]},
						{position: [2.6, 1.15, 3.7], target: [-1.0, 0.95, -0.8]},
					]}
				/>
			</Stage>
		</AbsoluteFill>
	);
};
