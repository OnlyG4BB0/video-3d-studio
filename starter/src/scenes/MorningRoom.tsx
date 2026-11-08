import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {Color} from 'three';
import {
	EnvLight,
	lensFov,
	LOOKS,
	PathCamera,
	scatter,
	ShotProps,
	Stage,
	SunLight,
	useLathe,
	usePlankTexture,
	useRoundedBox,
	useShot,
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
	wall: '#e6e0d5',
	accent: '#b5533c',
};

const Block: React.FC<{
	at: Vec3;
	size: Vec3;
	color: string;
	roughness?: number;
}> = ({at, size, color, roughness = 0.93}) => (
	<mesh position={at} castShadow receiveShadow>
		<boxGeometry args={size} />
		<meshStandardMaterial color={color} roughness={roughness} />
	</mesh>
);

const WIDTH = 9;
const DEPTH = 9;
const HEIGHT = 3.6;
// Walls run up into the ceiling, so that no sunlight leaks through the joint.
const ROOF = HEIGHT + 0.3;
const WINDOW = {low: 0.7, high: 3.1, back: -2.2, front: 1.4};

const Room: React.FC<{wall: string}> = ({wall}) => {
	const planks = usePlankTexture({repeat: [2.2, 2.2]});
	const x = -WIDTH / 2;
	const openingHeight = WINDOW.high - WINDOW.low;
	const openingMiddle = (WINDOW.high + WINDOW.low) / 2;
	const backLength = WINDOW.back + DEPTH / 2;
	const frontLength = DEPTH / 2 - WINDOW.front;

	return (
		<group>
			<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<planeGeometry args={[WIDTH + 2, DEPTH + 2]} />
				<meshStandardMaterial map={planks} roughness={0.68} />
			</mesh>

			{/* Window wall, built around its opening so the sun comes through it. */}
			<Block at={[x, WINDOW.low / 2, 0]} size={[0.3, WINDOW.low, DEPTH]} color={wall} />
			<Block
				at={[x, (ROOF + WINDOW.high) / 2, 0]}
				size={[0.3, ROOF - WINDOW.high, DEPTH]}
				color={wall}
			/>
			<Block
				at={[x, openingMiddle, -DEPTH / 2 + backLength / 2]}
				size={[0.3, openingHeight, backLength]}
				color={wall}
			/>
			<Block
				at={[x, openingMiddle, DEPTH / 2 - frontLength / 2]}
				size={[0.3, openingHeight, frontLength]}
				color={wall}
			/>

			{/* Glazing bars. */}
			{[-1.0, 0.2].map((z) => (
				<Block
					key={z}
					at={[x, openingMiddle, z]}
					size={[0.1, openingHeight, 0.06]}
					color="#f3efe7"
				/>
			))}
			<Block
				at={[x, 1.95, (WINDOW.back + WINDOW.front) / 2]}
				size={[0.1, 0.06, WINDOW.front - WINDOW.back]}
				color="#f3efe7"
			/>

			<Block at={[0, ROOF / 2, -DEPTH / 2]} size={[WIDTH, ROOF, 0.3]} color={wall} />
			<Block at={[WIDTH / 2, ROOF / 2, 0]} size={[0.3, ROOF, DEPTH]} color={wall} />

			{/* Skirting boards and a picture give the walls some scale. */}
			<Block at={[0, 0.07, -DEPTH / 2 + 0.17]} size={[WIDTH, 0.14, 0.04]} color="#f4f0e8" />
			<Block at={[WIDTH / 2 - 0.17, 0.07, 0]} size={[0.04, 0.14, DEPTH]} color="#f4f0e8" />
			<Block at={[1.1, 1.85, -DEPTH / 2 + 0.18]} size={[1.5, 1.05, 0.05]} color="#27231f" roughness={0.5} />
			<Block at={[1.1, 1.85, -DEPTH / 2 + 0.21]} size={[1.38, 0.93, 0.02]} color="#d9cdb8" />
			<Block at={[0.9, 1.72, -DEPTH / 2 + 0.225]} size={[0.62, 0.44, 0.01]} color="#b5533c" />
			<Block at={[0, HEIGHT + 0.15, 0]} size={[WIDTH + 1, 0.3, DEPTH + 1]} color="#f2eee6" />
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

const Table: React.FC<{accent: string}> = ({accent}) => {
	const top = useRoundedBox(2.5, 0.09, 1.4, 0.035);
	const book = useRoundedBox(0.72, 0.075, 0.52, 0.012);
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
	const legs: Vec3[] = [
		[-1.05, 0.33, -0.5],
		[1.05, 0.33, -0.5],
		[-1.05, 0.33, 0.5],
		[1.05, 0.33, 0.5],
	];

	return (
		<group>
			<mesh geometry={top} position={[0, 0.7, 0]} castShadow receiveShadow>
				<meshPhysicalMaterial {...LOOKS.ceramic('#ddd5c7')} />
			</mesh>
			{legs.map((position) => (
				<mesh key={position.join()} position={position} castShadow>
					<cylinderGeometry args={[0.03, 0.022, 0.66, 20]} />
					<meshStandardMaterial color="#26221e" roughness={0.45} metalness={0.5} />
				</mesh>
			))}
			<mesh geometry={vase} position={[-0.42, 0.745, -0.08]} castShadow receiveShadow>
				<meshPhysicalMaterial {...LOOKS.ceramic(accent)} />
			</mesh>
			<group position={[0.52, 0.745, 0.16]} rotation={[0, 0.3, 0]}>
				<mesh geometry={book} position={[0, 0.04, 0]} castShadow receiveShadow>
					<meshStandardMaterial color="#2f3f4c" roughness={0.7} />
				</mesh>
				<mesh
					geometry={book}
					position={[0.02, 0.115, 0.01]}
					rotation={[0, -0.22, 0]}
					scale={0.9}
					castShadow
					receiveShadow
				>
					<meshStandardMaterial color="#c9b78f" roughness={0.75} />
				</mesh>
			</group>
		</group>
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
					exposure: 1.5,
					bloom: 0.06,
					bloomThreshold: 2.2,
					bloomRadius: 0.35,
					vignette: 0.3,
					grain: 0.03,
				}}
			>
				<EnvLight preset="daylight" intensity={0.16} />
				{/* The warm ground colour stands in for sunlight bouncing off the floor. */}
				<hemisphereLight args={['#efe9df', '#dcc3a3', 0.42]} />
				{/* Soft glow from the window that falls off across the room. */}
				<pointLight position={[-1.6, 2.5, -0.4]} intensity={6} color="#e6eeff" />
				<SunLight
					position={[-11, 5.5, 3.2]}
					target={[0, 0, -0.5]}
					intensity={11}
					color="#ffe9cf"
					extent={8}
					mapSize={4096}
					blur={3}
					far={40}
				/>

				<Room wall={wall} />
				<SkyAndLeaves />
				<group position={[-0.9, 0, -0.7]} rotation={[0, 0.22, 0]}>
					<Table accent={accent} />
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
