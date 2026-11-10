import React, {useMemo} from 'react';
import {
	AdditiveBlending,
	BufferGeometry,
	CanvasTexture,
	CatmullRomCurve3,
	Color,
	DoubleSide,
	ExtrudeGeometry,
	Float32BufferAttribute,
	Group,
	LatheGeometry,
	MathUtils,
	Object3D,
	ShaderMaterial,
	Shape,
	SRGBColorSpace,
	TubeGeometry,
	Vector2,
	Vector3,
} from 'three';
import {Key, LOOKS, track, useMoving, useScratchMap} from '../../kit';

// A one-make race car built to the proportions of the Porsche 911 GT3 Cup (992),
// measured from reference drawings: metres, +z forward, +x to the left side of the
// car, y up, the ground at y = 0. It carries no badges or brand marks.
export const CAR = {
	front: 2.2925,
	rear: -2.2925,
	frontAxle: 1.197,
	rearAxle: -1.262,
	/** Tyre radius and width, front and rear: 18-inch slicks, wider at the back. */
	radiusFront: 0.33,
	radiusRear: 0.355,
	widthFront: 0.27,
	widthRear: 0.31,
	trackFront: 0.8,
	trackRear: 0.795,
	/** The radius used for wheel spin when a pose only gives the distance. */
	radius: 0.343,
};

const k = (keys: Key[]) => (z: number) => track(z, keys);

// Side silhouette, tail to nose: engine lid, the long slope of the rear window, the
// roof, the windscreen and then the crest of the front wings down to the nose.
const silhouette = k([
	[-2.2925, 0.905], [-2.22, 0.93], [-2.1, 0.94], [-1.904, 0.938], [-1.755, 0.936], [-1.68, 0.946],
	[-1.606, 0.972], [-1.531, 0.998], [-1.456, 1.024], [-1.381, 1.051], [-1.307, 1.075], [-1.23, 1.102],
	[-1.151, 1.124], [-1.072, 1.147], [-0.992, 1.169], [-0.913, 1.191], [-0.834, 1.207], [-0.754, 1.22],
	[-0.675, 1.234], [-0.596, 1.245], [-0.516, 1.254], [-0.437, 1.261], [-0.358, 1.267], [-0.199, 1.271],
	[-0.04, 1.264], [0.039, 1.252], [0.118, 1.234], [0.198, 1.2], [0.277, 1.162], [0.356, 1.121],
	[0.436, 1.079], [0.515, 1.036], [0.594, 0.992], [0.673, 0.949], [0.753, 0.903], [0.832, 0.866],
	[0.911, 0.86], [0.991, 0.86], [1.07, 0.851], [1.149, 0.836], [1.227, 0.821], [1.302, 0.808],
	[1.376, 0.795], [1.451, 0.783], [1.526, 0.773], [1.601, 0.761], [1.676, 0.742], [1.75, 0.708],
	[1.825, 0.677], [1.9, 0.648], [1.975, 0.616], [2.049, 0.583], [2.124, 0.54], [2.2, 0.49], [2.2925, 0.39],
]);
// Half the width in plan: broad rear haunches, narrower doors, wide front wings, round nose.
const halfWidth = k([
	[-2.2925, 0.775], [-2.2, 0.8], [-2.05, 0.818], [-1.942, 0.832], [-1.867, 0.856], [-1.792, 0.881],
	[-1.718, 0.905], [-1.643, 0.927], [-1.568, 0.94], [-1.456, 0.947], [-1.307, 0.951], [-1.15, 0.951],
	[-1.0, 0.948], [-0.873, 0.942], [-0.794, 0.928], [-0.715, 0.906], [-0.635, 0.902], [0.0, 0.9],
	[0.6, 0.9], [0.753, 0.906], [0.872, 0.925], [0.991, 0.945], [1.1, 0.957], [1.3, 0.96], [1.49, 0.953],
	[1.638, 0.942], [1.788, 0.925], [1.9, 0.902], [1.975, 0.865], [2.049, 0.81], [2.124, 0.735],
	[2.2, 0.62], [2.25, 0.5], [2.2925, 0.32],
]);
// Height of the shoulder, where the side turns over into the top.
const belt = k([
	[-2.2925, 0.8], [-2.05, 0.845], [-1.6, 0.885], [-1.2, 0.9], [-0.8, 0.888], [0.0, 0.878], [0.6, 0.872],
	[0.85, 0.845], [1.0, 0.82], [1.3, 0.782], [1.6, 0.735], [1.9, 0.625], [2.1, 0.535], [2.2925, 0.37],
]);
// Bottom of the body: splitter and sills low, the rear bumper lifted over the diffuser.
const bottom = k([
	[-2.2925, 0.3], [-2.12, 0.2], [-1.75, 0.12], [-1.5, 0.105], [1.5, 0.1], [1.9, 0.095], [2.15, 0.085], [2.2925, 0.12],
]);
// The front lid sits lower than the crests of the wings beside it.
const lidDip = k([[0.88, 0], [1.05, 0.03], [1.25, 0.045], [1.6, 0.045], [1.9, 0.032], [2.2925, 0.012]]);
// The cabin: half the width of the roof, and of the glass at the waist.
const roofHalf = k([[-1.45, 0.46], [-1.2, 0.5], [-0.8, 0.565], [-0.4, 0.6], [0.0, 0.61], [0.4, 0.64], [0.7, 0.69], [0.86, 0.72]]);
const waistHalf = k([[-1.45, 0.86], [-1.0, 0.86], [-0.6, 0.82], [0.0, 0.81], [0.5, 0.82], [0.86, 0.84]]);
const CABIN_REAR = -1.5;
const CABIN_FRONT = 0.86;

const smoothstep = (a: number, b: number, x: number) => {
	const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
};
const softMax = (a: number, b: number, r: number) => {
	const h = MathUtils.clamp(0.5 + (b - a) / (2 * r), 0, 1);
	return b * h + a * (1 - h) + r * h * (1 - h);
};

/** Height of the top surface at distance `x` from the centre line. */
const topAt = (z: number, x: number) => {
	const w = halfWidth(z);
	const shoulder = belt(z);
	const crest = silhouette(z);
	const front = smoothstep(0.83, 0.95, z);
	// Ahead of the windscreen: the lid between two wing crests, rolling over to the shoulder.
	const crestAt = w - 0.2;
	const lid = crest - lidDip(z);
	let y: number;
	if (x < crestAt) {
		const t = x / crestAt;
		y = lid + (crest - lid) * t * t * (3 - 2 * t);
	} else {
		const t = MathUtils.clamp((x - crestAt) / (w - crestAt), 0, 1);
		y = crest + (shoulder - crest) * t * t;
	}
	// Behind the windscreen: a broad convex deck from the centre to the shoulders.
	const deckCentre = z < CABIN_FRONT ? Math.min(silhouette(z), Math.max(shoulder + 0.05, silhouette(Math.min(z, -1.62)))) : lid;
	const u = MathUtils.clamp(x / w, 0, 1);
	const deck = deckCentre + (shoulder - deckCentre) * u ** 2.2;
	y = y * front + deck * (1 - front);
	// The cabin rises out of the deck with steeply sloped side glass.
	const inCabin = smoothstep(CABIN_REAR, CABIN_REAR + 0.3, z) * (1 - smoothstep(CABIN_FRONT - 0.06, CABIN_FRONT + 0.02, z));
	if (inCabin > 0) {
		const roof = silhouette(z);
		const rw = roofHalf(z);
		const ww = waistHalf(z);
		const edge = roof - 0.045;
		const cabin = x < rw ? roof - 0.045 * (x / rw) ** 2 : edge - ((x - rw) / Math.max(ww - rw, 0.05)) * (edge - shoulder - 0.03);
		y = softMax(y, y + (cabin - y) * inCabin, 0.025);
	}
	return y;
};

const archAt = (z: number) => {
	const arches = [
		{axle: CAR.frontAxle, r: CAR.radiusFront + 0.045, hub: CAR.radiusFront},
		{axle: CAR.rearAxle, r: CAR.radiusRear + 0.045, hub: CAR.radiusRear},
	];
	for (const {axle, r, hub} of arches) {
		const d = Math.abs(z - axle);
		if (d < r) {
			return hub + Math.sqrt(r * r - d * d);
		}
	}
	return null;
};

// Points for each part of a cross-section, so every section has the same layout
// and the livery can be painted by part.
const PARTS = {floor: 8, wall: 5, arch: 7, side: 22, top: 48};
const HALF = PARTS.floor + PARTS.wall + PARTS.arch + PARTS.side + PARTS.top;

const sectionAt = (z: number) => {
	const w = halfWidth(z);
	const yb = bottom(z);
	const arch = archAt(z);
	const inner = arch === null ? w - 0.06 : w - 0.34;
	const ceiling = arch === null ? yb : Math.max(arch, yb);
	const shoulder = belt(z);
	const points: [number, number][] = [];
	const line = (count: number, from: [number, number], to: [number, number]) => {
		for (let i = 0; i < count; i++) {
			const t = i / count;
			points.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
		}
	};
	line(PARTS.floor, [0, yb], [inner, yb]);
	line(PARTS.wall, [inner, yb], [inner, ceiling]);
	line(PARTS.arch, [inner, ceiling], [w - 0.02, ceiling]);
	// The side: tucked under at the bottom, fullest at mid height, turning in to the shoulder.
	const from = Math.max(ceiling, yb + 0.03);
	for (let i = 0; i < PARTS.side; i++) {
		const t = i / PARTS.side;
		const y = from + (shoulder - from) * t;
		const h = (y - yb) / Math.max(shoulder - yb, 0.05);
		const tuck = 0.035 * (1 - smoothstep(0, 0.3, h));
		const roll = 0.05 * smoothstep(0.72, 1, h) ** 1.6;
		points.push([w - tuck - roll, y]);
	}
	for (let i = 0; i <= PARTS.top; i++) {
		const x = (w - 0.05) * (1 - i / PARTS.top);
		points.push([x, Math.max(topAt(z, x), shoulder - 0.002)]);
	}
	return points;
};

/** How far the body is rounded off at the very nose and tail. */
const endShrink = (z: number) => {
	const front = smoothstep(CAR.front - 0.16, CAR.front, z);
	const rear = smoothstep(CAR.rear + 0.1, CAR.rear, z);
	return Math.sqrt(Math.max(0, 1 - Math.max(front, rear) ** 2));
};

/** Glass: windscreen, side windows split by the B-pillar, and the rear window. */
const isGlass = (x: number, y: number, z: number) => {
	const ax = Math.abs(x);
	const shoulder = belt(z) + 0.035;
	if (y < Math.max(shoulder, 0.915)) {
		return false;
	}
	const roof = silhouette(z);
	const rw = roofHalf(z);
	const windscreen = z > 0.07 && z < 0.8 && ax < rw + (0.8 - z) * 0.05 && y > roof - 0.08;
	const rearWindow = z > -1.5 && z < -0.82 && ax < rw * 0.9 && y > roof - 0.05;
	// Side glass: between the A-pillar, which slants back with height, and the C-pillar.
	const aPillar = 0.64 - (y - 0.92) * 2.75;
	const cPillar = -1.16 + (y - 0.92) * 1.7;
	const bPillar = z > -0.665 && z < -0.585;
	const sideTop = roof - 0.115;
	const side = ax > rw * 1.02 && z < aPillar && z > cPillar && y < sideTop && !bPillar;
	return windscreen || rearWindow || side;
};

export type BodyGeometry = {paint: BufferGeometry; glass: BufferGeometry};

/** Builds the body as a skin over cross-sections, split into paint and glass. */
const buildBody = (): BodyGeometry => {
	const rows = 260;
	const columns = HALF * 2 + 1;
	const positions: number[] = [];
	const uvs: number[] = [];
	for (let r = 0; r <= rows; r++) {
		const z = CAR.rear + ((CAR.front - CAR.rear) * r) / rows;
		const shrink = endShrink(z);
		const section = sectionAt(z);
		const middle = 0.5 * (bottom(z) + belt(z));
		const full: [number, number][] = [
			...section.map(([x, y]) => [-x, y] as [number, number]).reverse(),
			...section.slice(1),
		];
		const sx = z > 0 ? 0.8 + 0.2 * shrink : 0.94 + 0.06 * shrink;
		const sy = z > 0 ? 0.86 + 0.14 * shrink : 0.96 + 0.04 * shrink;
		full.forEach(([x, y], c) => {
			positions.push(x * sx, middle + (y - middle) * sy, z);
			uvs.push(c / (columns - 1), r / rows);
		});
	}
	const width = columns;
	const paint: number[] = [];
	const glass: number[] = [];
	const at = (r: number, c: number) => r * width + c;
	// Close the nose and the tail with a fan from the middle of the end section.
	for (const r of [0, rows]) {
		let cx = 0;
		let cy = 0;
		for (let c = 0; c < width; c++) {
			cx += positions[at(r, c) * 3] / width;
			cy += positions[at(r, c) * 3 + 1] / width;
		}
		// The caps get their own vertices, mapped to a plain body-coloured part of the livery.
		const plain = [(PARTS.top + PARTS.side * 0.45) / (HALF * 2), 0.45];
		const centre = positions.length / 3;
		positions.push(cx, cy, positions[at(r, 0) * 3 + 2]);
		uvs.push(plain[0], plain[1]);
		const ring = positions.length / 3;
		for (let c = 0; c < width; c++) {
			positions.push(positions[at(r, c) * 3], positions[at(r, c) * 3 + 1], positions[at(r, c) * 3 + 2]);
			uvs.push(plain[0], plain[1]);
		}
		for (let c = 0; c < width - 1; c++) {
			if (r === 0) {
				paint.push(centre, ring + c + 1, ring + c);
			} else {
				paint.push(centre, ring + c, ring + c + 1);
			}
		}
	}
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < width - 1; c++) {
			const quad = [at(r, c), at(r + 1, c), at(r + 1, c + 1), at(r, c + 1)];
			const centre = [0, 0, 0];
			for (const i of quad) {
				centre[0] += positions[i * 3] / 4;
				centre[1] += positions[i * 3 + 1] / 4;
				centre[2] += positions[i * 3 + 2] / 4;
			}
			const list = isGlass(centre[0], centre[1], centre[2]) ? glass : paint;
			list.push(quad[0], quad[2], quad[1], quad[0], quad[3], quad[2]);
		}
	}
	const make = (index: number[]) => {
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
		geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
		geometry.setIndex(index);
		geometry.computeVertexNormals();
		return geometry;
	};
	return {paint: make(paint), glass: make(glass)};
};

let cachedBody: BodyGeometry | null = null;
export const carBody = () => {
	cachedBody ??= buildBody();
	return cachedBody;
};

// The livery is painted in the body's own coordinates: u runs around each section,
// from the top of the right side (0) over the roof (0.5) to the top of the left side
// (1) the other way round, v runs from the tail (0) to the nose (1).
const vOf = (z: number) => (z - CAR.rear) / (CAR.front - CAR.rear);
/** u of a point on the top surface, `x` from the centre line (+x is the left side). */
const topU = (z: number, x: number) => {
	const f = (MathUtils.clamp(Math.abs(x) / (halfWidth(z) - 0.05), 0, 1) * PARTS.top) / (2 * HALF);
	return x >= 0 ? 1 - f : f;
};
/** u of a height on the side of the car. */
const sideU = (z: number, y: number, left: boolean) => {
	const yb = bottom(z);
	const arch = archAt(z);
	const from = Math.max(arch === null ? yb : Math.max(arch, yb), yb + 0.03);
	const t = MathUtils.clamp((y - from) / Math.max(belt(z) - from, 0.05), 0, 1);
	return left
		? (HALF + PARTS.floor + PARTS.wall + PARTS.arch + PARTS.side * t) / (2 * HALF)
		: (PARTS.top + PARTS.side * (1 - t)) / (2 * HALF);
};
/** The outer surface of the body at a height, for parts that hug it. */
const surfaceX = (z: number, y: number) => {
	const section = sectionAt(z);
	const shrink = endShrink(z);
	const middle = 0.5 * (bottom(z) + belt(z));
	const sx = z > 0 ? 0.8 + 0.2 * shrink : 0.94 + 0.06 * shrink;
	const sy = z > 0 ? 0.86 + 0.14 * shrink : 0.96 + 0.04 * shrink;
	const start = PARTS.floor + PARTS.wall + PARTS.arch;
	let best = section[start][0] * sx;
	for (let i = start; i < start + PARTS.side + 2 && i < section.length - 1; i++) {
		const [x0, y0] = section[i];
		const [x1, y1] = section[i + 1];
		const a = middle + (y0 - middle) * sy;
		const b = middle + (y1 - middle) * sy;
		if ((a - y) * (b - y) <= 0 && a !== b) {
			best = (x0 + ((x1 - x0) * (y - a)) / (b - a)) * sx;
			break;
		}
	}
	return best;
};

// ---------------------------------------------------------------- livery

/** Paint, stripes, panel gaps, vents and louvres, drawn in the body's own coordinates. */
const useLivery = (body: string, accent: string) =>
	useMemo(() => {
		const size = 2048;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const g = canvas.getContext('2d')!;
		const X = (u: number) => u * size;
		const Y = (z: number) => vOf(z) * size;
		const band = (u0: number, u1: number, colour: string) => {
			g.fillStyle = colour;
			g.fillRect(X(Math.min(u0, u1)), 0, X(Math.abs(u1 - u0)), size);
		};
		/**
		 * A shape on the top surface, given in metres (x across, z along). The top centre
		 * is where the texture wraps round, so each half is drawn on its own side of it.
		 */
		const topShape = (points: [number, number][], fill?: string, stroke?: string, width = 2) => {
			for (const half of [1, -1]) {
				if (!points.some(([x]) => x * half > 0)) continue;
				g.beginPath();
				points.forEach(([x, z], i) => {
					const clipped = half > 0 ? Math.max(x, 0) : Math.min(x, -1e-6);
					const u = X(topU(z, clipped));
					if (i === 0) g.moveTo(u, Y(z));
					else g.lineTo(u, Y(z));
				});
				if (fill) {
					g.closePath();
					g.fillStyle = fill;
					g.fill();
				}
				if (stroke) {
					g.strokeStyle = stroke;
					g.lineWidth = width;
					g.stroke();
				}
			}
		};
		/** A line or shape on one side, given in metres (z along, y up). */
		const sideShape = (left: boolean, points: [number, number][], fill?: string, stroke?: string, width = 2) => {
			g.beginPath();
			points.forEach(([z, y], i) => (i === 0 ? g.moveTo(X(sideU(z, y, left)), Y(z)) : g.lineTo(X(sideU(z, y, left)), Y(z))));
			if (fill) {
				g.closePath();
				g.fillStyle = fill;
				g.fill();
			}
			if (stroke) {
				g.strokeStyle = stroke;
				g.lineWidth = width;
				g.stroke();
			}
		};
		const along = (from: number, to: number, f: (z: number) => [number, number], steps = 40) =>
			Array.from({length: steps + 1}, (_, i) => f(from + ((to - from) * i) / steps));

		g.fillStyle = body;
		g.fillRect(0, 0, size, size);
		const dark = '#101113';
		const gap = 'rgba(0, 0, 0, 0.55)';
		const shade = new Color(accent).multiplyScalar(0.55).getStyle();
		// Underside, wheel wells and the black lower bumpers.
		const floorEnd = (HALF + PARTS.floor + PARTS.wall + PARTS.arch) / (2 * HALF);
		band((PARTS.top + PARTS.side) / (2 * HALF), floorEnd, dark);
		for (const left of [true, false]) {
			// A broad stripe along the lower flanks, in the accent colour.
			sideShape(left, [...along(-2.25, 2.25, (z) => [z, bottom(z) + 0.01]), ...along(2.25, -2.25, (z) => [z, bottom(z) + 0.2])], accent);
			sideShape(left, along(-2.25, 2.25, (z) => [z, bottom(z) + 0.2]), undefined, shade, 5);
			// Black lower bumpers at both ends.
			sideShape(left, [[1.92, 0.05], [2.29, 0.05], [2.29, 0.27], [2.05, 0.25], [1.92, 0.16]], dark);
			sideShape(left, [[-2.29, 0.05], [-1.98, 0.05], [-1.98, 0.2], [-2.29, 0.42]], dark);
			// Pinstripe under the shoulder.
			sideShape(left, along(-2.1, 2.0, (z) => [z, belt(z) - 0.035]), undefined, accent, 6);
			// Door: front, rear and bottom edges.
			sideShape(left, [[0.66, 0.17], [0.66, belt(0.66) - 0.01]], undefined, gap);
			sideShape(left, [[-0.62, 0.17], [-0.62, belt(-0.62) - 0.01]], undefined, gap);
			sideShape(left, along(-0.62, 0.66, (z) => [z, 0.17]), undefined, gap);
			// Seams where the bumpers meet the wings.
			sideShape(left, [[1.78, 0.12], [1.84, 0.5], [1.88, belt(1.88) - 0.01]], undefined, gap);
			sideShape(left, [[-1.96, 0.2], [-1.98, 0.6], [-2.0, belt(-2.0) - 0.01]], undefined, gap);
			// Intake on the rear haunch, ahead of the wheel.
			sideShape(left, [[-0.98, 0.5], [-0.76, 0.56], [-0.74, 0.76], [-0.96, 0.74]], dark);
		}
		// Twin stripes over the whole length of the top.
		for (const sign of [1, -1]) {
			topShape([...along(-2.3, 2.3, (z) => [sign * 0.09, z]), ...along(2.3, -2.3, (z) => [sign * 0.2, z])], accent);
		}
		// Front lid and engine lid outlines.
		for (const sign of [1, -1]) {
			topShape(along(0.93, 2.02, (z) => [sign * 0.56, z], 20), undefined, gap);
			topShape(along(-2.15, -1.58, (z) => [sign * 0.5, z], 20), undefined, gap);
		}
		topShape(along(-0.56, 0.56, (x) => [x, 0.93], 20).map(([x]) => [x, 0.93]), undefined, gap);
		topShape(along(-0.56, 0.56, (x) => [x, 2.02], 20).map(([x]) => [x, 2.02]), undefined, gap);
		topShape(along(-0.5, 0.5, (x) => [x, -1.58], 20).map(([x]) => [x, -1.58]), undefined, gap);
		topShape(along(-0.5, 0.5, (x) => [x, -2.15], 20).map(([x]) => [x, -2.15]), undefined, gap);
		// Vent at the front of the lid, with slats.
		topShape([[-0.34, 1.64], [0.34, 1.64], [0.3, 1.93], [-0.3, 1.93]], dark);
		for (let i = 1; i < 7; i++) {
			const z = 1.64 + (0.29 * i) / 7;
			topShape([[-0.33, z], [0.33, z]], undefined, '#3a3c40', 4);
		}
		// Louvres over the front wheels.
		for (const sign of [1, -1]) {
			topShape([[sign * 0.6, 0.98], [sign * 0.84, 0.98], [sign * 0.86, 1.34], [sign * 0.62, 1.34]], '#1a1b1e');
			for (let i = 1; i < 8; i++) {
				const z = 0.98 + (0.36 * i) / 8;
				topShape([[sign * 0.61, z], [sign * 0.85, z]], undefined, '#050506', 5);
			}
		}
		// Engine lid grille.
		topShape([[-0.46, -2.12], [0.46, -2.12], [0.44, -1.66], [-0.44, -1.66]], dark);
		for (let i = 1; i < 14; i++) {
			const z = -2.12 + (0.46 * i) / 14;
			topShape([[-0.45, z], [0.45, z]], undefined, '#2e3034', 4);
		}
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		texture.anisotropy = 8;
		return texture;
	}, [body, accent]);

const useNumber = (number: string, accent: string) =>
	useMemo(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 512;
		const g = canvas.getContext('2d')!;
		g.clearRect(0, 0, 512, 512);
		g.fillStyle = '#f4f2ee';
		g.beginPath();
		g.arc(256, 256, 230, 0, Math.PI * 2);
		g.fill();
		g.lineWidth = 18;
		g.strokeStyle = accent;
		g.stroke();
		g.fillStyle = '#121214';
		g.font = '900 260px Helvetica, Arial, sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText(number, 256, 270);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		return texture;
	}, [number]);

/** Intakes across the front bumper: three black openings with a honeycomb mesh. */
const useIntakes = () =>
	useMemo(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 2048;
		canvas.height = 256;
		const g = canvas.getContext('2d')!;
		g.clearRect(0, 0, 2048, 256);
		const opening = (u0: number, u1: number, top: number, bottomEdge: number) => {
			const x0 = u0 * 2048;
			const x1 = u1 * 2048;
			g.fillStyle = '#060607';
			g.beginPath();
			g.roundRect(x0, top, x1 - x0, bottomEdge - top, 36);
			g.fill();
			g.strokeStyle = 'rgba(70, 72, 78, 0.9)';
			g.lineWidth = 3;
			for (let x = x0 + 8; x < x1; x += 22) {
				for (let y = top + 8; y < bottomEdge; y += 19) {
					g.beginPath();
					g.arc(x + ((y / 19) % 2) * 11, y, 7, 0, Math.PI * 2);
					g.stroke();
				}
			}
		};
		opening(0.34, 0.66, 30, 250);
		opening(0.08, 0.27, 10, 250);
		opening(0.73, 0.92, 10, 250);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		texture.anisotropy = 8;
		return texture;
	}, []);

// ---------------------------------------------------------------- parts

const tyreGeometry = (r: number, width: number) => {
	const w = width / 2;
	const points: Vector2[] = [];
	const add = (x: number, y: number) => points.push(new Vector2(x, y));
	add(0.235, -w * 0.92);
	add(r - 0.035, -w);
	for (let i = 0; i <= 8; i++) {
		const a = -Math.PI / 2 + (Math.PI / 2) * (i / 8);
		add(r - 0.035 + 0.035 * Math.cos(a), -w + 0.035 + 0.035 * Math.sin(a));
	}
	for (let i = 0; i <= 8; i++) {
		const a = (Math.PI / 2) * (i / 8);
		add(r - 0.035 + 0.035 * Math.cos(a), w - 0.035 + 0.035 * Math.sin(a));
	}
	add(0.235, w * 0.92);
	return new LatheGeometry(points, 80).rotateZ(Math.PI / 2);
};

const spokeGeometry = () => {
	const shape = new Shape();
	shape.moveTo(-0.017, 0.06);
	shape.lineTo(0.017, 0.06);
	shape.lineTo(0.024, 0.226);
	shape.lineTo(-0.024, 0.226);
	shape.closePath();
	return new ExtrudeGeometry(shape, {depth: 0.03, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2}).rotateY(Math.PI / 2);
};

const discGeometry = () => {
	const shape = new Shape();
	shape.absarc(0, 0, 0.19, 0, Math.PI * 2, false);
	const hole = new Shape();
	hole.absarc(0, 0, 0.1, 0, Math.PI * 2, true);
	shape.holes.push(hole);
	return new ExtrudeGeometry(shape, {depth: 0.032, bevelEnabled: false, curveSegments: 48}).rotateY(Math.PI / 2);
};

/** The wing's section: chord 0.38 m, nose forward (+z), with a small lip at the trailing edge. */
const wingGeometry = () => {
	const shape = new Shape();
	shape.moveTo(0.19, 0);
	shape.bezierCurveTo(0.17, 0.035, 0.0, 0.05, -0.17, 0.028);
	shape.lineTo(-0.19, 0.05);
	shape.lineTo(-0.195, 0.044);
	shape.lineTo(-0.18, 0.012);
	shape.bezierCurveTo(-0.02, 0.0, 0.12, -0.02, 0.19, 0);
	// The shape is drawn in (z, y); turn it so it runs across the car.
	return new ExtrudeGeometry(shape, {depth: 1.74, bevelEnabled: false, curveSegments: 20}).translate(0, 0, -0.87).rotateY(-Math.PI / 2);
};

/** A swan-neck support: rises from the engine lid and hooks over onto the wing. */
const swanNeckGeometry = () => {
	const shape = new Shape();
	shape.moveTo(0.06, 0);
	shape.bezierCurveTo(0.05, 0.16, 0.02, 0.3, -0.08, 0.36);
	shape.bezierCurveTo(-0.16, 0.39, -0.24, 0.36, -0.27, 0.27);
	shape.lineTo(-0.22, 0.26);
	shape.bezierCurveTo(-0.2, 0.31, -0.14, 0.32, -0.09, 0.3);
	shape.bezierCurveTo(-0.02, 0.26, -0.01, 0.14, -0.04, 0);
	shape.closePath();
	return new ExtrudeGeometry(shape, {depth: 0.016, bevelEnabled: false, curveSegments: 20}).translate(0, 0, -0.008).rotateY(-Math.PI / 2);
};

/** The splitter: a carbon plate that follows the nose and sticks out a few centimetres. */
const splitterGeometry = () => {
	const shape = new Shape();
	const steps = 24;
	const outline: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const z = 1.72 + ((CAR.front - 1.72) * i) / steps;
		outline.push([surfaceX(z, 0.12) + 0.04, z]);
	}
	shape.moveTo(-outline[0][0], outline[0][1]);
	outline.forEach(([x, z]) => shape.lineTo(-x, z));
	shape.lineTo(-outline[steps][0] * 0.8, CAR.front + 0.055);
	shape.lineTo(outline[steps][0] * 0.8, CAR.front + 0.055);
	[...outline].reverse().forEach(([x, z]) => shape.lineTo(x, z));
	shape.closePath();
	// Drawn in (x, z): lay it flat.
	return new ExtrudeGeometry(shape, {depth: 0.016, bevelEnabled: false}).rotateX(Math.PI / 2);
};

/** A band that hugs the front bumper at the height of the intakes, carrying their texture. */
const fasciaGeometry = () => {
	const lower = 0.15;
	const upper = 0.36;
	const path: {z: number; side: number}[] = [];
	const steps = 30;
	for (let i = 0; i <= steps; i++) path.push({z: 1.98 + ((CAR.front - 1.98) * i) / steps, side: -1});
	for (let i = 1; i < 10; i++) path.push({z: CAR.front, side: -1 + (2 * i) / 10});
	for (let i = steps; i >= 0; i--) path.push({z: 1.98 + ((CAR.front - 1.98) * i) / steps, side: 1});
	const positions: number[] = [];
	const uvs: number[] = [];
	const index: number[] = [];
	const corner = surfaceX(CAR.front, 0.25);
	let length = 0;
	let previous: [number, number] | null = null;
	const placed = path.map(({z, side}) => {
		const onFace = z >= CAR.front && Math.abs(side) < 1;
		const xs = [lower, upper].map((y) => (onFace ? side * surfaceX(CAR.front, y) : side * surfaceX(z, y)));
		const here: [number, number] = [onFace ? side * corner : side * surfaceX(z, 0.25), z];
		if (previous) length += Math.hypot(here[0] - previous[0], here[1] - previous[1]);
		previous = here;
		return {xs, z: onFace ? CAR.front + 0.004 : z, length, side, onFace};
	});
	placed.forEach(({xs, z, length: at, side, onFace}) => {
		const out = onFace ? 0 : side * 0.005;
		positions.push(xs[0] + out, lower, z + (onFace ? 0 : 0.002), xs[1] + out, upper, z + (onFace ? 0 : 0.002));
		uvs.push(at / length, 0, at / length, 1);
	});
	for (let i = 0; i < placed.length - 1; i++) {
		const a = i * 2;
		index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
	geometry.setIndex(index);
	geometry.computeVertexNormals();
	return geometry;
};

const cageGeometry = () => {
	const tube = (points: [number, number, number][]) =>
		new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), 40, 0.02, 8, false);
	return [
		tube([[0.62, 0.3, -0.52], [0.6, 0.9, -0.5], [0.45, 1.13, -0.5], [-0.45, 1.13, -0.5], [-0.6, 0.9, -0.5], [-0.62, 0.3, -0.52]]),
		tube([[0.5, 1.13, -0.5], [0.55, 1.13, 0.0], [0.66, 0.95, 0.55], [0.72, 0.5, 0.75]]),
		tube([[-0.5, 1.13, -0.5], [-0.55, 1.13, 0.0], [-0.66, 0.95, 0.55], [-0.72, 0.5, 0.75]]),
		tube([[0.55, 1.1, -0.5], [-0.58, 0.32, -0.5]]),
	];
};

let parts: ReturnType<typeof buildParts> | null = null;
const buildParts = () => ({
	tyreFront: tyreGeometry(CAR.radiusFront, CAR.widthFront),
	tyreRear: tyreGeometry(CAR.radiusRear, CAR.widthRear),
	spoke: spokeGeometry(),
	disc: discGeometry(),
	wing: wingGeometry(),
	swanNeck: swanNeckGeometry(),
	splitter: splitterGeometry(),
	fascia: fasciaGeometry(),
	cage: cageGeometry(),
});
const carParts = () => {
	parts ??= buildParts();
	return parts;
};

export type CarPose = {
	/** Position of the point under the middle of the car, on the ground. */
	x: number;
	z: number;
	y?: number;
	/** Direction of travel, in radians around the vertical axis. 0 points along +z. */
	heading: number;
	/** Metres travelled, which turns the wheels. */
	distance: number;
	/** Front wheel angle, in radians. */
	steer?: number;
	/** 0 to 1: how hot the brake discs are. */
	brake?: number;
	/** Nose up (+) or down (-), and lean, in radians, from acceleration and cornering. */
	pitch?: number;
	roll?: number;
};

const Wheel: React.FC<{
	side: 1 | -1;
	front: boolean;
	pose: (time: number) => CarPose;
	rim: string;
}> = ({side, front, pose, rim}) => {
	const {tyreFront, tyreRear, spoke, disc} = carParts();
	const radius = front ? CAR.radiusFront : CAR.radiusRear;
	const trackHalf = front ? CAR.trackFront : CAR.trackRear;
	const width = front ? CAR.widthFront : CAR.widthRear;
	const steerGroup = useMoving<Group>((object, time) => {
		object.rotation.set(0, front ? pose(time).steer ?? 0 : 0, 0);
	});
	const spin = useMoving<Group>((object, time) => {
		object.rotation.set(pose(time).distance / radius, 0, 0);
	});
	const glow = useMoving<Group>((object, time) => {
		// Discs only glow once they are really hot.
		const heat = MathUtils.smoothstep(pose(time).brake ?? 0, 0.72, 1);
		object.children.forEach((child) => {
			const mesh = child as unknown as {material?: {emissiveIntensity: number}};
			if (mesh.material && 'emissiveIntensity' in mesh.material) {
				mesh.material.emissiveIntensity = heat * 5;
			}
		});
	});
	const face = width / 2 - 0.09;
	return (
		<group position={[side * trackHalf, radius, front ? CAR.frontAxle : CAR.rearAxle]}>
			<group ref={steerGroup}>
				<group ref={glow} position={[-side * 0.05, 0, 0]}>
					<mesh geometry={disc} position={[-0.016, 0, 0]} castShadow>
						<meshPhysicalMaterial color="#5a5a5e" metalness={0.9} roughness={0.35} emissive="#ff4a0a" emissiveIntensity={0} />
					</mesh>
				</group>
				{/* The caliper, which does not turn. */}
				<mesh position={[-side * 0.03, 0.13, -0.11]} rotation={[0.7, 0, 0]} castShadow>
					<boxGeometry args={[0.06, 0.12, 0.2]} />
					<meshPhysicalMaterial color="#c8151b" roughness={0.35} clearcoat={0.6} />
				</mesh>
				<group ref={spin}>
					<mesh geometry={front ? tyreFront : tyreRear} castShadow receiveShadow>
						<meshPhysicalMaterial color="#141416" roughness={0.82} sheen={0.3} sheenRoughness={0.8} side={DoubleSide} />
					</mesh>
					{Array.from({length: 10}, (_, i) => (
						<mesh key={i} geometry={spoke} rotation={[(i / 10) * Math.PI * 2, 0, 0]} position={[side * face, 0, 0]} castShadow>
							<meshPhysicalMaterial {...LOOKS.anodized(rim)} roughness={0.32} />
						</mesh>
					))}
					<mesh rotation={[0, 0, Math.PI / 2]} position={[side * (face + 0.015), 0, 0]}>
						<cylinderGeometry args={[0.235, 0.235, 0.02, 48, 1, true]} />
						<meshPhysicalMaterial {...LOOKS.anodized(rim)} roughness={0.3} side={DoubleSide} />
					</mesh>
					{/* Centre-lock nut, in red. */}
					<mesh rotation={[0, 0, Math.PI / 2]} position={[side * (face + 0.035), 0, 0]}>
						<cylinderGeometry args={[0.05, 0.058, 0.06, 6]} />
						<meshPhysicalMaterial color="#c8151b" metalness={0.6} roughness={0.3} />
					</mesh>
				</group>
			</group>
		</group>
	);
};

export type CarProps = {
	pose: (time: number) => CarPose;
	body?: string;
	accent?: string;
	number?: string;
	rim?: string;
	/** 0 to 1: headlights and tail lights. */
	lights?: number;
	/** Strength of real headlight beams that light the road, for night shots. 0 leaves them off. */
	beams?: number;
	castShadow?: boolean;
	/** Lets the body turn see-through. Set it from the start of the shot when `ghost` will be used. */
	xray?: boolean;
	/** 0 solid to 1: the body fades to glowing edges, showing what is inside. */
	ghost?: number;
	/** Where a bright scan line crosses the car, along its length in metres, or undefined for none. */
	sweep?: number;
	/** How brightly the x-ray edges glow, 1 by default; lower it when the camera is inside the car. */
	glow?: number;
	/** Things carried inside the body, in the car's frame, such as the engine. */
	children?: React.ReactNode;
};

const xrayMaterial = () =>
	new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		uniforms: {colour: {value: new Color(0.45, 0.85, 1.6)}, strength: {value: 0}, sweep: {value: 99}},
		vertexShader: /* glsl */ `
			varying vec3 vNormal;
			varying vec3 vView;
			varying float vAlong;
			void main() {
				vec4 world = modelMatrix * vec4(position, 1.0);
				vNormal = normalize(mat3(modelMatrix) * normal);
				vView = normalize(cameraPosition - world.xyz);
				vAlong = position.z;
				gl_Position = projectionMatrix * viewMatrix * world;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 colour;
			uniform float strength;
			uniform float sweep;
			varying vec3 vNormal;
			varying vec3 vView;
			varying float vAlong;
			void main() {
				float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
				float band = smoothstep(0.09, 0.0, abs(vAlong - sweep));
				gl_FragColor = vec4(colour * (edge * strength + band * 3.0), 1.0);
			}
		`,
	});

const carbon = {color: '#111214', roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.1} as const;

/** Two headlight beams that light the road ahead. */
const Beams: React.FC<{strength: number}> = ({strength}) => {
	const targets = useMemo(() => [new Object3D(), new Object3D()], []);
	return (
		<>
			{[1, -1].map((side, i) => (
				<group key={side}>
					<primitive object={targets[i]} position={[side * 0.9, 0, 14]} />
					<spotLight
						position={[side * 0.66, 0.62, 2.0]}
						target={targets[i]}
						color="#eef3ff"
						intensity={strength * 20}
						distance={70}
						angle={0.5}
						penumbra={0.85}
						decay={1.6}
					/>
				</group>
			))}
		</>
	);
};

/** The whole car, moving with motion blur along whatever path `pose` describes. */
export const Car: React.FC<CarProps> = ({
	pose,
	body = '#e9e7e2',
	accent = '#d5202b',
	number = '23',
	rim = '#2b2c30',
	lights = 0,
	beams = 0,
	castShadow = true,
	xray = false,
	ghost = 0,
	sweep,
	glow = 1,
	children,
}) => {
	const geometry = carBody();
	const shell = useMemo(() => (xray ? xrayMaterial() : null), [xray]);
	if (shell) {
		shell.uniforms.strength.value = ghost * 1.4 * glow;
		shell.uniforms.sweep.value = sweep ?? 99;
	}
	const solid = 1 - ghost * 0.95;
	const {wing, swanNeck, splitter, fascia, cage} = carParts();
	const livery = useLivery(body, accent);
	const roundel = useNumber(number, accent);
	const intakes = useIntakes();
	const wear = useScratchMap({seed: 33, repeat: [2, 2], amount: 0.5});
	const root = useMoving<Group>((object, time) => {
		const p = pose(time);
		object.position.set(p.x, p.y ?? 0, p.z);
		object.rotation.set(0, p.heading, 0);
	});
	const chassis = useMoving<Group>((object, time) => {
		const p = pose(time);
		object.rotation.set(-(p.pitch ?? 0), 0, p.roll ?? 0);
	});
	const headlightY = 0.598;
	return (
		<group ref={root}>
			<group ref={chassis}>
				<mesh geometry={geometry.paint} castShadow={castShadow && solid > 0.5} receiveShadow>
					<meshPhysicalMaterial
						{...LOOKS.carPaint(body)}
						color="#ffffff"
						map={livery}
						roughnessMap={wear}
						transparent={xray}
						opacity={solid}
						depthWrite={solid > 0.6}
					/>
				</mesh>
				{/* Tinted polycarbonate windows: dark, glossy and a little see-through. */}
				<mesh geometry={geometry.glass}>
					<meshPhysicalMaterial
						color="#161a20"
						roughness={0.03}
						metalness={0.1}
						clearcoat={1}
						clearcoatRoughness={0.02}
						transparent
						opacity={0.8 * solid}
						depthWrite={false}
					/>
				</mesh>
				{shell && (
					<>
						<mesh geometry={geometry.paint} material={shell} renderOrder={10} visible={ghost > 0 || sweep !== undefined} />
						<mesh geometry={geometry.glass} material={shell} renderOrder={10} visible={ghost > 0 || sweep !== undefined} />
					</>
				)}
				{children}
				{beams > 0 && <Beams strength={beams} />}
				<group visible={ghost < 0.25}>
					{/* The driver, seat and roll cage, seen through the glass. */}
					<group position={[0.37, 0, -0.18]}>
						<mesh position={[0, 1.0, 0]} castShadow>
							<sphereGeometry args={[0.13, 24, 16]} />
							<meshPhysicalMaterial color={body} roughness={0.25} clearcoat={1} />
						</mesh>
						<mesh position={[0, 1.0, 0.07]} rotation={[0.15, 0, 0]} scale={[1, 0.42, 0.6]}>
							<sphereGeometry args={[0.125, 24, 12]} />
							<meshPhysicalMaterial color="#0c0d10" roughness={0.05} clearcoat={1} />
						</mesh>
						<mesh position={[0, 0.78, -0.05]}>
							<boxGeometry args={[0.42, 0.22, 0.26]} />
							<meshStandardMaterial color={accent} roughness={0.8} />
						</mesh>
						<mesh position={[0, 0.7, -0.22]} rotation={[-0.25, 0, 0]}>
							<boxGeometry args={[0.5, 0.75, 0.08]} />
							<meshStandardMaterial color="#0d0e10" roughness={0.9} />
						</mesh>
						<mesh position={[0, 0.88, 0.42]} rotation={[0.35, 0, 0]}>
							<torusGeometry args={[0.15, 0.018, 8, 32]} />
							<meshStandardMaterial color="#121315" roughness={0.6} />
						</mesh>
					</group>
					{cage.map((tube, i) => (
						<mesh key={i} geometry={tube}>
							<meshPhysicalMaterial color="#c9ccd1" metalness={0.6} roughness={0.35} />
						</mesh>
					))}
					{/* Race number on each door. */}
					{[1, -1].map((side) => (
						<mesh key={side} position={[side * (surfaceX(0.02, 0.56) + 0.006), 0.56, 0.02]} rotation={[0, side * Math.PI * 0.5, 0]}>
							<planeGeometry args={[0.42, 0.42]} />
							<meshPhysicalMaterial map={roundel} transparent roughness={0.3} clearcoat={0.8} polygonOffset polygonOffsetFactor={-4} />
						</mesh>
					))}
					{/* Headlights on the front slope of the wings: an oval lens with four light points. */}
					{[1, -1].map((side) => (
						<group key={side} position={[side * 0.655, headlightY, 1.92]} rotation={[1.05, side * 0.18, 0]}>
							<mesh scale={[1.12, 1, 0.9]}>
								<sphereGeometry args={[0.1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
								<meshPhysicalMaterial color="#d7dde4" transmission={0.92} roughness={0.03} thickness={0.02} ior={1.45} />
							</mesh>
							<mesh position={[0, -0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
								<ringGeometry args={[0.088, 0.104, 40]} />
								<meshStandardMaterial color="#1a1b1e" roughness={0.4} />
							</mesh>
							{/* Chrome reflector behind the lens. */}
							<mesh position={[0, -0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.1, 0.9, 1]}>
								<circleGeometry args={[0.09, 40]} />
								<meshPhysicalMaterial color="#c9ced6" metalness={1} roughness={0.12} />
							</mesh>
							{[
								[-0.034, -0.032],
								[0.034, -0.032],
								[-0.034, 0.032],
								[0.034, 0.032],
							].map(([x, z], i) => (
								<mesh key={i} position={[x, 0.012, z]}>
									<boxGeometry args={[0.032, 0.006, 0.009]} />
									<meshStandardMaterial color="#f4f7ff" emissive="#eaf1ff" emissiveIntensity={0.6 + lights * 26} />
								</mesh>
							))}
						</group>
					))}
					{/* Intakes across the front bumper. */}
					<mesh geometry={fascia}>
						<meshStandardMaterial map={intakes} alphaTest={0.5} roughness={0.6} side={DoubleSide} polygonOffset polygonOffsetFactor={-3} />
					</mesh>
					{/* Splitter and dive planes. */}
					<mesh geometry={splitter} position={[0, 0.085, 0]} castShadow>
						<meshPhysicalMaterial {...carbon} />
					</mesh>
					{[1, -1].flatMap((side) =>
						[
							[2.08, 0.3],
							[2.03, 0.4],
						].map(([z, y]) => (
							<mesh key={`${side}${z}`} position={[side * (surfaceX(z, y) + 0.05), y, z]} rotation={[0.12, side * 0.5, side * -0.2]}>
								<boxGeometry args={[0.12, 0.008, 0.1]} />
								<meshPhysicalMaterial {...carbon} />
							</mesh>
						)),
					)}
					{/* Rear: light bar across the tail, lamps wrapping round the corners, black lower bumper. */}
					<mesh position={[0, 0.82, CAR.rear - 0.004]} rotation={[0, Math.PI, 0]}>
						<planeGeometry args={[1.36, 0.035]} />
						<meshStandardMaterial color="#3a0306" emissive="#ff1424" emissiveIntensity={0.8 + lights * 16} />
					</mesh>
					{[1, -1].map((side) => (
						<mesh key={side} position={[side * 0.66, 0.79, CAR.rear + 0.04]} rotation={[0, side * 0.6, 0]}>
							<boxGeometry args={[0.2, 0.07, 0.03]} />
							<meshStandardMaterial color="#4a0507" emissive="#ff1424" emissiveIntensity={0.6 + lights * 10} roughness={0.2} />
						</mesh>
					))}
					<mesh position={[0, 0.42, CAR.rear - 0.004]} rotation={[0, Math.PI, 0]}>
						<planeGeometry args={[1.42, 0.22]} />
						<meshStandardMaterial color="#0f1012" roughness={0.6} />
					</mesh>
					{/* Diffuser fins under the tail. */}
					{[-0.62, -0.38, -0.14, 0.14, 0.38, 0.62].map((x) => (
						<mesh key={x} position={[x, 0.17, CAR.rear + 0.2]}>
							<boxGeometry args={[0.01, 0.16, 0.4]} />
							<meshPhysicalMaterial {...carbon} />
						</mesh>
					))}
					{/* Two centre exhaust pipes. */}
					{[1, -1].map((side) => (
						<mesh key={side} position={[side * 0.08, 0.38, CAR.rear - 0.02]} rotation={[Math.PI / 2, 0, 0]}>
							<cylinderGeometry args={[0.048, 0.048, 0.12, 24, 1, true]} />
							<meshPhysicalMaterial {...LOOKS.chrome('#9a7a56')} roughness={0.3} side={DoubleSide} />
						</mesh>
					))}
					{/* Swan-neck rear wing: the plane hangs from two supports on the engine lid. */}
					<group position={[0, 1.165, -2.13]}>
						<mesh geometry={wing} castShadow>
							<meshPhysicalMaterial {...carbon} />
						</mesh>
						{[1, -1].map((side) => (
							<mesh key={side} position={[side * 0.876, -0.04, 0.0]}>
								<boxGeometry args={[0.012, 0.26, 0.44]} />
								<meshPhysicalMaterial {...carbon} />
							</mesh>
						))}
					</group>
					{[1, -1].map((side) => (
						<mesh key={side} geometry={swanNeck} position={[side * 0.3, 0.935, -1.86]} castShadow>
							<meshPhysicalMaterial {...LOOKS.anodized('#1c1d20')} roughness={0.35} />
						</mesh>
					))}
					{/* Aero mirrors on short stalks. */}
					{[1, -1].map((side) => (
						<group key={side} position={[side * 0.93, 0.975, 0.52]}>
							<mesh position={[side * 0.06, 0.03, 0]} scale={[0.75, 0.55, 1.15]} castShadow>
								<sphereGeometry args={[0.075, 20, 12]} />
								<meshPhysicalMaterial {...LOOKS.carPaint(accent)} />
							</mesh>
							<mesh position={[0, -0.01, 0.01]} rotation={[0, 0, side * 0.5]}>
								<boxGeometry args={[0.1, 0.012, 0.05]} />
								<meshPhysicalMaterial {...carbon} />
							</mesh>
						</group>
					))}
					{/* Dark underside. */}
					<mesh position={[0, 0.07, -0.1]}>
						<boxGeometry args={[1.5, 0.02, 4.1]} />
						<meshStandardMaterial color="#0a0a0b" roughness={0.9} />
					</mesh>
				</group>
			</group>
			{[
				[1, true],
				[-1, true],
				[1, false],
				[-1, false],
			].map(([side, front]) => (
				<Wheel key={`${side}${front}`} side={side as 1 | -1} front={front as boolean} pose={pose} rim={rim} />
			))}
		</group>
	);
};
