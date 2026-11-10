import React from 'react';
import {AbsoluteFill} from 'remotion';
import {
	AuroraBackdrop,
	Cue,
	GradeName,
	MoodName,
	plainText,
	RevealEffect,
	ShotMusic,
	ShotProps,
	Stage,
	TextReveal,
	typingCue,
	typingLength,
	useShot,
} from '../kit';

export type TitleCardProps = ShotProps & {
	/** A small line above the title. */
	kicker?: string;
	/** The main text. Use \n for a new line and *asterisks* to colour words with the accent. */
	title: string;
	/** A line under the title. */
	note?: string;
	/** How the title appears: rise, fade, pop, type or decode. */
	effect: RevealEffect;
	/** The title's font. Without one, type and decode use a monospace font and the rest the display font. */
	font?: 'display' | 'body' | 'mono';
	accent: string;
	/** Three colours for the moving backdrop, from dark to light. */
	colors: [string, string, string];
	mood: MoodName;
	grade?: GradeName;
};

export const titleCardDefaults: TitleCardProps = {
	format: 'wide',
	seconds: 6,
	kicker: 'VIDEO 3D STUDIO',
	title: 'Every frame *written in code*',
	note: 'Motion blur, animated type and a new sound',
	effect: 'type',
	accent: '#ffb35c',
	colors: ['#05060b', '#141a33', '#3a2342'],
	mood: 'lofi',
};

const KICKER_AT = 0.3;
const TITLE_AT = 0.8;
const CPS = 16;
const POP_STAGGER = 0.12;

/** When the title has finished arriving. */
const titleDone = ({effect, title}: TitleCardProps) =>
	TITLE_AT + (effect === 'type' ? typingLength(title, CPS) : effect === 'pop' ? plainText(title).split(/\s+/).length * POP_STAGGER + 0.4 : 1.1);

/** Sounds that follow the title: a key per typed letter, a pop per word, a whoosh or a shimmer. */
export const titleCardMusic = (props: TitleCardProps): ShotMusic => {
	const cues: Cue[] = [];
	if (props.effect === 'type') {
		cues.push(typingCue(props.title, TITLE_AT, CPS));
	} else if (props.effect === 'pop') {
		plainText(props.title)
			.split(/\s+/)
			.forEach((_, index) => cues.push({sound: 'pop', at: TITLE_AT + index * POP_STAGGER, pitch: 760 + index * 60, amp: 0.1}));
	} else if (props.effect === 'decode') {
		cues.push({sound: 'shimmer', at: TITLE_AT, length: 1.2, amp: 0.035});
	} else if (props.effect === 'rise' || props.effect === 'fade') {
		cues.push({sound: 'whoosh', at: TITLE_AT + 0.25, amp: 0.09, length: 1});
	}
	return {mood: props.mood, cues};
};

/** A title, quote or call to action set in moving type over drifting colour. */
export const TitleCard: React.FC<TitleCardProps> = (props) => {
	const {kicker, title, note, effect, font, accent, colors, grade} = props;
	const {duration, aspect} = useShot();
	const leave = duration - 0.9;
	const titleFont = font ?? (effect === 'type' || effect === 'decode' ? 'mono' : 'display');
	return (
		<AbsoluteFill>
			<Stage background={colors[0]} finish={{tone: 'neutral', bloom: 0.1, vignette: 0.45, grain: 0.03, grade}}>
				<AuroraBackdrop colors={colors} intensity={0.9} speed={0.12} seed={7} />
			</Stage>
			<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: aspect < 1 ? '0 7%' : '0 9%'}}>
				<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
					{kicker ? (
						<TextReveal
							place="none"
							text={kicker}
							at={KICKER_AT}
							until={leave}
							effect="fade"
							font="body"
							weight={600}
							size={26}
							tracking={0.32}
							color={accent}
							style={{marginBottom: '1.2em'}}
						/>
					) : null}
					<TextReveal
						place="none"
						text={title}
						at={TITLE_AT}
						until={leave}
						effect={effect}
						by={effect === 'pop' ? 'word' : undefined}
						stagger={effect === 'pop' ? POP_STAGGER : undefined}
						cps={CPS}
						font={titleFont}
						size={titleFont === 'mono' ? 62 : 88}
						accent={accent}
						lineHeight={1.12}
						maxWidth={aspect < 1 ? 0.86 : 0.8}
					/>
					{note ? (
						<TextReveal
							place="none"
							text={note}
							at={titleDone(props) + 0.2}
							until={leave}
							effect="fade"
							font="body"
							size={32}
							maxWidth={aspect < 1 ? 0.86 : 0.7}
							style={{marginTop: '1.4em', opacity: 0.86}}
						/>
					) : null}
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
