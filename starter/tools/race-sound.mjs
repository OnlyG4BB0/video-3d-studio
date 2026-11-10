// Engines, tyres and crowds, and eight electronic moods, synthesised sample by
// sample like everything in sound.mjs. The engine is a flat-six: firing pulses in
// the order 1-6-2-4-3-5, alternating between two banks with their own exhaust
// resonances, plus intake roar, gear whine, crackle on the overrun and the
// Doppler shift of a car going past. Nothing is recorded or sampled.

const TAU = Math.PI * 2;

/** A resonant state-variable filter, one sample at a time: 'low', 'band' or 'high'. */
const svf = (sr, mode = 'low') => {
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
			const g = Math.tan((Math.PI * Math.min(Math.max(cutoff, 10), sr * 0.45)) / sr);
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

/** A repeatable number in 0..1 for an integer and a seed. */
const hash = (n, seed) => {
	let h = (Math.imul(n | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const smooth = (a, b, x) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/** Saw wave with smoothed corners, so high notes do not alias. */
const blepSaw = (phase, dt) => {
	let v = 2 * phase - 1;
	if (phase < dt) {
		const x = phase / dt;
		v -= x + x - x * x - 1;
	} else if (phase > 1 - dt) {
		const x = (phase - 1) / dt;
		v -= x * x + x + x + 1;
	}
	return v;
};

/** Adds the race instruments to the kit made by sound.mjs. */
export const raceInstruments = (kit, mix, {hz, white, SR}) => {
	/** Writes a stereo sound: fn(t, out) fills out[0] and out[1]. */
	kit.stereo = (start, length, fn, {send = 0.2, fx = true} = {}) => {
		const first = Math.max(0, Math.floor(start * SR));
		const last = Math.min(mix.n, Math.floor((start + length) * SR));
		const outL = fx ? mix.fl : mix.ml;
		const outR = fx ? mix.fr : mix.mr;
		const out = [0, 0];
		for (let i = first; i < last; i++) {
			out[0] = 0;
			out[1] = 0;
			fn(Math.max(0, i / SR - start), out);
			outL[i] += out[0];
			outR[i] += out[1];
			mix.wl[i] += out[0] * send;
			mix.wr[i] += out[1] * send;
		}
	};
	kit.add = (start, length, fn, opts) => mix.add(start, length, fn, opts);

	// ------------------------------------------------------------ engine

	/**
	 * One car as a camera hears it. The cue carries control values `rate` times a
	 * second: rpm, load (throttle), gain, side, delay (for Doppler), squeal, road
	 * and an optional formant scale below 1 for slowed-down sound.
	 */
	kit.engine = (at, cue) => {
		const rate = cue.rate ?? 60;
		const rpm = cue.rpm ?? [];
		const count = rpm.length;
		if (count < 2) return;
		const length = (count - 1) / rate;
		const seed = cue.seed ?? 1;
		const amp = (cue.amp ?? 1) * 0.42;
		const mech = cue.mech ?? 0;
		const series = (name, fallback) => cue[name] ?? new Array(count).fill(fallback);
		const load = series('load', 0.6);
		const gain = series('gain', 1);
		const side = series('side', 0);
		const delay = series('delay', 0);
		const squeal = series('squeal', 0);
		const road = series('road', 0);
		const scale = series('scale', 1);
		// Revolutions of the crank: given, to match the picture, or integrated from the revs.
		const revs = new Float64Array(count);
		if (cue.turns && cue.turns.length === count) {
			revs.set(cue.turns);
		} else {
			for (let k = 1; k < count; k++) {
				revs[k] = revs[k - 1] + ((rpm[k - 1] + rpm[k]) / 2 / 60) / rate;
			}
		}
		const sample = (values, t) => {
			const f = Math.min(count - 1.0001, Math.max(0, t * rate));
			const k = Math.floor(f);
			return values[k] + (values[k + 1] - values[k]) * (f - k);
		};
		// Smooth (cubic) reading of the crank position, so the pitch glides between values.
		const revsAt = (t) => {
			const f = Math.min(count - 1.0001, Math.max(0, t * rate));
			const k = Math.floor(f);
			const u = f - k;
			const p0 = revs[Math.max(0, k - 1)];
			const p1 = revs[k];
			const p2 = revs[k + 1];
			const p3 = revs[Math.min(count - 1, k + 2)];
			const m1 = (p2 - p0) / 2;
			const m2 = (p3 - p1) / 2;
			const u2 = u * u;
			const u3 = u2 * u;
			return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
		};
		const ORDER = [1, 6, 2, 4, 3, 5];
		const cylinderLevel = [1.0, 0.94, 1.05, 0.97, 1.02, 0.95].map((v, i) => v * (0.97 + 0.06 * hash(i, seed)));
		// Two banks, each with its own header and pipe resonances.
		const bankA = [svf(SR, 'band'), svf(SR, 'band'), svf(SR, 'band')];
		const bankB = [svf(SR, 'band'), svf(SR, 'band'), svf(SR, 'band')];
		const formA = [150, 520, 1480];
		const formB = [172, 590, 1310];
		const body = svf(SR, 'low');
		const flow = svf(SR, 'band');
		const intake = svf(SR, 'band');
		const crackleLow = svf(SR, 'low');
		const tyre = svf(SR, 'band');
		const tyre2 = svf(SR, 'band');
		const rumble = svf(SR, 'low');
		const air = [svf(SR, 'low'), svf(SR, 'low')];
		const dcL = svf(SR, 'high');
		const dcR = svf(SR, 'high');
		const fade = Math.min(0.012, length / 4);
		let lastShiftRpm = rpm[0];
		kit.stereo(
			at,
			length,
			(t, out) => {
				const d = sample(delay, t);
				const te = Math.max(0, t - d);
				const r = Math.max(0, sample(rpm, te));
				const g = sample(gain, te);
				const l = sample(load, te);
				const sc = Math.max(0.12, sample(scale, te));
				const env = Math.min(1, t / fade, (length - t) / fade);
				if (r < 60 || env <= 0) {
					return;
				}
				const total = revsAt(te) * 3;
				const n = Math.floor(total);
				const phase = total - n;
				const fireRate = (r / 60) * 3;
				const tau = phase / fireRate;
				const cyl = ORDER[((n % 6) + 6) % 6];
				const bank = cyl <= 3 ? 0 : 1;
				// An upshift cuts the ignition for a few firings; idle is lumpier.
				const idle = 1 - smooth(1400, 3200, r);
				const jitter = 1 + (hash(n, seed) - 0.5) * (0.12 + idle * 0.5);
				const shiftCut = r < lastShiftRpm - 900 ? 0.15 : 1;
				lastShiftRpm = lastShiftRpm * 0.9995 + r * 0.0005;
				const level = cylinderLevel[cyl - 1] * jitter * (0.35 + 0.65 * Math.min(1, l + 0.25)) * shiftCut;
				const tau0 = 0.00019 / sc;
				const x = tau / tau0;
				const pulse = x * Math.exp(1 - x) * level;
				const pa = bank === 0 ? pulse : 0;
				const pb = bank === 1 ? pulse : 0;
				let exhaust = 0;
				for (let i = 0; i < 3; i++) {
					exhaust += bankA[i](pa, formA[i] * sc, 1.4 + i) * (1.4 - i * 0.35);
					exhaust += bankB[i](pb, formB[i] * sc, 1.4 + i) * (1.4 - i * 0.35);
				}
				const dry = body(pulse, (3200 + 4200 * l) * sc, 0.7);
				let v = Math.tanh((dry * 0.9 + exhaust * 0.55) * (1.6 + 2.2 * l)) * 0.8;
				// Combustion and flow noise riding on each pulse.
				const noisy = flow(white() * Math.exp(-tau / (0.0007 / sc)), 2300 * sc, 0.8);
				v += noisy * (0.15 + 0.35 * l) * level;
				// Induction roar through the throttle bodies at high revs and load.
				const roar = intake(white(), 980 * sc, 1.3) * (0.55 + 0.45 * Math.sin(TAU * total));
				v += roar * l * (r / 8000) ** 2 * 0.55;
				// Crackle on the overrun.
				if (l < 0.15 && r > 3500 && hash(n * 7 + 3, seed) < 0.16) {
					v += crackleLow(white() * Math.exp(-tau / 0.0022), 1700, 0.9) * 1.6;
				}
				// Gearbox whine and, from inside, the chain and the valves.
				const turns = total / 3;
				v += Math.sin(TAU * turns * 9.3) * 0.025 * (0.4 + l);
				if (mech > 0) {
					let ticks = 0;
					for (const at4 of [0.12, 0.37, 0.62, 0.87]) {
						const since = (phase - at4 + 1) % 1;
						ticks += Math.sin(TAU * 4200 * sc * since / fireRate) * Math.exp(-(since / fireRate) / 0.0018);
					}
					v += ticks * mech * 0.09;
					v += Math.sin(TAU * turns * 22) * mech * 0.02;
					// A heavy thump for each firing when slowed right down.
					v += Math.sin(TAU * 46 * tau) * Math.exp(-tau / 0.07) * (1 - sc) * level * 0.9;
				}
				// Tyres and road.
				const sq = sample(squeal, te);
				if (sq > 0.002) {
					const wob = 1 + 0.03 * Math.sin(TAU * 7.3 * t) + 0.02 * Math.sin(TAU * 13.1 * t);
					v += (tyre(white(), 1150 * wob, 9) + tyre2(white(), 1730 * wob, 7) * 0.6) * sq * 1.6;
				}
				const rd = sample(road, te);
				if (rd > 0.002) {
					v += rumble(white(), 260, 0.6) * rd * 0.7;
				}
				// Distance: quieter and duller; then place it left or right.
				const metres = d * 343;
				const cutoff = Math.min(18000, Math.max(1400, 18000 * (8 / Math.max(metres, 8)) ** 0.75));
				const s = Math.max(-1, Math.min(1, sample(side, t)));
				const angle = ((s + 1) * Math.PI) / 4;
				const a = v * g * amp * env;
				out[0] = dcL(air[0](a, cutoff, 0.6) * Math.cos(angle), 25, 0.6);
				out[1] = dcR(air[1](a, cutoff, 0.6) * Math.sin(angle), 25, 0.6);
			},
			{send: 0.12, fx: true},
		);
	};

	/** The starter motor turning the engine over before it fires. */
	kit.starter = (at, {amp = 0.5, length = 0.8} = {}) => {
		const band = svf(SR, 'band');
		mix.add(
			at,
			length + 0.1,
			(t) => {
				const lump = 0.6 + 0.4 * Math.sin(TAU * 5.5 * t) ** 2;
				const whine = Math.sin(TAU * 230 * t) * 0.6 + Math.sin(TAU * 460 * t) * 0.25 + Math.sin(TAU * 1380 * t) * 0.08;
				const grind = band(white(), 900, 2) * 0.5;
				const env = Math.min(1, t * 30) * Math.min(1, Math.max(0, (length + 0.1 - t) * 12));
				return (whine + grind) * lump * env;
			},
			{amp, send: 0.15, fx: true},
		);
	};

	/** A crowd in the stands: a murmur, with a cheer at `cheer` seconds. */
	kit.crowd = (at, length, {amp = 0.4, cheer} = {}) => {
		const bands = [svf(SR, 'band'), svf(SR, 'band'), svf(SR, 'band')];
		const wobble = [0.31, 0.47, 0.73];
		mix.add(
			at,
			length,
			(t) => {
				let v = 0;
				bands.forEach((band, i) => {
					v += band(white(), [420, 900, 1800][i], 0.9) * (0.7 + 0.3 * Math.sin(TAU * wobble[i] * t + i));
				});
				const lift = cheer === undefined ? 0 : smooth(cheer - 0.2, cheer + 0.6, t) * Math.exp(-Math.max(0, t - cheer - 0.6) / 3);
				const env = Math.min(1, t / 1.5, (length - t) / 1.5);
				return v * (0.25 + 1.4 * lift) * env;
			},
			{amp, send: 0.5, fx: true},
		);
	};

	/** A heavy relay closing: the start lights switching. */
	kit.clunk = (at, {amp = 0.25} = {}) => {
		const low = svf(SR, 'low');
		mix.add(
			at,
			0.25,
			(t) => (Math.sin(TAU * 70 * t) * Math.exp(-t * 30) + low(white(), 1200, 1) * Math.exp(-t * 60)) * Math.min(1, t * 3000),
			{amp, send: 0.3, fx: true},
		);
	};

	// ------------------------------------------------------------ synths for the moods

	/** A subtractive synth voice: detuned saws through a resonant low-pass with its own envelope. */
	kit.saw = (start, length, midi, {amp = 0.06, cutoff = 1800, env = 2400, decay = 0.25, q = 1.2, pan = 0, send = 0.3, voices = 2, detune = 9, attack = 0.005, release = 0.12, fx = false} = {}) => {
		const f = hz(midi);
		const lp = svf(SR, 'low');
		const phases = Array.from({length: voices}, (_, i) => (i * 0.37) % 1);
		const rates = Array.from({length: voices}, (_, i) => f * 2 ** (((i - (voices - 1) / 2) * detune) / 1200));
		mix.add(
			start,
			length + release,
			(t) => {
				let v = 0;
				for (let i = 0; i < voices; i++) {
					phases[i] = (phases[i] + rates[i] / SR) % 1;
					v += blepSaw(phases[i], rates[i] / SR);
				}
				v /= voices;
				const amplitude = Math.min(1, t / attack) * (t > length ? Math.max(0, 1 - (t - length) / release) : 1);
				return lp(v, cutoff + env * Math.exp(-t / decay), q) * amplitude;
			},
			{amp, pan, send, fx},
		);
	};

	/** A squelchy acid bass line voice. */
	kit.acid = (start, length, midi, {amp = 0.1, cutoff = 500, accent = 0, q = 7} = {}) => {
		kit.saw(start, length, midi, {amp: amp * (1 + accent * 0.4), cutoff, env: 1800 + accent * 2600, decay: 0.12 + accent * 0.08, q, voices: 1, send: 0.12, release: 0.03});
	};

	/** A Reese bass: two saws beating against each other, low and growling. */
	kit.reese = (start, length, midi, {amp = 0.12} = {}) => {
		kit.saw(start, length, midi, {amp, cutoff: 420, env: 380, decay: 0.6, q: 1.1, voices: 3, detune: 22, send: 0.05, release: 0.08, attack: 0.01});
	};

	/** An 808 sub: a sine that drops in pitch and rings. */
	kit.sub = (start, midi, {amp = 0.4, length = 1.2} = {}) => {
		const f = hz(midi);
		mix.add(
			start,
			length,
			(t) => {
				const phase = TAU * (f * t + ((f * 1.8) / 22) * (1 - Math.exp(-t * 22)));
				return Math.tanh(Math.sin(phase) * 1.6) * Math.exp(-t * (3 / length)) * Math.min(1, t * 900);
			},
			{amp, send: 0.03},
		);
	};

	/** Three quick noise bursts: a hand clap. */
	kit.clap = (start, {amp = 0.14, pan = 0} = {}) => {
		const band = svf(SR, 'band');
		mix.add(
			start,
			0.3,
			(t) => {
				const bursts = [0, 0.011, 0.022].reduce((sum, offset) => sum + (t >= offset ? Math.exp(-(t - offset) * 180) : 0), 0);
				return band(white(), 1250, 1.1) * (bursts + Math.exp(-t * 16) * 0.5);
			},
			{amp, pan, send: 0.35},
		);
	};

	/** A metallic hit with inharmonic partials, for industrial rhythms. */
	kit.metal = (start, {amp = 0.1, pitch = 420, pan = 0, decay = 10} = {}) => {
		const ratios = [1, 1.41, 2.13, 2.97, 4.07];
		mix.add(
			start,
			0.6,
			(t) => {
				let v = 0;
				ratios.forEach((r, i) => {
					v += Math.sin(TAU * pitch * r * t + i * 1.3) * Math.exp(-t * (decay + i * 6)) / (1 + i * 0.6);
				});
				return v * Math.min(1, t * 2500);
			},
			{amp, pan, send: 0.3},
		);
	};

	/** A snare drowned in a short, bright reverb, as in eighties pop. */
	kit.gatedSnare = (start, {amp = 0.2} = {}) => {
		kit.snare(start, {amp, tone: 180, decay: 12});
		const band = svf(SR, 'band');
		mix.add(start, 0.32, (t) => band(white(), 2400, 0.5) * (t < 0.26 ? 1 : Math.max(0, 1 - (t - 0.26) / 0.06)) * Math.exp(-t * 3), {amp: amp * 0.5, send: 0.6});
	};
};

// ---------------------------------------------------------------- moods

const A_MINOR = {Am: [57, 60, 64], F: [53, 57, 60], C: [55, 60, 64], G: [55, 59, 62], Dm: [57, 62, 65], Em: [55, 59, 64], E: [56, 59, 64]};
const ROOTS = {Am: 45, F: 41, C: 48, G: 43, Dm: 50, Em: 40, E: 40};
const chordAt = (list, beat, beatsPerChord) => list[Math.floor(beat / beatsPerChord) % list.length];

/** Steps through a length at a fixed step, calling fn(time, index). */
const each = (t0, length, step, fn, from = 0) => {
	for (let i = 0; from + i * step < length - 0.05; i++) {
		fn(t0 + from + i * step, i);
	}
};

export const RACE_MOODS = {
	/** Eighties synths at sunset: arpeggios and pads that wait, then a gated beat when the race starts. */
	synthwave(kit, t0, length, {section}) {
		const beat = 0.6;
		const hit = (section.music.hit ?? 0.66) * length;
		const list = ['Am', 'F', 'C', 'G'];
		each(t0, length, beat * 4, (t, i) => {
			const name = list[i % 4];
			kit.pad(t, beat * 4, A_MINOR[name].map((n) => n + 12), {amp: 0.035, bright: 0.6, attack: 0.6, release: 0.8});
		});
		// Arpeggio in sixteenths, opening up as the start nears.
		each(t0, length, beat / 4, (t, i) => {
			const name = chordAt(list, i / 4, 4);
			const notes = [...A_MINOR[name], A_MINOR[name][0] + 12];
			const open = Math.min(1, (t - t0) / hit);
			kit.saw(t, beat / 5, notes[i % 4] + 12, {amp: 0.028 + 0.02 * open, cutoff: 600 + 2600 * open, env: 1400, decay: 0.08, q: 2, pan: i % 2 ? 0.35 : -0.35, send: 0.4, voices: 1});
		});
		// Pulsing bass in eighths.
		each(t0, length, beat / 2, (t, i) => {
			const name = chordAt(list, i / 2, 4);
			kit.saw(t, beat / 2.6, ROOTS[name], {amp: 0.07, cutoff: 260, env: 900, decay: 0.09, q: 1.6, voices: 2, detune: 6, send: 0.05});
		});
		// The beat drops in with the start.
		each(t0, length, beat, (t, i) => {
			if (t - t0 < hit) return;
			kit.kick(t, {amp: 0.42});
			if (i % 2 === 1) kit.gatedSnare(t, {amp: 0.2});
			kit.hat(t + beat / 2, {amp: 0.05, decay: 60});
		});
		// A soaring lead after the start.
		const lead = [69, 72, 76, 74, 72, 69, 67, 69];
		each(t0, length, beat, (t, i) => {
			if (t - t0 < hit + beat * 2 || i % 2) return;
			kit.saw(t, beat * 1.6, lead[(i / 2) % lead.length] + 12, {amp: 0.04, cutoff: 1800, env: 1200, decay: 0.3, q: 1, voices: 3, detune: 12, send: 0.5, attack: 0.03, release: 0.4});
		});
		kit.dip(t0 + hit, 3, 0.5);
	},

	/** Drum and bass at 172 bpm: broken beat, Reese bass and minor stabs. */
	dnb(kit, t0, length) {
		const beat = 60 / 172;
		const bar = beat * 4;
		const list = ['Am', 'F', 'Dm', 'E'];
		each(t0, length, bar, (t, b) => {
			// The classic two-step: kick on 1 and the "and" of 3, snare on 2 and 4.
			kit.kick(t, {amp: 0.44});
			kit.kick(t + beat * 2.5, {amp: 0.36});
			kit.snare(t + beat, {amp: 0.2, tone: 210, decay: 18});
			kit.snare(t + beat * 3, {amp: 0.2, tone: 210, decay: 18});
			if (b % 2) kit.snare(t + beat * 3.75, {amp: 0.07, tone: 230, decay: 30, soft: true});
			for (let s = 0; s < 8; s++) {
				kit.hat(t + (s * beat) / 2, {amp: s % 2 ? 0.035 : 0.055, decay: 90, pan: s % 2 ? 0.3 : -0.2});
			}
			const name = list[Math.floor(b / 2) % 4];
			kit.reese(t, bar * 0.95, ROOTS[name] - 12 + (name === 'E' ? 12 : 0), {amp: 0.11});
			if (b % 2 === 0) {
				A_MINOR[name].forEach((n, i) => kit.saw(t + beat * 1.5, beat * 0.5, n + 12, {amp: 0.03, cutoff: 1200, env: 3000, decay: 0.1, q: 1, voices: 2, pan: (i - 1) * 0.4, send: 0.45}));
			}
		});
		kit.pad(t0, length, [69, 76, 81], {amp: 0.018, bright: 0.3, attack: 2, release: 1.5});
	},

	/** Half-time heaviness: slow snare, sliding 808 and a held breath for the slow motion. */
	halftime(kit, t0, length, {section}) {
		const beat = 60 / 140;
		const bar = beat * 4;
		const hold = (section.music.hit ?? 0.44) * length;
		each(t0, length, bar, (t, b) => {
			const quiet = t - t0 > hold - 0.2 && t - t0 < hold + 2.6;
			if (!quiet) {
				kit.kick(t, {amp: 0.4});
				kit.snare(t + beat * 2, {amp: 0.24, tone: 170, decay: 10});
				if (b % 2) kit.kick(t + beat * 2.75, {amp: 0.3});
				for (let s = 0; s < 8; s++) kit.hat(t + (s * beat) / 2, {amp: s % 4 === 2 ? 0.05 : 0.03, decay: 80});
			}
			kit.sub(t, [33, 33, 36, 31][b % 4], {amp: quiet ? 0.32 : 0.4, length: bar * 0.9});
		});
		kit.pad(t0, length, [57, 60, 64, 71], {amp: 0.022, bright: 0.25, attack: 1.5, release: 1.2});
		kit.swell(t0 + hold - 1.2, 1.2, {amp: 0.1});
	},

	/** Industrial: clanking metal in sixteenths, a distorted kick and a dark drone. */
	industrial(kit, t0, length, {section}) {
		const beat = 0.5;
		const drop = (section.music.hit ?? 0.41) * length;
		kit.pad(t0, length, [33, 40, 45], {amp: 0.045, bright: 0.2, attack: 2.5, release: 2});
		each(t0, length, beat / 4, (t, i) => {
			const full = t - t0 >= drop;
			const accent = i % 4 === 0;
			if (full || i % 8 === 0) {
				kit.metal(t, {amp: accent ? 0.06 : 0.025, pitch: accent ? 380 : 610 + (i % 3) * 90, pan: ((i % 5) - 2) * 0.2, decay: accent ? 9 : 22});
			}
		});
		each(t0, length, beat, (t, i) => {
			if (t - t0 < drop) {
				if (i % 4 === 0) kit.kick(t, {amp: 0.3, soft: true});
				return;
			}
			kit.kick(t, {amp: 0.46});
			if (i % 2 === 1) kit.clank(t, {amp: 0.12, pitch: 210});
		});
		each(t0, length, beat * 8, (t) => kit.clank(t + beat * 7.5, {amp: 0.09, pitch: 140}));
	},

	/** Acid: four to the floor with a squelching line that opens as the revs climb. */
	acid(kit, t0, length, {section}) {
		const beat = 60 / 128;
		const peak = (section.music.hit ?? 0.86) * length;
		const line = [33, 33, 45, 33, 36, 33, 43, 33, 33, 45, 33, 40, 33, 38, 45, 33];
		each(t0, length, beat / 4, (t, i) => {
			const open = Math.min(1, ((t - t0) / peak) ** 1.4);
			kit.acid(t, beat / 4.4, line[i % 16] + 12, {amp: 0.08, cutoff: 260 + open * 2200, accent: i % 4 === 2 ? 1 : 0, q: 6 + open * 6});
		});
		each(t0, length, beat, (t, i) => {
			if (t - t0 > 1.8) kit.kick(t, {amp: 0.42});
			if (t - t0 > 4 && i % 2) kit.clap(t, {amp: 0.11});
			if (t - t0 > 7) kit.hat(t + beat / 2, {amp: 0.06, decay: 40});
		});
		kit.pad(t0 + peak, Math.max(0.5, length - peak), [57, 64, 69, 72], {amp: 0.05, bright: 0.8, attack: 0.05, release: 1});
		kit.dip(t0 + peak, 3, 0.5);
	},

	/** A slow ascent: rising arpeggios over big chords, opening into light. */
	ascent(kit, t0, length, {section}) {
		const open = (section.music.hit ?? 0.5) * length;
		const list = [['Am', 0], ['F', 0], ['C', 0], ['G', 0]];
		const span = length / 4;
		list.forEach(([name], i) => {
			kit.pad(t0 + i * span, span + 0.6, A_MINOR[name].map((n) => n + 12), {amp: 0.045 + i * 0.008, bright: 0.4 + i * 0.12, attack: 1.2, release: 1.4});
			kit.saw(t0 + i * span, span, ROOTS[name] - 12, {amp: 0.06, cutoff: 200 + i * 80, env: 200, decay: 1, voices: 2, detune: 5, send: 0.1, attack: 0.4, release: 0.6});
		});
		// Arpeggio that climbs and speeds up.
		let t = 0;
		let i = 0;
		while (t < length - 0.2) {
			const name = list[Math.min(3, Math.floor(t / span))][0];
			const notes = A_MINOR[name];
			const octave = 12 + 12 * Math.floor((i % 9) / 3);
			kit.saw(t0 + t, 0.18, notes[i % 3] + octave, {amp: 0.022 + 0.02 * Math.min(1, t / length), cutoff: 1400 + 3000 * (t / length), env: 1500, decay: 0.08, q: 1.5, pan: Math.sin(i * 0.9) * 0.5, send: 0.55, voices: 1});
			t += 0.3 - 0.14 * Math.min(1, t / length);
			i++;
		}
		each(t0, length, 0.5, (time, k) => {
			if (time - t0 < open) return;
			kit.kick(time, {amp: 0.36, soft: k % 2 === 1});
			if (k % 4 === 2) kit.snare(time, {amp: 0.14, tone: 160, decay: 9});
		});
		kit.swell(t0 + open - 1.6, 1.6, {amp: 0.12});
	},

	/** Night drive: a dark, steady synth pulse with plucks echoing across the stereo field. */
	nightdrive(kit, t0, length) {
		const beat = 60 / 110;
		const list = ['Dm', 'Am', 'F', 'E'];
		each(t0, length, beat * 4, (t, b) => {
			const name = list[b % 4];
			kit.pad(t, beat * 4, A_MINOR[name], {amp: 0.03, bright: 0.35, attack: 0.8, release: 0.9});
		});
		each(t0, length, beat / 4, (t, i) => {
			const name = chordAt(list, i / 4, 4);
			kit.saw(t, beat / 4.5, ROOTS[name], {amp: 0.06 * (i % 4 === 0 ? 0.6 : 1), cutoff: 300, env: 700, decay: 0.06, q: 1.4, voices: 2, detune: 7, send: 0.04});
		});
		each(t0, length, beat, (t, i) => {
			kit.kick(t, {amp: 0.38});
			if (i % 2) kit.snare(t, {amp: 0.16, tone: 175, decay: 9});
			kit.hat(t + beat / 2, {amp: 0.04, decay: 55, pan: 0.3});
		});
		const plucks = [74, 77, 81, 77, 76, 72, 69, 72];
		each(t0, length, beat / 2, (t, i) => {
			if (i % 3 === 2) return;
			kit.pluck(t, plucks[i % 8], {amp: 0.045, length: 0.9, pan: i % 2 ? 0.5 : -0.5, send: 0.55});
			kit.pluck(t + beat * 0.75, plucks[i % 8], {amp: 0.018, length: 0.7, pan: i % 2 ? -0.5 : 0.5, send: 0.6});
		});
	},

	/** An anthem to end on: piano chords, big drums and a lead that resolves. */
	anthem(kit, t0, length, {isLast}) {
		const beat = 0.5;
		const chords = [
			[45, [57, 60, 64, 69]],
			[41, [57, 60, 65, 69]],
			[48, [55, 60, 64, 67]],
			[43, [55, 59, 62, 67]],
		];
		const bar = beat * 4;
		const bars = Math.floor((length - 2.5) / bar);
		for (let b = 0; b < bars; b++) {
			const [root, notes] = chords[b % 4];
			const t = t0 + b * bar;
			notes.forEach((n, i) => kit.piano(t + i * 0.012, n, {amp: 0.11, length: 2.4, pan: (i - 1.5) * 0.15}));
			kit.bass(t, root - 12, bar * 0.95, {amp: 0.2});
			kit.pad(t, bar, notes.map((n) => n + 12), {amp: 0.022, bright: 0.6, attack: 0.3, release: 0.6});
			if (b >= 1) {
				for (let k = 0; k < 4; k++) {
					kit.kick(t + k * beat, {amp: 0.38});
					if (k % 2) kit.snare(t + k * beat, {amp: 0.17, tone: 185, decay: 10});
				}
			}
			if (b >= 2) {
				const melody = [76, 74, 72, 71][b % 4];
				kit.saw(t, bar * 0.9, melody, {amp: 0.035, cutoff: 1600, env: 900, decay: 0.4, voices: 3, detune: 10, send: 0.45, attack: 0.04, release: 0.5});
			}
		}
		// The last chord: A major, held.
		const end = t0 + bars * bar;
		[57, 61, 64, 69, 73].forEach((n, i) => kit.piano(end + i * 0.02, n, {amp: 0.12, length: 5}));
		kit.pad(end, Math.max(1.5, length - bars * bar), [57, 61, 64, 69], {amp: 0.04, bright: 0.5, attack: 0.2, release: isLast ? 1.5 : 0.8});
		kit.bass(end, 33, Math.max(1, length - bars * bar - 0.2), {amp: 0.22, soft: true});
	},
};

/** How loud each mood sits in a film, in dB, alongside the moods in sound.mjs. */
export const RACE_LEVELS = {
	synthwave: 0,
	dnb: 1,
	halftime: 0.5,
	industrial: 0.5,
	acid: 1,
	ascent: 0,
	nightdrive: 0,
	anthem: 0,
};

export const RACE_CUES = {
	engine: (kit, at, cue) => kit.engine(at, cue),
	starter: (kit, at, cue) => kit.starter(at, {amp: cue.amp ?? 0.5, length: cue.length ?? 0.8}),
	crowd: (kit, at, cue) => kit.crowd(at, cue.length ?? 10, {amp: cue.amp ?? 0.4, cheer: cue.note}),
	clunk: (kit, at, cue) => kit.clunk(at, {amp: cue.amp ?? 0.25}),
	beep: (kit, at, cue) => kit.tick(at, {amp: cue.amp ?? 0.1, fx: true}),
};

