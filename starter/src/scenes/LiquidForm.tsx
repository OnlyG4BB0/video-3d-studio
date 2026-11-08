import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {
	AuroraBackdrop,
	EnvLight,
	fitDistance,
	lensFov,
	LookName,
	LOOKS,
	OrbitCamera,
	scatter,
	ShotProps,
	Stage,
	SunLight,
	useLiquidMaterial,
	useShot,
	wobble,
} from '../kit';

export type LiquidFormProps = ShotProps & {
	/** Any look from the kit. chrome-like and iridescent ones suit it best. */
	look: LookName;
};

export const liquidFormDefaults: LiquidFormProps = {
	format: 'square',
	seconds: 6,
	look: 'oilSlick',
};

const Droplets: React.FC<{look: LookName}> = ({look}) => {
	const {time} = useShot();
	const material = useMemo(() => LOOKS[look](), [look]);
	const drops = useMemo(
		() =>
			Array.from({length: 9}, (_, index) => ({
				index,
				radius: 0.05 + scatter(2, index) * 0.11,
				orbit: 1.75 + scatter(3, index) * 0.75,
				height: (scatter(4, index) - 0.5) * 1.8,
				phase: scatter(5, index) * Math.PI * 2,
				speed: 0.12 + scatter(6, index) * 0.1,
			})),
		[],
	);
	return (
		<>
			{drops.map((drop) => {
				const angle = drop.phase + time * drop.speed;
				return (
					<mesh
						key={drop.index}
						position={[
							Math.cos(angle) * drop.orbit,
							drop.height + wobble(drop.index, time, 0.25) * 0.12,
							Math.sin(angle) * drop.orbit,
						]}
						castShadow
					>
						<sphereGeometry args={[drop.radius, 48, 32]} />
						<meshPhysicalMaterial {...material} />
					</mesh>
				);
			})}
		</>
	);
};

export const LiquidForm: React.FC<LiquidFormProps> = ({look}) => {
	const {aspect, progress} = useShot();
	const liquid = useLiquidMaterial(LOOKS[look](), {
		amplitude: 0.62,
		frequency: 1.15,
		speed: 0.2,
	});
	const fov = lensFov(70, aspect);
	const distance = fitDistance(1.55, fov, aspect, 1.12);

	return (
		<AbsoluteFill>
			<Stage
				background="#04040a"
				finish={{
					tone: 'aces',
					highlightLimit: 3,
					bloom: 0.16,
					bloomThreshold: 1.4,
					bloomRadius: 0.6,
					contrast: 0.2,
					saturation: 1.15,
					vignette: 0.42,
					grain: 0.025,
					fringe: 0.0012,
					focus: {target: [0, 0, 1.15], aperture: 0.04},
				}}
			>
				<AuroraBackdrop
					colors={['#03030a', '#14103a', '#47206a']}
					intensity={0.9}
					speed={0.12}
					seed={8}
				/>
				<EnvLight preset="neon" intensity={1.2} rotate={progress * 60} />
				<SunLight
					position={[3, 6, 5]}
					intensity={1.5}
					extent={4}
					softness={0.8}
					far={24}
				/>
				<mesh
					material={liquid.material}
					customDepthMaterial={liquid.depthMaterial}
					castShadow
					receiveShadow
				>
					<icosahedronGeometry args={[1, 96]} />
				</mesh>
				<Droplets look={look} />
				<OrbitCamera
					distance={distance * 1.05}
					endDistance={distance * 0.97}
					height={distance * 0.1}
					fromDeg={-18}
					toDeg={18}
					fov={fov}
					drift={0.012}
				/>
			</Stage>
		</AbsoluteFill>
	);
};
