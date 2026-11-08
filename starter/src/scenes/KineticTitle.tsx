import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {
	EnvLight,
	fitWidth,
	landing,
	lensFov,
	Letter,
	LOOKS,
	PathCamera,
	ShotProps,
	Stage,
	SunLight,
	useFontFile,
	useRadialFade,
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
	backdrop: '#0d0e13',
};

const STAGGER_SECONDS = 0.075;

// Letters are hinged at the floor and stand up one after another.
const Letters: React.FC<{
	letters: Letter[];
	bottom: number;
	color: string;
}> = ({letters, bottom, color}) => {
	const {frame, fps} = useShot();
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
							castShadow
							receiveShadow
						>
							<meshPhysicalMaterial {...look} />
						</mesh>
					</group>
				);
			})}
		</>
	);
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
		bevel: 0.02,
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
					bloom: 0.14,
					bloomThreshold: 1.5,
					bloomRadius: 0.5,
					vignette: 0.4,
					grain: 0.03,
				}}
			>
				<EnvLight preset="showcase" intensity={1} rotate={-24 + progress * 40} />
				<SunLight
					position={[-3, 6, 7]}
					target={[0, 0.3, 0]}
					intensity={1.3}
					color="#ffe6c7"
					extent={Math.max(word.width, 5)}
					blur={5}
				/>

				<Letters letters={word.letters} bottom={word.bottom} color={color} />

				{/* Mirrored copy under a translucent floor: a cheap, sharp reflection. */}
				<group scale={[1, -1, 1]}>
					<Letters letters={word.letters} bottom={word.bottom} color={color} />
				</group>
				<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
					<circleGeometry args={[word.width * 1.3, 96]} />
					<meshPhysicalMaterial
						color={backdrop}
						transparent
						alphaMap={floorFade}
						opacity={0.9}
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
