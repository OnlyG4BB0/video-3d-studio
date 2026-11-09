import React from 'react';
import {AbsoluteFill} from 'remotion';
import {MathUtils} from 'three';
import {
	AuroraBackdrop,
	Cue,
	EnvLight,
	fitWidth,
	GlossyReflection,
	lensFov,
	LOOKS,
	PathCamera,
	scatter,
	ShotMusic,
	ShotProps,
	span,
	Stage,
	SunLight,
	useFontFile,
	useRadialFade,
	useScratchMap,
	useShot,
	useWord,
} from '../../kit';
import type {WordLayout} from '../../kit';

const STEEL = '#d7d9df';
const GOLD = '#e2b56c';
const DROP_HEIGHT = 7;
const DROP_SECONDS = 2.4;
const STAGGER = 0.15;
const LOWER_ROW_DELAY = 0.35;
const UPPER_ROW_DELAY = 1.25;

// The moment each letter first hits the floor, worked out from the same numbers
// as the animation, so that the sound lands exactly with the picture.
const landings = (count: number, delay: number, pitch: number, step: number, pan: number): Cue[] =>
	Array.from({length: count}, (_, index) => ({
		sound: 'clank',
		at: delay + index * STAGGER + DROP_SECONDS / 2.75,
		pitch: pitch + index * step,
		pan: pan + index * 0.19,
		amp: 0.2,
	}));

export const filmTitleDefaults: ShotProps & {music: ShotMusic} = {
	format: 'wide',
	seconds: 9,
	music: {
		mood: 'drone',
		cues: [...landings(6, LOWER_ROW_DELAY, 210, 12, -0.5), ...landings(7, UPPER_ROW_DELAY, 280, 15, -0.55)],
	},
};

// Falls and bounces, but never passes below the point where it lands.
const bounce = (x: number) => {
	const n = 7.5625;
	const d = 2.75;
	if (x < 1 / d) {
		return n * x * x;
	}
	if (x < 2 / d) {
		const t = x - 1.5 / d;
		return n * t * t + 0.75;
	}
	if (x < 2.5 / d) {
		const t = x - 2.25 / d;
		return n * t * t + 0.9375;
	}
	const t = x - 2.625 / d;
	return n * t * t + 0.984375;
};

const Row: React.FC<{
	word: WordLayout;
	scale: number;
	base: number;
	delay: number;
	seed: number;
	tint: (index: number) => string;
	castShadow: boolean;
}> = ({word, scale, base, delay, seed, tint, castShadow}) => {
	const {time} = useShot();
	const wear = useScratchMap({seed: 21, repeat: [0.7, 0.7]});
	return (
		<>
			{word.letters.map((letter) => {
				// One after another, so that only a letter or two is moving fast at once.
				const start = delay + letter.index * STAGGER + scatter(seed, letter.index) * 0.04;
				const t = MathUtils.clamp((time - start) / DROP_SECONDS, 0, 1);
				const fall = 1 - bounce(t);
				const tilt = (scatter(seed + 1, letter.index) - 0.5) * 0.6;
				return (
					<mesh
						key={letter.index}
						geometry={letter.geometry}
						position={[
							letter.x * scale,
							base + (letter.y - word.bottom) * scale + fall * DROP_HEIGHT,
							0,
						]}
						rotation={[fall * 0.5, 0, fall * tilt]}
						scale={scale}
						visible={time >= start}
						castShadow={castShadow}
						receiveShadow
					>
						<meshPhysicalMaterial
							{...LOOKS.brushedMetal(tint(letter.index))}
							roughness={0.34}
							roughnessMap={wear}
						/>
					</mesh>
				);
			})}
		</>
	);
};

export const ChapterTitle: React.FC = () => {
	const {aspect, progress, time} = useShot();
	const font = useFontFile();
	const options = {size: 1, depth: 0.6, bevel: 0.03, tracking: 0.03};
	const top = useWord(font, 'VIDEO 3D', options);
	const under = useWord(font, 'STUDIO', options);
	const ratio = under.width > 0 ? top.width / under.width : 1;
	const fov = lensFov(45, aspect);
	const distance = fitWidth(top.width, fov, aspect, 1.42);
	const gap = 0.05;
	const underHeight = under.height * ratio;
	const stack = underHeight + gap + top.height;
	const lightsUp = span(time, 1.6, 4, (t) => t * t * (3 - 2 * t));
	const floorFade = useRadialFade(0.28);

	if (!font) {
		return null;
	}

	const letters = (castShadow: boolean) => (
		<>
			<Row
				word={under}
				scale={ratio}
				base={0}
				delay={LOWER_ROW_DELAY}
				seed={2}
				tint={() => STEEL}
				castShadow={castShadow}
			/>
			<Row
				word={top}
				scale={1}
				base={underHeight + gap}
				delay={UPPER_ROW_DELAY}
				seed={5}
				tint={(index) => (index >= 5 ? GOLD : STEEL)}
				castShadow={castShadow}
			/>
		</>
	);

	return (
		<AbsoluteFill>
			<Stage
				background="#07080c"
				finish={{
					tone: 'neutral',
					bloom: 0.12,
					bloomThreshold: 1.5,
					bloomRadius: 0.5,
					contrast: 0.25,
					saturation: 1.06,
					vignette: 0.42,
					grain: 0.028,
					beams: {density: 0.0016, reach: distance * 2.2, anisotropy: 0.72},
					focus: {target: [0, stack * 0.5, 0.4], aperture: 0.03},
				}}
			>
				<AuroraBackdrop
					colors={['#050509', '#131320', '#3a2415']}
					intensity={0.3 + lightsUp * 0.3}
					seed={3}
				/>
				<EnvLight
					preset="showcase"
					intensity={0.45 + lightsUp * 0.65}
					diffuse={0.08}
					rotate={-30 + progress * 55}
				/>
				<SunLight
					position={[-2 + progress * 3, 4.2, -9]}
					target={[0, stack * 0.45, 0]}
					intensity={1 + lightsUp * 5}
					color="#ffd9a6"
					extent={Math.max(top.width * 0.85, 6)}
					softness={0.35}
					mapSize={4096}
					far={32}
				/>

				{letters(true)}
				<GlossyReflection gloss={0.08}>{letters(false)}</GlossyReflection>
				<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
					<circleGeometry args={[distance * 1.5, 96]} />
					<meshPhysicalMaterial
						color="#0a0b10"
						transparent
						alphaMap={floorFade}
						opacity={0.86}
						roughness={0.5}
						specularIntensity={0.12}
					/>
				</mesh>

				<PathCamera
					fov={fov}
					drift={0.018}
					keys={[
						{position: [-0.9, stack * 0.3, distance * 1.2], target: [0, stack * 0.48, 0]},
						{position: [0.5, stack * 0.42, distance], target: [0, stack * 0.52, 0]},
					]}
				/>
			</Stage>
		</AbsoluteFill>
	);
};
