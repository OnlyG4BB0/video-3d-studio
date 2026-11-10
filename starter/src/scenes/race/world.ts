import {CatmullRomCurve3, Vector3} from 'three';
import {Key, track} from '../../kit';
import type {CarPose} from './Car';

// The race world as pure functions of time: the circuit, a lap driven at the limit,
// the cars' positions, gears and revs, and the sounds they make for a camera.
// The picture and the soundtrack both read it, so they always agree.

/** The circuit's centre line, in metres (x, z), from the start line, anticlockwise from above. */
const CONTROL: [number, number][] = [
	[0, -120], [0, -30], [0, 60], [0, 125],
	// Turn 1, the hairpin.
	[3, 160], [13, 182], [30, 191], [46, 182], [51, 160],
	// Back straight and the esses.
	[51, 115], [52, 70], [62, 38], [80, 20], [86, -8], [75, -35], [71, -60], [80, -92], [86, -135],
	// The long final corner onto the main straight.
	[76, -180], [52, -210], [22, -218], [5, -200], [0, -170],
];

export const TRACK = {
	width: 12,
	/** Kerbs sit on corners tighter than this radius, in metres. */
	kerbRadius: 130,
};

const STEP = 1;
const G = 9.81;
const MASS = 1330;
const POWER = 375000 * 0.86;
const A_LAT = 1.75 * G;
const A_BRAKE = 1.5 * G;
const A_TRACTION = 0.95 * G;
const DRAG = (0.5 * 1.2 * 0.95) / MASS;
const V_MAX = 77;
const WHEELBASE = 2.459;
/** Speed in m/s at 8,500 rpm in each gear, 1 to 6. */
const GEAR_TOP = [0, 27, 37, 46, 55.5, 65, 76];
export const IDLE_RPM = 1150;
export const LIMIT_RPM = 8750;

const accelAt = (v: number) => Math.min(A_TRACTION, POWER / (MASS * Math.max(v, 3))) - DRAG * v * v;
const brakeAt = (v: number) => A_BRAKE + DRAG * v * v;
const gearRpm = (v: number, gear: number) => (8500 * v) / GEAR_TOP[gear];
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
	const t = clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
};

type Lap = {
	length: number;
	count: number;
	step: number;
	x: Float64Array;
	z: Float64Array;
	heading: Float64Array;
	curve: Float64Array;
	line: Float64Array;
	speed: Float64Array;
	time: Float64Array;
	gear: Float64Array;
	throttle: Float64Array;
	brake: Float64Array;
	heat: Float64Array;
	along: Float64Array;
	lapTime: number;
};

const periodicAverage = (values: Float64Array, count: number, half: number) => {
	const out = new Float64Array(count + 1);
	for (let i = 0; i < count; i++) {
		let sum = 0;
		for (let k = -half; k <= half; k++) {
			sum += values[(((i + k) % count) + count) % count];
		}
		out[i] = sum / (2 * half + 1);
	}
	out[count] = out[0];
	return out;
};

const buildLap = (): Lap => {
	const curve = new CatmullRomCurve3(CONTROL.map(([x, z]) => new Vector3(x, 0, z)), true, 'centripetal');
	curve.arcLengthDivisions = 8000;
	const length = curve.getLength();
	const count = Math.round(length / STEP);
	const step = length / count;
	const x = new Float64Array(count + 1);
	const z = new Float64Array(count + 1);
	const point = new Vector3();
	for (let i = 0; i <= count; i++) {
		curve.getPointAt((i % count) / count, point);
		x[i] = point.x;
		z[i] = point.z;
	}
	// Headings, unwrapped so that they climb smoothly through the lap.
	const heading = new Float64Array(count + 1);
	let previous = 0;
	for (let i = 0; i <= count; i++) {
		const a = (i - 1 + count) % count;
		const b = (i + 1) % count;
		let h = Math.atan2(x[b] - x[a], z[b] - z[a]);
		if (i > 0) {
			while (h - previous > Math.PI) h -= 2 * Math.PI;
			while (h - previous < -Math.PI) h += 2 * Math.PI;
		}
		heading[i] = h;
		previous = h;
	}
	const turn = heading[count] - heading[0];
	const headingAt = (i: number) => heading[((i % count) + count) % count] + turn * Math.floor(i / count);
	const raw = new Float64Array(count);
	for (let i = 0; i < count; i++) {
		raw[i] = (headingAt(i + 1) - headingAt(i - 1)) / (2 * step);
	}
	const curveSmooth = periodicAverage(raw, count, 3);
	const narrow = periodicAverage(raw, count, 12);
	const wide = periodicAverage(raw, count, 45);
	// Racing line: out wide before a corner, in tight at the apex, out wide on exit.
	const reach = TRACK.width / 2 - 1.6;
	const rough = new Float64Array(count);
	for (let i = 0; i < count; i++) {
		rough[i] = reach * clamp(1.7 * 30 * narrow[i] - 1.0 * 30 * wide[i], -1, 1);
	}
	const line = periodicAverage(rough, count, 14);

	// Fastest speed at each point: grip in corners, power out of them, brakes into them.
	const limit = new Float64Array(count);
	for (let i = 0; i < count; i++) {
		limit[i] = Math.min(V_MAX, Math.sqrt(A_LAT / Math.max(Math.abs(curveSmooth[i]), 1e-6)));
	}
	const forward = new Float64Array(count);
	let v = limit[0];
	for (let k = 0; k < 3 * count; k++) {
		const j = (k + 1) % count;
		v = Math.min(limit[j], Math.sqrt(v * v + 2 * Math.max(accelAt(v), 0) * step));
		forward[j] = v;
	}
	const backward = new Float64Array(count);
	v = limit[0];
	for (let k = 3 * count; k > 0; k--) {
		const i = (k - 1) % count;
		v = Math.min(limit[i], Math.sqrt(v * v + 2 * brakeAt(v) * step));
		backward[i] = v;
	}
	const speed = new Float64Array(count + 1);
	for (let i = 0; i < count; i++) {
		speed[i] = Math.min(forward[i], backward[i]);
	}
	speed[count] = speed[0];

	const time = new Float64Array(count + 1);
	for (let i = 0; i < count; i++) {
		time[i + 1] = time[i] + (2 * step) / (speed[i] + speed[i + 1]);
	}
	const lapTime = time[count];

	const along = new Float64Array(count + 1);
	const throttle = new Float64Array(count + 1);
	const brake = new Float64Array(count + 1);
	for (let i = 0; i < count; i++) {
		const vi = speed[i];
		const a = (speed[i + 1] ** 2 - vi * vi) / (2 * step);
		along[i] = a;
		if (a > 0.15) {
			throttle[i] = clamp(0.3 + (0.75 * a) / Math.max(accelAt(vi), 0.5), 0, 1);
		} else if (a < -(DRAG * vi * vi + 0.6)) {
			brake[i] = clamp((-a - DRAG * vi * vi) / A_BRAKE, 0, 1);
		} else {
			throttle[i] = 0.32;
		}
	}
	along[count] = along[0];
	throttle[count] = throttle[0];
	brake[count] = brake[0];

	// Gears: up at 8,400 rpm, down through the box under braking, keeping the revs up.
	const gear = new Float64Array(count + 1);
	let g = 3;
	for (let lap = 0; lap < 2; lap++) {
		for (let i = 0; i < count; i++) {
			const vi = speed[i];
			if (gearRpm(vi, g) > 8400 && g < 6 && along[i] > -1) {
				g++;
			}
			while (g > 1 && gearRpm(vi, g - 1) < (brake[i] > 0.05 ? 8100 : 5200) && (brake[i] > 0.05 || gearRpm(vi, g) < 4300)) {
				g--;
			}
			gear[i] = g;
		}
	}
	gear[count] = gear[0];

	// Brake discs heat up under braking and cool over a few seconds.
	const heat = new Float64Array(count + 1);
	let h = 0;
	for (let lap = 0; lap < 2; lap++) {
		for (let i = 0; i < count; i++) {
			const dt = time[i + 1] - time[i];
			h = h * Math.exp(-dt / 5) + brake[i] * speed[i] * dt * 0.012;
			heat[i] = Math.min(1, h);
		}
	}
	heat[count] = heat[0];

	return {length, count, step, x, z, heading, curve: curveSmooth, line, speed, time, gear, throttle, brake, heat, along, lapTime};
};

let cached: Lap | null = null;
export const lap = () => {
	cached ??= buildLap();
	return cached;
};

const sampleAt = (values: Float64Array, s: number) => {
	const l = lap();
	const wrapped = ((s % l.length) + l.length) % l.length;
	const f = wrapped / l.step;
	const i = Math.min(Math.floor(f), l.count - 1);
	const u = f - i;
	return values[i] * (1 - u) + values[i + 1] * u;
};

/** The circuit's centre line at `s` metres from the start line. */
export const centreAt = (s: number) => {
	const l = lap();
	const laps = Math.floor(s / l.length);
	return {
		x: sampleAt(l.x, s),
		z: sampleAt(l.z, s),
		heading: sampleAt(l.heading, s) + laps * (l.heading[l.count] - l.heading[0]),
		curve: sampleAt(l.curve, s),
	};
};

/** A point `side` metres to the left (+) or right (-) of the centre line. */
export const trackPoint = (s: number, side: number, y = 0): Vector3 => {
	const c = centreAt(s);
	return new Vector3(c.x + Math.cos(c.heading) * side, y, c.z - Math.sin(c.heading) * side);
};

/** Metres along the lap at `seconds` into a flying lap. */
export const distanceAtLapTime = (seconds: number) => {
	const l = lap();
	const laps = Math.floor(seconds / l.lapTime);
	const t = seconds - laps * l.lapTime;
	let lo = 0;
	let hi = l.count;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (l.time[mid] <= t) lo = mid;
		else hi = mid;
	}
	const u = (t - l.time[lo]) / Math.max(l.time[lo + 1] - l.time[lo], 1e-9);
	return (lo + u) * l.step + laps * l.length;
};

/** Seconds into a flying lap at which a car passes `s` metres. */
export const lapTimeAt = (s: number) => {
	const l = lap();
	const laps = Math.floor(s / l.length);
	return sampleAt(l.time, s - laps * l.length) + laps * l.lapTime;
};

export type CarState = CarPose & {
	speed: number;
	rpm: number;
	/** 0 to 1. */
	throttle: number;
	gear: number;
	/** 0 to 1: how loudly the tyres complain. */
	squeal: number;
};

/** A point in the car's own frame (+z forward, +x left, y up), in the world. */
export const carPoint = (car: CarPose, local: [number, number, number]) => {
	const c = Math.cos(car.heading);
	const s = Math.sin(car.heading);
	const [lx, ly, lz] = local;
	return new Vector3(car.x + lx * c + lz * s, (car.y ?? 0) + ly, car.z - lx * s + lz * c);
};

const stateAt = (s: number, side: number, sideRate: number, extraSpeed: number): CarState => {
	const l = lap();
	const c = centreAt(s);
	const line = sampleAt(l.line, s);
	const lineSlope = (sampleAt(l.line, s + 1.5) - sampleAt(l.line, s - 1.5)) / 3;
	const v = Math.max(0, sampleAt(l.speed, s) + extraSpeed);
	const lateral = v * v * c.curve;
	const gear = Math.round(sampleAt(l.gear, s));
	const throttle = sampleAt(l.throttle, s);
	const brake = sampleAt(l.brake, s);
	const offset = line + side;
	const slip = clamp(lateral / A_LAT, -1, 1) * 0.04;
	const heading = c.heading + Math.atan(lineSlope + sideRate / Math.max(v, 1)) + slip;
	return {
		x: c.x + Math.cos(c.heading) * offset,
		z: c.z - Math.sin(c.heading) * offset,
		heading,
		distance: s,
		steer: clamp(Math.atan(WHEELBASE * c.curve) * 1.6 + slip * 0.5, -0.45, 0.45),
		brake: sampleAt(l.heat, s),
		pitch: clamp(sampleAt(l.along, s) * 0.0011, -0.02, 0.012),
		roll: clamp(lateral * 0.0014, -0.03, 0.03),
		speed: v,
		rpm: clamp(gearRpm(v, gear), IDLE_RPM, LIMIT_RPM),
		throttle,
		gear,
		squeal: smooth(0.82, 1, Math.abs(lateral) / A_LAT) * 0.8 + smooth(0.85, 1, brake) * 0.6,
	};
};

const keyed = (keys: Key[] | undefined, t: number) => (keys && keys.length > 0 ? track(t, keys) : 0);

export type FlyingCar = {
	/** Seconds into its flying lap at the start of the shot. */
	phase: number;
	/** Extra metres ahead (+) or behind (-) of the ideal lap, keyed by world seconds. */
	gap?: Key[];
	/** Extra metres to the left (+) or right (-) of the racing line, keyed by world seconds. */
	lane?: Key[];
};

/** A car on a flying lap. `clock` maps shot seconds to world seconds, for slow motion. */
export const flyingCar = ({phase, gap, lane}: FlyingCar, clock: (t: number) => number = (t) => t) => {
	let lastT = NaN;
	let last: CarState | null = null;
	return (time: number): CarState => {
		if (time === lastT && last) {
			return last;
		}
		const w = clock(time);
		const s = distanceAtLapTime(phase + w) + keyed(gap, w);
		const gapRate = (keyed(gap, w + 0.05) - keyed(gap, w - 0.05)) / 0.1;
		const sideRate = (keyed(lane, w + 0.05) - keyed(lane, w - 0.05)) / 0.1;
		last = stateAt(s, keyed(lane, w), sideRate, gapRate);
		lastT = time;
		return last;
	};
};

export type StandingCar = {
	/** Metres from the start line to the grid slot: negative, behind the line. */
	grid: number;
	/** Metres left (+) or right (-) of the centre line on the grid. */
	side: number;
	/** World seconds at which the engine fires up. Before it, the car is silent. */
	fire?: number;
	/** World seconds at which the lights go out. */
	go: number;
	/** The driver's reaction, in seconds. */
	reaction?: number;
};

/** A car on the grid that starts its engine, waits for the lights and launches. */
export const standingCar = ({grid, side, fire = -10, go, reaction = 0.18}: StandingCar, clock: (t: number) => number = (t) => t) => {
	// Distance and speed after the launch, a hundredth of a second apart.
	const dt = 0.01;
	const table: {s: number; v: number; a: number}[] = [];
	let s = grid;
	let v = 0;
	for (let k = 0; k < 2500; k++) {
		const cap = sampleAt(lap().speed, s);
		const a = Math.min(Math.min(A_TRACTION * 0.92, POWER / (MASS * Math.max(v, 4))) - DRAG * v * v, (cap - v) / dt);
		table.push({s, v, a});
		v = Math.max(0, v + a * dt);
		s += v * dt;
	}
	let lastT = NaN;
	let last: CarState | null = null;
	return (time: number): CarState => {
		if (time === lastT && last) {
			return last;
		}
		const w = clock(time);
		const since = w - go - reaction;
		const f = clamp(since / dt, 0, table.length - 2);
		const i = Math.floor(f);
		const u = f - i;
		const at = {
			s: table[i].s * (1 - u) + table[i + 1].s * u,
			v: table[i].v * (1 - u) + table[i + 1].v * u,
			a: table[i].a,
		};
		const base = stateAt(at.s, 0, 0, 0);
		// Line up on the grid slot, then drift to the racing line once moving.
		const blend = smooth(1.5, 5, since);
		const c = centreAt(at.s);
		const offset = side * (1 - blend) + sampleAt(lap().line, at.s) * blend;
		let gear = 1;
		while (gear < 6 && gearRpm(at.v, gear) > 8400) gear++;
		const running = w >= fire;
		const starting = smooth(fire, fire + 0.9, w);
		let rpm = 0;
		if (running) {
			// Fires, flares, settles to a lumpy idle, then holds launch revs before the start.
			const flare = Math.exp(-Math.max(0, w - fire - 0.7) / 0.45) * smooth(fire + 0.4, fire + 0.75, w);
			const idle = IDLE_RPM + 2200 * flare;
			const launchRevs = 6800 + 220 * Math.sin(w * 9.3 + grid);
			const holding = smooth(go - 2.6, go - 2.1, w);
			rpm = starting * (idle * (1 - holding) + launchRevs * holding);
			if (since > 0) {
				// The clutch slips for about a second, pulling the revs down until the gears take over.
				const slipping = launchRevs * (1 - 0.32 * smooth(0, 0.9, since)) * (1 - smooth(0.9, 1.7, since));
				rpm = Math.max(gearRpm(at.v, gear), slipping);
			}
		}
		last = {
			...base,
			x: c.x + Math.cos(c.heading) * offset,
			z: c.z - Math.sin(c.heading) * offset,
			heading: c.heading + (since > 0 ? Math.atan((sampleAt(lap().line, at.s + 1.5) - sampleAt(lap().line, at.s - 1.5)) / 3) * blend : 0),
			distance: at.s,
			speed: at.v,
			pitch: since > 0 ? clamp(at.a * 0.0011, -0.02, 0.012) : 0,
			steer: since > 0 ? base.steer : 0,
			brake: 0,
			rpm: clamp(rpm, 0, LIMIT_RPM),
			throttle: since > 0 ? 1 : running ? 0.15 + 0.6 * smooth(go - 2.6, go - 2.1, w) : 0,
			gear: since > 0 ? gear : 0,
			squeal: since > 0 ? Math.exp(-since / 0.5) * 0.7 : 0,
		};
		lastT = time;
		return last;
	};
};

// ---------------------------------------------------------------- cameras

export type CameraShot = {position: Vector3; target: Vector3; fov: number; roll?: number};
export type Rig = (time: number) => CameraShot;

/** A camera fixed to a car, at a point in its frame, looking at another point in its frame. */
export const mountedOn = (car: (t: number) => CarState, from: [number, number, number], to: [number, number, number], fov = 40) => (time: number): CameraShot => {
	const pose = car(time);
	return {position: carPoint(pose, from), target: carPoint(pose, to), fov};
};

/** Cuts between rigs at the given shot seconds: `[[0, rigA], [6, rigB]]`. */
export const cutBetween = (rigs: [number, Rig][]): Rig => (time: number) => {
	let current = rigs[0][1];
	for (const [at, rig] of rigs) {
		if (time >= at) current = rig;
	}
	return current(time);
};

// ---------------------------------------------------------------- sound

const round = (value: number, digits = 3) => {
	const scale = 10 ** digits;
	return Math.round(value * scale) / scale;
};

export type EngineCue = {
	sound: 'engine';
	at: number;
	/** Control values per second. */
	rate: number;
	rpm: number[];
	load: number[];
	gain: number[];
	side: number[];
	/** Seconds the sound takes to reach the camera, for the Doppler shift. */
	delay: number[];
	squeal: number[];
	/** Rumble of tyres on the road and the rush of air. */
	road: number[];
	/** Formant scale, below 1 for slowed-down sound. */
	scale?: number[];
	/** 0 to 1: valve train and gears heard from inside the engine. */
	mech?: number;
	seed?: number;
	amp?: number;
};

/**
 * The sound of one car as heard by a camera: revs, throttle, distance, side and
 * Doppler delay, sampled `rate` times a second from `from` to `to` shot seconds.
 */
export const engineCue = (
	car: (t: number) => CarState,
	rig: Rig,
	{from = 0, to, rate = 60, amp = 1, seed = 1, clockRate}: {from?: number; to: number; rate?: number; amp?: number; seed?: number; clockRate?: (t: number) => number},
): EngineCue => {
	const cue: EngineCue = {sound: 'engine', at: from, rate, rpm: [], load: [], gain: [], side: [], delay: [], squeal: [], road: [], seed, amp};
	const pitch: number[] = [];
	const frames = Math.ceil((to - from) * rate) + 1;
	for (let k = 0; k < frames; k++) {
		const t = from + k / rate;
		const state = car(t);
		const shot = rig(t);
		// The exhaust is at the tail of the car.
		const exhaust = carPoint(state, [0, 0.36, -2.3]);
		const toCar = exhaust.clone().sub(shot.position);
		const distance = Math.max(toCar.length(), 0.5);
		const forward = shot.target.clone().sub(shot.position).normalize();
		const right = forward.clone().cross(new Vector3(0, 1, 0)).normalize();
		const pan = clamp((toCar.dot(right) / distance) * 1.15, -1, 1);
		// Louder behind the car, where the exhaust points.
		const back = new Vector3(-Math.sin(state.heading), 0, -Math.cos(state.heading));
		const behind = toCar.clone().multiplyScalar(-1 / distance).dot(back);
		const directivity = 0.72 + 0.28 * behind;
		const rateHere = clockRate ? clockRate(t) : 1;
		cue.rpm.push(Math.round(state.rpm * rateHere));
		cue.load.push(round(state.throttle, 2));
		cue.gain.push(round(Math.pow(3 / Math.max(distance, 3), 0.85) * directivity, 4));
		cue.side.push(round(pan, 2));
		cue.delay.push(round(distance / 343, 4));
		cue.squeal.push(round(state.squeal * Math.pow(3 / Math.max(distance, 3), 0.85), 3));
		cue.road.push(round(Math.min(1, (state.speed / 70) ** 2) * Math.pow(3 / Math.max(distance, 3), 0.85), 3));
		pitch.push(round(rateHere, 3));
	}
	if (pitch.some((value) => value !== 1)) {
		cue.scale = pitch;
	}
	return cue;
};

// ---------------------------------------------------------------- engine clock

/**
 * The crank angle over a shot, from a curve of revs. `align` turns the whole
 * crank so that a cylinder fires exactly at that second, to land on a beat.
 */
export const crankClock = (rpmAt: (t: number) => number, seconds: number, align?: number) => {
	const step = 1 / 1000;
	const count = Math.ceil(seconds / step) + 2;
	const angle = new Float64Array(count);
	for (let i = 1; i < count; i++) {
		const t = (i - 0.5) * step;
		angle[i] = angle[i - 1] + (rpmAt(t) / 60) * 2 * Math.PI * step;
	}
	let offset = 0;
	if (align !== undefined) {
		const f = Math.min(count - 2, Math.max(0, align / step));
		const i = Math.floor(f);
		const at = angle[i] + (angle[i + 1] - angle[i]) * (f - i);
		const firing = (2 * Math.PI) / 3;
		offset = Math.ceil(at / firing) * firing - at;
	}
	return {
		angle: (t: number) => {
			const f = Math.min(count - 2, Math.max(0, t / step));
			const i = Math.floor(f);
			return angle[i] + (angle[i + 1] - angle[i]) * (f - i) + offset;
		},
		rpm: rpmAt,
	};
};
