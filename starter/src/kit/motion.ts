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
	/** Arrives fast and settles with a little overshoot. Good for things popping into place. */
	overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
	/** A very fast start and a long, smooth stop. Good for titles and quick moves. */
	swift: Easing.bezier(0.19, 1, 0.22, 1),
	/** Falls and bounces to rest, never passing below where it lands. */
	bounce: (t: number) => {
		const n = 7.5625;
		const d = 2.75;
		if (t < 1 / d) {
			return n * t * t;
		}
		if (t < 2 / d) {
			const x = t - 1.5 / d;
			return n * x * x + 0.75;
		}
		if (t < 2.5 / d) {
			const x = t - 2.25 / d;
			return n * x * x + 0.9375;
		}
		const x = t - 2.625 / d;
		return n * x * x + 0.984375;
	},
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
	snappy: {stiffness: 260, damping: 24, mass: 0.9},
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

/**
 * The same spring as `landing`, worked out exactly at any moment rather than on
 * whole frames, so it works inside useMotion with motion blur. 0 until
 * `seconds` reaches 0, then on its way to 1.
 */
export const springAt = (seconds: number, feel: Feel = 'firm') => {
	if (seconds <= 0) {
		return 0;
	}
	const {stiffness, damping, mass} = FEEL[feel];
	const natural = Math.sqrt(stiffness / mass);
	const ratio = damping / (2 * Math.sqrt(stiffness * mass));
	if (ratio < 1) {
		const ringing = natural * Math.sqrt(1 - ratio * ratio);
		return (
			1 -
			Math.exp(-ratio * natural * seconds) *
				(Math.cos(ringing * seconds) + ((ratio * natural) / ringing) * Math.sin(ringing * seconds))
		);
	}
	if (ratio === 1) {
		return 1 - Math.exp(-natural * seconds) * (1 + natural * seconds);
	}
	const spread = natural * Math.sqrt(ratio * ratio - 1);
	const fast = -ratio * natural - spread;
	const slow = -ratio * natural + spread;
	return 1 + (fast * Math.exp(slow * seconds) - slow * Math.exp(fast * seconds)) / (slow - fast);
};

/** Progress of item `index` in a staggered sequence: each starts `stagger` seconds after the last. */
export const cascade = (
	time: number,
	index: number,
	{start = 0, stagger = 0.06, length = 0.6, easing = EASE.arrive}: {
		start?: number;
		stagger?: number;
		length?: number;
		easing?: (t: number) => number;
	} = {},
) => span(time, start + index * stagger, start + index * stagger + length, easing);

/** A keyframe: a time in seconds and the value at that time. */
export type Key = [time: number, value: number];

const smoothSlopes = (keys: Key[]) => {
	const count = keys.length;
	const steps = keys.slice(1).map(([time, value], i) => (value - keys[i][1]) / (time - keys[i][0]));
	const slopes = keys.map((_, i) =>
		i === 0 || i === count - 1 || steps[i - 1] * steps[i] <= 0 ? 0 : (steps[i - 1] + steps[i]) / 2,
	);
	// Fritsch-Carlson: keep every slope gentle enough that no segment overshoots.
	steps.forEach((step, i) => {
		if (step === 0) {
			slopes[i] = 0;
			slopes[i + 1] = 0;
			return;
		}
		const a = slopes[i] / step;
		const b = slopes[i + 1] / step;
		const size = a * a + b * b;
		if (size > 9) {
			const scale = 3 / Math.sqrt(size);
			slopes[i] = scale * a * step;
			slopes[i + 1] = scale * b * step;
		}
	});
	return slopes;
};

/**
 * A value that passes smoothly through keyframes, starting and stopping gently
 * and never overshooting between them. Before the first key and after the last
 * it holds still. Keys must be in time order.
 */
export const track = (time: number, keys: Key[]) => {
	if (keys.length === 0) {
		return 0;
	}
	if (keys.length === 1 || time <= keys[0][0]) {
		return keys[0][1];
	}
	const last = keys[keys.length - 1];
	if (time >= last[0]) {
		return last[1];
	}
	let i = 0;
	while (time > keys[i + 1][0]) {
		i++;
	}
	const slopes = smoothSlopes(keys);
	const [t0, v0] = keys[i];
	const [t1, v1] = keys[i + 1];
	const h = t1 - t0;
	const u = (time - t0) / h;
	const u2 = u * u;
	const u3 = u2 * u;
	return (
		(2 * u3 - 3 * u2 + 1) * v0 +
		(u3 - 2 * u2 + u) * h * slopes[i] +
		(-2 * u3 + 3 * u2) * v1 +
		(u3 - u2) * h * slopes[i + 1]
	);
};

/** One jolt of camera shake: when it happens, how hard and how long it takes to die away. */
export type Shake = {at: number; amount?: number; length?: number};

/**
 * Offset in world units for a camera shaken by impacts: a sharp jolt at each
 * `at` that dies away over `length` seconds. Time it from the same numbers as
 * the sound, so the two land together.
 */
export const shakeAt = (time: number, hits: Shake[], seed = 0): [number, number, number] => {
	let x = 0;
	let y = 0;
	let z = 0;
	hits.forEach((hit, i) => {
		const t = time - hit.at;
		const length = hit.length ?? 0.6;
		if (t < 0 || t > length) {
			return;
		}
		const size = (hit.amount ?? 0.04) * (1 - t / length) ** 2 * Math.min(1, t / 0.02);
		x += wobble(seed + i * 7 + 1, t, 9) * size;
		y += wobble(seed + i * 7 + 2, t, 11) * size;
		z += wobble(seed + i * 7 + 3, t, 8) * size * 0.5;
	});
	return [x, y, z];
};
