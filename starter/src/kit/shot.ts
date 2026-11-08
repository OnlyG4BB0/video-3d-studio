import {useCurrentFrame, useVideoConfig} from 'remotion';

export const FORMATS = {
	vertical: {width: 1080, height: 1920},
	wide: {width: 1920, height: 1080},
	square: {width: 1080, height: 1080},
} as const;

export type FormatName = keyof typeof FORMATS;

export type ShotProps = {
	format: FormatName;
	seconds: number;
	fps?: number;
};

export const DEFAULT_FPS = 30;

/** Remotion metadata callback: turns a shot's props into its size and length. */
export const fitShot = ({props}: {props: ShotProps}) => {
	const size = FORMATS[props.format];
	if (!size) {
		throw new Error(
			`Unknown format "${props.format}". Use one of: ${Object.keys(FORMATS).join(', ')}`,
		);
	}
	const fps = props.fps ?? DEFAULT_FPS;
	return {
		width: size.width,
		height: size.height,
		fps,
		durationInFrames: Math.max(1, Math.round(props.seconds * fps)),
	};
};

/**
 * The clock of the shot. Anything that changes over time should be computed
 * from these values so that every frame can be rendered on its own.
 */
export const useShot = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames, width, height} = useVideoConfig();
	return {
		frame,
		fps,
		width,
		height,
		durationInFrames,
		aspect: width / height,
		/** Seconds since the start of the shot. */
		time: frame / fps,
		/** Length of the shot in seconds. */
		duration: durationInFrames / fps,
		/** 0 on the first frame, 1 on the last. */
		progress: durationInFrames > 1 ? frame / (durationInFrames - 1) : 0,
		/** 0 on the first frame, just below 1 on the last: use it for seamless loops. */
		loop: frame / durationInFrames,
	};
};
