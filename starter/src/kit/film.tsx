import React from 'react';
import {AbsoluteFill, interpolate, Sequence, useCurrentFrame} from 'remotion';
import {EASE, span} from './motion';
import {DEFAULT_FPS, FormatName, FORMATS, ShotProps, useShot} from './shot';
import {BODY_FONT, TextReveal, useDisplayFont} from './type';

export type MoodName =
	| 'drone'
	| 'warm'
	| 'clockwork'
	| 'groove'
	| 'build'
	| 'dreamy'
	| 'drive'
	| 'resolve'
	| 'elegy'
	| 'lofi'
	| 'epic'
	| 'synthwave'
	| 'dnb'
	| 'halftime'
	| 'industrial'
	| 'acid'
	| 'ascent'
	| 'nightdrive'
	| 'anthem';

export type CueSound =
	| 'bell'
	| 'piano'
	| 'clank'
	| 'impact'
	| 'boom'
	| 'riser'
	| 'swell'
	| 'whoosh'
	| 'shimmer'
	| 'pop'
	| 'key'
	| 'typing'
	| 'tick'
	| 'kick'
	| 'snare'
	| 'taiko'
	| 'creak'
	| 'rain'
	| 'wind'
	| 'crickets'
	| 'engine'
	| 'starter'
	| 'beep'
	| 'crowd'
	| 'clunk';

/** A background sound under a whole chapter. */
export type Ambience = 'rain' | 'wind' | 'night' | 'vinyl';

/** What plays while this chapter dissolves in from the one before. */
export type Transition = 'whoosh' | 'impact' | 'swell' | 'none';

/** One sound placed at an exact moment, so that it lands with something on screen. */
export type Cue = {
	sound: CueSound;
	/** Seconds from the start of the chapter. */
	at?: number;
	/** Or a fraction of the chapter, 0 to 1, for things that scale with its length. */
	progress?: number;
	amp?: number;
	/** -1 is left, 1 is right. */
	pan?: number;
	/** bell, piano: the note, as a MIDI number. */
	note?: number;
	/** clank, pop: the pitch in Hz. */
	pitch?: number;
	/**
	 * riser, swell: how long it climbs, ending at `at`. whoosh: its length, loudest
	 * at `at`. rain, wind, crickets, shimmer: how long they last.
	 */
	length?: number;
	/** typing: the text being typed, so that there is one key per character. */
	text?: string;
	/** typing: characters per second, as given to the `type` reveal. */
	cps?: number;
	/** creak: true for the upward swing. */
	up?: boolean;
	/**
	 * engine: one car as a camera hears it, as values sampled `rate` times a
	 * second: revs, throttle (0 to 1), level, side (-1 left to 1 right), the
	 * seconds the sound takes to arrive (for the Doppler shift), tyre squeal,
	 * road noise and a formant scale below 1 for slowed-down sound.
	 */
	rate?: number;
	rpm?: number[];
	load?: number[];
	gain?: number[];
	side?: number[];
	delay?: number[];
	squeal?: number[];
	road?: number[];
	scale?: number[];
	/** engine: 0 to 1, how much of the valve train and gears is heard. */
	mech?: number;
	/** engine: crank turns at each control value, so the firings land exactly where the picture shows them. */
	turns?: number[];
	seed?: number;
};

export type ShotMusic = {
	mood: MoodName;
	cues?: Cue[];
	/** build, epic: when the big moment lands, as a fraction of the chapter. */
	hit?: number;
	ambience?: Ambience;
	/** In a film, the sound as this chapter dissolves in. The default is a soft whoosh. */
	transition?: Transition;
};

export type Chapter = {
	/** The scene's name in the film's `scenes`. */
	scene: string;
	seconds: number;
	/** Settings for this chapter, on top of the scene's defaults. */
	props?: Record<string, unknown>;
	music?: ShotMusic;
};

export type ChapterSlot = Chapter & {
	index: number;
	/** First frame of the chapter in the film. */
	from: number;
	frames: number;
	/** Seconds into the film at which the chapter starts. */
	start: number;
	/** Seconds until the next chapter starts. */
	length: number;
};

export type FilmProps = {
	format: FormatName;
	fps?: number;
	chapters: Chapter[];
	/** Seconds that each chapter takes to dissolve into the next. 0 is a hard cut. */
	dissolve?: number;
	/** Seconds of fading up from black at the start. */
	fadeIn?: number;
	/** Seconds of fading down to black at the end. */
	fadeOut?: number;
	/** Filled in by fitFilm, for the music tool. */
	timeline?: ChapterSlot[];
};

export type SceneEntry = {
	// Each scene has its own props, and a film only passes them through.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: React.ComponentType<any>;
	defaults: ShotProps & Record<string, unknown>;
	/**
	 * Works out the music from the shot's actual props, for sounds that must
	 * follow the picture, such as one key per typed letter.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	music?: (props: any) => ShotMusic;
};

/**
 * The music for a scene with given props: what the scene works out from its own
 * picture (such as one key per typed letter), with the mood and cues given here
 * on top. Anything given here wins, and both sets of cues play.
 */
export const sceneMusic = (
	entry: SceneEntry | undefined,
	props: Record<string, unknown>,
	given?: ShotMusic,
): ShotMusic | undefined => {
	const computed = entry?.music ? entry.music(props) : (props.music as ShotMusic | undefined);
	if (!computed) {
		return given;
	}
	if (!given) {
		return computed;
	}
	return {...computed, ...given, cues: [...(computed.cues ?? []), ...(given.cues ?? [])]};
};

/** A film whose chapters carry their scenes' own sounds, ready for fitFilm and the music tool. */
export const withSceneMusic = (props: FilmProps, scenes: Record<string, SceneEntry>): FilmProps => ({
	...props,
	chapters: props.chapters.map((chapter) => {
		const entry = scenes[chapter.scene];
		const music = sceneMusic(entry, {...entry?.defaults, ...chapter.props}, chapter.music);
		return music ? {...chapter, music} : chapter;
	}),
});

const DEFAULT_DISSOLVE = 0.8;

/** Where each chapter falls in the film. Neighbouring chapters overlap by the dissolve. */
export const filmTimeline = (
	{chapters, dissolve = DEFAULT_DISSOLVE}: Pick<FilmProps, 'chapters' | 'dissolve'>,
	fps: number,
): ChapterSlot[] => {
	if (chapters.length === 0) {
		throw new Error('A film needs at least one chapter.');
	}
	const fade = Math.round(dissolve * fps);
	let from = 0;
	return chapters.map((chapter, index) => {
		const frames = Math.round(chapter.seconds * fps);
		if (frames <= fade) {
			throw new Error(
				`Chapter "${chapter.scene}" lasts ${chapter.seconds} s, which is no longer than its ${dissolve} s dissolve.`,
			);
		}
		const isLast = index === chapters.length - 1;
		const slot: ChapterSlot = {
			...chapter,
			index,
			from,
			frames,
			start: from / fps,
			length: (isLast ? frames : frames - fade) / fps,
		};
		from += frames - fade;
		return slot;
	});
};

/** Remotion metadata callback for a film, in place of fitShot. */
export const fitFilm = ({props}: {props: FilmProps}) => {
	const size = FORMATS[props.format];
	if (!size) {
		throw new Error(
			`Unknown format "${props.format}". Use one of: ${Object.keys(FORMATS).join(', ')}`,
		);
	}
	const fps = props.fps ?? DEFAULT_FPS;
	const timeline = filmTimeline(props, fps);
	const last = timeline[timeline.length - 1];
	return {
		width: size.width,
		height: size.height,
		fps,
		durationInFrames: last.from + last.frames,
		props: {...props, timeline},
	};
};

const FadeIn: React.FC<{frames: number; children: React.ReactNode}> = ({
	frames,
	children,
}) => {
	const frame = useCurrentFrame();
	const opacity =
		frames === 0
			? 1
			: interpolate(frame, [0, frames], [0, 1], {
					extrapolateLeft: 'clamp',
					extrapolateRight: 'clamp',
				});
	return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};

const edgeFade = (frame: number, from: number, to: number, start: number, end: number) =>
	from === to
		? 0
		: interpolate(frame, [from, to], [start, end], {
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});

/**
 * Plays scenes one after another, each dissolving into the next. Inside a chapter
 * useShot() counts from the start of that chapter, so any scene works unchanged.
 */
export const Chapters: React.FC<FilmProps & {scenes: Record<string, SceneEntry>}> = ({
	scenes,
	chapters,
	dissolve = DEFAULT_DISSOLVE,
	fadeIn = 0.8,
	fadeOut = 1.2,
}) => {
	const {fps, frame, durationInFrames} = useShot();
	const fade = Math.round(dissolve * fps);
	const fadeInFrames = Math.round(fadeIn * fps);
	const fadeOutFrames = Math.round(fadeOut * fps);
	const blackout = Math.max(
		edgeFade(frame, 0, fadeInFrames, 1, 0),
		edgeFade(frame, durationInFrames - 1 - fadeOutFrames, durationInFrames - 1, 0, 1),
	);

	return (
		<AbsoluteFill style={{backgroundColor: '#000000'}}>
			{filmTimeline({chapters, dissolve}, fps).map((slot) => {
				const entry = scenes[slot.scene];
				if (!entry) {
					throw new Error(
						`No scene called "${slot.scene}". Available: ${Object.keys(scenes).join(', ')}`,
					);
				}
				const Scene = entry.component;
				return (
					<Sequence
						key={`${slot.index}-${slot.scene}`}
						name={slot.scene}
						from={slot.from}
						durationInFrames={slot.frames}
					>
						<FadeIn frames={slot.index === 0 ? 0 : fade}>
							<Scene {...entry.defaults} {...slot.props} />
						</FadeIn>
					</Sequence>
				);
			})}
			<AbsoluteFill style={{backgroundColor: '#000000', opacity: blackout}} />
		</AbsoluteFill>
	);
};

export type CaptionProps = {
	/** Small line above the title, such as a chapter number. */
	index?: string;
	title: string;
	note?: string;
	/** A short extra line shown only in vertical clips, such as where to find you. */
	footer?: string;
};

/**
 * A chapter title with one line of explanation, over a soft shade that keeps it
 * readable. The title rises letter by letter and the note drifts in word by
 * word. In 9:16 it sits clear of the buttons that phone apps put on top.
 */
export const Caption: React.FC<CaptionProps> = ({index, title, note, footer}) => {
	useDisplayFont();
	const {time, duration, width, height, aspect} = useShot();
	const tall = aspect < 1;
	const appear = tall ? 0.4 : 1;
	const enter = span(time, appear, appear + 0.7, EASE.arrive);
	const until = tall ? undefined : duration - 1.9;
	const leave = until === undefined ? 0 : span(time, until, until + 0.7, EASE.glide);
	const unit = tall ? width / 1080 : width / 1920;
	// TextReveal sizes text against the shorter side of the frame.
	const scale = unit / (Math.min(width, height) / 1080);
	return (
		<AbsoluteFill
			style={{
				justifyContent: 'flex-end',
				padding: tall
					? `0 ${70 * unit}px ${Math.round(height * 0.22)}px ${70 * unit}px`
					: `0 0 ${76 * unit}px ${96 * unit}px`,
			}}
		>
			<AbsoluteFill
				style={{
					opacity: enter * (1 - leave),
					background: tall
						? 'linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.45) 26%, rgba(0,0,0,0) 48%)'
						: 'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0) 36%)',
				}}
			/>
			<div style={{position: 'relative', color: '#f6f3ec'}}>
				{index ? (
					<TextReveal
						place="none"
						text={index}
						at={appear}
						until={until}
						effect="fade"
						font="body"
						size={22 * scale}
						tracking={0.32}
						align="left"
						style={{opacity: 0.78, marginBottom: 10 * unit}}
					/>
				) : null}
				<TextReveal
					place="none"
					text={title}
					at={appear + 0.08}
					until={until}
					effect="rise"
					stagger={0.035}
					font="display"
					size={78 * scale}
					tracking={0.02}
					lineHeight={1}
					align="left"
				/>
				{note ? (
					<TextReveal
						place="none"
						text={note}
						at={appear + 0.35}
						until={until}
						effect="fade"
						stagger={0.035}
						duration={0.5}
						font="body"
						size={(tall ? 36 : 29) * scale}
						lineHeight={1.25}
						align="left"
						maxWidth={tall ? 0.86 : 0.7}
						style={{marginTop: 16 * unit, opacity: 0.92}}
					/>
				) : null}
				{tall && footer ? (
					<div
						style={{
							fontFamily: BODY_FONT,
							fontSize: 28 * unit,
							color: '#ffc08a',
							marginTop: 22 * unit,
							opacity: enter,
							textShadow: '0 2px 26px rgba(0,0,0,0.6)',
						}}
					>
						{footer}
					</div>
				) : null}
			</div>
		</AbsoluteFill>
	);
};
