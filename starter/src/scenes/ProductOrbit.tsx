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
	Stage,
	SunLight,
	useLathe,
	useModelFile,
	useNoiseTexture,
	useShot,
} from '../kit';

export type ProductOrbitProps = ShotProps & {
	color: string;
	backdrop: string;
	/** A .glb in public/. Without one, the placeholder flask is shown. */
	modelFile?: string;
};

export const productOrbitDefaults: ProductOrbitProps = {
	format: 'vertical',
	seconds: 6,
	color: '#1f4e46',
	backdrop: '#d6cfc2',
};

// The product is a stand-in: replace <Flask /> with the object in the brief.
const Flask: React.FC<{color: string}> = ({color}) => {
	const coating = useNoiseTexture({seed: 4, repeat: [14, 20], periods: [64, 128]});
	const body = useLathe([
		[0, 0],
		[0.46, 0, 0.05],
		[0.46, 1.72, 0.03],
		[0.35, 2.02, 0.14],
		[0.34, 2.1, 0.02],
		[0, 2.1],
	]);
	const seal = useLathe([
		[0, 2.08],
		[0.352, 2.08, 0.008],
		[0.352, 2.15, 0.008],
		[0, 2.15],
	]);
	const cap = useLathe([
		[0, 2.14],
		[0.362, 2.14, 0.012],
		[0.362, 2.56, 0.05],
		[0, 2.6],
	]);
	const foot = useLathe([
		[0, 0],
		[0.472, 0, 0.03],
		[0.472, 0.2, 0.012],
		[0, 0.2],
	]);

	return (
		<group>
			<mesh geometry={body} castShadow receiveShadow>
				<meshPhysicalMaterial
					{...LOOKS.powderCoat(color)}
					roughness={0.44}
					bumpMap={coating}
					bumpScale={0.35}
				/>
			</mesh>
			<mesh geometry={foot} castShadow receiveShadow>
				<meshPhysicalMaterial {...LOOKS.rubber('#191a1c')} />
			</mesh>
			<mesh geometry={seal}>
				<meshPhysicalMaterial {...LOOKS.rubber('#111214')} />
			</mesh>
			<mesh geometry={cap} castShadow receiveShadow>
				<meshPhysicalMaterial {...LOOKS.brushedMetal('#d7d7da')} />
			</mesh>
		</group>
	);
};

const Plinth: React.FC = () => {
	const surface = useNoiseTexture({seed: 12, repeat: [3, 2]});
	const geometry = useLathe([
		[0, 0],
		[1.05, 0, 0.01],
		[1.05, 0.34, 0.03],
		[0, 0.34],
	]);
	return (
		<mesh geometry={geometry} castShadow receiveShadow>
			<meshPhysicalMaterial
				{...LOOKS.stone('#8d867b')}
				bumpMap={surface}
				bumpScale={0.6}
			/>
		</mesh>
	);
};

export const ProductOrbit: React.FC<ProductOrbitProps> = ({
	color,
	backdrop,
	modelFile,
}) => {
	const {aspect} = useShot();
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
					vignette: 0.3,
					grain: 0.025,
					focus: {target: [0, 1.4, 0.4], aperture: 0.0016, maxBlur: 0.006},
				}}
			>
				<EnvLight preset="studio" intensity={0.42} />
				<SunLight
					position={[-4, 7.5, 4.5]}
					target={[0, 0.8, 0]}
					intensity={1.5}
					color="#fff4e6"
					extent={5}
					blur={6}
				/>
				<Cyclorama color={backdrop} />
				<Plinth />
				<group position={[0, 0.34, 0]}>
					{model ? <primitive object={model} /> : <Flask color={color} />}
				</group>
				<OrbitCamera
					target={[0, 1.42, 0]}
					distance={distance * 1.06}
					endDistance={distance * 0.98}
					height={0.75}
					fromDeg={-32}
					toDeg={26}
					fov={fov}
					drift={0.012}
				/>
			</Stage>
		</AbsoluteFill>
	);
};
