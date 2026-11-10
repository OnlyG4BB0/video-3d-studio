import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {Group, MathUtils, Texture} from 'three';
import {
	AuroraBackdrop,
	Cue,
	EASE,
	EnvLight,
	fitWidth,
	GlossyReflection,
	lensFov,
	Letter,
	LOOKS,
	MoodName,
	PathCamera,
	scatter,
	ShotMusic,
	ShotProps,
	springAt,
	Stage,
	SunLight,
	TextReveal,
	useFontFile,
	useMoving,
	useRadialFade,
	useScratchMap,
	useShot,
	useWord,
} from '../kit';

/** How the letters arrive: stand up from the floor, drop in and bounce, flip round, or grow. */
export type TitleReveal = 'stand' | 'drop' | 'flip' | 'grow';

export type KineticTitleProps = ShotProps & {
	text: string;
	color: string;
	backdrop: string;
	fontFile?: string;
	reveal?: TitleReveal;
	/** A line of normal text under the title, such as a date or a slogan. */
	subtitle?: string;
	/** The music's mood, when it is rendered with --music. */
	mood?: MoodName;
};

export const kineticTitleDefaults: KineticTitleProps = {
	format: 'wide',
	seconds: 5,
	text: 'STUDIO',
	color: '#d8b169',
	backdrop: '#0a0b10',
	reveal: 'stand',
};

const STAGGER_SECONDS = 0.075;
const FIRST_LETTER = 0.2;
const DROP_SECONDS = 1.7;

/** When a dropped letter first hits the floor. */
const landsAt = (index: number) => FIRST_LETTER + index * STAGGER_SECONDS + DROP_SECONDS / 2.75;

/**
 * The title's own sounds, worked out from its text: a clank for every dropped
 * letter and a deep hit under the last one, or a soft whoosh for the other reveals.
 */
export const kineticTitleMusic = (props: KineticTitleProps): ShotMusic => {
	const count = props.text.replace(/\s/g, '').length;
	const cues: Cue[] = [];
	if ((props.reveal ?? 'stand') === 'drop') {
		for (let index = 0; index < count; index++) {
			cues.push({
				sound: 'clank',
				at: landsAt(index),
				pitch: 200 + (index % 8) * 14,
				pan: count > 1 ? -0.5 + index / (count - 1) : 0,
				amp: 0.15,
			});
		}
		cues.push({sound: 'boom', at: landsAt(count - 1), amp: 0.32});
	} else {
		cues.push({sound: 'whoosh', at: FIRST_LETTER + 0.3, amp: 0.1, length: 1});
	}
	return {mood: props.mood ?? 'drone', cues};
};

/** When the last letter has finished arriving, for timing what comes after. */
export const titleSettles = (count: number, reveal: TitleReveal = 'stand') =>
	FIRST_LETTER + Math.max(0, count - 1) * STAGGER_SECONDS + (reveal === 'drop' ? DROP_SECONDS * 0.75 : 0.6);

// Each letter moves on its own, with motion blur, so a fast arrival smears as it would on camera.
const MovingLetter: React.FC<{
	letter: Letter;
	bottom: number;
	reveal: TitleReveal;
	dropHeight: number;
	look: ReturnType<typeof LOOKS.gold>;
	wear: Texture;
	castShadow: boolean;
}> = ({letter, bottom, reveal, dropHeight, look, wear, castShadow}) => {
	const delay = FIRST_LETTER + letter.index * STAGGER_SECONDS;
	const group = useMoving<Group>((object, time) => {
		const t = time - delay;
		if (reveal === 'drop') {
			const fall = 1 - EASE.bounce(MathUtils.clamp(t / DROP_SECONDS, 0, 1));
			object.position.set(letter.x, fall * dropHeight, 0);
			object.rotation.set(fall * 0.5, 0, fall * (scatter(9, letter.index) - 0.5) * 0.6);
			object.scale.setScalar(1);
			object.visible = t >= 0;
			return;
		}
		const p = springAt(t, reveal === 'flip' ? 'firm' : 'bouncy');
		object.position.set(letter.x, 0, 0);
		object.rotation.set(reveal === 'stand' ? (p - 1) * Math.PI * 0.5 : 0, reveal === 'flip' ? (1 - p) * Math.PI * 0.5 : 0, 0);
		object.scale.setScalar(reveal === 'grow' ? Math.max(p, 0.0001) : 1);
		object.visible = p > 0.002;
	});
	return (
		<group ref={group}>
			<mesh geometry={letter.geometry} position={[0, letter.y - bottom, 0]} castShadow={castShadow} receiveShadow>
				<meshPhysicalMaterial {...look} roughness={0.3} roughnessMap={wear} />
			</mesh>
		</group>
	);
};

// Letters are hinged at the floor, so they can stand up, flip round or grow from it.
const Letters: React.FC<{
	letters: Letter[];
	bottom: number;
	color: string;
	reveal: TitleReveal;
	dropHeight: number;
	castShadow: boolean;
}> = ({letters, bottom, color, reveal, dropHeight, castShadow}) => {
	const wear = useScratchMap({seed: 21, repeat: [0.7, 0.7]});
	const look = useMemo(() => LOOKS.gold(color), [color]);
	return (
		<>
			{letters.map((letter) => (
				<MovingLetter
					key={letter.index}
					letter={letter}
					bottom={bottom}
					reveal={reveal}
					dropHeight={dropHeight}
					look={look}
					wear={wear}
					castShadow={castShadow}
				/>
			))}
		</>
	);
};

export const KineticTitle: React.FC<KineticTitleProps> = ({
	text,
	color,
	backdrop,
	fontFile,
	reveal = 'stand',
	subtitle,
}) => {
	const {aspect, progress} = useShot();
	const font = useFontFile(fontFile);
	const word = useWord(font, text, {
		size: 1,
		depth: 0.26,
		bevel: 0.026,
		tracking: 0.04,
		// In 9:16 a long title wraps onto several lines rather than shrinking.
		maxWidth: aspect < 1 ? 4.2 : undefined,
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
				<AuroraBackdrop colors={['#050509', '#17121f', '#3d2416']} intensity={0.8} seed={3} />
				<EnvLight preset="showcase" intensity={1} diffuse={0.05} rotate={-24 + progress * 40} />
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
					reveal={reveal}
					dropHeight={word.height * 4}
					castShadow
				/>
				<GlossyReflection gloss={0.09}>
					<Letters
						letters={word.letters}
						bottom={word.bottom}
						color={color}
						reveal={reveal}
						dropHeight={word.height * 4}
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
					// A small jolt as the last dropped letter lands, in time with its deep hit.
					shake={reveal === 'drop' ? [{at: landsAt(word.letters.length - 1), amount: 0.035, length: 0.7}] : undefined}
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
			{subtitle ? (
				<TextReveal
					text={subtitle}
					at={titleSettles(word.letters.length, reveal) + 0.2}
					effect="fade"
					font="body"
					size={34}
					tracking={0.28}
					place="bottom"
				/>
			) : null}
		</AbsoluteFill>
	);
};
