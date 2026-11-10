import React, {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import type {Cue} from './film';
import {EASE, scatter, span, springAt} from './motion';
import {useShot} from './shot';
import {DEFAULT_FONT_FILE} from './text';

export const DISPLAY_FONT = '"Video3D Display", Helvetica, Arial, sans-serif';
export const BODY_FONT = 'Helvetica, Arial, sans-serif';
export const MONO_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace';

const FONTS = {display: DISPLAY_FONT, body: BODY_FONT, mono: MONO_FONT};

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

const DEFAULT_CPS = 14;

/**
 * When each character of a typed text appears, in seconds from the start. Pauses
 * after punctuation make it read like a person typing. tools/sound.mjs has the
 * same rule, so that a typing cue lands its keys on the letters.
 */
export const typeSchedule = (text: string, cps: number) => {
	const schedule: {char: string; at: number}[] = [];
	let at = 0;
	for (const char of text) {
		schedule.push({char, at});
		const pause = /[,;:]/.test(char) ? 3 : /[.!?]/.test(char) ? 5 : char === '\n' ? 4 : 0;
		at += (1 + pause) / cps;
	}
	return schedule;
};

/** The text without the *asterisks* that mark accented words. */
export const plainText = (text: string) => text.replaceAll('*', '');

/** A typing sound that lands on the letters of a `type` reveal: give it the same text, start and speed. */
export const typingCue = (text: string, at: number, cps = DEFAULT_CPS): Cue => ({
	sound: 'typing',
	at,
	text: plainText(text),
	cps,
});

/** Seconds that a `type` reveal takes to finish typing `text`. */
export const typingLength = (text: string, cps = DEFAULT_CPS) => {
	const schedule = typeSchedule(plainText(text), cps);
	return schedule.length === 0 ? 0 : schedule[schedule.length - 1].at + 1 / cps;
};

type Glyph = {
	char: string;
	accent: boolean;
	/** Position in the plain text, counting spaces and line breaks. */
	index: number;
	/** Position among the letters only. */
	letter: number;
	word: number;
	line: number;
};

const parse = (text: string) => {
	const lines: Glyph[][][] = [];
	let accent = false;
	let index = 0;
	let letter = 0;
	let word = -1;
	text.split('\n').forEach((lineText, line) => {
		const words: Glyph[][] = [];
		let current: Glyph[] | null = null;
		for (const char of lineText) {
			if (char === '*') {
				accent = !accent;
				continue;
			}
			if (char === ' ') {
				current = null;
				index++;
				continue;
			}
			if (!current) {
				current = [];
				words.push(current);
				word++;
			}
			current.push({char, accent, index, letter: letter++, word, line});
			index++;
		}
		lines.push(words);
		index++;
	});
	return lines;
};

const SCRAMBLE_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=<>/?';
const SCRAMBLE_LOWER = 'abcdefghjkmnpqrstuvwxyz0123456789#%&+=<>/?';

export type RevealEffect = 'rise' | 'fade' | 'pop' | 'type' | 'decode' | 'none';
export type TextPlace = 'center' | 'top' | 'bottom' | 'lower-left' | 'upper-left' | 'none';

export type TextRevealProps = {
	/** Use \n for a new line, and *asterisks* around words to colour them with `accent`. */
	text: string;
	/** Seconds into the shot when it starts to appear. */
	at?: number;
	/** Seconds into the shot when it starts to leave. Leave it out to keep it on screen. */
	until?: number;
	/**
	 * rise: letters slide up out of a mask. fade: words drift into focus. pop:
	 * letters spring up with a bounce. type: a typewriter with a cursor. decode:
	 * random characters settle into the text. none: no entrance.
	 */
	effect?: RevealEffect;
	/** What appears one after another. Each effect has a natural default. */
	by?: 'letter' | 'word' | 'line';
	/** Seconds between one piece and the next. */
	stagger?: number;
	/** Seconds each piece takes to arrive. */
	duration?: number;
	/** Characters per second for `type`. */
	cps?: number;
	font?: 'display' | 'body' | 'mono';
	/** Font size in pixels on a frame whose shorter side is 1080. */
	size?: number;
	weight?: number;
	color?: string;
	/** Colour of the words between *asterisks*, and of the typing cursor. */
	accent?: string;
	align?: 'left' | 'center' | 'right';
	/** Where on the frame. In 9:16 every place stays clear of the apps' buttons. */
	place?: TextPlace;
	/** Widest line, as a fraction of the frame's width. */
	maxWidth?: number;
	/** Extra space between letters, in em. */
	tracking?: number;
	lineHeight?: number;
	/** A soft shadow that keeps the text readable over a busy picture. */
	shadow?: boolean;
	/** Changes which random characters `decode` shows. */
	seed?: number;
	style?: React.CSSProperties;
};

/**
 * Animated text over the picture: titles, captions, quotes, calls to action.
 * Put it next to <Stage>, inside the scene's AbsoluteFill.
 */
export const TextReveal: React.FC<TextRevealProps> = ({
	text,
	at = 0.3,
	until,
	effect = 'rise',
	by,
	stagger,
	duration,
	cps = DEFAULT_CPS,
	font = 'display',
	size = 72,
	weight,
	color = '#f6f3ec',
	accent = '#ffb35c',
	align,
	place = 'center',
	maxWidth = 0.84,
	tracking = 0,
	lineHeight = 1.1,
	shadow = true,
	seed = 1,
	style,
}) => {
	useDisplayFont();
	const {time, frame, width, height, aspect} = useShot();
	const lines = useMemo(() => parse(text), [text]);
	const schedule = useMemo(() => (effect === 'type' ? typeSchedule(plainText(text), cps) : []), [effect, text, cps]);
	const tall = aspect < 1;
	const unit = Math.min(width, height) / 1080;
	const grouping = by ?? (effect === 'fade' ? 'word' : 'letter');
	const gap = stagger ?? (grouping === 'letter' ? 0.035 : grouping === 'word' ? 0.08 : 0.2);
	const take = duration ?? (effect === 'pop' ? 0.7 : effect === 'decode' ? 0.55 : 0.6);
	const perLetter = grouping === 'letter' || effect === 'type' || effect === 'decode';
	const side = align ?? (place === 'lower-left' || place === 'upper-left' ? 'left' : 'center');

	const order = (glyph: Glyph) => (grouping === 'letter' ? glyph.letter : grouping === 'word' ? glyph.word : glyph.line);
	const begin = (glyph: Glyph) => at + order(glyph) * gap;
	const leaving = (glyph: Glyph) => {
		if (until === undefined) {
			return 0;
		}
		const start = until + order(glyph) * gap * 0.5;
		return span(time, start, start + take * 0.8, EASE.depart);
	};

	// The typewriter's cursor sits after the last character typed so far.
	const typed = effect === 'type' ? schedule.filter((step) => time >= at + step.at).length : 0;
	let cursorAfter = typed - 1;
	while (cursorAfter >= 0 && /\s/.test(schedule[cursorAfter].char)) {
		cursorAfter--;
	}
	const firstLetter = lines.flat(2)[0]?.index ?? 0;
	const finished = effect === 'type' && typed === schedule.length;
	const doneAt = finished && schedule.length > 0 ? at + schedule[schedule.length - 1].at + 1 / cps : 0;
	const cursorOn =
		effect === 'type' &&
		(until === undefined || time < until) &&
		time >= at - 0.6 &&
		(!finished || Math.floor((time - doneAt) * 2.2) % 2 === 0);

	const cursor = (left: boolean) => (
		<span
			style={{
				position: 'absolute',
				left: left ? '-0.08em' : 'calc(100% + 0.06em)',
				top: '0.06em',
				width: '0.48em',
				height: '0.98em',
				background: accent,
				opacity: 0.9,
			}}
		/>
	);

	/** Style for one piece: a letter, or a whole word when the effect works word by word. */
	const pieceStyle = (glyph: Glyph): React.CSSProperties => {
		const out = leaving(glyph);
		const start = begin(glyph);
		if (effect === 'rise') {
			const p = span(time, start, start + take, EASE.swift);
			return {transform: `translateY(${(1 - p) * 108 - out * 108}%)`, opacity: p > 0 ? 1 : 0};
		}
		if (effect === 'fade') {
			const p = span(time, start, start + take, EASE.glide);
			return {
				opacity: p * (1 - out),
				filter: `blur(${((1 - p) * 10 + out * 6) * unit}px)`,
				transform: `translateY(${(1 - p) * 0.18}em)`,
			};
		}
		if (effect === 'pop') {
			const s = springAt(time - start, 'bouncy');
			return {
				opacity: Math.min(1, Math.max(0, (time - start) / 0.08)) * (1 - out),
				transform: `scale(${s * (1 - out * 0.4)})`,
				transformOrigin: '50% 70%',
			};
		}
		return {opacity: 1 - out};
	};

	const letterNode = (glyph: Glyph) => {
		const colour = glyph.accent ? accent : undefined;
		if (effect === 'type') {
			const shown = time >= at + (schedule[glyph.index]?.at ?? 0);
			return (
				<span
					key={glyph.index}
					style={{display: 'inline-block', position: 'relative', color: colour, ...pieceStyle(glyph)}}
				>
					<span style={{visibility: shown ? 'visible' : 'hidden'}}>{glyph.char}</span>
					{cursorOn && cursorAfter >= 0 && glyph.index === cursorAfter ? cursor(false) : null}
					{cursorOn && cursorAfter < 0 && glyph.index === firstLetter ? cursor(true) : null}
				</span>
			);
		}
		if (effect === 'decode') {
			const start = begin(glyph);
			const settled = time >= start + take;
			const started = time >= start;
			const pool = glyph.char === glyph.char.toLowerCase() ? SCRAMBLE_LOWER : SCRAMBLE_UPPER;
			const noise = pool[Math.floor(scatter(seed * 97 + Math.floor(frame / 2), glyph.index) * pool.length)];
			return (
				<span key={glyph.index} style={{display: 'inline-block', position: 'relative', ...pieceStyle(glyph)}}>
					<span style={{visibility: settled ? 'visible' : 'hidden', color: colour}}>{glyph.char}</span>
					{started && !settled ? (
						<span
							style={{
								position: 'absolute',
								left: 0,
								right: 0,
								textAlign: 'center',
								color: accent,
								opacity: 0.8,
							}}
						>
							{noise}
						</span>
					) : null}
				</span>
			);
		}
		return (
			<span key={glyph.index} style={{display: 'inline-block', color: colour, ...pieceStyle(glyph)}}>
				{glyph.char}
			</span>
		);
	};

	const wordNode = (glyphs: Glyph[], key: number) => {
		const mask: React.CSSProperties =
			effect === 'rise'
				? {overflow: 'hidden', padding: '0.1em 0.04em 0.16em', margin: '-0.1em -0.04em -0.16em', verticalAlign: 'top'}
				: {};
		if (perLetter) {
			return (
				<span key={key} style={{display: 'inline-block', whiteSpace: 'nowrap', ...mask}}>
					{glyphs.map(letterNode)}
				</span>
			);
		}
		// Whole words keep the font's kerning between their letters.
		const runs: {accent: boolean; text: string}[] = [];
		for (const glyph of glyphs) {
			const last = runs[runs.length - 1];
			if (last && last.accent === glyph.accent) {
				last.text += glyph.char;
			} else {
				runs.push({accent: glyph.accent, text: glyph.char});
			}
		}
		return (
			<span key={key} style={{display: 'inline-block', whiteSpace: 'nowrap', ...mask}}>
				<span style={{display: 'inline-block', ...pieceStyle(glyphs[0])}}>
					{runs.map((run, i) => (
						<span key={i} style={{color: run.accent ? accent : undefined}}>
							{run.text}
						</span>
					))}
				</span>
			</span>
		);
	};

	const block = (
		<div
			style={{
				fontFamily: FONTS[font],
				fontSize: size * unit,
				fontWeight: weight,
				lineHeight,
				letterSpacing: `${tracking}em`,
				marginRight: side === 'center' ? `${-tracking}em` : undefined,
				color,
				textAlign: side,
				maxWidth: maxWidth * width,
				textShadow: shadow ? `0 ${2 * unit}px ${26 * unit}px rgba(0,0,0,0.55)` : undefined,
				...style,
			}}
		>
			{lines.map((words, line) => (
				<div key={line}>
					{words.length === 0 ? ' ' : null}
					{words.map((glyphs, w) => (
						<React.Fragment key={w}>
							{w > 0 ? ' ' : null}
							{wordNode(glyphs, w)}
						</React.Fragment>
					))}
				</div>
			))}
		</div>
	);

	if (place === 'none') {
		return block;
	}
	const flexSide = side === 'left' ? 'flex-start' : side === 'right' ? 'flex-end' : 'center';
	const sideways = tall ? 70 * unit : 96 * unit;
	const placement: Record<Exclude<TextPlace, 'none'>, React.CSSProperties> = {
		center: {justifyContent: 'center', alignItems: flexSide, padding: `0 ${sideways}px`},
		top: {
			justifyContent: 'flex-start',
			alignItems: flexSide,
			padding: `${tall ? height * 0.15 : height * 0.09}px ${sideways}px 0`,
		},
		bottom: {
			justifyContent: 'flex-end',
			alignItems: flexSide,
			padding: `0 ${sideways}px ${tall ? height * 0.22 : height * 0.1}px`,
		},
		'lower-left': {
			justifyContent: 'flex-end',
			alignItems: 'flex-start',
			padding: tall ? `0 ${sideways}px ${height * 0.22}px` : `0 0 ${76 * unit}px ${sideways}px`,
		},
		'upper-left': {
			justifyContent: 'flex-start',
			alignItems: 'flex-start',
			padding: tall ? `${height * 0.15}px ${sideways}px 0` : `${76 * unit}px 0 0 ${sideways}px`,
		},
	};
	return <AbsoluteFill style={placement[place]}>{block}</AbsoluteFill>;
};
