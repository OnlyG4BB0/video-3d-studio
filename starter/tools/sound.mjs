// Original music, synthesised sample by sample. It uses no recordings and no
// samples, and the same score always produces exactly the same sound.

import fs from 'node:fs';
import path from 'node:path';

const SR = 44100;
const TAU = Math.PI * 2;
const TARGET_LUFS = -14;
const PEAK_LIMIT = 0.89;
const BEAT = 0.4;

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

/** A bar length close to `bar` seconds that divides `length` exactly. */
const fitBars = (names, length, bar = 3.4) => {
	const count = Math.max(1, Math.round(length / bar));
	return {
		bar: length / count,
		list: Array.from({length: count}, (_, index) => names[index % names.length]),
	};
};

class Mix {
	constructor(seconds) {
		this.n = Math.ceil(seconds * SR);
		this.dl = new Float32Array(this.n);
		this.dr = new Float32Array(this.n);
		this.wl = new Float32Array(this.n);
		this.wr = new Float32Array(this.n);
	}

	// fn(seconds since the note began) returns a mono sample.
	add(start, length, fn, {amp = 1, pan = 0, send = 0.2} = {}) {
		const first = Math.max(0, Math.floor(start * SR));
		const last = Math.min(this.n, Math.floor((start + length) * SR));
		const angle = ((pan + 1) * Math.PI) / 4;
		const l = Math.cos(angle) * amp;
		const r = Math.sin(angle) * amp;
		for (let i = first; i < last; i++) {
			const v = fn(i / SR - start);
			this.dl[i] += v * l;
			this.dr[i] += v * r;
			this.wl[i] += v * l * send;
			this.wr[i] += v * r * send;
		}
	}
}

const instruments = (mix, {seed, transpose}) => {
	const hz = (midi) => 440 * 2 ** ((midi + transpose - 69) / 12);
	const noise = random(99);

	const kit = {
		seed,
		random: (offset) => random(seed * 1000 + offset),
		pick: (list) => list[(Math.max(1, seed) - 1) % list.length],

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

		bell(start, midi, {amp = 0.14, length = 2.6, ratio = 3.51, pan = 0, send = 0.75} = {}) {
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
				{amp, pan, send},
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

		bass(start, midi, length, {amp = 0.3} = {}) {
			const f = hz(midi);
			mix.add(
				start,
				length,
				(t) => {
					const env = Math.min(1, t * 90) * Math.min(1, (length - t) * 25);
					return Math.tanh((Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * 1.5) * env;
				},
				{amp, send: 0.03},
			);
		},

		kick(start, {amp = 0.5} = {}) {
			mix.add(
				start,
				0.42,
				(t) => {
					const phase = TAU * (46 * t + (95 / 26) * (1 - Math.exp(-t * 26)));
					return Math.tanh(Math.sin(phase) * 2) * Math.exp(-t * 8.5);
				},
				{amp, send: 0.04},
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

		tick(start, {amp = 0.12, high = true, pan = 0} = {}) {
			const a = high ? 3350 : 2480;
			mix.add(
				start,
				0.05,
				(t) => (Math.sin(TAU * a * t) + 0.6 * Math.sin(TAU * a * 1.73 * t)) * Math.exp(-t * 240),
				{amp, pan, send: 0.3},
			);
		},

		// A metal object landing: a low thump with inharmonic ringing on top.
		clank(start, {amp = 0.22, pitch = 240, pan = 0} = {}) {
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
				{amp, pan, send: 0.45},
			);
		},

		impact(start, {amp = 0.6, length = 2.8} = {}) {
			let low = 0;
			mix.add(
				start,
				length,
				(t) => {
					const phase = TAU * (30 * t + (42 / 3.2) * (1 - Math.exp(-t * 3.2)));
					low += (noise() * 2 - 1 - low) * 0.12;
					return Math.tanh(Math.sin(phase) * 1.8) * Math.exp(-t * 1.7) + low * Math.exp(-t * 7) * 1.5;
				},
				{amp, send: 0.5},
			);
		},

		riser(start, length, {amp = 0.14} = {}) {
			let low = 0;
			mix.add(
				start,
				length,
				(t) => {
					const p = t / length;
					low += (noise() * 2 - 1 - low) * (0.01 + p * p * 0.5);
					return low * p * p * 2.2 + 0.3 * p ** 3 * Math.sin(TAU * (110 * t + 160 * t * p));
				},
				{amp, send: 0.6},
			);
		},

		chords(start, bar, list, opts) {
			list.forEach((name, index) => {
				kit.pad(start + index * bar, bar, CHORD[name].notes, opts);
			});
		},
	};
	return kit;
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
};

// These two already open with something strong of their own.
const OPENS_BY_ITSELF = new Set(['build', 'resolve']);

const CUES = {
	bell: (kit, at, cue) => kit.bell(at, cue.note ?? 81, {amp: cue.amp ?? 0.14, pan: cue.pan ?? 0}),
	clank: (kit, at, cue) =>
		kit.clank(at, {amp: cue.amp ?? 0.22, pitch: cue.pitch ?? 240, pan: cue.pan ?? 0}),
	impact: (kit, at, cue) => kit.impact(at, {amp: cue.amp ?? 0.5}),
	riser: (kit, at, cue) => {
		const length = cue.length ?? 2;
		kit.riser(at - length, length, {amp: cue.amp ?? 0.16});
	},
	tick: (kit, at, cue) => kit.tick(at, {amp: cue.amp ?? 0.12, pan: cue.pan ?? 0}),
	kick: (kit, at, cue) => kit.kick(at, {amp: cue.amp ?? 0.45}),
};

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

// Two sets of parallel echoes followed by diffusers: a large soft room.
const reverb = (input, offset) => {
	const output = new Float32Array(input.length);
	const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => ({
		b: new Float32Array(d + offset),
		i: 0,
		s: 0,
	}));
	const passes = [556, 441, 341, 225].map((d) => ({b: new Float32Array(d + offset), i: 0}));
	for (let n = 0; n < input.length; n++) {
		let sum = 0;
		for (const c of combs) {
			const y = c.b[c.i];
			c.s = y * 0.62 + c.s * 0.38;
			c.b[c.i] = input[n] + c.s * 0.86;
			c.i = (c.i + 1) % c.b.length;
			sum += y;
		}
		for (const p of passes) {
			const y = p.b[p.i];
			p.b[p.i] = sum + y * 0.5;
			p.i = (p.i + 1) % p.b.length;
			sum = y - sum;
		}
		output[n] = sum * 0.05;
	}
	return output;
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

const levelOf = (left, right, startSeconds, seconds) => {
	const first = Math.floor(startSeconds * SR);
	const last = Math.min(left.length, first + Math.floor(seconds * SR));
	let sum = 0;
	for (let i = first; i < last; i++) {
		sum += left[i] * left[i] + right[i] * right[i];
	}
	return toDb(Math.sqrt(sum / (2 * Math.max(1, last - first))));
};

const composeScore = ({seconds, sections, isFilm, seed, transpose}) => {
	for (const section of sections) {
		if (!MOODS[section.music.mood]) {
			throw new Error(
				`Unknown mood "${section.music.mood}". Use one of: ${Object.keys(MOODS).join(', ')}`,
			);
		}
	}
	const mix = new Mix(seconds);
	const kit = instruments(mix, {seed, transpose});
	sections.forEach((section, index) => {
		const isLast = index === sections.length - 1;
		MOODS[section.music.mood](kit, section.start, section.length, {section, isLast});
		for (const cue of section.music.cues ?? []) {
			playCue(kit, cue, section);
		}
		if (index > 0 && !OPENS_BY_ITSELF.has(section.music.mood)) {
			kit.impact(section.start, {amp: 0.26, length: 2});
		}
	});

	const wetL = reverb(mix.wl, 0);
	const wetR = reverb(mix.wr, 23);
	const left = new Float32Array(mix.n);
	const right = new Float32Array(mix.n);
	const fadeIn = isFilm ? 0.5 : 0.08;
	const fadeOut = Math.min(isFilm ? 1.6 : 1.1, seconds * 0.2);
	let peak = 0;
	for (let i = 0; i < mix.n; i++) {
		const t = i / SR;
		const gain = Math.min(1, t / fadeIn) * Math.min(1, Math.max(0, (seconds - t) / fadeOut));
		left[i] = Math.tanh((mix.dl[i] + wetL[i]) * 1.15) * gain;
		right[i] = Math.tanh((mix.dr[i] + wetR[i]) * 1.15) * gain;
		peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
	}

	const scale = Math.min(10 ** ((TARGET_LUFS - integratedLoudness(left, right)) / 20), PEAK_LIMIT / peak);
	for (let i = 0; i < mix.n; i++) {
		left[i] *= scale;
		right[i] *= scale;
	}
	return {
		left,
		right,
		lufs: integratedLoudness(left, right),
		peak: toDb(peak * scale),
		levels: sections.map((section) => ({
			name: section.name,
			mood: section.music.mood,
			start: section.start,
			level: levelOf(left, right, section.start, section.length),
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
	for (let i = 0; i < left.length; i++) {
		data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), i * 4);
		data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), i * 4 + 2);
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
	});
	writeWav(output, score.left, score.right);

	console.log(
		`Music: ${seconds.toFixed(1)} s, ${score.lufs.toFixed(1)} LUFS, peak ${score.peak.toFixed(1)} dB`,
	);
	for (const {name, mood, start, level} of score.levels) {
		console.log(`  ${start.toFixed(1).padStart(6)} s  ${level.toFixed(1).padStart(6)} dB  ${mood.padEnd(10)} ${name}`);
	}
	return output;
};
