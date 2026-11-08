import {createContext, useContext, useLayoutEffect, useRef} from 'react';
import type {DirectionalLight} from 'three';

/**
 * Each video frame is drawn many times with small variations (light position,
 * lens position, sub-pixel offset) and averaged. Those variations are what turn
 * hard computer-graphics edges into soft shadows, real focus blur and clean lines.
 */
export type Sample = {
	index: number;
	count: number;
	/** Two well-spread numbers in 0..1. Use a different seed for each effect. */
	pair: (seed: number) => [number, number];
};

export type SampleHook = (sample: Sample) => void;

const ALPHA_1 = 0.7548776662466927;
const ALPHA_2 = 0.5698402909980532;

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
	/** The main light, used for the volumetric beams. */
	sun: DirectionalLight | null = null;
	private orders = new Map<string, number[]>();

	sample(index: number, count: number): Sample {
		return {
			index,
			count,
			pair: (seed) => {
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
				return [
					fraction(0.5 + ALPHA_1 * (position + 1)),
					fraction(0.5 + ALPHA_2 * (position + 1)),
				];
			},
		};
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

/** Maps two numbers in 0..1 onto a disc of radius 1, evenly. */
export const pointOnDisc = (u: number, v: number): [number, number] => {
	const a = 2 * u - 1;
	const b = 2 * v - 1;
	if (a === 0 && b === 0) {
		return [0, 0];
	}
	const horizontal = Math.abs(a) > Math.abs(b);
	const radius = horizontal ? a : b;
	const angle = horizontal
		? (Math.PI / 4) * (b / a)
		: Math.PI / 2 - (Math.PI / 4) * (a / b);
	return [radius * Math.cos(angle), radius * Math.sin(angle)];
};
