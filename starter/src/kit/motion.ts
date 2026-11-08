import {Easing, interpolate, spring} from 'remotion';

export const EASE = {
	/** Starts and stops gently. The default for camera moves. */
	glide: Easing.bezier(0.45, 0, 0.3, 1),
	/** Quick start, long settle. Good for things arriving on screen. */
	arrive: Easing.bezier(0.16, 1, 0.3, 1),
	/** Slow start, quick exit. Good for things leaving. */
	depart: Easing.bezier(0.7, 0, 0.84, 0),
	/** Constant speed. Good for turntables and loops. */
	steady: (t: number) => t,
};

/** 0 before `start`, 1 after `end`, eased in between. Times are in seconds. */
export const span = (
	time: number,
	start: number,
	end: number,
	easing: (t: number) => number = EASE.glide,
) =>
	interpolate(time, [start, end], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
		easing,
	});

const FEEL = {
	firm: {stiffness: 140, damping: 20, mass: 1},
	soft: {stiffness: 60, damping: 18, mass: 1.2},
	bouncy: {stiffness: 170, damping: 11, mass: 0.8},
};

export type Feel = keyof typeof FEEL;

/** Spring from 0 to 1 that starts after `delay` seconds and may overshoot. */
export const landing = (
	frame: number,
	fps: number,
	delay: number,
	feel: Feel = 'firm',
) =>
	spring({
		frame: frame - Math.round(delay * fps),
		fps,
		config: FEEL[feel],
	});

const lattice = (seed: number, index: number) => {
	const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
	return (value - Math.floor(value)) * 2 - 1;
};

const smoothNoise = (seed: number, x: number) => {
	const index = Math.floor(x);
	const f = x - index;
	const u = f * f * f * (f * (f * 6 - 15) + 10);
	return lattice(seed, index) * (1 - u) + lattice(seed, index + 1) * u;
};

/**
 * Smooth pseudo-random value in about -1..1. The same seed and time always give
 * the same result, which keeps renders repeatable. Never use Math.random in a scene.
 */
export const wobble = (seed: number, time: number, speed = 0.3) =>
	smoothNoise(seed, time * speed) * 0.7 +
	smoothNoise(seed + 19, time * speed * 2.4082 + 3.3272) * 0.3;

/** Repeatable random number in 0..1 for placing things. */
export const scatter = (seed: number, index: number) =>
	(lattice(seed, index) + 1) / 2;
