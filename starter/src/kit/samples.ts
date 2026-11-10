import {createContext, useContext, useLayoutEffect, useRef} from 'react';
import type {DirectionalLight, Group, Object3D} from 'three';
import {useShot} from './shot';

/**
 * Each video frame is drawn many times with small variations (light position,
 * lens position, sub-pixel offset, moment within the shutter) and averaged. Those
 * variations are what turn hard computer-graphics edges into soft shadows, real
 * focus blur, motion blur and clean lines.
 */
export type Sample = {
	index: number;
	count: number;
	/** Two well-spread numbers in 0..1. Use a different seed for each effect. */
	pair: (seed: number) => [number, number];
	/** Seconds into the shot at which this pass is taken. With motion blur the passes spread across the shutter. */
	time: number;
};

export type SampleHook = (sample: Sample) => void;

/** Places things for one moment, given in seconds into the shot. */
export type MotionHook = (time: number) => void;

const ALPHA_1 = 0.7548776662466927;
const ALPHA_2 = 0.5698402909980532;

/** The seed that spreads the passes across the shutter. */
const SHUTTER_SEED = 7;

const shuffled = (count: number, seed: number) => {
	let state = (seed * 2654435761) >>> 0;
	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const order = Array.from({length: count}, (_, i) => i);
	for (let i = count - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}
	return order;
};

const fraction = (value: number) => value - Math.floor(value);

/** Coordinates the sampling loop with the lights and objects that take part in it. */
export class SampleBus {
	hooks = new Set<SampleHook>();
	/** Everything animated with useMotion, posed again for each pass. */
	motions = new Set<MotionHook>();
	/** The main light, used for the volumetric beams. */
	sun: DirectionalLight | null = null;
	/** Seconds into the shot of the frame being drawn. */
	frameTime = 0;
	/** The length of one frame, in seconds. */
	frameLength = 1 / 30;
	/** How long the shutter stays open, as a fraction of a frame. 0 turns motion blur off. */
	shutter = 0.5;
	private orders = new Map<string, number[]>();

	private spread(index: number, count: number, seed: number): [number, number] {
		if (count === 1) {
			return [0.5, 0.5];
		}
		const key = `${count}:${seed}`;
		let order = this.orders.get(key);
		if (!order) {
			order = shuffled(count, seed);
			this.orders.set(key, order);
		}
		const position = order[index];
		return [fraction(0.5 + ALPHA_1 * (position + 1)), fraction(0.5 + ALPHA_2 * (position + 1))];
	}

	sample(index: number, count: number): Sample {
		const pair = (seed: number) => this.spread(index, count, seed);
		const open = count > 1 ? this.shutter * this.frameLength : 0;
		return {
			index,
			count,
			pair,
			time: this.frameTime + (pair(SHUTTER_SEED)[0] - 0.5) * open,
		};
	}

	/** Puts everything animated with useMotion where it is at `time`. */
	pose(time: number) {
		for (const motion of this.motions) {
			motion(time);
		}
	}
}

export const SampleContext = createContext<SampleBus | null>(null);

export const useSampleBus = () => {
	const bus = useContext(SampleContext);
	if (!bus) {
		throw new Error('This component has to be placed inside <Stage>.');
	}
	return bus;
};

/**
 * Runs before each of the frame's samples. Use it for anything that should blur
 * when averaged, for example moving a mirrored copy to make its reflection glossy.
 */
export const useEachSample = (hook: SampleHook) => {
	const bus = useSampleBus();
	const latest = useRef(hook);
	latest.current = hook;
	useLayoutEffect(() => {
		const run: SampleHook = (sample) => latest.current(sample);
		bus.hooks.add(run);
		return () => {
			bus.hooks.delete(run);
		};
	}, [bus]);
};

/**
 * Animates with motion blur. `pose(time)` places things for one moment in
 * seconds. It runs at the frame's own time, and again for every pass across the
 * shutter, so anything moving fast smears the way it does through a real camera.
 * Work everything out from `time`, never from the frame number.
 */
export const useMotion = (pose: MotionHook) => {
	const bus = useSampleBus();
	const {time} = useShot();
	const latest = useRef(pose);
	latest.current = pose;
	useLayoutEffect(() => {
		const run: MotionHook = (moment) => latest.current(moment);
		bus.motions.add(run);
		return () => {
			bus.motions.delete(run);
		};
	}, [bus]);
	useLayoutEffect(() => {
		latest.current(time);
	});
};

/**
 * Motion blur for one object: returns a ref to put on a mesh or group, and calls
 * `place(object, time)` to move it. Do not also set the properties it changes as
 * props, since React would put them back.
 */
export const useMoving = <T extends Object3D = Group>(place: (object: T, time: number) => void) => {
	const ref = useRef<T>(null);
	useMotion((time) => {
		if (ref.current) {
			place(ref.current, time);
		}
	});
	return ref;
};

/** Maps two numbers in 0..1 onto a disc of radius 1, evenly. */
export const pointOnDisc = (u: number, v: number): [number, number] => {
	const a = 2 * u - 1;
	const b = 2 * v - 1;
	if (a === 0 && b === 0) {
		return [0, 0];
	}
	const horizontal = Math.abs(a) > Math.abs(b);
	const radius = horizontal ? a : b;
	const angle = horizontal ? (Math.PI / 4) * (b / a) : Math.PI / 2 - (Math.PI / 4) * (a / b);
	return [radius * Math.cos(angle), radius * Math.sin(angle)];
};
