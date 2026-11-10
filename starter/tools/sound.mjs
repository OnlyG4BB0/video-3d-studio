// Original music and sound effects, synthesised sample by sample. Nothing is
// recorded or sampled, and the same score always produces exactly the same sound.

import fs from 'node:fs';
import path from 'node:path';
import {raceInstruments, RACE_CUES, RACE_LEVELS, RACE_MOODS} from './race-sound.mjs';

const SR = 48000;
const TAU = Math.PI * 2;
const TARGET_LUFS = -14;
/** The highest true peak allowed, in dBTP. Most platforms ask for -1. */
const CEILING_DBTP = -1;
/** The limiter never reduces by more than this, so that quiet music stays musical. */
const MAX_LIMITING_DB = 7;
const BEAT = 0.4;
/** Level of the reverb return, set so that the moods keep the balance they were written for. */
const WET = 1.2;

/**
 * How loud each mood sits compared with the others in a film, in dB. Without
 * this a gentle piano chapter would come out far quieter than a drum-heavy one.
 */
const MOOD_LEVEL = {
	drone: -2.5,
	warm: -1,
	clockwork: 0,
	groove: 0.5,
	build: 0.5,
	dreamy: -1.5,
	drive: 1,
	resolve: 0,
	elegy: -2,
	lofi: -0.5,
	epic: 1.5,
};

export const DEFAULT_MOOD = 'warm';

const random = (seed) => () => {
	seed = (seed + 0x6d2b79f5) >>> 0;
	let t = seed;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const CHORD = {
	Dm: {bass: 38, notes: [62, 65, 69]},
	Bb: {bass: 34, notes: [58, 62, 65]},
	F: {bass: 41, notes: [60, 65, 69]},
	C: {bass: 36, notes: [60, 64, 67]},
	Gm: {bass: 43, notes: [58, 62, 67]},
	A: {bass: 45, notes: [61, 64, 69]},
};

const PENTATONIC = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84];

// Each mood has several progressions, and --seed chooses between them.
const PROGRESSIONS = {
	warm: [['Dm', 'Bb', 'F', 'C'], ['F', 'C', 'Dm', 'Bb'], ['Bb', 'F', 'C', 'Dm']],
	clockwork: [['Gm', 'Dm', 'Bb', 'A'], ['Dm', 'A', 'Bb', 'F'], ['Gm', 'Bb', 'Dm', 'A']],
	groove: [['Dm', 'F', 'C', 'Bb'], ['Dm', 'Bb', 'C', 'A'], ['Gm', 'Dm', 'F', 'C']],
	lift: [['F', 'C', 'Dm', 'Bb'], ['Bb', 'F', 'C', 'Dm'], ['Dm', 'C', 'Bb', 'F']],
	dreamy: [['Bb', 'Gm', 'Dm', 'A'], ['F', 'Dm', 'Bb', 'C'], ['Dm', 'Bb', 'Gm', 'A']],
	drive: [['Gm', 'Dm', 'Bb', 'A'], ['Dm', 'Gm', 'A', 'Dm'], ['Dm', 'Bb', 'Gm', 'A']],
	epic: [['Dm', 'Bb', 'Gm', 'A'], ['Dm', 'Bb', 'F', 'C'], ['Dm', 'Gm', 'Bb', 'A']],
};

const MOTIFS = [
	[67, 70, 74, 72, 70, 69, 65, 69],
	[74, 72, 70, 67, 69, 70, 72, 65],
	[62, 65, 69, 70, 69, 65, 67, 69],
];

const OSTINATOS = [
	[79, 74, 77, 74, 82, 74, 77, 74],
	[74, 77, 79, 77, 74, 81, 79, 77],
	[82, 79, 74, 79, 77, 74, 72, 74],
];

// A minor for the piano elegy: bass, the chord's tones and an open string voicing.
const ELEGY_HARMONY = {
	Am: {bass: 45, tones: [57, 60, 64], strings: [45, 57, 64, 69]},
	F: {bass: 41, tones: [57, 60, 65], strings: [41, 57, 65, 69]},
	C: {bass: 48, tones: [55, 60, 64], strings: [48, 55, 64, 67]},
	G: {bass: 43, tones: [55, 59, 62], strings: [43, 55, 62, 67]},
	Dm: {bass: 50, tones: [57, 62, 65], strings: [38, 57, 62, 69]},
	E: {bass: 40, tones: [56, 59, 64], strings: [40, 56, 64, 71]},
};
const ELEGY_PHRASES = [
	['Am', 'F', 'C', 'G'],
	['Am', 'F', 'C', 'E'],
	['Am', 'F', 'Dm', 'E'],
	['F', 'C', 'Dm', 'Am'],
];
const ELEGY_ORDERS = [[0, 1, 0, 2, 3], [1, 0, 2, 3, 1], [0, 2, 1, 3, 0]];
/** Note starts and lengths within a bar, in beats. */
const ELEGY_RHYTHMS = [
	[[0, 2], [2, 1], [3, 1]],
	[[0, 2], [2, 2]],
	[[0, 3], [3, 1]],
	[[0, 1], [1, 1], [2, 2]],
	[[0, 4]],
];
const A_MINOR = [64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83];

// Lo-fi voicings with sevenths and ninths: a bass note and a hand of keys.
const LOFI = [
	[
		{bass: 38, keys: [53, 57, 60, 64]},
		{bass: 43, keys: [53, 57, 59, 64]},
		{bass: 48, keys: [52, 55, 59, 62]},
		{bass: 45, keys: [52, 55, 60, 64]},
	],
	[
		{bass: 41, keys: [52, 55, 57, 60]},
		{bass: 40, keys: [50, 55, 59, 62]},
		{bass: 38, keys: [53, 57, 60, 64]},
		{bass: 43, keys: [53, 57, 59, 62]},
	],
	[
		{bass: 45, keys: [55, 59, 60, 64]},
		{bass: 38, keys: [53, 57, 60, 64]},
		{bass: 43, keys: [53, 57, 59, 62]},
		{bass: 48, keys: [52, 55, 59, 62]},
	],
];
const LOFI_LICK = [69, 72, 74, 76, 79, 81];

/** A bar length close to `bar` seconds that divides `length` exactly. */
const fitBars = (names, length, bar = 3.4) => {
	const count = Math.max(1, Math.round(length / bar));
	return {
		bar: length / count,
		list: Array.from({length: count}, (_, index) => names[index % names.length]),
	};
};

/**
 * When each character of a typed text appears, in seconds from the start. Pauses
 * after punctuation make it read like a person typing. Keep this in step with
 * typeSchedule in src/kit/type.tsx, so that the keys land on the letters.
 */
const typeSchedule = (text, cps) => {
	const schedule = [];
	let at = 0;
	for (const char of text) {
		schedule.push({char, at});
		const pause = /[,;:]/.test(char) ? 3 : /[.!?]/.test(char) ? 5 : char === '\n' ? 4 : 0;
		at += (1 + pause) / cps;
	}
	return schedule;
};

class Mix {
	constructor(seconds) {
		this.n = Math.ceil(seconds * SR);
		// Music, which ducks under big effects.
		this.ml = new Float32Array(this.n);
		this.mr = new Float32Array(this.n);
		// Effects and ambience, which never duck.
		this.fl = new Float32Array(this.n);
		this.fr = new Float32Array(this.n);
		// What goes to the reverb.
		this.wl = new Float32Array(this.n);
		this.wr = new Float32Array(this.n);
		// How far the music dips, in dB.
		this.duck = new Float32Array(this.n);
	}

	// fn(seconds since the sound began) returns a mono sample.
	add(start, length, fn, {amp = 1, pan = 0, send = 0.2, fx = false} = {}) {
		const first = Math.max(0, Math.floor(start * SR));
		const last = Math.min(this.n, Math.floor((start + length) * SR));
		const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
		const l = Math.cos(angle) * amp;
		const r = Math.sin(angle) * amp;
		const outL = fx ? this.fl : this.ml;
		const outR = fx ? this.fr : this.mr;
		for (let i = first; i < last; i++) {
			// The first sample can fall a fraction before `start`. Envelopes expect 0 or more.
			const v = fn(Math.max(0, i / SR - start));
			outL[i] += v * l;
			outR[i] += v * r;
			this.wl[i] += v * l * send;
			this.wr[i] += v * r * send;
		}
	}

	/** Lowers the music by `depth` dB at `start`, recovering over about `release` seconds. */
	dip(start, depth = 3, release = 0.6) {
		const first = Math.max(0, Math.floor((start - 0.01) * SR));
		const last = Math.min(this.n, Math.floor((start + release * 4) * SR));
		for (let i = first; i < last; i++) {
			const t = i / SR - start;
			const amount = t < 0 ? depth * (1 + t / 0.01) : depth * Math.exp(-t / release);
			this.duck[i] = Math.max(this.duck[i], amount);
		}
	}
}

/** A resonant filter run one sample at a time: 'low', 'band' or 'high' pass. */
const filter = (mode = 'low') => {
	let ic1 = 0;
	let ic2 = 0;
	let lastCutoff = -1;
	let lastQ = -1;
	let k = 1.414;
	let a1 = 0;
	let a2 = 0;
	let a3 = 0;
	return (x, cutoff, q = 0.707) => {
		if (cutoff !== lastCutoff || q !== lastQ) {
			lastCutoff = cutoff;
			lastQ = q;
			const g = Math.tan((Math.PI * Math.min(Math.max(cutoff, 10), SR * 0.45)) / SR);
			k = 1 / q;
			a1 = 1 / (1 + g * (g + k));
			a2 = g * a1;
			a3 = g * a2;
		}
		const v3 = x - ic2;
		const v1 = a1 * ic1 + a2 * v3;
		const v2 = ic2 + a2 * ic1 + a3 * v3;
		ic1 = 2 * v1 - ic1;
		ic2 = 2 * v2 - ic2;
		return mode === 'low' ? v2 : mode === 'band' ? v1 : x - k * v1 - v2;
	};
};

/** Smooths the corner of a sawtooth so that high notes do not alias. */
const blep = (t, dt) => {
	if (t < dt) {
		const x = t / dt;
		return x + x - x * x - 1;
	}
	if (t > 1 - dt) {
		const x = (t - 1) / dt;
		return x * x + x + x + 1;
	}
	return 0;
};

const instruments = (mix, {seed, transpose}) => {
	const hz = (midi) => 440 * 2 ** ((midi + transpose - 69) / 12);
	const noise = random(99);
	const white = () => noise() * 2 - 1;

	const kit = {
		seed,
		random: (offset) => random(seed * 1000 + offset),
		pick: (list) => list[(Math.max(1, seed) - 1) % list.length],
		dip: (start, depth, release) => mix.dip(start, depth, release),

		// A slow-moving chord: detuned stacks of soft harmonics, different in each ear.
		pad(start, length, notes, {amp = 0.05, bright = 0.5, attack = 0.9, release = 1, send = 0.5} = {}) {
			const harmonics = 3 + Math.round(bright * 7);
			const fade = (t) =>
				Math.min(1, t / attack) ** 2 * Math.min(1, Math.max(0, (length + release - t) / release));
			notes.forEach((note, n) => {
				[-7, 0, 6.5].forEach((cents, d) => {
					const f = hz(note) * 2 ** (cents / 1200);
					const pan = [-0.7, 0.05, 0.7][d] * (n % 2 ? -1 : 1);
					for (let h = 1; h <= harmonics; h++) {
						const weight = 1 / h ** (2.2 - bright);
						const w = TAU * f * h;
						const phase = (n * 1.7 + d * 2.3 + h * 0.9) % TAU;
						mix.add(start, length + release, (t) => Math.sin(w * t + phase) * fade(t), {
							amp: amp * weight,
							pan,
							send,
						});
					}
				});
			});
		},

		bell(start, midi, {amp = 0.14, length = 2.6, ratio = 3.51, pan = 0, send = 0.75, fx = false} = {}) {
			const f = hz(midi);
			mix.add(
				start,
				length,
				(t) => {
					const index = 1.8 * Math.exp(-t * 3.5);
					return (
						Math.sin(TAU * f * t + index * Math.sin(TAU * f * ratio * t)) *
						Math.exp(-t * 2.2) *
						Math.min(1, t * 400)
					);
				},
				{amp, pan, send, fx},
			);
		},

		pluck(start, midi, {amp = 0.16, length = 1.3, pan = 0, send = 0.4} = {}) {
			const f = hz(midi);
			mix.add(
				start,
				length,
				(t) => {
					let v = 0;
					for (let h = 1; h <= 7; h++) {
						v += (Math.sin(TAU * f * h * t + h) / h ** 1.4) * Math.exp(-t * (2.4 + h * 1.5));
					}
					return v * Math.min(1, t * 700);
				},
				{amp, pan, send},
			);
		},

		bass(start, midi, length, {amp = 0.3, soft = false} = {}) {
			const f = hz(midi);
			const drive = soft ? 0.9 : 1.5;
			const second = soft ? 0.12 : 0.3;
			mix.add(
				start,
				length,
				(t) => {
					const env = Math.min(1, t * (soft ? 40 : 90)) * Math.min(1, (length - t) * 25);
					return Math.tanh((Math.sin(TAU * f * t) + second * Math.sin(TAU * f * 2 * t)) * drive) * env;
				},
				{amp, send: 0.03},
			);
		},

		kick(start, {amp = 0.5, soft = false, fx = false} = {}) {
			mix.add(
				start,
				0.42,
				(t) => {
					const phase = TAU * (46 * t + ((soft ? 60 : 95) / 26) * (1 - Math.exp(-t * 26)));
					return Math.tanh(Math.sin(phase) * (soft ? 1.3 : 2)) * Math.exp(-t * (soft ? 9.5 : 8.5));
				},
				{amp, send: 0.04, fx},
			);
		},

		hat(start, {amp = 0.07, pan = 0.2, decay = 70} = {}) {
			let previous = 0;
			mix.add(
				start,
				0.12,
				(t) => {
					const x = noise();
					const y = x - previous;
					previous = x;
					return y * Math.exp(-t * decay);
				},
				{amp, pan, send: 0.1},
			);
		},

		tick(start, {amp = 0.12, high = true, pan = 0, fx = false} = {}) {
			const a = high ? 3350 : 2480;
			mix.add(
				start,
				0.05,
				(t) => (Math.sin(TAU * a * t) + 0.6 * Math.sin(TAU * a * 1.73 * t)) * Math.exp(-t * 240),
				{amp, pan, send: 0.3, fx},
			);
		},

		// A metal object landing: a low thump with inharmonic ringing on top.
		clank(start, {amp = 0.22, pitch = 240, pan = 0, fx = false} = {}) {
			const ratios = [1, 2.76, 5.4, 8.93];
			mix.add(
				start,
				0.9,
				(t) => {
					let v = Math.sin(TAU * 78 * t) * Math.exp(-t * 16) * 1.7;
					ratios.forEach((r, i) => {
						v += (Math.sin(TAU * pitch * r * t + i) * Math.exp(-t * (7 + i * 7))) / (i + 1.6);
					});
					return v * Math.min(1, t * 900);
				},
				{amp, pan, send: 0.45, fx},
			);
		},

		impact(start, {amp = 0.6, length = 2.8, fx = false} = {}) {
			let low = 0;
			mix.add(
				start,
				length,
				(t) => {
					const phase = TAU * (30 * t + (42 / 3.2) * (1 - Math.exp(-t * 3.2)));
					low += (white() - low) * 0.12;
					return Math.tanh(Math.sin(phase) * 1.8) * Math.exp(-t * 1.7) + low * Math.exp(-t * 7) * 1.5;
				},
				{amp, send: 0.5, fx},
			);
		},

		riser(start, length, {amp = 0.14, fx = false} = {}) {
			let low = 0;
			mix.add(
				start,
				length,
				(t) => {
					const p = t / length;
					low += (white() - low) * (0.01 + p * p * 0.5);
					return low * p * p * 2.2 + 0.3 * p ** 3 * Math.sin(TAU * (110 * t + 160 * t * p));
				},
				{amp, send: 0.6, fx},
			);
		},

		chords(start, bar, list, opts) {
			list.forEach((name, index) => {
				kit.pad(start + index * bar, bar, CHORD[name].notes, opts);
			});
		},

		// A felt piano: slightly stretched partials, the high ones dying first, a soft hammer.
		piano(start, midi, {amp = 0.16, length = 5.5, pan = 0, send = 0.55, bright = 0.4, fx = false} = {}) {
			const f = hz(midi);
			const count = Math.max(3, Math.min(10, Math.floor(7000 / f)));
			const tilt = 1.95 - bright * 0.5;
			const partials = Array.from({length: count}, (_, k) => {
				const h = k + 1;
				return {
					w: TAU * f * h * Math.sqrt(1 + 0.00032 * h * h),
					weight: 1 / h ** tilt,
					decay: 0.75 + 0.52 * h * (f / 330) ** 0.4,
					phase: h * 0.7,
				};
			});
			let low = 0;
			mix.add(
				start,
				length,
				(t) => {
					let v = 0;
					for (const p of partials) {
						v += Math.sin(p.w * t + p.phase) * p.weight * Math.exp(-t * p.decay);
					}
					low += (white() - low) * 0.05;
					return (v + low * Math.exp(-t * 48) * 0.7) * Math.min(1, t * 130) * Math.min(1, (length - t) * 3);
				},
				{amp, pan, send, fx},
			);
		},

		// An electric piano: a soft bell-like tine over a round body, as in lo-fi records.
		epiano(start, midi, {amp = 0.1, length = 3, pan = 0, send = 0.35} = {}) {
			const f = hz(midi);
			const wobble = 4.2 + (midi % 5) * 0.13;
			mix.add(
				start,
				length,
				(t) => {
					const index = 0.35 + 1.6 * Math.exp(-t * 6);
					const body = Math.sin(TAU * f * t + index * Math.sin(TAU * f * t));
					const tine = Math.sin(TAU * f * 14.03 * t) * Math.exp(-t * 34) * 0.2;
					const tremolo = 1 - 0.12 * (0.5 + 0.5 * Math.sin(TAU * wobble * t));
					return (
						(body + tine) *
						tremolo *
						Math.exp(-t * 1.25) *
						Math.min(1, t * 350) *
						Math.min(1, Math.max(0, (length - t) * 6))
					);
				},
				{amp, pan, send},
			);
		},

		// Bowed strings: two slightly detuned voices per note, softened, with a gentle vibrato.
		strings(start, length, notes, {amp = 0.03, attack = 0.6, release = 0.8, bright = 0.4, send = 0.6, fx = false} = {}) {
			const total = length + release;
			const envelope = (t) =>
				Math.min(1, t / attack) ** 1.5 * Math.min(1, Math.max(0, (total - t) / release));
			notes.forEach((note, n) => {
				[-1, 1].forEach((side, d) => {
					const f = hz(note) * 2 ** ((side * (5 + n)) / 1200);
					const cutoff = Math.min(9000, f * (2.5 + bright * 7));
					const rate = 5 + n * 0.23 + d * 0.31;
					const lowpass = filter('low');
					let phase = (n * 0.37 + d * 0.61) % 1;
					mix.add(
						start,
						total,
						(t) => {
							const vibrato = 1 + 0.0025 * Math.min(1, Math.max(0, (t - 0.35) / 0.8)) * Math.sin(TAU * rate * t + n);
							const step = (f / SR) * vibrato;
							phase += step;
							if (phase >= 1) {
								phase -= 1;
							}
							return lowpass(2 * phase - 1 - blep(phase, step), cutoff, 0.6) * envelope(t);
						},
						{amp, pan: side * (0.25 + 0.15 * (n % 3)), send, fx},
					);
				});
			});
		},

		// Brass that swells as its tone opens up, for the big moments.
		brass(start, length, notes, {amp = 0.04, send = 0.45, fx = false} = {}) {
			const total = length + 0.6;
			notes.forEach((note, n) => {
				[-1, 1].forEach((side, d) => {
					const f = hz(note) * 2 ** ((side * 4) / 1200);
					const step = f / SR;
					const lowpass = filter('low');
					let phase = (n * 0.41 + d * 0.23) % 1;
					mix.add(
						start,
						total,
						(t) => {
							const swell = Math.min(1, t / (length * 0.55)) ** 1.6 * Math.min(1, Math.max(0, (total - t) / 0.6));
							phase += step;
							if (phase >= 1) {
								phase -= 1;
							}
							const saw = 2 * phase - 1 - blep(phase, step);
							return Math.tanh(lowpass(saw, f * (1.2 + 6 * swell), 0.9) * 1.6) * swell;
						},
						{amp, pan: side * 0.3, send, fx},
					);
				});
			});
		},

		// A deep drop under a big moment.
		boom(start, {amp = 0.5, from = 72, to = 34, length = 1.8, fx = true} = {}) {
			mix.add(
				start,
				length,
				(t) => {
					const phase = TAU * (to * t + ((from - to) * (1 - Math.exp(-t * 6))) / 6);
					return Math.tanh(1.6 * Math.sin(phase)) * Math.exp(-t * 1.9) * Math.min(1, t * 400);
				},
				{amp, send: 0.25, fx},
			);
			if (fx) {
				mix.dip(start, 4, 0.7);
			}
		},

		snare(start, {amp = 0.16, tone = 190, decay = 16, soft = false, pan = 0.05, fx = false} = {}) {
			const highpass = filter('high');
			const lowpass = filter('low');
			mix.add(
				start,
				0.35,
				(t) => {
					const body = Math.sin(TAU * tone * (t + (0.4 * (1 - Math.exp(-t * 40))) / 40)) * Math.exp(-t * 28);
					const rattle = highpass(white(), 1400) * Math.exp(-t * decay);
					return (body * 0.55 + (soft ? lowpass(rattle, 3200) : rattle) * 0.8) * Math.min(1, t * 2000);
				},
				{amp, pan, send: soft ? 0.12 : 0.22, fx},
			);
		},

		// A large drum, struck hard.
		taiko(start, {amp = 0.4, pitch = 68, pan = 0, fx = false} = {}) {
			const lowpass = filter('low');
			mix.add(
				start,
				1.4,
				(t) => {
					const skin = Math.sin(TAU * (pitch * t + (pitch * 0.9 * (1 - Math.exp(-t * 18))) / 18)) * Math.exp(-t * 3.2);
					const slap = lowpass(white(), 900) * Math.exp(-t * 30);
					return Math.tanh((skin + slap * 1.4) * 1.5) * Math.min(1, t * 1500);
				},
				{amp, pan, send: 0.45, fx},
			);
		},

		// The surface noise of a record: soft hiss and scattered crackle.
		vinyl(start, length, {amp = 0.02, fx = true} = {}) {
			const r = kit.random(77);
			const highpass = filter('high');
			const lowpass = filter('low');
			let crackle = 0;
			mix.add(
				start,
				length,
				(t) => {
					if (r() < 9 / SR) {
						crackle = (r() - 0.5) * 2;
					}
					crackle *= 0.86;
					const hiss = lowpass(highpass(white(), 1800), 6000) * 0.08;
					return (crackle + hiss) * Math.min(1, t / 0.4) * Math.min(1, Math.max(0, (length - t) / 0.5));
				},
				{amp, send: 0, fx},
			);
		},

		// A mechanical key: a short bright click over a small low knock. `low` is the space bar.
		key(start, {amp = 0.1, pan = 0, low = false, fx = true} = {}) {
			const click = (low ? 1300 : 1900) + noise() * 1500;
			const knock = (low ? 120 : 190) + noise() * 70;
			mix.add(
				start,
				0.08,
				(t) =>
					Math.sin(TAU * click * t) * Math.exp(-t * 420) +
					Math.sin(TAU * knock * t) * Math.exp(-t * (low ? 70 : 95)) * (low ? 1.2 : 0.9) +
					white() * Math.exp(-t * 700) * 0.5,
				{amp, pan, send: 0.12, fx},
			);
		},

		// Keys for every character of a typed text, at the times the text appears.
		typing(start, text, {cps = 14, amp = 0.09, pan = 0} = {}) {
			const r = kit.random(808);
			for (const {char, at} of typeSchedule(text, cps)) {
				if (char === ' ' || char === '\n') {
					kit.key(start + at, {amp: amp * (char === '\n' ? 1.4 : 1.15), pan, low: true});
				} else {
					kit.key(start + at, {amp: amp * (0.75 + 0.45 * r()), pan: pan + (r() - 0.5) * 0.25});
				}
			}
		},

		// A soft blip for something popping onto the screen.
		pop(start, {amp = 0.12, pitch = 880, pan = 0, fx = true} = {}) {
			mix.add(
				start,
				0.18,
				(t) => {
					const phase = TAU * (pitch * t + (pitch * (1 - Math.exp(-t * 45))) / 45);
					return Math.sin(phase) * Math.exp(-t * 26) * Math.min(1, t * 3000);
				},
				{amp, pan, send: 0.25, fx},
			);
		},

		// Air rushing past from one side to the other, loudest at 60% of its length.
		whoosh(start, length = 1.2, {amp = 0.16, from = -0.8, to = 0.8, fx = true} = {}) {
			[0, 1].forEach((side) => {
				const bandpass = filter('band');
				mix.add(
					start,
					length,
					(t) => {
						const p = t / length;
						const shape = p < 0.6 ? (p / 0.6) ** 2 : ((1 - p) / 0.4) ** 1.6;
						const angle = ((from + (to - from) * p + 1) * Math.PI) / 4;
						const gain = side === 0 ? Math.cos(angle) : Math.sin(angle);
						return bandpass(white(), 250 + 4200 * shape, 1.1) * shape * gain * 1.8;
					},
					{amp, pan: side === 0 ? -1 : 1, send: 0.35, fx},
				);
			});
		},

		// Rising air that ends exactly at start + length, like a cymbal played backwards.
		swell(start, length = 1.6, {amp = 0.14, fx = true} = {}) {
			[-0.6, 0.6].forEach((pan) => {
				const highpass = filter('high');
				mix.add(
					start,
					length,
					(t) => {
						const p = t / length;
						return highpass(white(), 2500 + 5000 * p, 0.7) * p ** 3 * 1.4;
					},
					{amp, pan, send: 0.5, fx},
				);
			});
		},

		// Sparkles that gather and grow, for something magical appearing.
		shimmer(start, length = 2, {amp = 0.05, fx = true} = {}) {
			const r = kit.random(31 + Math.round(start * 10));
			const notes = [81, 84, 86, 88, 91, 93, 96];
			const count = Math.max(3, Math.round(length * 9));
			for (let i = 0; i < count; i++) {
				kit.bell(start + (i / count) * length * (0.85 + 0.15 * r()), notes[Math.floor(r() * notes.length)], {
					amp: amp * (0.4 + (0.6 * i) / count),
					length: 1.6,
					ratio: 3.01 + Math.floor(r() * 2),
					pan: r() * 1.6 - 0.8,
					send: 0.9,
					fx,
				});
			}
		},

		// Rain on a window: soft noise that swells and fades slowly, different in each ear.
		rain(start, length, {amp = 0.05, fx = true} = {}) {
			[-0.6, 0.6].forEach((pan, side) => {
				let low = 0;
				let previous = 0;
				mix.add(
					start,
					length,
					(t) => {
						const x = white();
						low += (x - low) * 0.06;
						const high = x - previous;
						previous = x;
						const swell = 0.78 + 0.22 * Math.sin(t * 0.37 + side + Math.sin(t * 0.11) * 2);
						const fade = Math.min(1, t / 1.5) * Math.min(1, Math.max(0, (length - t) / 1.5));
						return (high * 0.32 + low * 1.1) * swell * fade;
					},
					{amp, pan, send: 0.15, fx},
				);
			});
		},

		// Rusty chains at the end of a swing's arc.
		creak(start, {amp = 0.05, pan = 0, up = true, fx = true} = {}) {
			const length = 0.46;
			const base = up ? 610 : 505;
			const slide = up ? 0.2 : -0.16;
			mix.add(
				start,
				length,
				(t) => {
					const p = t / length;
					const f = base * (1 + slide * p);
					const rough = 1 + 0.6 * Math.sin(TAU * 37 * t) * Math.sin(TAU * 91 * t);
					const tone =
						Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.03 * t) + 0.25 * Math.sin(TAU * f * 3.1 * t);
					return tone * rough * Math.max(0, Math.sin(Math.PI * p)) ** 1.5;
				},
				{amp, pan, send: 0.4, fx},
			);
		},

		// Wind in open air: low noise that rises and falls slowly, different in each ear.
		wind(start, length, {amp = 0.05, fx = true} = {}) {
			[-0.7, 0.7].forEach((pan, side) => {
				let low = 0;
				let lower = 0;
				mix.add(
					start,
					length,
					(t) => {
						const open = 0.012 + 0.02 * (0.5 + 0.5 * Math.sin(t * 0.21 + side * 1.4 + Math.sin(t * 0.09) * 2));
						low += (white() - low) * open;
						lower += (low - lower) * 0.2;
						const fade = Math.min(1, t / 2) * Math.min(1, Math.max(0, (length - t) / 2));
						return lower * (0.7 + 0.3 * Math.sin(t * 0.31 + side)) * fade;
					},
					{amp: amp * 9, pan, send: 0.2, fx},
				);
			});
		},

		// Crickets far away.
		crickets(start, length, {amp = 0.012, fx = true} = {}) {
			[
				[-0.75, 4150, 0],
				[0.6, 4640, 1.7],
			].forEach(([pan, f, offset]) => {
				mix.add(
					start,
					length,
					(t) => {
						const chirp = Math.max(0, Math.sin(TAU * 0.9 * t + offset)) ** 0.5;
						const pulse = Math.max(0, Math.sin(TAU * 31 * t));
						const fade = Math.min(1, t / 4) * Math.min(1, Math.max(0, (length - t) / 2));
						return Math.sin(TAU * f * t) * chirp * pulse * fade;
					},
					{amp, pan, send: 0.3, fx},
				);
			});
		},
	};
	raceInstruments(kit, mix, {hz, white, SR});
	return kit;
};

/** The next melody note of the elegy: a chord tone on strong beats, otherwise a step, mostly down. */
const elegyNote = (previous, chord, name, strong, r) => {
	if (strong) {
		const options = chord.tones.flatMap((note) => [note + 12, note + 24]).filter((note) => note >= 67 && note <= 81);
		return options.reduce((best, note) => {
			const distance = Math.abs(note - previous);
			const bestDistance = Math.abs(best - previous);
			return distance < bestDistance || (distance === bestDistance && note < best) ? note : best;
		}, options[0]);
	}
	// Over E the seventh of the scale is raised, which pulls the ear back home.
	const scale = name === 'E' ? A_MINOR.map((note) => (note === 67 || note === 79 ? note + 1 : note)) : A_MINOR;
	const nearest = scale.reduce((best, note) => (Math.abs(note - previous) < Math.abs(best - previous) ? note : best));
	const index = scale.indexOf(nearest);
	const next = scale[Math.max(0, Math.min(scale.length - 1, index + (r() < 0.62 ? -1 : 1)))];
	return next < 66 ? scale[index + 1] : next > 81 ? scale[index - 1] : next;
};

// Every mood fills `length` seconds from `t0`, at any length.
const MOODS = {
	/** Dark and still: openings, titles, anything emerging from black. */
	drone(kit, t0, length, {isLast}) {
		kit.pad(t0, length, [38, 45, 50], {
			amp: 0.07,
			bright: 0.18,
			attack: Math.min(3, length * 0.35),
			send: 0.6,
		});
		kit.bass(t0 + length * 0.44, 38, length * 0.5, {amp: 0.22});
		[
			[0.54, 74],
			[0.63, 69],
			[0.73, 77],
			[0.83, 76],
		].forEach(([at, note]) => kit.bell(t0 + length * at, note, {amp: 0.16}));
		if (!isLast && length > 3) {
			kit.riser(t0 + length - 1.7, 1.7, {amp: 0.08});
		}
	},

	/** Gentle and bright, with soft bells: places, daylight, calm products. */
	warm(kit, t0, length) {
		const {bar, list} = fitBars(kit.pick(PROGRESSIONS.warm), length);
		kit.chords(t0, bar, list, {amp: 0.05, bright: 0.55, attack: 1.2});
		list.forEach((name, b) => {
			kit.bass(t0 + b * bar, CHORD[name].bass + 12, bar * 0.95, {amp: 0.13});
			const notes = [...CHORD[name].notes, CHORD[name].notes[0] + 12];
			for (let s = 0; s * BEAT < bar; s++) {
				kit.bell(t0 + b * bar + s * BEAT, notes[[0, 1, 2, 3, 2, 1][s % 6]] + 12, {
					amp: 0.05,
					length: 1.6,
					ratio: 2.01,
					pan: Math.sin(s) * 0.6,
				});
			}
		});
	},

	/** Precise ticking and plucked notes: watches, instruments, close-ups of detail. */
	clockwork(kit, t0, length) {
		const {bar, list} = fitBars(kit.pick(PROGRESSIONS.clockwork), length);
		kit.chords(t0, bar, list, {amp: 0.04, bright: 0.35});
		for (let s = 0; s * BEAT < length; s++) {
			kit.tick(t0 + s * BEAT, {high: s % 2 === 0, amp: 0.1, pan: s % 2 ? 0.25 : -0.25});
		}
		const motif = kit.pick(MOTIFS);
		for (let s = 0; s * 0.8 < length - 0.8; s++) {
			kit.pluck(t0 + s * 0.8, motif[s % 8] + (s > 11 ? 12 : 0), {
				amp: 0.13,
				pan: Math.sin(s * 1.3) * 0.4,
			});
		}
		list.forEach((name, b) => kit.bass(t0 + b * bar, CHORD[name].bass, bar * 0.9, {amp: 0.2}));
		for (let t = Math.round((length * 0.45) / 0.8) * 0.8; t < length - 0.5; t += 1.6) {
			kit.kick(t0 + t, {amp: 0.34});
		}
	},

	/** A steady beat and bass line: product ranges, anything that keeps moving. */
	groove(kit, t0, length) {
		const {bar, list} = fitBars(kit.pick(PROGRESSIONS.groove), length);
		kit.chords(t0, bar, list, {amp: 0.045, bright: 0.6});
		for (let t = 0; t < length - 0.2; t += 0.8) {
			kit.kick(t0 + t, {amp: 0.4});
			kit.hat(t0 + t + 0.4);
		}
		list.forEach((name, b) => {
			for (let t = 0; t < bar - 0.1; t += BEAT) {
				const up = Math.round(t / BEAT) % 4 === 3;
				kit.bass(t0 + b * bar + t, CHORD[name].bass + (up ? 12 : 0), 0.36, {amp: 0.2});
			}
		});
	},

	/** Tension rising to one big hit: reveals and transformations. */
	build(kit, t0, length, {section}) {
		const hit = Math.max(1, Math.min(length - 1, section.seconds * (section.music.hit ?? 0.6)));
		kit.pad(t0, hit, [38, 50, 53, 57], {amp: 0.05, bright: 0.3, attack: Math.min(1.5, hit * 0.4)});
		for (let t = 0; t < hit - 0.1; t += 0.8) {
			kit.bass(t0 + t, 38, 0.6, {amp: 0.24});
		}
		for (let t = 0; t < hit - 0.1; t += BEAT) {
			kit.hat(t0 + t, {amp: 0.035});
		}
		const climb = Math.min(3.2, hit);
		kit.riser(t0 + hit - climb, climb, {amp: 0.2});
		kit.impact(t0 + hit, {amp: 0.62});
		const after = length - hit;
		const {bar, list} = fitBars(kit.pick(PROGRESSIONS.lift), after, 2.2);
		kit.chords(t0 + hit, bar, list, {amp: 0.055, bright: 0.75, attack: 0.3});
		for (let t = 0; t < after - 0.2; t += 0.8) {
			kit.kick(t0 + hit + t, {amp: 0.42});
			kit.hat(t0 + hit + t + BEAT, {amp: 0.08});
			kit.bass(t0 + hit + t, CHORD[list[Math.floor(t / bar)]].bass, 0.7, {amp: 0.2});
		}
		[
			[0, 77],
			[0.4, 81],
			[0.8, 84],
			[1.6, 86],
		].forEach(([at, note]) => kit.bell(t0 + hit + at, note, {amp: 0.14}));
	},

	/** Wide and weightless, with scattered sparkles: abstract and liquid shots. */
	dreamy(kit, t0, length) {
		const {bar, list} = fitBars(kit.pick(PROGRESSIONS.dreamy), length);
		kit.chords(t0, bar, list, {amp: 0.055, bright: 0.8, attack: 1.4, send: 0.8});
		kit.pad(t0, length, [38], {amp: 0.1, bright: 0, attack: 1});
		const r = kit.random(21);
		for (let s = 0; s * 0.2 < length - 0.4; s++) {
			if (r() < 0.42) {
				kit.bell(t0 + s * 0.2, PENTATONIC[Math.floor(r() * PENTATONIC.length)] + 12, {
					amp: 0.04 + r() * 0.05,
					length: 2,
					ratio: 1 + Math.floor(r() * 3) + 0.51,
					pan: r() * 1.6 - 0.8,
					send: 0.95,
				});
			}
		}
	},

	/** Fast, mechanical and rhythmic: machines, energy, the run-up to an ending. */
	drive(kit, t0, length) {
		const {bar, list} = fitBars(kit.pick(PROGRESSIONS.drive), length, 2.6);
		kit.chords(t0, bar, list, {amp: 0.04, bright: 0.5});
		for (let s = 0; s * 0.2 < length - 0.1; s++) {
			kit.tick(t0 + s * 0.2, {
				high: s % 4 === 0,
				amp: s % 4 === 0 ? 0.11 : 0.05,
				pan: Math.sin(s * 0.7) * 0.5,
			});
		}
		for (let t = 0; t < length - 0.3; t += 0.8) {
			kit.kick(t0 + t, {amp: 0.42});
		}
		for (let t = 1.6; t < length - 0.3; t += 3.2) {
			kit.clank(t0 + t, {amp: 0.15, pitch: 330, pan: 0.35});
		}
		list.forEach((name, b) => {
			[0, 0.6, 1.2, 1.6, 2.2].forEach((offset) => {
				if (offset < bar) {
					kit.bass(t0 + b * bar + offset, CHORD[name].bass, 0.5, {amp: 0.21});
				}
			});
		});
		const ostinato = kit.pick(OSTINATOS);
		for (let s = 0; s * BEAT < length - BEAT; s++) {
			kit.pluck(t0 + s * BEAT, ostinato[s % 8], {
				amp: 0.07,
				length: 0.7,
				pan: s % 2 ? 0.4 : -0.4,
			});
		}
	},

	/** Settles on a major chord: logos, end cards, the last chapter. */
	resolve(kit, t0, length) {
		const turn = Math.min(2.2, length * 0.3);
		kit.pad(t0, turn, [38, 50, 57], {amp: 0.05, bright: 0.25, release: 0.8});
		kit.impact(t0 + turn, {amp: 0.42, length: 3.6});
		kit.pad(t0 + turn - 0.2, Math.max(1.5, length - turn - 1.2), [50, 57, 62, 66, 69], {
			amp: 0.06,
			bright: 0.72,
			attack: 1.2,
			release: 1.4,
			send: 0.85,
		});
		kit.bass(t0 + turn, 38, Math.max(1, length - turn - 1.8), {amp: 0.2});
		[
			[0.8, 74],
			[1.6, 78],
			[2.4, 81],
			[3.2, 86],
		].forEach(([after, note]) => {
			if (turn + after < length - 1) {
				kit.bell(t0 + turn + after, note, {amp: 0.15, length: 3.4});
			}
		});
	},

	/** Slow felt piano in A minor, strings underneath: memories, empty places, quiet endings. */
	elegy(kit, t0, length, {isLast}) {
		const bars = Math.max(2, Math.round(length / 4.2));
		const bar = length / bars;
		const beat = bar / 4;
		const order = kit.pick(ELEGY_ORDERS);
		const names = Array.from(
			{length: bars},
			(_, b) => ELEGY_PHRASES[order[Math.floor(b / 4) % order.length]][b % 4],
		);
		const intro = bars >= 6 ? 2 : bars >= 3 ? 1 : 0;
		const r = kit.random(55);
		let previous = 76;
		names.forEach((name, b) => {
			const start = t0 + b * bar;
			const chord = ELEGY_HARMONY[name];
			if (isLast && b === bars - 1 && bars >= 3) {
				// It ends without quite coming to rest: the ninth stays in the air.
				[33, 45, 57, 64, 71].forEach((note, n) =>
					kit.piano(start + n * 0.07, note, {amp: 0.15 - n * 0.012, length: bar + 2.5, send: 0.75}),
				);
				return;
			}
			kit.piano(start, chord.bass, {amp: 0.17, length: bar * 1.5});
			chord.tones.forEach((note, n) =>
				kit.piano(start + (n + 1) * beat + (r() - 0.5) * 0.04, note, {
					amp: 0.082,
					length: bar,
					pan: -0.25 + n * 0.25,
				}),
			);
			if (b >= intro) {
				const rhythm = b % 4 === 0 ? ELEGY_RHYTHMS[0] : ELEGY_RHYTHMS[Math.floor(r() * ELEGY_RHYTHMS.length)];
				for (const [at, hold] of rhythm) {
					previous = elegyNote(previous, chord, name, at === 0, r);
					kit.piano(start + at * beat + (r() - 0.5) * 0.05, previous, {
						amp: 0.145,
						length: Math.max(2.5, hold * beat * 2.2),
						pan: 0.1,
						send: 0.65,
					});
				}
			}
			if (bars >= 6 && b >= 4) {
				kit.strings(start, bar, chord.strings, {
					amp: b >= 8 && b < 12 ? 0.02 : 0.014,
					attack: 1.4,
					release: 1.4,
					bright: 0.3,
					send: 0.75,
				});
			}
			if (bars >= 10 && b >= 8 && b < 12) {
				// A music box joins for one phrase.
				const box = chord.tones.map((note) => note + 24);
				[0, 1, 2, 3].forEach((s) =>
					kit.bell(start + s * beat, box[[2, 1, 0, 1][s]], {
						amp: 0.05,
						length: 3.2,
						ratio: 4.0,
						pan: Math.sin(s * 2 + b) * 0.45,
						send: 0.85,
					}),
				);
			}
		});
	},

	/** Mellow electric piano over a lazy swung beat and record crackle: coding, cosy rooms, night. */
	lofi(kit, t0, length, {isLast}) {
		const bars = Math.max(1, Math.round(length / 3));
		const bar = length / bars;
		const beat = bar / 4;
		// Eighth notes, with every second one pushed late.
		const swung = (eighth) => (eighth % 2 === 0 ? eighth / 2 : Math.floor(eighth / 2) + 0.62) * beat;
		const chords = kit.pick(LOFI);
		const r = kit.random(64);
		kit.vinyl(t0, length, {amp: 0.016, fx: false});
		for (let b = 0; b < bars; b++) {
			const start = t0 + b * bar;
			const chord = chords[b % chords.length];
			const drums = bars < 3 || (b > 0 && !(isLast && b === bars - 1));
			chord.keys.forEach((note, n) =>
				kit.epiano(start + n * 0.018, note, {amp: 0.07, length: bar * 0.95, pan: -0.3 + n * 0.2}),
			);
			if (b % 2 === 1) {
				chord.keys
					.slice(1)
					.forEach((note, n) =>
						kit.epiano(start + 2.62 * beat + n * 0.012, note, {amp: 0.045, length: beat * 1.2, pan: 0.2}),
					);
			}
			kit.bass(start, chord.bass, beat * 1.6, {amp: 0.17, soft: true});
			kit.bass(start + 2.62 * beat, chord.bass + 7, beat * 0.9, {amp: 0.12, soft: true});
			if (drums) {
				kit.kick(start, {amp: 0.34, soft: true});
				kit.kick(start + 2.62 * beat, {amp: 0.24, soft: true});
				kit.snare(start + beat, {amp: 0.11, soft: true});
				kit.snare(start + 3 * beat, {amp: 0.11, soft: true});
				for (let e = 0; e < 8; e++) {
					kit.hat(start + swung(e), {amp: e % 2 ? 0.02 : 0.032, pan: 0.25, decay: 90});
				}
			}
			if (b % 2 === 1) {
				let index = 2 + Math.floor(r() * 3);
				[1, 2, 3, 5].forEach((eighth) => {
					if (r() < 0.8) {
						kit.epiano(start + swung(eighth), LOFI_LICK[index] + 12, {
							amp: 0.035,
							length: 1.2,
							pan: 0.35,
							send: 0.5,
						});
					}
					index = Math.max(0, Math.min(LOFI_LICK.length - 1, index + (r() < 0.6 ? -1 : 1)));
				});
			}
		}
	},

	/** Driving strings and big drums rising to a hit: trailers, launches, anything heroic. */
	epic(kit, t0, length, {section, isLast}) {
		const bars = Math.max(1, Math.round(length / 2.4));
		const bar = length / bars;
		const eighth = bar / 8;
		const list = Array.from({length: bars}, (_, i) => kit.pick(PROGRESSIONS.epic)[i % 4]);
		// The big moment lands on a bar line, as close as possible to `hit`.
		const wanted = section.seconds * (section.music.hit ?? 0.5);
		const hitBar = length > 6 ? Math.max(1, Math.min(bars - 1, Math.round(wanted / bar))) : 0;
		list.forEach((name, b) => {
			const start = t0 + b * bar;
			const chord = CHORD[name];
			const after = hitBar > 0 && b >= hitBar;
			for (let e = 0; e < 8; e++) {
				const note = chord.bass + 12 + (e % 4 === 3 ? 7 : 0);
				kit.strings(start + e * eighth, eighth * 0.7, [note, note - 12], {
					amp: after ? 0.04 : 0.028,
					attack: 0.012,
					release: 0.06,
					bright: 0.55,
					send: 0.3,
				});
			}
			const hits = after ? [0, 3, 4, 6, 7] : [0, 4];
			hits.forEach((e) =>
				kit.taiko(start + e * eighth, {
					amp: e === 0 ? 0.26 : 0.18,
					pitch: e === 0 ? 62 : 74,
					pan: e % 2 ? 0.25 : -0.2,
				}),
			);
			if (after) {
				kit.brass(start, bar * 0.95, chord.notes.map((note) => note - 12), {amp: 0.03});
				kit.strings(start, bar, chord.notes.map((note) => note + 12), {
					amp: 0.022,
					attack: 0.25,
					release: 0.5,
					bright: 0.5,
					send: 0.7,
				});
			} else if (b === 0) {
				kit.strings(start, hitBar > 0 ? hitBar * bar : length, [chord.bass + 24, chord.bass + 31], {
					amp: 0.016,
					attack: 1.5,
					release: 1,
					send: 0.7,
				});
			}
		});
		if (hitBar > 0) {
			const hit = t0 + hitBar * bar;
			const climb = Math.min(2.4, hitBar * bar);
			kit.riser(hit - climb, climb, {amp: 0.15});
			kit.swell(hit - 1.4, 1.4, {amp: 0.1, fx: false});
			kit.boom(hit, {amp: 0.3, fx: false});
			kit.impact(hit, {amp: 0.26});
		}
		if (isLast) {
			kit.boom(t0 + length - Math.min(2.5, length * 0.3), {amp: 0.3, fx: false});
		}
	},
};

/** Background sound under a whole chapter. */
const AMBIENCE = {
	rain: (kit, t0, length) => kit.rain(t0, length, {amp: 0.045}),
	wind: (kit, t0, length) => kit.wind(t0, length, {amp: 0.05}),
	night: (kit, t0, length) => {
		kit.wind(t0, length, {amp: 0.03});
		kit.crickets(t0, length, {amp: 0.012});
	},
	vinyl: (kit, t0, length) => kit.vinyl(t0, length, {amp: 0.02}),
};

/** What plays as one chapter dissolves into the next. `at` is when the dissolve starts. */
const TRANSITIONS = {
	whoosh: (kit, at, dissolve) => {
		const length = Math.max(1.1, dissolve + 0.7);
		kit.whoosh(at + dissolve / 2 - length * 0.6, length, {amp: 0.12});
	},
	impact: (kit, at) => {
		kit.impact(at, {amp: 0.26, length: 2, fx: true});
		kit.dip(at, 2.5, 0.6);
	},
	swell: (kit, at, dissolve) => {
		kit.swell(at + dissolve / 2 - 1.5, 1.5, {amp: 0.12});
		kit.boom(at + dissolve / 2, {amp: 0.3});
	},
	none: () => undefined,
};

const CUES = {
	bell: (kit, at, cue) => kit.bell(at, cue.note ?? 81, {amp: cue.amp ?? 0.14, pan: cue.pan ?? 0, fx: true}),
	piano: (kit, at, cue) => kit.piano(at, cue.note ?? 72, {amp: cue.amp ?? 0.16, pan: cue.pan ?? 0, fx: true}),
	clank: (kit, at, cue) =>
		kit.clank(at, {amp: cue.amp ?? 0.22, pitch: cue.pitch ?? 240, pan: cue.pan ?? 0, fx: true}),
	impact: (kit, at, cue) => {
		kit.impact(at, {amp: cue.amp ?? 0.5, fx: true});
		kit.dip(at, 3, 0.6);
	},
	boom: (kit, at, cue) => kit.boom(at, {amp: cue.amp ?? 0.5}),
	riser: (kit, at, cue) => {
		const length = cue.length ?? 2;
		kit.riser(at - length, length, {amp: cue.amp ?? 0.16, fx: true});
	},
	swell: (kit, at, cue) => {
		const length = cue.length ?? 1.6;
		kit.swell(at - length, length, {amp: cue.amp ?? 0.14});
	},
	whoosh: (kit, at, cue) => {
		const length = cue.length ?? 1.2;
		const pan = cue.pan ?? 0;
		kit.whoosh(at - length * 0.6, length, {amp: cue.amp ?? 0.16, from: pan - 0.8, to: pan + 0.8});
	},
	shimmer: (kit, at, cue) => kit.shimmer(at, cue.length ?? 2, {amp: cue.amp ?? 0.05}),
	pop: (kit, at, cue) => kit.pop(at, {amp: cue.amp ?? 0.12, pitch: cue.pitch ?? 880, pan: cue.pan ?? 0}),
	key: (kit, at, cue) => kit.key(at, {amp: cue.amp ?? 0.1, pan: cue.pan ?? 0}),
	typing: (kit, at, cue) =>
		kit.typing(at, cue.text ?? 'x'.repeat(Math.max(1, Math.round((cue.length ?? 1) * (cue.cps ?? 14)))), {
			cps: cue.cps ?? 14,
			amp: cue.amp ?? 0.09,
			pan: cue.pan ?? 0,
		}),
	tick: (kit, at, cue) => kit.tick(at, {amp: cue.amp ?? 0.12, pan: cue.pan ?? 0, fx: true}),
	kick: (kit, at, cue) => kit.kick(at, {amp: cue.amp ?? 0.45, fx: true}),
	snare: (kit, at, cue) => kit.snare(at, {amp: cue.amp ?? 0.16, pan: cue.pan ?? 0, fx: true}),
	taiko: (kit, at, cue) => kit.taiko(at, {amp: cue.amp ?? 0.4, pan: cue.pan ?? 0, fx: true}),
	creak: (kit, at, cue) => kit.creak(at, {amp: cue.amp ?? 0.05, pan: cue.pan ?? 0, up: cue.up ?? true}),
	rain: (kit, at, cue) => kit.rain(at, cue.length ?? 10, {amp: cue.amp ?? 0.05}),
	wind: (kit, at, cue) => kit.wind(at, cue.length ?? 10, {amp: cue.amp ?? 0.05}),
	crickets: (kit, at, cue) => kit.crickets(at, cue.length ?? 10, {amp: cue.amp ?? 0.012}),
};

// Engines, crowds and the electronic moods of the race film.
Object.assign(MOODS, RACE_MOODS);
Object.assign(CUES, RACE_CUES);
Object.assign(MOOD_LEVEL, RACE_LEVELS);

const playCue = (kit, cue, section) => {
	const play = CUES[cue.sound];
	if (!play) {
		throw new Error(`Unknown cue sound "${cue.sound}". Use one of: ${Object.keys(CUES).join(', ')}`);
	}
	const offset = cue.at ?? (cue.progress === undefined ? undefined : cue.progress * section.seconds);
	if (offset === undefined) {
		throw new Error(`A "${cue.sound}" cue in ${section.name} needs "at" or "progress".`);
	}
	play(kit, section.start + offset, cue);
};

/** A delay line that is read before it is written. */
class Delay {
	constructor(length) {
		this.size = length + 2;
		this.buffer = new Float32Array(this.size);
		this.index = 0;
	}

	/** What was written `ago` samples back. */
	read(ago) {
		let i = this.index - ago;
		if (i < 0) {
			i += this.size;
		}
		return this.buffer[i];
	}

	readFraction(ago) {
		const whole = Math.floor(ago);
		const part = ago - whole;
		return this.read(whole) * (1 - part) + this.read(whole + 1) * part;
	}

	write(value) {
		this.buffer[this.index] = value;
		this.index = this.index + 1 === this.size ? 0 : this.index + 1;
	}
}

/**
 * A plate reverb after Jon Dattorro's design: the input is smeared by four
 * diffusers, then circulates through two cross-coupled loops that slowly
 * modulate, which gives a smooth, wide tail without metallic ringing.
 */
const plate = (sendL, sendR, {decay = 0.62, damping = 0.32, predelay = 0.018, bandwidth = 0.72} = {}) => {
	const scale = SR / 29761;
	const size = (n) => Math.max(1, Math.round(n * scale));
	const preLength = Math.max(1, Math.round(predelay * SR));
	const pre = new Delay(preLength);
	const diffusers = [
		[142, 0.75],
		[107, 0.75],
		[379, 0.625],
		[277, 0.625],
	].map(([n, g]) => ({line: new Delay(size(n)), n: size(n), g}));
	const excursion = size(16);
	const half = (modulated, first, diffuse, second, rate, phase) => ({
		mod: size(modulated),
		modLine: new Delay(size(modulated) + excursion + 2),
		n1: size(first),
		d1: new Delay(size(first)),
		nap: size(diffuse),
		ap: new Delay(size(diffuse)),
		n2: size(second),
		d2: new Delay(size(second)),
		rate,
		phase,
		damp: 0,
		out: 0,
	});
	const left = half(672, 4453, 1800, 3720, 1, 0);
	const right = half(908, 4217, 2656, 3163, 0.83, 1.3);
	const taps = {
		l: [
			[right.d1, size(266), 1],
			[right.d1, size(2974), 1],
			[right.ap, size(1913), -1],
			[right.d2, size(1996), 1],
			[left.d1, size(1990), -1],
			[left.ap, size(187), -1],
			[left.d2, size(1066), -1],
		],
		r: [
			[left.d1, size(353), 1],
			[left.d1, size(3627), 1],
			[left.ap, size(1228), -1],
			[left.d2, size(2673), 1],
			[right.d1, size(2111), -1],
			[right.ap, size(335), -1],
			[right.d2, size(121), -1],
		],
	};
	const step = (part, input, t) => {
		const ago = part.mod + excursion * Math.sin(TAU * part.rate * t + part.phase);
		const delayed = part.modLine.readFraction(ago);
		const w = input - 0.7 * delayed;
		part.modLine.write(w);
		let y = delayed + 0.7 * w;
		const a = part.d1.read(part.n1);
		part.d1.write(y);
		part.damp += (1 - damping) * (a - part.damp);
		y = part.damp * decay;
		const e = part.ap.read(part.nap);
		const w2 = y + 0.5 * e;
		part.ap.write(w2);
		y = e - 0.5 * w2;
		part.out = part.d2.read(part.n2);
		part.d2.write(y);
	};

	const n = sendL.length;
	const outL = new Float32Array(n);
	const outR = new Float32Array(n);
	let band = 0;
	for (let i = 0; i < n; i++) {
		const delayed = pre.read(preLength);
		pre.write((sendL[i] + sendR[i]) * 0.5);
		band += bandwidth * (delayed - band);
		let x = band;
		for (const d of diffusers) {
			const z = d.line.read(d.n);
			const w = x + d.g * z;
			d.line.write(w);
			x = z - d.g * w;
		}
		const fromLeft = left.out;
		const fromRight = right.out;
		const t = i / SR;
		step(left, x + decay * fromRight, t);
		step(right, x + decay * fromLeft, t);
		let yl = 0;
		for (const [line, at, sign] of taps.l) {
			yl += sign * line.read(at);
		}
		let yr = 0;
		for (const [line, at, sign] of taps.r) {
			yr += sign * line.read(at);
		}
		outL[i] = yl * 0.6;
		outR[i] = yr * 0.6;
	}
	return {left: outL, right: outR};
};

const biquad = (input, b, a) => {
	const output = new Float64Array(input.length);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < input.length; i++) {
		const x = input[i];
		const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
		output[i] = y;
	}
	return output;
};

const weighted = (input) => {
	let K = Math.tan((Math.PI * 1681.974450955533) / SR);
	let Q = 0.7071752369554196;
	const Vh = 10 ** (3.999843853973347 / 20);
	const Vb = Vh ** 0.4996667741545416;
	let a0 = 1 + K / Q + K * K;
	const shelf = biquad(
		input,
		[(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
		[1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
	);
	K = Math.tan((Math.PI * 38.13547087602444) / SR);
	Q = 0.5003270373238773;
	a0 = 1 + K / Q + K * K;
	return biquad(shelf, [1, -2, 1], [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]);
};

/** Integrated loudness in LUFS, the measure that streaming and social apps use. */
const integratedLoudness = (left, right) => {
	const l = weighted(left);
	const r = weighted(right);
	const block = Math.round(SR * 0.4);
	const hop = Math.round(SR * 0.1);
	const running = new Float64Array(l.length + 1);
	for (let i = 0; i < l.length; i++) {
		running[i + 1] = running[i] + l[i] * l[i] + r[i] * r[i];
	}
	const blocks = [];
	for (let i = 0; i + block <= l.length; i += hop) {
		blocks.push((running[i + block] - running[i]) / block);
	}
	const lufs = (energy) => -0.691 + 10 * Math.log10(energy);
	const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
	const audible = blocks.filter((energy) => energy > 0 && lufs(energy) > -70);
	if (audible.length === 0) {
		return -Infinity;
	}
	const gate = lufs(mean(audible)) - 10;
	const kept = audible.filter((energy) => lufs(energy) > gate);
	return lufs(mean(kept));
};

const toDb = (value) => (value > 0 ? 20 * Math.log10(value) : -Infinity);

/** For each sample, the smallest value from there to `window` samples ahead. */
const minimumAhead = (values, window) => {
	const n = values.length;
	const output = new Float32Array(n);
	const queue = new Int32Array(n);
	let head = 0;
	let tail = 0;
	for (let i = n - 1; i >= 0; i--) {
		while (tail > head && values[queue[tail - 1]] >= values[i]) {
			tail--;
		}
		queue[tail++] = i;
		while (queue[head] > i + window) {
			head++;
		}
		output[i] = values[queue[head]];
	}
	return output;
};

/**
 * A look-ahead limiter: it starts lowering the level 5 ms before a peak and
 * lets go over about 80 ms, so that loud moments are held under the ceiling
 * without audible clicks or pumping.
 */
const limit = (left, right, gain, ceiling) => {
	const n = left.length;
	const look = Math.round(0.005 * SR);
	const needed = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const peak = Math.max(Math.abs(left[i]), Math.abs(right[i])) * gain;
		needed[i] = peak > ceiling ? ceiling / peak : 1;
	}
	const ahead = minimumAhead(needed, look);
	const release = Math.exp(-1 / (0.08 * SR));
	const outL = new Float32Array(n);
	const outR = new Float32Array(n);
	let sum = 0;
	let g = 1;
	let deepest = 1;
	for (let i = 0; i < n; i++) {
		sum += ahead[i];
		if (i >= look) {
			sum -= ahead[i - look];
		}
		const eased = sum / Math.min(i + 1, look);
		g = Math.min(eased, 1 - (1 - g) * release);
		deepest = Math.min(deepest, g);
		outL[i] = left[i] * gain * g;
		outR[i] = right[i] * gain * g;
	}
	return {left: outL, right: outR, reduction: -toDb(deepest)};
};

// Windowed-sinc taps for the three points between each pair of samples.
const TAPS = 32;
const BETWEEN = [0.25, 0.5, 0.75].map((offset) =>
	Array.from({length: TAPS}, (_, j) => {
		const d = offset - (j - TAPS / 2 + 1);
		const sinc = Math.sin(Math.PI * d) / (Math.PI * d);
		const x = (d + TAPS / 2) / TAPS;
		// Blackman window, which keeps the passband flat almost to the top.
		return sinc * (0.42 - 0.5 * Math.cos(TAU * x) + 0.08 * Math.cos(2 * TAU * x));
	}),
);

/** The highest level reached between samples, as a converter would play it. */
const truePeak = (left, right) => {
	let peak = 0;
	for (const channel of [left, right]) {
		for (let i = 0; i < channel.length; i++) {
			peak = Math.max(peak, Math.abs(channel[i]));
		}
	}
	const near = peak * 0.6;
	for (const channel of [left, right]) {
		for (let i = TAPS / 2; i < channel.length - TAPS / 2; i++) {
			if (Math.abs(channel[i]) < near && Math.abs(channel[i + 1]) < near) {
				continue;
			}
			for (const taps of BETWEEN) {
				let v = 0;
				for (let j = 0; j < TAPS; j++) {
					v += taps[j] * channel[i + j - TAPS / 2 + 1];
				}
				peak = Math.max(peak, Math.abs(v));
			}
		}
	}
	return peak;
};

const levelOf = (left, right, startSeconds, seconds) => {
	const first = Math.floor(startSeconds * SR);
	const last = Math.min(left.length, first + Math.floor(seconds * SR));
	let sum = 0;
	for (let i = first; i < last; i++) {
		sum += left[i] * left[i] + right[i] * right[i];
	}
	return toDb(Math.sqrt(sum / (2 * Math.max(1, last - first))));
};

/**
 * Turns the separate parts into the finished stereo track: reverb, ducking,
 * a little warmth, rumble removed, then loudness and peaks brought into line.
 */
const master = (mix, {seconds, isFilm}) => {
	const wet = plate(mix.wl, mix.wr);
	const n = mix.n;
	const left = new Float32Array(n);
	const right = new Float32Array(n);
	const highL = filter('high');
	const highR = filter('high');
	const fadeIn = isFilm ? 0.5 : 0.08;
	const fadeOut = Math.min(isFilm ? 1.6 : 1.1, seconds * 0.2);
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const gain = Math.min(1, t / fadeIn) * Math.min(1, Math.max(0, (seconds - t) / fadeOut));
		const duck = mix.duck[i] > 0 ? 10 ** (-mix.duck[i] / 20) : 1;
		const l = mix.ml[i] * duck + mix.fl[i] + wet.left[i] * WET;
		const r = mix.mr[i] * duck + mix.fr[i] + wet.right[i] * WET;
		left[i] = highL(Math.tanh(l * 1.1) / 1.1, 28, 0.6) * gain;
		right[i] = highR(Math.tanh(r * 1.1) / 1.1, 28, 0.6) * gain;
	}

	const broken = left.findIndex((value, i) => !Number.isFinite(value) || !Number.isFinite(right[i]));
	if (broken !== -1) {
		throw new Error(`The music has an invalid sample at ${(broken / SR).toFixed(2)} s. An instrument produced NaN.`);
	}
	const start = integratedLoudness(left, right);
	if (process.env.SOUND_DEBUG) {
		console.log(`  (before levelling: ${start.toFixed(1)} LUFS)`);
	}
	if (!Number.isFinite(start)) {
		throw new Error('The music came out silent. Check the moods and cues.');
	}
	let gain = 10 ** ((TARGET_LUFS - start) / 20);
	let ceiling = 10 ** ((CEILING_DBTP - 0.6) / 20);
	let result = limit(left, right, gain, ceiling);
	let lufs = integratedLoudness(result.left, result.right);
	for (let pass = 0; pass < 4 && Math.abs(lufs - TARGET_LUFS) > 0.1 && result.reduction < MAX_LIMITING_DB; pass++) {
		gain *= 10 ** ((TARGET_LUFS - lufs) / 20);
		result = limit(left, right, gain, ceiling);
		lufs = integratedLoudness(result.left, result.right);
	}
	// Meters disagree by a few tenths of a dB, and the AAC encoder in the MP4 adds a
	// few more, so aim half a dB under the ceiling.
	const aim = CEILING_DBTP - 0.5;
	let peak = truePeak(result.left, result.right);
	for (let pass = 0; pass < 3 && toDb(peak) > aim; pass++) {
		ceiling *= 10 ** ((aim - toDb(peak) - 0.05) / 20);
		result = limit(left, right, gain, ceiling);
		peak = truePeak(result.left, result.right);
	}
	return {
		left: result.left,
		right: result.right,
		lufs: integratedLoudness(result.left, result.right),
		truePeak: toDb(peak),
		limited: result.reduction,
	};
};

/**
 * Brings each chapter of a film to its mood's intended level, so that no chapter
 * comes out much louder or quieter than its neighbours. The change in level is
 * spread across the dissolve.
 */
const levelSections = (mix, sections, dissolve) => {
	if (sections.length < 2) {
		return [];
	}
	const measured = sections.map((section) => {
		const first = Math.max(0, Math.floor(section.start * SR));
		const last = Math.min(mix.n, Math.floor((section.start + section.length) * SR));
		const l = new Float32Array(last - first);
		const r = new Float32Array(last - first);
		for (let i = first; i < last; i++) {
			l[i - first] = mix.ml[i] + mix.fl[i] + mix.wl[i] * 0.3;
			r[i - first] = mix.mr[i] + mix.fr[i] + mix.wr[i] * 0.3;
		}
		return integratedLoudness(l, r);
	});
	const raw = sections.map((section, k) =>
		Number.isFinite(measured[k]) ? (MOOD_LEVEL[section.music.mood] ?? 0) - measured[k] : undefined,
	);
	const known = raw.filter((value) => value !== undefined);
	const middle = known.reduce((a, b) => a + b, 0) / Math.max(1, known.length);
	const gains = raw.map((value) => (value === undefined ? 0 : Math.max(-9, Math.min(9, value - middle))));
	const fade = Math.max(0.3, dissolve);
	for (let i = 0; i < mix.n; i++) {
		const t = i / SR;
		let k = 0;
		while (k < sections.length - 1 && t >= sections[k + 1].start) {
			k++;
		}
		let db = gains[k];
		if (k > 0 && t < sections[k].start + fade) {
			const p = (t - sections[k].start) / fade;
			db = gains[k - 1] + (gains[k] - gains[k - 1]) * p * p * (3 - 2 * p);
		}
		const g = 10 ** (db / 20);
		mix.ml[i] *= g;
		mix.mr[i] *= g;
		mix.fl[i] *= g;
		mix.fr[i] *= g;
		mix.wl[i] *= g;
		mix.wr[i] *= g;
	}
	return gains;
};

const composeScore = ({seconds, sections, isFilm, seed, transpose, dissolve}) => {
	for (const section of sections) {
		const {mood, ambience, transition} = section.music;
		if (!MOODS[mood]) {
			throw new Error(`Unknown mood "${mood}". Use one of: ${Object.keys(MOODS).join(', ')}`);
		}
		if (ambience !== undefined && !AMBIENCE[ambience]) {
			throw new Error(`Unknown ambience "${ambience}". Use one of: ${Object.keys(AMBIENCE).join(', ')}`);
		}
		if (transition !== undefined && !TRANSITIONS[transition]) {
			throw new Error(`Unknown transition "${transition}". Use one of: ${Object.keys(TRANSITIONS).join(', ')}`);
		}
	}
	const mix = new Mix(seconds);
	const kit = instruments(mix, {seed, transpose});
	sections.forEach((section, index) => {
		const isLast = index === sections.length - 1;
		const {mood, ambience, transition = 'whoosh', cues = []} = section.music;
		if (process.env.SOUND_ONLY !== 'cues') {
			MOODS[mood](kit, section.start, section.length, {section, isLast});
		}
		if (ambience) {
			AMBIENCE[ambience](kit, section.start, section.length + (isLast ? 0 : dissolve));
		}
		for (const cue of process.env.SOUND_ONLY === 'music' ? [] : cues) {
			playCue(kit, cue, section);
		}
		if (index > 0) {
			TRANSITIONS[transition](kit, section.start, dissolve);
		}
	});

	levelSections(mix, sections, dissolve);
	const track = master(mix, {seconds, isFilm});
	return {
		...track,
		levels: sections.map((section) => ({
			name: section.name,
			mood: section.music.mood,
			ambience: section.music.ambience,
			cues: (section.music.cues ?? []).length,
			start: section.start,
			level: levelOf(track.left, track.right, section.start, section.length),
		})),
	};
};

const writeWav = (file, left, right) => {
	const size = left.length * 4;
	const header = Buffer.alloc(44);
	header.write('RIFF', 0);
	header.writeUInt32LE(36 + size, 4);
	header.write('WAVEfmt ', 8);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(2, 22);
	header.writeUInt32LE(SR, 24);
	header.writeUInt32LE(SR * 4, 28);
	header.writeUInt16LE(4, 32);
	header.writeUInt16LE(16, 34);
	header.write('data', 36);
	header.writeUInt32LE(size, 40);
	const data = Buffer.alloc(size);
	// A tiny amount of shaped noise hides the steps of 16-bit audio in quiet fades.
	const dither = random(5);
	const quantise = (value) =>
		Math.max(-32768, Math.min(32767, Math.round(Math.max(-1, Math.min(1, value)) * 32767 + dither() - dither())));
	for (let i = 0; i < left.length; i++) {
		data.writeInt16LE(quantise(left[i]), i * 4);
		data.writeInt16LE(quantise(right[i]), i * 4 + 2);
	}
	fs.mkdirSync(path.dirname(file), {recursive: true});
	fs.writeFileSync(file, Buffer.concat([header, data]));
};

/** Works out the music for a shot or film, saves it as a WAV and reports its levels. */
export const makeSoundtrack = ({composition, flags, output}) => {
	const {id, fps, durationInFrames, props} = composition;
	const seconds = durationInFrames / fps;
	const forced = typeof flags.music === 'string' ? flags.music : flags.mood;
	const isFilm = Array.isArray(props.timeline) && !forced;
	const sections = isFilm
		? props.timeline.map((slot) => ({
				name: slot.scene,
				start: slot.start,
				length: slot.length,
				seconds: slot.seconds,
				music: slot.music ?? {mood: DEFAULT_MOOD},
			}))
		: [
				{
					name: id,
					start: 0,
					length: seconds,
					seconds,
					music: forced ? {mood: forced} : (props.music ?? {mood: DEFAULT_MOOD}),
				},
			];

	const score = composeScore({
		seconds,
		sections,
		isFilm,
		seed: Number(flags.seed ?? 1),
		transpose: Number(flags.transpose ?? 0),
		dissolve: isFilm ? (props.dissolve ?? 0.8) : 0,
	});
	writeWav(output, score.left, score.right);

	const limited = score.limited >= 0.1 ? `, limiter up to ${score.limited.toFixed(1)} dB` : '';
	console.log(
		`Music: ${seconds.toFixed(1)} s, ${score.lufs.toFixed(1)} LUFS, true peak ${score.truePeak.toFixed(1)} dBTP${limited}`,
	);
	for (const {name, mood, ambience, cues, start, level} of score.levels) {
		const bed = ambience ? ` + ${ambience}` : '';
		const count = cues > 0 ? `  (${cues} cue${cues === 1 ? '' : 's'})` : '';
		console.log(
			`  ${start.toFixed(1).padStart(6)} s  ${level.toFixed(1).padStart(6)} dB  ${(mood + bed).padEnd(16)} ${name}${count}`,
		);
	}
	return output;
};
