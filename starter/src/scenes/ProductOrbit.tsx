import type * as opentype from 'opentype.js';
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {
	Cyclorama,
	EnvLight,
	fitDistance,
	lensFov,
	LOOKS,
	OrbitCamera,
	ShotProps,
	SkyLight,
	Stage,
	SunLight,
	useBrushedMap,
	useFontFile,
	useLathe,
	useModelFile,
	useNoiseTexture,
	usePrintMap,
	useRidgeMap,
	useScratchMap,
	useShot,
	useSpeckleMap,
} from '../kit';

export type ProductOrbitProps = ShotProps & {
	color: string;
	backdrop: string;
	/** Name printed on the placeholder flask. */
	brand: string;
	/** A .glb in public/. Without one, the placeholder flask is shown. */
	modelFile?: string;
};

export const productOrbitDefaults: ProductOrbitProps = {
	format: 'vertical',
	seconds: 6,
	color: '#1f4e46',
	backdrop: '#cfc7b8',
	brand: 'NORDA',
};

// The product is a stand-in: replace <Flask /> with the object in the brief.
const Flask: React.FC<{
	color: string;
	brand: string;
	font: opentype.Font | null;
}> = ({color, brand, font}) => {
	const coating = useNoiseTexture({seed: 4, repeat: [24, 24], periods: [64, 128]});
	const wear = useScratchMap({seed: 8, repeat: [1, 1], amount: 0.7});
	const brushed = useBrushedMap({repeat: [1, 3]});
	const grip = useRidgeMap(96);
	const rubber = useNoiseTexture({seed: 6, repeat: [40, 40], periods: [128]});
	const print = usePrintMap(font, [
		{text: brand, size: 0.05, y: 0.5, tracking: 0.3},
		{text: 'INSULATED STEEL  750 ML', size: 0.0115, y: 0.532, tracking: 0.3},
	]);

	const body = useLathe([
		[0, 0.18],
		[0.462, 0.18, 0.01],
		[0.462, 1.72, 0.03],
		[0.352, 2.0, 0.17],
		[0.34, 2.08, 0.015],
		[0, 2.08],
	]);
	const foot = useLathe(
		[
			[0, 0],
			[0.452, 0, 0.03],
			[0.474, 0.02, 0.02],
			[0.474, 0.16, 0.01],
			[0.466, 0.2, 0.012],
			[0, 0.2],
		],
		{steps: 10},
	);
	const collar = useLathe([
		[0, 2.06],
		[0.348, 2.06, 0.006],
		[0.348, 2.1, 0.006],
		[0, 2.1],
	]);
	const seal = useLathe([
		[0, 2.095],
		[0.338, 2.095, 0.006],
		[0.338, 2.135, 0.006],
		[0, 2.135],
	]);
	const capBand = useLathe([
		[0, 2.13],
		[0.366, 2.13, 0.012],
		[0.366, 2.36, 0.008],
		[0, 2.36],
	]);
	const capTop = useLathe(
		[
			[0, 2.355],
			[0.352, 2.355, 0.005],
			[0.358, 2.5, 0.07],
			[0.26, 2.535, 0.03],
			[0.255, 2.525, 0.006],
			[0, 2.525],
		],
		{steps: 12},
	);

	return (
		<group>
			<mesh geometry={body} castShadow receiveShadow>
				<meshPhysicalMaterial
					{...LOOKS.powderCoat(color)}
					roughness={0.5}
					clearcoat={0.3}
					clearcoatRoughness={0.38}
					bumpMap={coating}
					bumpScale={0.4}
				/>
			</mesh>

			{/* The printed name: a thin sleeve just above the coating. */}
			<mesh position={[0, 1.02, 0]} rotation={[0, Math.PI, 0]}>
				<cylinderGeometry args={[0.4632, 0.4632, 0.96 * 3, 160, 1, true]} />
				<meshPhysicalMaterial
					map={print}
					transparent
					roughness={0.45}
					depthWrite={false}
				/>
			</mesh>

			<mesh geometry={foot} castShadow receiveShadow>
				<meshPhysicalMaterial
					{...LOOKS.rubber('#17181a')}
					bumpMap={rubber}
					bumpScale={0.25}
				/>
			</mesh>
			<mesh geometry={collar} castShadow>
				<meshPhysicalMaterial {...LOOKS.brushedMetal('#cfcfd3')} roughnessMap={brushed} />
			</mesh>
			<mesh geometry={seal}>
				<meshPhysicalMaterial {...LOOKS.rubber('#101113')} />
			</mesh>
			<mesh geometry={capBand} castShadow receiveShadow>
				<meshPhysicalMaterial
					{...LOOKS.brushedMetal('#d9d9dd')}
					bumpMap={grip}
					bumpScale={1.4}
					roughnessMap={wear}
				/>
			</mesh>
			<mesh geometry={capTop} castShadow receiveShadow>
				<meshPhysicalMaterial {...LOOKS.brushedMetal('#e0e0e4')} roughnessMap={brushed} />
			</mesh>
		</group>
	);
};

const Plinth: React.FC = () => {
	const terrazzo = useSpeckleMap({
		base: '#a8a194',
		flecks: ['#5f594f', '#d7d1c4', '#39362f', '#8c6f58'],
		density: 1500,
		maxSize: 11,
		repeat: [2, 2],
	});
	const surface = useNoiseTexture({seed: 12, repeat: [6, 6], periods: [32, 64, 128]});
	const geometry = useLathe(
		[
			[0, 0],
			[1.05, 0, 0.01],
			[1.05, 0.34, 0.035],
			[0, 0.34],
		],
		{steps: 12},
	);
	return (
		<mesh geometry={geometry} castShadow receiveShadow>
			<meshPhysicalMaterial
				map={terrazzo}
				roughness={0.42}
				clearcoat={0.25}
				clearcoatRoughness={0.3}
				bumpMap={surface}
				bumpScale={0.25}
			/>
		</mesh>
	);
};

export const ProductOrbit: React.FC<ProductOrbitProps> = ({
	color,
	backdrop,
	brand,
	modelFile,
}) => {
	const {aspect} = useShot();
	const font = useFontFile();
	const model = useModelFile(modelFile, 2.6);
	const fov = lensFov(70, aspect);
	// Tall frames are limited by the plinth's width, the others by the bottle's height.
	const distance = fitDistance(aspect < 1 ? 1.2 : 1.75, fov, aspect, 1.1);

	return (
		<AbsoluteFill>
			<Stage
				background={backdrop}
				finish={{
					tone: 'neutral',
					bloom: 0.05,
					bloomThreshold: 1.6,
					contrast: 0.2,
					saturation: 1.05,
					warmth: 0.012,
					vignette: 0.3,
					grain: 0.022,
					focus: {target: [0, 1.4, 0.45], aperture: 0.05},
				}}
			>
				<EnvLight preset="studio" intensity={1} diffuse={0.07} />
				<SkyLight intensity={1.5} centre={[0, 1, 0]} extent={7} />
				<SunLight
					position={[-4, 7.5, 4.5]}
					target={[0, 0.8, 0]}
					intensity={1.25}
					color="#fff1e0"
					extent={5}
					softness={1.1}
				/>
				<Cyclorama color={backdrop} />
				<Plinth />
				<group position={[0, 0.34, 0]}>
					{model ? (
						<primitive object={model} />
					) : (
						<Flask color={color} brand={brand} font={font} />
					)}
				</group>
				<OrbitCamera
					target={[0, 1.42, 0]}
					distance={distance * 1.06}
					endDistance={distance * 0.98}
					height={distance * 0.12}
					fromDeg={-32}
					toDeg={26}
					fov={fov}
					drift={0.012}
				/>
			</Stage>
		</AbsoluteFill>
	);
};
