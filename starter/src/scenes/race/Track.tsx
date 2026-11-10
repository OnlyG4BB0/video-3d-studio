import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {
	BackSide,
	BufferGeometry,
	Color,
	DoubleSide,
	Float32BufferAttribute,
	InstancedMesh,
	Object3D,
	ShaderMaterial,
	Vector3,
} from 'three';
import {useCanvasTexture} from '../../kit';
import {centreAt, lap, TRACK} from './world';

// The circuit around the cars: asphalt, kerbs, walls with catch fences, the start
// gantry, grandstand, pit building, floodlight towers, trees and the sky.

type Profile = [side: number, y: number][];

const rand = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const HALF = TRACK.width / 2;
export const TRACK_HALF = HALF;

/**
 * A strip that follows the circuit with the given cross-section (metres left of
 * the centre line, height), from `from` to `to` metres along it. Texture
 * coordinates are in metres: across the section and along the lap.
 */
const strip = (
	profile: Profile,
	from: number,
	to: number,
	{step = 1, uLength = 1, vLength = 1, shift}: {step?: number; uLength?: number; vLength?: number; shift?: (s: number) => number} = {},
) => {
	const rows = Math.max(1, Math.round((to - from) / step));
	const cols = profile.length;
	const positions: number[] = [];
	const uvs: number[] = [];
	const index: number[] = [];
	// Whole laps get a length that tiles exactly, so there is no seam at the line.
	const along = to - from >= lap().length - 1 ? lap().length / Math.max(1, Math.round(lap().length / vLength)) : vLength;
	const across: number[] = [0];
	for (let k = 1; k < cols; k++) {
		across.push(across[k - 1] + Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]));
	}
	for (let r = 0; r <= rows; r++) {
		const s = from + ((to - from) * r) / rows;
		const c = centreAt(s);
		const nx = Math.cos(c.heading);
		const nz = -Math.sin(c.heading);
		const extra = shift ? shift(s) : 0;
		for (let k = 0; k < cols; k++) {
			const [side, y] = profile[k];
			const d = side + extra;
			positions.push(c.x + nx * d, y, c.z + nz * d);
			uvs.push(across[k] / uLength, (s - from) / along);
		}
	}
	for (let r = 0; r < rows; r++) {
		for (let k = 0; k < cols - 1; k++) {
			const a = r * cols + k;
			const b = a + 1;
			const c = a + cols;
			const d = c + 1;
			index.push(a, c, b, b, c, d);
		}
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
	geometry.setIndex(index);
	geometry.computeVertexNormals();
	return geometry;
};

/** Stretches of the lap that are corners, with the side of their inside. */
const corners = () => {
	const l = lap();
	const result: {from: number; to: number; side: 1 | -1}[] = [];
	let start = -1;
	let sum = 0;
	for (let i = 0; i <= l.count; i++) {
		const tight = i < l.count && Math.abs(l.curve[i]) > 1 / TRACK.kerbRadius;
		if (tight && start < 0) {
			start = i;
			sum = 0;
		}
		if (tight) {
			sum += l.curve[i];
		}
		if (!tight && start >= 0) {
			result.push({from: start * l.step - 8, to: i * l.step + 8, side: sum > 0 ? 1 : -1});
			start = -1;
		}
	}
	return result;
};

/** How far the outer walls stand back from the track: further out where the gravel is. */
const GRAVEL = {from: 255, to: 375};
const wallShift = (s: number) => {
	const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (s - a) / (b - a)));
	return -9 * (ramp(GRAVEL.from - 25, GRAVEL.from) - ramp(GRAVEL.to, GRAVEL.to + 25));
};

const LEFT_WALL = HALF + 6.5;
const RIGHT_WALL = -(HALF + 8);

type TrackGeometry = ReturnType<typeof buildTrack>;

const buildTrack = () => {
	const length = lap().length;
	const kerbs = corners().flatMap(({from, to, side}) => {
		const inside: Profile = [
			[side * (HALF - 0.05), 0.004],
			[side * (HALF + 0.45), 0.05],
			[side * (HALF + 1.25), 0.012],
		];
		const outside: Profile = inside.map(([d, y]) => [-d, y]);
		const middle = (from + to) / 2;
		return [strip(inside, from, to, {step: 0.5, uLength: 1.3, vLength: 4.4}), strip(outside, middle, to + 12, {step: 0.5, uLength: 1.3, vLength: 4.4})];
	});
	const lines = [1, -1].map((side) =>
		strip(
			[
				[side * (HALF - 0.45), 0.006],
				[side * (HALF - 0.2), 0.006],
			],
			0,
			length,
			{step: 1, vLength: 4},
		),
	);
	const wallFace = (d: number, shift?: (s: number) => number) =>
		strip(
			[
				[d, 0],
				[d, 1.05],
			],
			0,
			length,
			{step: 1, uLength: 1.05, vLength: 48, shift},
		);
	const wallTop = (d: number, shift?: (s: number) => number) =>
		strip(
			[
				[d, 1.05],
				[d + Math.sign(d) * 0.35, 1.05],
				[d + Math.sign(d) * 0.35, 0],
			],
			0,
			length,
			{step: 1, shift},
		);
	const fence = (d: number, shift?: (s: number) => number) =>
		strip(
			[
				[d + Math.sign(d) * 0.2, 1.05],
				[d + Math.sign(d) * 0.2, 4.3],
			],
			0,
			length,
			{step: 1, uLength: 0.14, vLength: 0.14, shift},
		);
	const l = lap();
	const lineAt = (s: number) => {
		const f = ((((s % length) + length) % length) / l.step);
		const i = Math.min(Math.floor(f), l.count - 1);
		return l.line[i] * (1 - (f - i)) + l.line[i + 1] * (f - i);
	};
	const rubber = strip(
		[
			[-1.15, 0.003],
			[1.15, 0.003],
		],
		0,
		length,
		{step: 1, uLength: 2.3, vLength: 6, shift: lineAt},
	);
	// Darker where the cars brake hard and lean on the tyres in corners.
	const colours: number[] = [];
	const rows = rubber.getAttribute('position').count / 2;
	for (let r = 0; r < rows; r++) {
		const s = (r / (rows - 1)) * length;
		const f = Math.min(Math.floor(s / l.step), l.count - 1);
		const v = l.speed[f];
		const grip = Math.min(1, Math.abs(v * v * l.curve[f]) / 17);
		const alpha = Math.min(0.85, 0.18 + 0.55 * l.brake[f] + 0.35 * grip);
		colours.push(1, 1, 1, alpha, 1, 1, 1, alpha);
	}
	rubber.setAttribute('color', new Float32BufferAttribute(colours, 4));
	return {
		rubber,
		asphalt: strip(
			[
				[-(HALF + 0.7), 0],
				[HALF + 0.7, 0],
			],
			0,
			length,
			{step: 1, uLength: 4, vLength: 4},
		),
		lines,
		kerbs,
		gravel: strip(
			[
				[-(HALF + 1.2), 0.008],
				[-(HALF + 17), 0.008],
			],
			GRAVEL.from,
			GRAVEL.to,
			{step: 1, uLength: 3, vLength: 3},
		),
		walls: [wallFace(LEFT_WALL), wallFace(RIGHT_WALL, wallShift)],
		tops: [wallTop(LEFT_WALL), wallTop(RIGHT_WALL, wallShift)],
		fences: [fence(LEFT_WALL), fence(RIGHT_WALL, wallShift)],
	};
};

let built: TrackGeometry | null = null;
const trackGeometry = () => {
	built ??= buildTrack();
	return built;
};

/** Places of things around the lap, worked out once. */
const placeAlong = (spacing: number, side: number, shift?: (s: number) => number) => {
	const places: {x: number; z: number; heading: number}[] = [];
	for (let s = spacing / 2; s < lap().length; s += spacing) {
		const c = centreAt(s);
		const d = side + (shift ? shift(s) : 0);
		places.push({x: c.x + Math.cos(c.heading) * d, z: c.z - Math.sin(c.heading) * d, heading: c.heading});
	}
	return places;
};

const distanceToTrack = (x: number, z: number) => {
	const l = lap();
	let best = Infinity;
	for (let i = 0; i < l.count; i += 2) {
		best = Math.min(best, Math.hypot(l.x[i] - x, l.z[i] - z));
	}
	return best;
};

// ---------------------------------------------------------------- textures

const useAsphalt = (wet: number) =>
	useCanvasTexture(
		(context, size) => {
			const random = rand(71);
			context.fillStyle = '#2f3032';
			context.fillRect(0, 0, size, size);
			// Broad patches, then the aggregate: thousands of small light and dark stones.
			for (let i = 0; i < 60; i++) {
				context.globalAlpha = 0.05;
				context.fillStyle = random() > 0.5 ? '#26272a' : '#3c3d40';
				context.beginPath();
				context.arc(random() * size, random() * size, 40 + random() * 160, 0, Math.PI * 2);
				context.fill();
			}
			for (let i = 0; i < 26000; i++) {
				const shade = random();
				context.globalAlpha = 0.35 + random() * 0.5;
				context.fillStyle = shade > 0.62 ? '#5d5e61' : shade > 0.3 ? '#222325' : '#45464a';
				const r = 0.6 + random() * random() * 2.6;
				context.fillRect(random() * size, random() * size, r, r);
			}
			context.globalAlpha = 1;
		},
		{size: 1024, key: `asphalt${wet > 0 ? 'wet' : ''}`},
	);

/** Two dark tyre tracks with soft edges, across the texture. */
const useRubber = () =>
	useCanvasTexture(
		(context, size) => {
			const random = rand(17);
			context.clearRect(0, 0, size, size);
			for (const centre of [0.22, 0.78]) {
				const gradient = context.createLinearGradient((centre - 0.16) * size, 0, (centre + 0.16) * size, 0);
				gradient.addColorStop(0, 'rgba(255,255,255,0)');
				gradient.addColorStop(0.35, 'rgba(255,255,255,0.8)');
				gradient.addColorStop(0.65, 'rgba(255,255,255,0.8)');
				gradient.addColorStop(1, 'rgba(255,255,255,0)');
				context.fillStyle = gradient;
				context.fillRect((centre - 0.16) * size, 0, 0.32 * size, size);
			}
			// Streaks along the direction of travel.
			context.globalCompositeOperation = 'destination-out';
			for (let i = 0; i < 300; i++) {
				context.globalAlpha = 0.2 + random() * 0.4;
				context.fillRect(random() * size, random() * size, 1 + random() * 3, 20 + random() * 120);
			}
			context.globalCompositeOperation = 'source-over';
			context.globalAlpha = 1;
		},
		{size: 256, key: 'rubber'},
	);

const useKerb = () =>
	useCanvasTexture(
		(context, size) => {
			context.fillStyle = '#efeeea';
			context.fillRect(0, 0, size, size);
			context.fillStyle = '#c4161d';
			context.fillRect(0, 0, size, size / 2);
			context.fillStyle = 'rgba(0,0,0,0.25)';
			for (let i = 0; i < 400; i++) {
				const x = ((i * 97) % size) + 0.5;
				const y = ((i * 61) % size) + 0.5;
				context.fillRect(x, y, 2, 2);
			}
		},
		{size: 256, key: 'kerb'},
	);

const BOARDS = ['#1f4ea3', '#efeeea', '#c4161d', '#141518', '#f0b21b', '#2f8f5b', '#efeeea', '#141518'];
const useBoards = () =>
	useCanvasTexture(
		(context, size) => {
			const each = size / BOARDS.length;
			BOARDS.forEach((colour, i) => {
				const y = i * each;
				context.fillStyle = colour;
				context.fillRect(0, y, size, each);
				const light = colour === '#efeeea' || colour === '#f0b21b';
				context.fillStyle = light ? '#141518' : '#efeeea';
				// Abstract graphics only: chevrons, bars and a disc.
				if (i % 3 === 0) {
					for (let k = 0; k < 5; k++) {
						context.beginPath();
						context.moveTo(size * 0.2, y + each * (0.15 + k * 0.16));
						context.lineTo(size * 0.8, y + each * (0.22 + k * 0.16));
						context.lineTo(size * 0.2, y + each * (0.29 + k * 0.16));
						context.fill();
					}
				} else if (i % 3 === 1) {
					context.fillRect(size * 0.3, y + each * 0.1, size * 0.4, each * 0.8);
				} else {
					context.beginPath();
					context.arc(size * 0.5, y + each * 0.5, size * 0.3, 0, Math.PI * 2);
					context.fill();
				}
				context.fillStyle = 'rgba(0,0,0,0.35)';
				context.fillRect(0, y, size, 3);
			});
		},
		{size: 1024, key: 'boards'},
	);

const useWire = () =>
	useCanvasTexture(
		(context, size) => {
			context.clearRect(0, 0, size, size);
			context.strokeStyle = '#9a9ea3';
			context.lineWidth = size * 0.06;
			context.beginPath();
			context.moveTo(0, 0);
			context.lineTo(size, size);
			context.moveTo(size, 0);
			context.lineTo(0, size);
			context.stroke();
		},
		{size: 64, key: 'wire'},
	);

const useGrass = () =>
	useCanvasTexture(
		(context, size) => {
			const random = rand(5);
			context.fillStyle = '#3d4a2a';
			context.fillRect(0, 0, size, size);
			for (let i = 0; i < 9000; i++) {
				context.globalAlpha = 0.25 + random() * 0.4;
				context.fillStyle = random() > 0.5 ? '#4f5d33' : '#2f3a21';
				context.fillRect(random() * size, random() * size, 1 + random() * 3, 1 + random() * 6);
			}
			// Mowing stripes.
			context.globalAlpha = 0.08;
			context.fillStyle = '#c9d6a0';
			for (let k = 0; k < 8; k += 2) {
				context.fillRect(0, (k * size) / 8, size, size / 8);
			}
			context.globalAlpha = 1;
		},
		{size: 512, repeat: [180, 180], key: 'grass'},
	);

const useGravel = () =>
	useCanvasTexture(
		(context, size) => {
			const random = rand(9);
			context.fillStyle = '#a69a83';
			context.fillRect(0, 0, size, size);
			for (let i = 0; i < 16000; i++) {
				context.globalAlpha = 0.4 + random() * 0.5;
				context.fillStyle = random() > 0.5 ? '#cbbfa6' : '#7c705d';
				const r = 1 + random() * 3;
				context.fillRect(random() * size, random() * size, r, r);
			}
			context.globalAlpha = 1;
		},
		{size: 512, key: 'gravel'},
	);

const useChecker = () =>
	useCanvasTexture(
		(context, size) => {
			const n = 8;
			for (let y = 0; y < 2; y++) {
				for (let x = 0; x < n * 6; x++) {
					context.fillStyle = (x + y) % 2 ? '#141414' : '#efefef';
					context.fillRect((x * size) / (n * 6), (y * size) / 2, size / (n * 6) + 1, size / 2 + 1);
				}
			}
		},
		{size: 512, key: 'checker'},
	);

const useCrowd = () =>
	useCanvasTexture(
		(context, size) => {
			const random = rand(31);
			context.fillStyle = '#26262a';
			context.fillRect(0, 0, size, size);
			const colours = ['#d8d4cc', '#c4161d', '#1f4ea3', '#f0b21b', '#2b2b2f', '#8b5a3c', '#e9e2d4', '#3b6e4a'];
			for (let i = 0; i < 7000; i++) {
				context.fillStyle = colours[Math.floor(random() * colours.length)];
				context.globalAlpha = 0.7;
				context.fillRect(random() * size, random() * size, 3 + random() * 3, 4 + random() * 5);
			}
			context.globalAlpha = 1;
		},
		{size: 512, repeat: [24, 1], key: 'crowd'},
	);

const useGarages = (lit: number) =>
	useCanvasTexture(
		(context, size) => {
			context.fillStyle = '#b9bcc0';
			context.fillRect(0, 0, size, size);
			const doors = 12;
			for (let i = 0; i < doors; i++) {
				const x = (i + 0.12) * (size / doors);
				const w = size / doors - (size / doors) * 0.24;
				context.fillStyle = lit > 0 ? '#e9e4d6' : '#2a2c30';
				context.fillRect(x, size * 0.35, w, size * 0.65);
				context.fillStyle = 'rgba(0,0,0,0.18)';
				for (let k = 0; k < 10; k++) {
					context.fillRect(x, size * 0.35 + k * size * 0.065, w, 2);
				}
			}
			context.fillStyle = '#1b1d21';
			context.fillRect(0, size * 0.12, size, size * 0.12);
		},
		{size: 1024, key: `garages${lit}`},
	);

// ---------------------------------------------------------------- pieces

const Trees: React.FC = () => {
	const crowns = useRef<InstancedMesh>(null);
	const trunks = useRef<InstancedMesh>(null);
	const places = useMemo(() => {
		const random = rand(404);
		const list: {x: number; z: number; scale: number}[] = [];
		while (list.length < 320) {
			const x = -170 + random() * 420;
			const z = -330 + random() * 620;
			const nearStands = x > 10 && x < 40 && z > -100 && z < 40;
			const nearPits = x < -16 && x > -42 && z > -120 && z < 40;
			if (nearStands || nearPits || distanceToTrack(x, z) < 26) {
				continue;
			}
			list.push({x, z, scale: 0.7 + random() * 0.8});
		}
		return list;
	}, []);
	useLayoutEffect(() => {
		const dummy = new Object3D();
		const random = rand(77);
		const tint = new Color();
		places.forEach(({x, z, scale}, i) => {
			// Each tree is three tiers of foliage, each a little smaller and turned.
			for (let tier = 0; tier < 3; tier++) {
				const size = scale * (1 - tier * 0.24);
				dummy.position.set(x + (random() - 0.5) * 0.4, scale * (3.2 + tier * 2.3), z + (random() - 0.5) * 0.4);
				dummy.scale.set(size * (0.9 + random() * 0.2), size * (0.85 + random() * 0.3), size * (0.9 + random() * 0.2));
				dummy.rotation.set((random() - 0.5) * 0.1, random() * 6, (random() - 0.5) * 0.1);
				dummy.updateMatrix();
				crowns.current?.setMatrixAt(i * 3 + tier, dummy.matrix);
				tint.setHSL(0.24 + random() * 0.08, 0.28 + random() * 0.15, 0.1 + random() * 0.07 + tier * 0.012);
				crowns.current?.setColorAt(i * 3 + tier, tint);
			}
			dummy.position.set(x, 1.2 * scale, z);
			dummy.scale.set(scale, scale, scale);
			dummy.rotation.set(0, 0, 0);
			dummy.updateMatrix();
			trunks.current?.setMatrixAt(i, dummy.matrix);
		});
		if (crowns.current) {
			crowns.current.instanceMatrix.needsUpdate = true;
			if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
		}
		if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
	}, [places]);
	return (
		<>
			<instancedMesh ref={crowns} args={[undefined, undefined, places.length * 3]} castShadow>
				<coneGeometry args={[2.4, 4.2, 9, 3]} />
				<meshStandardMaterial color="#ffffff" roughness={0.95} flatShading />
			</instancedMesh>
			<instancedMesh ref={trunks} args={[undefined, undefined, places.length]}>
				<cylinderGeometry args={[0.18, 0.25, 2.4, 6]} />
				<meshStandardMaterial color="#3a2e24" roughness={1} />
			</instancedMesh>
		</>
	);
};

/** Poles that hold the catch fences, every few metres along both walls. */
const Poles: React.FC = () => {
	const poles = useRef<InstancedMesh>(null);
	const places = useMemo(
		() => [...placeAlong(6, LEFT_WALL + 0.2), ...placeAlong(6, RIGHT_WALL - 0.2, wallShift)],
		[],
	);
	useLayoutEffect(() => {
		const dummy = new Object3D();
		places.forEach(({x, z}, i) => {
			dummy.position.set(x, 2.7, z);
			dummy.updateMatrix();
			poles.current?.setMatrixAt(i, dummy.matrix);
		});
		if (poles.current) poles.current.instanceMatrix.needsUpdate = true;
	}, [places]);
	return (
		<instancedMesh ref={poles} args={[undefined, undefined, places.length]}>
			<cylinderGeometry args={[0.045, 0.045, 3.3, 6]} />
			<meshStandardMaterial color="#7d8186" metalness={0.6} roughness={0.5} />
		</instancedMesh>
	);
};

/** Floodlight towers on the outside of the lap. `lamps` from 0 (off) to 1. */
export const TOWERS = placeAlong(70, -(HALF + 15), wallShift);

const Towers: React.FC<{lamps: number}> = ({lamps}) => (
	<>
		{TOWERS.map(({x, z, heading}, i) => (
			<group key={i} position={[x, 0, z]} rotation={[0, heading, 0]}>
				<mesh position={[0, 9, 0]} castShadow>
					<cylinderGeometry args={[0.18, 0.32, 18, 8]} />
					<meshStandardMaterial color="#8a8d92" metalness={0.5} roughness={0.5} />
				</mesh>
				<group position={[0, 18.2, 0]} rotation={[0, Math.PI / 2, 0]}>
					<mesh rotation={[0.45, 0, 0]}>
						<boxGeometry args={[3.2, 1.6, 0.35]} />
						<meshStandardMaterial color="#2b2d31" roughness={0.6} />
					</mesh>
					<mesh rotation={[0.45, 0, 0]} position={[0, -0.07, 0.19]}>
						<planeGeometry args={[3, 1.4]} />
						<meshStandardMaterial color="#fff4e2" emissive="#fff1d8" emissiveIntensity={0.05 + lamps * 22} />
					</mesh>
				</group>
			</group>
		))}
	</>
);

const Grandstand: React.FC<{lit: number}> = ({lit}) => {
	const crowd = useCrowd();
	return (
		<group position={[0, 0, -30]}>
			{Array.from({length: 10}, (_, k) => (
				<group key={k}>
					<mesh position={[17 + k * 1.8 + 0.9, ((k + 1) * 0.75) / 2, 0]} castShadow receiveShadow>
						<boxGeometry args={[1.8, (k + 1) * 0.75, 120]} />
						<meshStandardMaterial color="#8d9096" roughness={0.85} />
					</mesh>
					<mesh position={[17 + k * 1.8 + 0.9, (k + 1) * 0.75 + 0.35, 0]} rotation={[0, -Math.PI / 2, 0]}>
						<planeGeometry args={[120, 0.7]} />
						<meshStandardMaterial map={crowd} roughness={0.9} emissive="#ffffff" emissiveMap={crowd} emissiveIntensity={lit * 0.25} />
					</mesh>
				</group>
			))}
			{/* Roof on slender columns. */}
			<mesh position={[27, 11, 0]} castShadow>
				<boxGeometry args={[22, 0.4, 122]} />
				<meshStandardMaterial color="#d9dadc" roughness={0.6} />
			</mesh>
			<mesh position={[27, 10.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
				<planeGeometry args={[20, 118]} />
				<meshStandardMaterial color="#20232a" emissive="#fff3dc" emissiveIntensity={lit * 2.5} />
			</mesh>
			{Array.from({length: 7}, (_, k) => (
				<mesh key={k} position={[36.5, 5.5, -60 + k * 20]}>
					<cylinderGeometry args={[0.25, 0.25, 11, 8]} />
					<meshStandardMaterial color="#d9dadc" roughness={0.6} />
				</mesh>
			))}
		</group>
	);
};

const PitBuilding: React.FC<{lit: number}> = ({lit}) => {
	const garages = useGarages(lit);
	return (
		<group>
			<mesh position={[-30, 4, -40]} castShadow receiveShadow>
				<boxGeometry args={[14, 8, 140]} />
				<meshStandardMaterial color="#c9ccd0" roughness={0.8} />
			</mesh>
			<mesh position={[-22.98, 4, -40]} rotation={[0, Math.PI / 2, 0]}>
				<planeGeometry args={[140, 8]} />
				<meshStandardMaterial map={garages} roughness={0.7} emissive="#ffffff" emissiveMap={garages} emissiveIntensity={lit * 1.2} />
			</mesh>
			{/* The pit wall between the pit lane and the track. */}
			<mesh position={[-(HALF + 2.2), 0.55, -45]} castShadow receiveShadow>
				<boxGeometry args={[0.45, 1.1, 230]} />
				<meshStandardMaterial color="#d7d8da" roughness={0.8} />
			</mesh>
			<mesh position={[-15, 0.004, -45]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<planeGeometry args={[16, 230]} />
				<meshStandardMaterial color="#47484b" roughness={0.9} />
			</mesh>
		</group>
	);
};

/** The start gantry over the line. `lights` red lamps are lit, from 0 to 5. */
const Gantry: React.FC<{lights: number}> = ({lights}) => {
	const c = centreAt(0);
	return (
		<group position={[c.x, 0, c.z]} rotation={[0, c.heading, 0]}>
			{[1, -1].map((side) => (
				<mesh key={side} position={[side * (HALF + 1.3), 3.7, 0]} castShadow>
					<boxGeometry args={[0.55, 7.4, 0.55]} />
					<meshStandardMaterial color="#26282c" roughness={0.5} metalness={0.4} />
				</mesh>
			))}
			<mesh position={[0, 7.0, 0]} castShadow>
				<boxGeometry args={[TRACK.width + 3.2, 0.9, 0.7]} />
				<meshStandardMaterial color="#26282c" roughness={0.5} metalness={0.4} />
			</mesh>
			{Array.from({length: 5}, (_, i) => {
				const on = lights >= i + 1 ? 1 : 0;
				return (
					<group key={i} position={[(i - 2) * 1.5, 6.25, -0.45]}>
						<mesh>
							<boxGeometry args={[0.8, 1.3, 0.25]} />
							<meshStandardMaterial color="#0d0e10" roughness={0.4} />
						</mesh>
						{[0.28, -0.28].map((y) => (
							<mesh key={y} position={[0, y, -0.13]} rotation={[0, Math.PI, 0]}>
								<circleGeometry args={[0.2, 24]} />
								<meshStandardMaterial color={on ? '#ff2a1a' : '#2a0606'} emissive="#ff1a0a" emissiveIntensity={on * 40} />
							</mesh>
						))}
					</group>
				);
			})}
		</group>
	);
};

/** White grid boxes behind the line. */
export const GRID_SLOTS = [1, 2, 3, 4, 5, 6].map((k) => ({s: -8 * k, side: k % 2 ? 2.8 : -2.8}));

const GridMarks: React.FC = () => (
	<>
		{GRID_SLOTS.map(({s, side}, i) => {
			const c = centreAt(s);
			const x = c.x + Math.cos(c.heading) * side;
			const z = c.z - Math.sin(c.heading) * side;
			return (
				<group key={i} position={[x, 0.007, z]} rotation={[0, c.heading, 0]}>
					<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2.6]}>
						<planeGeometry args={[2.4, 0.16]} />
						<meshStandardMaterial color="#e8e8e6" roughness={0.6} />
					</mesh>
					{[1, -1].map((edge) => (
						<mesh key={edge} rotation={[-Math.PI / 2, 0, 0]} position={[edge * 1.14, 0, 1.95]}>
							<planeGeometry args={[0.14, 1.3]} />
							<meshStandardMaterial color="#e8e8e6" roughness={0.6} />
						</mesh>
					))}
				</group>
			);
		})}
	</>
);

// ---------------------------------------------------------------- sky

export type SkyLook = {
	top: string;
	horizon: string;
	ground: string;
	/** Direction towards the sun or moon. */
	sun: [number, number, number];
	sunColour: string;
	/** Brightness of the sun's disc and glow. */
	sunPower: number;
	hills: string;
	stars?: number;
};

export const SKIES: Record<'dusk' | 'day' | 'night', SkyLook> = {
	dusk: {top: '#1d2747', horizon: '#e0855a', ground: '#1b1a1c', sun: [-0.8, 0.06, -0.6], sunColour: '#ffb070', sunPower: 6, hills: '#2a2430'},
	day: {top: '#4f7fbf', horizon: '#d8dfe4', ground: '#2c3024', sun: [-0.5, 0.55, -0.4], sunColour: '#fff3e0', sunPower: 4, hills: '#55656a'},
	night: {top: '#03040a', horizon: '#141a2a', ground: '#050506', sun: [0.4, 0.35, 0.7], sunColour: '#cfdcff', sunPower: 1.4, hills: '#07080c', stars: 1},
};

/** A sky at infinity, with distant hills, the sun's glow and, at night, stars. */
export const Sky: React.FC<{look: SkyLook; power?: number}> = ({look, power = 1}) => {
	const material = useMemo(
		() =>
			new ShaderMaterial({
				side: BackSide,
				depthWrite: false,
				depthTest: false,
				fog: false,
				uniforms: {
					top: {value: new Color()},
					horizon: {value: new Color()},
					ground: {value: new Color()},
					hills: {value: new Color()},
					sun: {value: new Vector3()},
					sunColour: {value: new Color()},
					sunPower: {value: 1},
					stars: {value: 0},
					power: {value: 1},
				},
				vertexShader: /* glsl */ `
					varying vec3 vDirection;
					void main() {
						vDirection = position;
						vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
						gl_Position = p.xyww;
					}
				`,
				fragmentShader: /* glsl */ `
					uniform vec3 top;
					uniform vec3 horizon;
					uniform vec3 ground;
					uniform vec3 hills;
					uniform vec3 sun;
					uniform vec3 sunColour;
					uniform float sunPower;
					uniform float stars;
					uniform float power;
					varying vec3 vDirection;
					float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
					void main() {
						vec3 d = normalize(vDirection);
						float up = d.y;
						vec3 colour = mix(horizon, top, pow(smoothstep(0.0, 0.6, up), 0.7));
						colour = mix(colour, ground, smoothstep(0.0, -0.04, up));
						// Distant hills along the horizon.
						float az = atan(d.z, d.x);
						float ridge = 0.018 + 0.012 * sin(az * 3.0 + 1.3) + 0.008 * sin(az * 7.0 + 0.4) + 0.004 * sin(az * 19.0);
						float hill = smoothstep(ridge + 0.002, ridge - 0.002, up) * smoothstep(-0.03, 0.0, up);
						colour = mix(colour, hills, hill);
						float toward = max(dot(d, normalize(sun)), 0.0);
						colour += sunColour * (pow(toward, 900.0) * 30.0 + pow(toward, 12.0) * 0.35 + pow(toward, 3.0) * 0.12) * sunPower * (1.0 - hill);
						if (stars > 0.0) {
							vec2 cell = floor(vec2(az * 260.0, up * 260.0));
							float star = step(0.9975, hash(cell)) * smoothstep(0.05, 0.3, up);
							colour += vec3(star) * stars * 1.6;
						}
						gl_FragColor = vec4(colour * power, 1.0);
					}
				`,
			}),
		[],
	);
	useLayoutEffect(() => {
		material.uniforms.top.value.set(look.top);
		material.uniforms.horizon.value.set(look.horizon);
		material.uniforms.ground.value.set(look.ground);
		material.uniforms.hills.value.set(look.hills);
		material.uniforms.sun.value.set(...look.sun);
		material.uniforms.sunColour.value.set(look.sunColour);
		material.uniforms.sunPower.value = look.sunPower;
		material.uniforms.stars.value = look.stars ?? 0;
		material.uniforms.power.value = power;
	});
	return (
		<mesh renderOrder={-100} material={material} frustumCulled={false}>
			<sphereGeometry args={[100, 48, 24]} />
		</mesh>
	);
};

// ---------------------------------------------------------------- the circuit

export type TrackProps = {
	/** 0 dry to 1 soaking: darker, glossier asphalt with puddles that mirror the lights. */
	wet?: number;
	/** 0 to 1: floodlights, grandstand roof and pit garages. */
	lamps?: number;
	/** Red lamps lit on the start gantry, 0 to 5. */
	startLights?: number;
};

export const Track: React.FC<TrackProps> = ({wet = 0, lamps = 0, startLights = 0}) => {
	const geometry = trackGeometry();
	const asphalt = useAsphalt(wet);
	const rubber = useRubber();
	const kerb = useKerb();
	const boards = useBoards();
	const wire = useWire();
	const grass = useGrass();
	const gravel = useGravel();
	const checker = useChecker();
	const start = centreAt(0);
	return (
		<group>
			<mesh geometry={geometry.asphalt} receiveShadow>
				<meshPhysicalMaterial
					map={asphalt}
					color={wet > 0 ? '#8a8a8a' : '#ffffff'}
					roughness={0.9 - wet * 0.72}
					roughnessMap={asphalt}
					specularIntensity={0.3 + wet * 0.7}
					clearcoat={wet}
					clearcoatRoughness={0.08}
					side={DoubleSide}
				/>
			</mesh>
			<mesh geometry={geometry.rubber}>
				<meshStandardMaterial
					color="#0a0a0b"
					map={rubber}
					vertexColors
					transparent
					depthWrite={false}
					roughness={0.6 - wet * 0.4}
					side={DoubleSide}
					polygonOffset
					polygonOffsetFactor={-1}
				/>
			</mesh>
			{geometry.lines.map((line, i) => (
				<mesh key={i} geometry={line} receiveShadow>
					<meshStandardMaterial color="#e6e6e3" roughness={0.6 - wet * 0.4} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} />
				</mesh>
			))}
			{geometry.kerbs.map((piece, i) => (
				<mesh key={i} geometry={piece} receiveShadow castShadow>
					<meshStandardMaterial map={kerb} roughness={0.55 - wet * 0.35} side={DoubleSide} polygonOffset polygonOffsetFactor={-3} />
				</mesh>
			))}
			<mesh geometry={geometry.gravel} receiveShadow>
				<meshStandardMaterial map={gravel} roughness={0.95} side={DoubleSide} polygonOffset polygonOffsetFactor={-1} />
			</mesh>
			{geometry.walls.map((wall, i) => (
				<mesh key={i} geometry={wall} receiveShadow castShadow>
					<meshStandardMaterial map={boards} roughness={0.5} side={DoubleSide} emissive="#ffffff" emissiveMap={boards} emissiveIntensity={lamps * 0.12} />
				</mesh>
			))}
			{geometry.tops.map((top, i) => (
				<mesh key={i} geometry={top} castShadow>
					<meshStandardMaterial color="#cfd1d4" roughness={0.7} side={DoubleSide} />
				</mesh>
			))}
			{geometry.fences.map((fence, i) => (
				<mesh key={i} geometry={fence}>
					<meshStandardMaterial map={wire} alphaTest={0.5} metalness={0.5} roughness={0.5} side={DoubleSide} />
				</mesh>
			))}
			{/* Start and finish line. */}
			<mesh position={[start.x, 0.008, start.z]} rotation={[-Math.PI / 2, 0, start.heading]}>
				<planeGeometry args={[TRACK.width, 0.9]} />
				<meshStandardMaterial map={checker} roughness={0.6} polygonOffset polygonOffsetFactor={-4} />
			</mesh>
			<GridMarks />
			<Gantry lights={startLights} />
			<Grandstand lit={lamps} />
			<PitBuilding lit={lamps} />
			<Towers lamps={lamps} />
			<Poles />
			<Trees />
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[40, -0.03, -15]} receiveShadow>
				<planeGeometry args={[1200, 1200]} />
				<meshStandardMaterial map={grass} roughness={1} />
			</mesh>
		</group>
	);
};
