import React, {useMemo, useRef} from 'react';
import {AbsoluteFill} from 'remotion';
import {Group} from 'three';
import {
	AuroraBackdrop,
	EnvLight,
	fitWidth,
	landing,
	lensFov,
	Letter,
	LOOKS,
	PathCamera,
	pointOnDisc,
	ShotProps,
	Stage,
	SunLight,
	useEachSample,
	useFontFile,
	useRadialFade,
	useScratchMap,
	useShot,
	useWord,
} from '../kit';

export type KineticTitleProps = ShotProps & {
	text: string;
	color: string;
	backdrop: string;
	fontFile?: string;
};

export const kineticTitleDefaults: KineticTitleProps = {
	format: 'wide',
	seconds: 5,
	text: 'STUDIO',
	color: '#d8b169',
	backdrop: '#0a0b10',
};

const STAGGER_SECONDS = 0.075;

// Letters are hinged at the floor and stand up one after another.
const Letters: React.FC<{
	letters: Letter[];
	bottom: number;
	color: string;
	castShadow: boolean;
}> = ({letters, bottom, color, castShadow}) => {
	const {frame, fps} = useShot();
	const wear = useScratchMap({seed: 21, repeat: [0.7, 0.7]});
	const look = useMemo(() => LOOKS.gold(color), [color]);
	return (
		<>
			{letters.map((letter) => {
				const rise = landing(
					frame,
					fps,
					0.2 + letter.index * STAGGER_SECONDS,
					'bouncy',
				);
				return (
					<group
						key={letter.index}
						position={[letter.x, 0, 0]}
						rotation={[(rise - 1) * Math.PI * 0.5, 0, 0]}
						visible={rise > 0.002}
					>
						<mesh
							geometry={letter.geometry}
							position={[0, letter.y - bottom, 0]}
							castShadow={castShadow}
							receiveShadow
						>
							<meshPhysicalMaterial {...look} roughness={0.3} roughnessMap={wear} />
						</mesh>
					</group>
				);
			})}
		</>
	);
};

/**
 * A mirrored copy that wobbles a little more the higher each point is. Averaged
 * over the samples, the reflection is sharp at the floor and melts away above it.
 */
const GlossyReflection: React.FC<{
	gloss: number;
	children: React.ReactNode;
}> = ({gloss, children}) => {
	const group = useRef<Group>(null);
	useEachSample(({pair}) => {
		const current = group.current;
		if (!current) {
			return;
		}
		const [u, v] = pair(41);
		const [x, z] = pointOnDisc(u, v);
		current.matrixAutoUpdate = false;
		current.matrix.set(1, -x * gloss, 0, 0, 0, -1, 0, 0, 0, -z * gloss, 1, 0, 0, 0, 0, 1);
		current.matrixWorldNeedsUpdate = true;
	});
	return <group ref={group}>{children}</group>;
};

export const KineticTitle: React.FC<KineticTitleProps> = ({
	text,
	color,
	backdrop,
	fontFile,
}) => {
	const {aspect, progress} = useShot();
	const font = useFontFile(fontFile);
	const word = useWord(font, text, {
		size: 1,
		depth: 0.26,
		bevel: 0.026,
		tracking: 0.04,
	});
	const fov = lensFov(50, aspect);
	// Short words are limited by height, so that their reflection stays in frame.
	const distance = Math.max(
		fitWidth(word.width, fov, aspect, 1.2),
		(word.height * 1.8) / Math.tan((fov * Math.PI) / 360),
	);
	const eye = word.height * 0.55;
	const floorFade = useRadialFade(0.3);

	if (!font) {
		return null;
	}

	return (
		<AbsoluteFill>
			<Stage
				background={backdrop}
				finish={{
					tone: 'neutral',
					bloom: 0.12,
					bloomThreshold: 1.5,
					bloomRadius: 0.5,
					contrast: 0.25,
					saturation: 1.08,
					vignette: 0.42,
					grain: 0.028,
					beams: {
						density: 0.004,
						reach: distance * 2.2,
						anisotropy: 0.72,
					},
					focus: {target: [0, eye, 0.2], aperture: 0.025},
				}}
			>
				<AuroraBackdrop
					colors={['#050509', '#17121f', '#3d2416']}
					intensity={0.8}
					seed={3}
				/>
				<EnvLight
					preset="showcase"
					intensity={1}
					diffuse={0.05}
					rotate={-24 + progress * 40}
				/>
				{/* Behind the letters: light streams between them towards the camera. */}
				<SunLight
					position={[-1.6, 3.4, -8]}
					target={[0, 0.5, 0]}
					intensity={7}
					color="#ffd9a6"
					extent={Math.max(word.width * 0.9, 5)}
					softness={0.35}
					mapSize={4096}
					far={30}
				/>

				<Letters
					letters={word.letters}
					bottom={word.bottom}
					color={color}
					castShadow
				/>
				<GlossyReflection gloss={0.09}>
					<Letters
						letters={word.letters}
						bottom={word.bottom}
						color={color}
						castShadow={false}
					/>
				</GlossyReflection>
				<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
					<circleGeometry args={[Math.max(word.width * 1.3, distance * 1.4), 96]} />
					<meshPhysicalMaterial
						color={backdrop}
						transparent
						alphaMap={floorFade}
						opacity={0.86}
						roughness={0.5}
						specularIntensity={0.12}
					/>
				</mesh>

				<PathCamera
					fov={fov}
					drift={0.015}
					keys={[
						{
							position: [-0.5, eye * 0.7, distance * 1.16],
							target: [0, eye * 0.95, 0],
						},
						{
							position: [0.25, eye * 0.85, distance],
							target: [0, eye, 0],
						},
					]}
				/>
			</Stage>
		</AbsoluteFill>
	);
};
