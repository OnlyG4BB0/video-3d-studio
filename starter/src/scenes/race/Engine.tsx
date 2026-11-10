import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {
	AdditiveBlending,
	BoxGeometry,
	BufferGeometry,
	CanvasTexture,
	CatmullRomCurve3,
	CircleGeometry,
	Color,
	Curve,
	CylinderGeometry,
	DoubleSide,
	ExtrudeGeometry,
	Float32BufferAttribute,
	Group,
	InstancedMesh,
	Mesh,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	MeshPhysicalMaterialParameters,
	Object3D,
	Plane,
	PointLight,
	ShaderMaterial,
	Shape,
	SRGBColorSpace,
	TubeGeometry,
	Vector3,
	Vector4,
} from 'three';
import {useMotion} from '../../kit';

// A water-cooled 4.0-litre flat-six with the dimensions of the 911 GT3 Cup's
// engine: bore 102 mm, stroke 81.5 mm, firing order 1-6-2-4-3-5. Metres, with the
// crank along z, the banks along x (cylinders 1-3 at +x, 4-6 at -x) and y up.
// The housings can be cut away to show the moving parts.

const R = 0.04075;
const ROD = 0.135;
const DECK = 0.205;
const BORE = 0.051;

/** Each cylinder: its bank, place along the crank, crank pin angle and firing angle, in degrees. */
export const CYLINDERS = [
	{n: 1, bank: 1, z: -0.118, pin: 0, fire: 0},
	{n: 2, bank: 1, z: 0, pin: 120, fire: 240},
	{n: 3, bank: 1, z: 0.118, pin: 240, fire: 480},
	{n: 4, bank: -1, z: -0.084, pin: 180, fire: 360},
	{n: 5, bank: -1, z: 0.034, pin: 300, fire: 600},
	{n: 6, bank: -1, z: 0.152, pin: 60, fire: 120},
] as const;

const DEG = Math.PI / 180;
const wrap720 = (deg: number) => ((deg % 720) + 720) % 720;

/** Distance from the crank axis to the piston pin, for a crank angle measured from the bore's axis. */
const pistonReach = (phi: number) => R * Math.cos(phi) + Math.sqrt(ROD * ROD - R * R * Math.sin(phi) ** 2);

/** How brightly a cylinder burns at a crank angle in degrees, 0 to 1. */
export const flameAt = (crankDeg: number, fire: number) => {
	const since = wrap720(crankDeg - fire + 8) - 8;
	if (since < -6 || since > 140) return 0;
	const rise = Math.min(1, Math.max(0, (since + 6) / 8));
	return rise * Math.exp(-Math.max(0, since) / 75);
};

const VALVE_LIFT = 0.0115;
const INTAKE = {open: 345, close: 585};
const EXHAUST = {open: 130, close: 375};
const liftAt = (crankDeg: number, fire: number, window: {open: number; close: number}) => {
	const rel = wrap720(crankDeg - fire - window.open);
	const length = window.close - window.open;
	if (rel > length) return 0;
	return ((1 - Math.cos((2 * Math.PI * rel) / length)) / 2) * VALVE_LIFT;
};

// ---------------------------------------------------------------- materials

export type CutUniforms = {plane: {value: Vector4}; colour: {value: Color}};

/** A physical material that is cut away above a plane, with flat red faces where it is cut. */
const cutMaterial = (params: MeshPhysicalMaterialParameters, cut: CutUniforms, cap = true) => {
	const material = new MeshPhysicalMaterial({...params, side: DoubleSide});
	material.onBeforeCompile = (shader) => {
		shader.uniforms.cutPlane = cut.plane;
		shader.uniforms.cutColour = cut.colour;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;\nuniform vec4 cutPlane;\nuniform vec3 cutColour;')
			.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (dot(vec4(vCutWorld, 1.0), cutPlane) < 0.0) discard;')
			.replace(
				'#include <dithering_fragment>',
				cap
					? '#include <dithering_fragment>\nif (!gl_FrontFacing) { float hatch = step(0.5, fract((vCutWorld.x + vCutWorld.y + vCutWorld.z) * 160.0)); gl_FragColor = vec4(cutColour * (0.78 + 0.22 * hatch), 1.0); }'
					: '#include <dithering_fragment>',
			);
	};
	material.customProgramCacheKey = () => `cut${cap ? 1 : 0}`;
	return material;
};

const heatTexture = () => {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 4;
	const context = canvas.getContext('2d')!;
	const gradient = context.createLinearGradient(0, 0, 256, 0);
	gradient.addColorStop(0, '#ffffff');
	gradient.addColorStop(0.25, '#b0b0b0');
	gradient.addColorStop(0.6, '#303030');
	gradient.addColorStop(1, '#000000');
	context.fillStyle = gradient;
	context.fillRect(0, 0, 256, 4);
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	return texture;
};

const useMaterials = (cut: CutUniforms) =>
	useMemo(() => {
		const casting = {color: '#9fa4aa', metalness: 0.65, roughness: 0.48, clearcoat: 0.1};
		return {
			casting: cutMaterial(casting, cut),
			head: cutMaterial({...casting, color: '#8f949a'}, cut),
			bore: cutMaterial({color: '#c9ccd0', metalness: 1, roughness: 0.16}, cut, false),
			carbon: cutMaterial({color: '#141518', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08}, cut),
			forged: new MeshPhysicalMaterial({color: '#8d939a', metalness: 1, roughness: 0.27}),
			polished: new MeshPhysicalMaterial({color: '#e2e4e7', metalness: 0.8, roughness: 0.26}),
			titanium: new MeshPhysicalMaterial({color: '#a3a39f', metalness: 1, roughness: 0.24}),
			valve: new MeshPhysicalMaterial({color: '#b9bdc2', metalness: 1, roughness: 0.22}),
			spring: new MeshPhysicalMaterial({color: '#4a4d52', metalness: 0.9, roughness: 0.35}),
			ring: new MeshPhysicalMaterial({color: '#2a2b2e', metalness: 0.9, roughness: 0.4}),
			bronze: new MeshPhysicalMaterial({color: '#b88a4a', metalness: 1, roughness: 0.28}),
			black: new MeshPhysicalMaterial({color: '#141518', roughness: 0.55}),
			rubber: cutMaterial({color: '#18191b', roughness: 0.85}, cut, false),
			chain: new MeshPhysicalMaterial({color: '#5e6168', metalness: 1, roughness: 0.38}),
			relief: new MeshPhysicalMaterial({color: '#8d9197', metalness: 1, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2}),
			connector: new MeshPhysicalMaterial({color: '#d9641e', roughness: 0.5}),
			ceramic: new MeshPhysicalMaterial({color: '#efece6', roughness: 0.25, clearcoat: 0.6}),
			exhaust: new MeshPhysicalMaterial({
				color: '#a8977c',
				metalness: 1,
				roughness: 0.32,
				emissive: new Color('#ff4a12'),
				emissiveMap: heatTexture(),
				emissiveIntensity: 0,
			}),
			flame: new ShaderMaterial({
				transparent: true,
				blending: AdditiveBlending,
				depthWrite: false,
				side: DoubleSide,
				uniforms: {strength: {value: 0}, phase: {value: 0}},
				vertexShader: /* glsl */ `
					varying vec2 vUv;
					varying vec3 vLocal;
					varying vec3 vNormal;
					varying vec3 vView;
					void main() {
						vUv = uv;
						vLocal = position;
						vec4 world = modelMatrix * vec4(position, 1.0);
						vNormal = normalize(mat3(modelMatrix) * normal);
						vView = normalize(cameraPosition - world.xyz);
						gl_Position = projectionMatrix * viewMatrix * world;
					}
				`,
				fragmentShader: /* glsl */ `
					uniform float strength;
					uniform float phase;
					varying vec2 vUv;
					varying vec3 vLocal;
					varying vec3 vNormal;
					varying vec3 vView;
					float hash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 51.3))) * 43758.5453); }
					float noise(vec3 p) {
						vec3 i = floor(p);
						vec3 f = fract(p);
						f = f * f * (3.0 - 2.0 * f);
						float a = mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y);
						float b = mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y);
						return mix(a, b, f.z);
					}
					void main() {
						// Glowing gas: bright in the middle of the bore, turbulent, hottest at the plug.
						float facing = abs(dot(normalize(vNormal), normalize(vView)));
						float turbulence = noise(vLocal * vec3(40.0, 90.0, 90.0) + phase) * 0.6 + noise(vLocal * vec3(120.0, 260.0, 260.0) - phase * 2.0) * 0.4;
						float hot = smoothstep(0.0, 1.0, vUv.y);
						vec3 colour = mix(vec3(1.0, 0.22, 0.04), vec3(1.0, 0.72, 0.38), hot * turbulence);
						float glow = (0.25 + 0.75 * facing) * (0.45 + 0.9 * turbulence);
						gl_FragColor = vec4(colour * glow * strength * 3.0, 1.0);
					}
				`,
			}),
			spark: new MeshBasicMaterial({color: new Color(12, 14, 20), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false}),
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

// ---------------------------------------------------------------- geometry

class Helix extends Curve<Vector3> {
	constructor(
		private radius: number,
		private length: number,
		private turns: number,
	) {
		super();
	}
	getPoint(t: number, target = new Vector3()) {
		const a = t * this.turns * Math.PI * 2;
		return target.set(t * this.length, Math.cos(a) * this.radius, Math.sin(a) * this.radius);
	}
}

/** A crank web: a lobe around the pin and a heavy counterweight opposite, pin along +x. */
const webShape = () => {
	const shape = new Shape();
	const steps = 40;
	// Counterweight arc on the far side.
	for (let i = 0; i <= steps; i++) {
		const a = Math.PI - 1.15 + (2.3 * i) / steps;
		const x = Math.cos(a) * 0.074;
		const y = Math.sin(a) * 0.074;
		if (i === 0) shape.moveTo(x, y);
		else shape.lineTo(x, y);
	}
	// Round end around the pin.
	for (let i = 0; i <= steps; i++) {
		const a = -Math.PI / 2 + (Math.PI * i) / steps;
		shape.lineTo(R + Math.cos(a) * 0.032, Math.sin(a) * 0.032);
	}
	shape.closePath();
	return shape;
};

/** A connecting rod from its big end at the origin to its small end at +x. */
const rodShape = () => {
	const shape = new Shape();
	shape.absarc(0, 0, 0.034, Math.PI * 0.62, Math.PI * 1.38, false);
	shape.lineTo(ROD - 0.012, -0.012);
	shape.absarc(ROD, 0, 0.017, -Math.PI * 0.7, Math.PI * 0.7, false);
	shape.lineTo(ROD - 0.012, 0.012);
	shape.closePath();
	const big = new Shape().absarc(0, 0, 0.0245, 0, Math.PI * 2, true);
	const small = new Shape().absarc(ROD, 0, 0.0105, 0, Math.PI * 2, true);
	shape.holes.push(big, small);
	return shape;
};

/** A cam lobe: base circle with a nose along +x. */
const lobeShape = () => {
	const shape = new Shape();
	const steps = 90;
	for (let i = 0; i <= steps; i++) {
		const a = (i / steps) * Math.PI * 2 - Math.PI;
		const nose = Math.abs(a) < Math.PI / 3 ? Math.cos(a * 1.5) ** 2 : 0;
		const r = 0.0165 + 0.0115 * nose;
		if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
		else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
	}
	return shape;
};

/** A gear outline for the flywheel's ring gear. */
const gearShape = (radius: number, teeth: number, depth: number) => {
	const shape = new Shape();
	for (let i = 0; i <= teeth * 4; i++) {
		const a = (i / (teeth * 4)) * Math.PI * 2;
		const r = i % 4 < 2 ? radius : radius - depth;
		if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
		else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
	}
	shape.holes.push(new Shape().absarc(0, 0, radius * 0.45, 0, Math.PI * 2, true));
	return shape;
};

const along = (geometry: BufferGeometry) => geometry.rotateZ(-Math.PI / 2); // y axis to +x

let shared: ReturnType<typeof buildGeometry> | null = null;
const buildGeometry = () => {
	const extrude = (shape: Shape, depth: number, bevel = 0.0015) => {
		const g = new ExtrudeGeometry(shape, {depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 24});
		g.translate(0, 0, -depth / 2);
		return g;
	};
	return {
		web: extrude(webShape(), 0.012),
		rod: extrude(rodShape(), 0.019, 0.002),
		lobe: extrude(lobeShape(), 0.012, 0.001),
		ringGear: extrude(gearShape(0.142, 96, 0.006), 0.022, 0.001),
		// The piston along +x: crown outward, skirt toward the crank.
		piston: along(new CylinderGeometry(0.0505, 0.0505, 0.066, 48).translate(0, -0.002, 0)),
		crown: along(new CylinderGeometry(0.03, 0.0498, 0.004, 48).translate(0, 0.033, 0)),
		pistonRing: along(new CylinderGeometry(0.0508, 0.0508, 0.0016, 48, 1, true)),
		journal: new CylinderGeometry(0.031, 0.031, 0.42, 40).rotateX(Math.PI / 2),
		pinGeometry: new CylinderGeometry(0.024, 0.024, 0.024, 32).rotateX(Math.PI / 2),
		wristPin: new CylinderGeometry(0.0105, 0.0105, 0.07, 24).rotateX(Math.PI / 2),
		camShaft: new CylinderGeometry(0.012, 0.012, 0.44, 24).rotateX(Math.PI / 2),
		stem: along(new CylinderGeometry(0.0035, 0.0035, 0.1, 12).translate(0, 0.05, 0)),
		valveHead: along(new CylinderGeometry(0.004, 0.0185, 0.012, 32).translate(0, 0.006, 0)),
		retainer: along(new CylinderGeometry(0.0115, 0.0085, 0.004, 24).translate(0, 0.098, 0)),
		// Bucket tappet on the valve tip, pushed by the cam.
		bucket: along(new CylinderGeometry(0.0148, 0.0148, 0.014, 28).translate(0, 0.1, 0)),
		sprocket: extrude(gearShape(0.041, 30, 0.004), 0.008, 0.0006),
		crankSprocket: extrude(gearShape(0.03, 22, 0.004), 0.008, 0.0006),
		bolt: new CylinderGeometry(0.0055, 0.0055, 0.006, 6),
		rodBolt: along(new CylinderGeometry(0.0042, 0.0042, 0.046, 12)),
		relief: new CircleGeometry(0.0155, 24).rotateY(Math.PI / 2),
		shell: new CylinderGeometry(0.0337, 0.0337, 0.024, 40, 1, true).rotateX(Math.PI / 2),
		clutch: new CylinderGeometry(0.122, 0.122, 0.022, 48).rotateX(Math.PI / 2),
		bellhousing: new CylinderGeometry(0.115, 0.168, 0.17, 48, 1, true).rotateX(Math.PI / 2),
		coil: new BoxGeometry(0.062, 0.03, 0.027),
		spring: new TubeGeometry(new Helix(0.0105, 0.035, 7), 220, 0.0016, 8, false),
		liner: along(new CylinderGeometry(0.0575, 0.0575, 0.12, 48, 1, true).translate(0, 0.145, 0)),
		bore: along(new CylinderGeometry(BORE + 0.0004, BORE + 0.0004, 0.12, 48, 1, true).translate(0, 0.145, 0)),
		flame: along(new CylinderGeometry(0.049, 0.049, 1, 32, 1, true).translate(0, 0.5, 0)),
		flameCap: along(new CylinderGeometry(0.049, 0.049, 0.002, 32)),
		plug: along(new CylinderGeometry(0.007, 0.007, 0.07, 16).translate(0, 0.035, 0)),
		plugHex: along(new CylinderGeometry(0.011, 0.011, 0.014, 6).translate(0, 0.075, 0)),
		pulley: new CylinderGeometry(0.075, 0.075, 0.03, 48).rotateX(Math.PI / 2),
		flywheel: new CylinderGeometry(0.13, 0.13, 0.018, 64).rotateX(Math.PI / 2),
	};
};
const engineGeometry = () => {
	shared ??= buildGeometry();
	return shared;
};

/** Exhaust pipes from the ports of one bank (built for +x) into a collector at the back. */
const headerCurves = () =>
	[-0.118, 0, 0.118].map(
		(z, i) =>
			new CatmullRomCurve3([
				new Vector3(0.27, -0.07, z),
				new Vector3(0.29, -0.13, z),
				new Vector3(0.27, -0.2, z - 0.03),
				new Vector3(0.22, -0.24, -0.16 - i * 0.012),
				new Vector3(0.16, -0.25, -0.26),
				new Vector3(0.1, -0.25, -0.33),
			]),
	);

/** Intake runners from the plenum on top down to the ports of one bank (built for +x). */
const runnerCurves = () =>
	[-0.118, 0, 0.118].map(
		(z) =>
			new CatmullRomCurve3([
				new Vector3(0.06, 0.2, z),
				new Vector3(0.19, 0.2, z),
				new Vector3(0.27, 0.15, z),
				new Vector3(0.285, 0.075, z),
			]),
	);

// ---------------------------------------------------------------- the engine

export type EngineProps = {
	/** Crank angle in radians at a moment, in shot seconds. */
	crank: (time: number) => number;
	/** Height above the crank, in metres, above which the housings are cut away. 1 leaves it whole. */
	cut?: number;
	/** 0 to 1: how hot the exhaust glows. */
	heat?: number;
	/** 0 to 1: brightness of the combustion. */
	fire?: number;
	/** Small lights at each cylinder that flash with the combustion. */
	flashLights?: boolean;
};

/** Rows of hex bolts, all facing the same way. */
const Bolts: React.FC<{places: [number, number, number][]; facing: 'x' | 'y' | 'z'; material: MeshPhysicalMaterial}> = ({
	places,
	facing,
	material,
}) => {
	const mesh = useRef<InstancedMesh>(null);
	useLayoutEffect(() => {
		const dummy = new Object3D();
		places.forEach((place, i) => {
			dummy.position.set(...place);
			dummy.rotation.set(facing === 'z' ? Math.PI / 2 : 0, 0, facing === 'x' ? -Math.PI / 2 : 0);
			dummy.updateMatrix();
			mesh.current?.setMatrixAt(i, dummy.matrix);
		});
		if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
	}, [places, facing]);
	return <instancedMesh ref={mesh} args={[engineGeometry().bolt, material, places.length]} />;
};

const Bank: React.FC<{
	bank: 1 | -1;
	cylinders: (typeof CYLINDERS)[number][];
	m: ReturnType<typeof useMaterials>;
	register: (bank: number, part: Group | null, key: string) => void;
}> = ({bank, cylinders, m, register}) => {
	const g = engineGeometry();
	const zs = cylinders.map((c) => c.z);
	const zMin = Math.min(...zs) - 0.066;
	const zMax = Math.max(...zs) + 0.066;
	const length = zMax - zMin;
	const middle = (zMin + zMax) / 2;
	const headers = useMemo(() => headerCurves().map((curve) => new TubeGeometry(curve, 80, 0.019, 16, false)), []);
	const runners = useMemo(() => runnerCurves().map((curve) => new TubeGeometry(curve, 50, 0.022, 16, false)), []);
	const chain = useMemo(() => {
		const intake = new Vector3(DECK + 0.004, 0.018, 0).addScaledVector(new Vector3(Math.cos(20 * DEG), Math.sin(20 * DEG), 0), 0.1238);
		const exhaust = new Vector3(DECK + 0.004, -0.018, 0).addScaledVector(new Vector3(Math.cos(20 * DEG), -Math.sin(20 * DEG), 0), 0.1238);
		const loop = new CatmullRomCurve3(
			[
				new Vector3(0.0, 0.034, 0),
				new Vector3(intake.x - 0.03, intake.y + 0.03, 0),
				new Vector3(intake.x + 0.03, intake.y + 0.03, 0),
				new Vector3(intake.x + 0.045, intake.y - 0.01, 0),
				new Vector3(exhaust.x + 0.045, exhaust.y + 0.01, 0),
				new Vector3(exhaust.x + 0.03, exhaust.y - 0.03, 0),
				new Vector3(exhaust.x - 0.03, exhaust.y - 0.032, 0),
				new Vector3(0.0, -0.034, 0),
				new Vector3(-0.034, 0, 0),
			],
			true,
			'centripetal',
		);
		return new TubeGeometry(loop, 160, 0.0042, 6, true);
	}, []);
	const shift = cylinders[0].z - -0.118;
	const valves = [
		{kind: 'intake', dir: new Vector3(Math.cos(20 * DEG), Math.sin(20 * DEG), 0)},
		{kind: 'exhaust', dir: new Vector3(Math.cos(20 * DEG), -Math.sin(20 * DEG), 0)},
	] as const;
	return (
		<group scale={[bank, 1, 1]}>
			{/* Cylinder block and liners. */}
			<mesh material={m.casting} position={[0.145, 0, middle]}>
				<boxGeometry args={[0.12, 0.15, length]} />
			</mesh>
			{cylinders.map((c) => (
				<group key={c.n} position={[0, 0, c.z]}>
					<mesh geometry={g.liner} material={m.casting} />
					<mesh geometry={g.bore} material={m.bore} />
				</group>
			))}
			{/* Cylinder head and cam cover. */}
			<mesh material={m.head} position={[0.262, 0, middle]}>
				<boxGeometry args={[0.114, 0.17, length]} />
			</mesh>
			<mesh material={m.head} position={[0.334, 0, middle]}>
				<boxGeometry args={[0.03, 0.18, length - 0.01]} />
			</mesh>
			{/* Two camshafts, turning at half the crank's speed. */}
			{valves.map(({kind, dir}) => {
				const seatY = kind === 'intake' ? 0.018 : -0.018;
				const centre = new Vector3(DECK + 0.004, seatY, 0).addScaledVector(dir, 0.1 + 0.0238);
				const base = Math.atan2(-dir.y, -dir.x);
				const caps = [zMin + 0.018, ...cylinders.slice(0, -1).map((c) => c.z + 0.059), zMax - 0.018];
				return (
					<group key={kind} position={[centre.x, centre.y, 0]}>
						{/* Bearing caps that hold the camshaft in the head. */}
						{caps.map((z) => (
							<mesh key={z} material={m.head} position={[0, 0, z]}>
								<boxGeometry args={[0.04, 0.034, 0.02]} />
							</mesh>
						))}
						<group ref={(part) => register(bank, part, `cam-${kind}`)}>
							<mesh geometry={g.camShaft} material={m.forged} position={[0, 0, middle]} />
							<mesh geometry={g.sprocket} material={m.chain} position={[0, 0, zMin - 0.014]} />
							{cylinders.flatMap((c) =>
								[-0.021, 0.021].map((dz) => {
									const peak = (c.fire + (kind === 'intake' ? (INTAKE.open + INTAKE.close) / 2 : (EXHAUST.open + EXHAUST.close) / 2)) * DEG;
									return <mesh key={`${c.n}${dz}`} geometry={g.lobe} material={m.polished} position={[0, 0, c.z + dz]} rotation={[0, 0, base - peak / 2]} />;
								}),
							)}
						</group>
					</group>
				);
			})}
			{/* Valves, springs and retainers: four per cylinder. */}
			{cylinders.flatMap((c) =>
				valves.flatMap(({kind, dir}) =>
					[-0.021, 0.021].map((dz) => {
						const seatY = kind === 'intake' ? 0.018 : -0.018;
						const angle = Math.atan2(dir.y, dir.x);
						return (
							<group key={`${c.n}${kind}${dz}`} position={[DECK + 0.004, seatY, c.z + dz]} rotation={[0, 0, angle]}>
								<group ref={(part) => register(bank, part, `valve-${c.n}-${kind}-${dz}`)}>
									<mesh geometry={g.stem} material={m.valve} />
									<mesh geometry={g.valveHead} material={m.valve} />
									<mesh geometry={g.retainer} material={m.forged} />
									<mesh geometry={g.bucket} material={m.polished} />
								</group>
								<group ref={(part) => register(bank, part, `spring-${c.n}-${kind}-${dz}`)} position={[0.06, 0, 0]}>
									<mesh geometry={g.spring} material={m.spring} />
								</group>
							</group>
						);
					}),
				),
			)}
			{/* Spark plugs between the valves, each under its ignition coil. */}
			{cylinders.map((c) => (
				<group key={c.n} position={[DECK + 0.002, 0, c.z]}>
					<mesh geometry={g.plug} material={m.ceramic} />
					<mesh geometry={g.plugHex} material={m.forged} />
					<mesh geometry={g.coil} material={m.black} position={[0.142, 0, 0]} />
					<mesh material={m.connector} position={[0.176, 0.008, 0]}>
						<boxGeometry args={[0.012, 0.016, 0.02]} />
					</mesh>
				</group>
			))}
			{/* Wiring loom along the head, with a lead to each coil. */}
			<mesh material={m.black} position={[0.392, -0.012, middle]} rotation={[Math.PI / 2, 0, 0]}>
				<cylinderGeometry args={[0.0055, 0.0055, length, 10]} />
			</mesh>
			{cylinders.map((c) => (
				<mesh key={c.n} material={m.black} position={[0.388, -0.004, c.z]} rotation={[0, 0, 0.6]}>
					<cylinderGeometry args={[0.003, 0.003, 0.026, 8]} />
				</mesh>
			))}
			{/* Timing chain from the crank up round both camshaft sprockets. */}
			<mesh geometry={chain} material={m.chain} position={[0, 0, zMin - 0.014]} />
			{/* Bolts round the cam cover and along the head. */}
			<Bolts
				facing="x"
				material={m.forged}
				places={[
										...Array.from({length: 7}, (_, i): [number, number, number] => [0.351, -0.072, zMin + 0.02 + ((length - 0.04) * i) / 6]),
					...cylinders.flatMap((c): [number, number, number][] => [
						[0.207, -0.064, c.z - 0.05],
						[0.207, -0.064, c.z + 0.05],
					]),
				]}
			/>
			{/* Exhaust headers, glowing when hot. */}
			{headers.map((geometry, i) => (
				<mesh key={i} geometry={geometry} material={m.exhaust} position={[0, 0, shift]} />
			))}
			{/* Intake runners to the plenum. */}
			{runners.map((geometry, i) => (
				<mesh key={i} geometry={geometry} material={m.carbon} position={[0, 0, shift]} />
			))}
		</group>
	);
};

export const Engine: React.FC<EngineProps> = ({crank, cut = 0.004, heat = 0, fire = 1, flashLights = false}) => {
	const g = engineGeometry();
	const cutUniforms = useMemo<CutUniforms>(() => ({plane: {value: new Vector4(0, -1, 0, 10)}, colour: {value: new Color('#7c2416')}}), []);
	const m = useMaterials(cutUniforms);
	const crankGroup = useRef<Group>(null);
	const rods = useRef<(Group | null)[]>([]);
	const pistons = useRef<(Group | null)[]>([]);
	const flames = useRef<(Mesh | null)[]>([]);
	const sparks = useRef<(Mesh | null)[]>([]);
	const lights = useRef<(PointLight | null)[]>([]);
	const parts = useRef(new Map<string, Group>());
	const cutLevel = useRef(cut);
	cutLevel.current = cut;
	const flameMaterials = useMemo(() => CYLINDERS.map(() => m.flame.clone() as ShaderMaterial), [m]);
	const sparkMaterials = useMemo(() => CYLINDERS.map(() => m.spark.clone()), [m]);
	m.exhaust.emissiveIntensity = heat * 7;

	// A probe drawn first in every pass moves the cutting plane with the engine.
	const probe = useMemo(() => {
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0.0001, 0, 0, 0, 0.0001, 0], 3));
		const mesh = new Mesh(geometry, new MeshBasicMaterial({colorWrite: false, depthWrite: false, depthTest: false}));
		mesh.frustumCulled = false;
		mesh.renderOrder = -1000;
		const plane = new Plane();
		mesh.onBeforeRender = () => {
			plane.set(new Vector3(0, -1, 0), cutLevel.current).applyMatrix4(mesh.matrixWorld);
			cutUniforms.plane.value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
		};
		return mesh;
	}, [cutUniforms]);

	const register = (bank: number, part: Group | null, key: string) => {
		if (part) parts.current.set(`${bank}:${key}`, part);
	};

	useMotion((time) => {
		const theta = crank(time);
		const deg = theta / DEG;
		crankGroup.current?.rotation.set(0, 0, theta);
		CYLINDERS.forEach((c, i) => {
			const alpha = theta + c.pin * DEG;
			const px = R * Math.cos(alpha);
			const py = R * Math.sin(alpha);
			const phi = c.bank > 0 ? alpha : alpha - Math.PI;
			const reach = pistonReach(phi) * c.bank;
			rods.current[i]?.position.set(px, py, c.z);
			rods.current[i]?.rotation.set(0, 0, Math.atan2(-py, reach - px));
			pistons.current[i]?.position.set(reach, 0, c.z);
			const flame = flameAt(deg, c.fire) * fire;
			const crown = Math.abs(reach) + 0.0315;
			const flameMesh = flames.current[i];
			if (flameMesh) {
				flameMesh.position.set(c.bank * crown, 0, c.z);
				flameMesh.scale.set(Math.max(0.0005, DECK - crown), 1, 1);
				flameMaterials[i].uniforms.strength.value = flame;
				flameMaterials[i].uniforms.phase.value = deg / 40 + i * 7;
				flameMesh.visible = flame > 0.002;
			}
			const sparkMesh = sparks.current[i];
			if (sparkMesh) {
				const since = wrap720(deg - c.fire + 8) - 8;
				const spark = since > -4 && since < 14 ? Math.exp(-Math.abs(since) / 4) : 0;
				sparkMaterials[i].opacity = spark * fire;
				sparkMesh.visible = spark > 0.01;
			}
			const light = lights.current[i];
			if (light) light.intensity = flame * fire * 0.4;
			// Valves and springs on this cylinder.
			for (const kind of ['intake', 'exhaust'] as const) {
				const lift = liftAt(deg, c.fire, kind === 'intake' ? INTAKE : EXHAUST);
				for (const dz of [-0.021, 0.021]) {
					parts.current.get(`${c.bank}:valve-${c.n}-${kind}-${dz}`)?.position.set(-lift, 0, 0);
					parts.current.get(`${c.bank}:spring-${c.n}-${kind}-${dz}`)?.scale.set((0.035 - lift) / 0.035, 1, 1);
				}
			}
		});
		for (const bank of [1, -1]) {
			for (const kind of ['intake', 'exhaust']) {
				parts.current.get(`${bank}:cam-${kind}`)?.rotation.set(0, 0, theta / 2);
			}
		}
	});

	useLayoutEffect(() => () => probe.geometry.dispose(), [probe]);

	const zMin = -0.2;
	const zMax = 0.24;
	const belt = useMemo(() => {
		const loop = new CatmullRomCurve3(
			[
				new Vector3(0.078, 0, 0),
				new Vector3(0.055, -0.055, 0),
				new Vector3(0, -0.078, 0),
				new Vector3(-0.055, -0.055, 0),
				new Vector3(-0.078, 0, 0),
				new Vector3(-0.036, 0.2, 0),
				new Vector3(0, 0.236, 0),
				new Vector3(0.036, 0.2, 0),
			],
			true,
			'centripetal',
		);
		return new TubeGeometry(loop, 120, 0.005, 6, true);
	}, []);
	return (
		<group>
			<primitive object={probe} />
			{/* Crankcase halves and sump. */}
			<mesh material={m.casting} position={[0, -0.01, (zMin + zMax) / 2]}>
				<boxGeometry args={[0.17, 0.2, zMax - zMin]} />
			</mesh>
			<mesh material={m.casting} position={[0, -0.135, (zMin + zMax) / 2]}>
				<boxGeometry args={[0.24, 0.05, zMax - zMin - 0.04]} />
			</mesh>
			{/* Intake plenum on top. */}
			<mesh material={m.carbon} position={[0, 0.2, 0.017]}>
				<boxGeometry args={[0.16, 0.07, 0.4]} />
			</mesh>
			{/* The crankshaft: journals, webs, pins, flywheel and pulley. */}
			<group ref={crankGroup}>
				<mesh geometry={g.journal} material={m.forged} position={[0, 0, 0.02]} />
				{CYLINDERS.map((c) => (
					<group key={c.n} rotation={[0, 0, c.pin * DEG]}>
						<mesh geometry={g.web} material={m.forged} position={[0, 0, c.z - 0.0185]} />
						<mesh geometry={g.web} material={m.forged} position={[0, 0, c.z + 0.0185]} />
						<mesh geometry={g.pinGeometry} material={m.polished} position={[R, 0, c.z]} />
					</group>
				))}
				<group position={[0, 0, 0.235]}>
					<mesh geometry={g.flywheel} material={m.forged} />
					<mesh geometry={g.ringGear} material={m.polished} />
				</group>
				<mesh geometry={g.pulley} material={m.titanium} position={[0, 0, -0.19]} />
				<mesh geometry={g.crankSprocket} material={m.chain} position={[0, 0, -0.198]} />
				<mesh geometry={g.crankSprocket} material={m.chain} position={[0, 0, -0.164]} />
				{/* Clutch pressure plate behind the flywheel. */}
				<mesh geometry={g.clutch} material={m.forged} position={[0, 0, 0.262]} />
			</group>
			{/* Main bearing shells round the crank journals. */}
			{[-0.165, -0.042, 0.076, 0.195].map((z) => (
				<mesh key={z} geometry={g.shell} material={m.bronze} position={[0, 0, z]} />
			))}
			{/* Bell housing towards the gearbox. */}
			<mesh geometry={g.bellhousing} material={m.casting} position={[0, 0, 0.335]} />
			{/* Alternator on top, driven by a belt from the crank pulley. */}
			<mesh material={m.casting} position={[0, 0.215, -0.235]} rotation={[Math.PI / 2, 0, 0]}>
				<cylinderGeometry args={[0.058, 0.058, 0.09, 32]} />
			</mesh>
			<mesh geometry={belt} material={m.rubber} position={[0, 0, -0.19]} />
			{/* Cooling fins under the sump. */}
			{Array.from({length: 7}, (_, i) => (
				<mesh key={i} material={m.casting} position={[0, -0.168, -0.15 + i * 0.058]}>
					<boxGeometry args={[0.2, 0.016, 0.006]} />
				</mesh>
			))}
			<Bolts
				facing="x"
				material={m.forged}
				places={[1, -1].flatMap((side) => Array.from({length: 9}, (_, i): [number, number, number] => [side * 0.0865, -0.093, -0.18 + i * 0.05]))}
			/>
			{/* Rods and pistons. */}
			{CYLINDERS.map((c, i) => (
				<group key={c.n}>
					<group ref={(part) => (rods.current[i] = part)}>
						<mesh geometry={g.rod} material={m.titanium} />
						{[0.03, -0.03].map((y) => (
							<mesh key={y} geometry={g.rodBolt} material={m.forged} position={[-0.004, y, 0]} />
						))}
					</group>
					<group ref={(part) => (pistons.current[i] = part)} rotation={[0, 0, c.bank > 0 ? 0 : Math.PI]}>
						<mesh geometry={g.piston} material={m.polished} />
						<mesh geometry={g.crown} material={m.polished} />
						<mesh geometry={g.wristPin} material={m.forged} />
						{/* Valve pockets in the crown. */}
						{[
							[0.018, 0.021],
							[0.018, -0.021],
							[-0.018, 0.021],
							[-0.018, -0.021],
						].map(([y, z]) => (
							<mesh key={`${y}${z}`} geometry={g.relief} material={m.relief} position={[0.0352, y, z]} />
						))}
						{[0.024, 0.019, 0.014].map((x) => (
							<mesh key={x} geometry={g.pistonRing} material={m.ring} position={[x, 0, 0]} />
						))}
					</group>
					<mesh ref={(part) => (flames.current[i] = part)} geometry={g.flame} material={flameMaterials[i]} rotation={[0, 0, c.bank > 0 ? 0 : Math.PI]} renderOrder={5} />
					<mesh
						ref={(part) => (sparks.current[i] = part)}
						material={sparkMaterials[i]}
						position={[c.bank * (DECK - 0.002), 0, c.z]}
						renderOrder={6}
					>
						<sphereGeometry args={[0.004, 12, 8]} />
					</mesh>
					{flashLights && (
						<pointLight ref={(light) => (lights.current[i] = light)} position={[c.bank * 0.18, 0.03, c.z]} color="#ff8a3a" distance={0.45} decay={2} intensity={0} />
					)}
				</group>
			))}
			<Bank bank={1} cylinders={CYLINDERS.filter((c) => c.bank > 0)} m={m} register={register} />
			<Bank bank={-1} cylinders={CYLINDERS.filter((c) => c.bank < 0)} m={m} register={register} />
		</group>
	);
};
