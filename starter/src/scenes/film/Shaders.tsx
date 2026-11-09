import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {AbsoluteFill} from 'remotion';
import {InstancedMesh, Matrix4, Quaternion, Vector3} from 'three';
import {
	AuroraBackdrop,
	Caption,
	EnvLight,
	fitDistance,
	lensFov,
	LOOKS,
	OrbitCamera,
	scatter,
	ShotMusic,
	ShotProps,
	Stage,
	SunLight,
	useLiquidMaterial,
	useShot,
} from '../../kit';
import {FOOTER} from './common';

export const filmShadersDefaults: ShotProps & {music: ShotMusic} = {
	format: 'wide',
	seconds: 11,
	music: {mood: 'dreamy'},
};

const DROPS = 2200;
const BANDS = [
	{inner: 2.15, outer: 2.6},
	{inner: 2.75, outer: 3.3},
	{inner: 3.45, outer: 3.6},
];

const Rings: React.FC = () => {
	const {time} = useShot();
	const mesh = useRef<InstancedMesh>(null);
	const drops = useMemo(
		() =>
			Array.from({length: DROPS}, (_, index) => {
				const band = BANDS[Math.min(BANDS.length - 1, Math.floor(scatter(3, index) * 3.2))];
				const radius = band.inner + scatter(4, index) * (band.outer - band.inner);
				return {
					radius,
					phase: scatter(5, index) * Math.PI * 2,
					height: (scatter(6, index) - 0.5) * 0.07,
					size: 0.012 + Math.pow(scatter(7, index), 3) * 0.05,
				};
			}),
		[],
	);
	const matrix = useMemo(() => new Matrix4(), []);
	const rotation = useMemo(() => new Quaternion(), []);

	useLayoutEffect(() => {
		const current = mesh.current;
		if (!current) {
			return;
		}
		const position = new Vector3();
		const scale = new Vector3();
		drops.forEach((drop, index) => {
			const angle = drop.phase + time * (0.9 / Math.pow(drop.radius, 1.5));
			position.set(
				Math.cos(angle) * drop.radius,
				drop.height + Math.sin(time * 0.7 + drop.phase * 3) * 0.015,
				Math.sin(angle) * drop.radius,
			);
			scale.setScalar(drop.size);
			matrix.compose(position, rotation, scale);
			current.setMatrixAt(index, matrix);
		});
		current.instanceMatrix.needsUpdate = true;
	});

	const look = useMemo(() => LOOKS.chrome('#f4d7b0'), []);
	return (
		<instancedMesh ref={mesh} args={[undefined, undefined, DROPS]} castShadow frustumCulled={false}>
			<sphereGeometry args={[1, 18, 14]} />
			<meshPhysicalMaterial {...look} roughness={0.12} />
		</instancedMesh>
	);
};

export const ChapterShaders: React.FC = () => {
	const {aspect, progress} = useShot();
	const liquid = useLiquidMaterial(LOOKS.oilSlick('#eef0f6'), {
		amplitude: 0.5,
		frequency: 1.25,
		speed: 0.26,
	});
	const fov = lensFov(60, aspect);
	const distance = fitDistance(2.5, fov, aspect, 1);

	return (
		<AbsoluteFill>
			<Stage
				background="#03040a"
				finish={{
					tone: 'aces',
					highlightLimit: 3.2,
					bloom: 0.2,
					bloomThreshold: 1.25,
					bloomRadius: 0.6,
					contrast: 0.2,
					saturation: 1.18,
					vignette: 0.42,
					grain: 0.025,
					fringe: 0.0014,
					focus: {target: [0, 0, 1.4], aperture: 0.07},
				}}
			>
				<AuroraBackdrop colors={['#02040a', '#08243c', '#5a1c6a']} intensity={0.85} speed={0.14} seed={14} />
				<EnvLight preset="neon" intensity={1.25} diffuse={0.08} rotate={progress * 120} />
				<SunLight
					position={[-7, 2.4, 6]}
					target={[0, 0, 0]}
					intensity={2.4}
					color="#ffe2c4"
					extent={5}
					softness={0.5}
					mapSize={4096}
					far={26}
				/>
				<mesh
					material={liquid.material}
					customDepthMaterial={liquid.depthMaterial}
					castShadow
					receiveShadow
				>
					<icosahedronGeometry args={[1.4, 120]} />
				</mesh>
				<group rotation={[0.34, 0, -0.2]}>
					<Rings />
				</group>
				<OrbitCamera
					distance={distance * 1.08}
					endDistance={distance * 0.84}
					height={distance * 0.17}
					fromDeg={-46}
					toDeg={24}
					fov={fov}
					drift={0.015}
				/>
			</Stage>
			<Caption footer={FOOTER} index="05" title="SHADERS" note="A liquid metal surface computed on the graphics card, ringed by 2,200 droplets" />
		</AbsoluteFill>
	);
};
