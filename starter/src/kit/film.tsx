import React, {useEffect, useState} from 'react';
import {
	AbsoluteFill,
	cancelRender,
	continueRender,
	delayRender,
	interpolate,
	Sequence,
	staticFile,
	useCurrentFrame,
} from 'remotion';
import {EASE, span} from './motion';
import {DEFAULT_FPS, FormatName, FORMATS, ShotProps, useShot} from './shot';
import {DEFAULT_FONT_FILE} from './text';

export type MoodName =
	| 'drone'
	| 'warm'
	| 'clockwork'
	| 'groove'
	| 'build'
	| 'dreamy'
	| 'drive'
	| 'resolve';

export type CueSound = 'bell' | 'clank' | 'impact' | 'riser' | 'tick' | 'kick';

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
	/** bell: the note, as a MIDI number. */
	note?: number;
	/** clank: the ringing pitch in Hz. */
	pitch?: number;
	/** riser: how long it climbs, ending at `at`. */
	length?: number;
};

export type ShotMusic = {
	mood: MoodName;
	cues?: Cue[];
	/** build: when the big moment lands, as a fraction of the chapter. */
	hit?: number;
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
};

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

export const DISPLAY_FONT = '"Video3D Display", Helvetica, Arial, sans-serif';
export const BODY_FONT = 'Helvetica, Arial, sans-serif';

/** Holds the render until normal text can use the bundled display font. */
export const useDisplayFont = () => {
	const [handle] = useState(() => delayRender('Loading the display font'));
	useEffect(() => {
		new FontFace('Video3D Display', `url(${staticFile(DEFAULT_FONT_FILE)})`)
			.load()
			.then((loaded) => {
				document.fonts.add(loaded);
				continueRender(handle);
			})
			.catch(cancelRender);
	}, [handle]);
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
 * readable. In 9:16 it sits clear of the buttons that phone apps put on top.
 */
export const Caption: React.FC<CaptionProps> = ({index, title, note, footer}) => {
	useDisplayFont();
	const {time, duration, width, height, aspect} = useShot();
	const tall = aspect < 1;
	const enter = span(time, tall ? 0.4 : 1, tall ? 1.1 : 1.7, EASE.arrive);
	const leave = tall ? 0 : span(time, duration - 1.9, duration - 1.2, EASE.glide);
	const unit = tall ? width / 1080 : width / 1920;
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
			<div
				style={{
					position: 'relative',
					opacity: enter * (1 - leave),
					transform: `translateY(${(1 - enter) * 26 * unit}px)`,
					color: '#f6f3ec',
					textShadow: '0 2px 26px rgba(0,0,0,0.6)',
				}}
			>
				{index ? (
					<div
						style={{
							fontFamily: BODY_FONT,
							fontSize: 22 * unit,
							letterSpacing: '0.32em',
							opacity: 0.78,
							marginBottom: 10 * unit,
						}}
					>
						{index}
					</div>
				) : null}
				<div
					style={{
						fontFamily: DISPLAY_FONT,
						fontSize: 78 * unit,
						lineHeight: 1,
						letterSpacing: '0.02em',
					}}
				>
					{title}
				</div>
				{note ? (
					<div
						style={{
							fontFamily: BODY_FONT,
							fontSize: (tall ? 36 : 29) * unit,
							lineHeight: 1.25,
							marginTop: 16 * unit,
							opacity: 0.92,
						}}
					>
						{note}
					</div>
				) : null}
				{tall && footer ? (
					<div
						style={{
							fontFamily: BODY_FONT,
							fontSize: 28 * unit,
							color: '#ffc08a',
							marginTop: 22 * unit,
						}}
					>
						{footer}
					</div>
				) : null}
			</div>
		</AbsoluteFill>
	);
};
