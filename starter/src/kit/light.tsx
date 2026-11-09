import {useThree} from '@react-three/fiber';
import React, {useEffect, useLayoutEffect, useMemo, useRef} from 'react';
import {
	BackSide,
	Color,
	DirectionalLight,
	DoubleSide,
	MathUtils,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	PlaneGeometry,
	PMREMGenerator,
	Quaternion,
	Scene,
	ShaderMaterial,
	SphereGeometry,
	Vector3,
} from 'three';
import type {Vec3} from './camera';
import {pointOnDisc, useEachSample, useSampleBus} from './samples';

type Panel = {at: Vec3; size: [number, number]; color: string; power: number};

type Recipe = {
	top: string;
	horizon: string;
	bottom: string;
	skyPower: number;
	panels: Panel[];
};

const RECIPES = {
	studio: {
		top: '#1a1b1f',
		horizon: '#101114',
		bottom: '#08080a',
		skyPower: 1,
		panels: [
			{at: [0, 9, 1], size: [9, 7], color: '#ffffff', power: 9},
			{at: [-9, 2.5, 2.5], size: [2, 9], color: '#ffffff', power: 14},
			{at: [9, 3, -1], size: [3, 8], color: '#f4efe6', power: 7},
			{at: [1, 2, -10], size: [8, 2], color: '#dfe7ff', power: 3},
		],
	},
	// Has a broad panel behind the camera, so flat metal faces have something to reflect.
	showcase: {
		top: '#2a2620',
		horizon: '#3a342b',
		bottom: '#0c0b09',
		skyPower: 1,
		panels: [
			{at: [0, 2, 10], size: [9, 5], color: '#fff6e8', power: 2.6},
			{at: [-9, 3, 3], size: [2, 9], color: '#ffffff', power: 11},
			{at: [9, 3, 3], size: [2, 9], color: '#ffffff', power: 8},
			{at: [0, 10, 0], size: [10, 5], color: '#ffffff', power: 4},
		],
	},
	// Coloured light tubes, for liquid metal and glossy abstract forms.
	neon: {
		top: '#2a2460',
		horizon: '#3a2a70',
		bottom: '#120f33',
		skyPower: 1.3,
		panels: [
			{at: [-8, 3, 5], size: [3.2, 12], color: '#ff2f92', power: 9},
			{at: [8, 2, 4], size: [3.2, 12], color: '#2fb8ff', power: 9},
			{at: [0, 10, 2], size: [12, 3.5], color: '#ffffff', power: 8},
			{at: [3, -6, 8], size: [10, 2.5], color: '#8a5cff', power: 7},
			{at: [-3, 1, -10], size: [4, 10], color: '#ffb35c', power: 8},
		],
	},
	daylight: {
		top: '#7fa8d9',
		horizon: '#dfe7ee',
		bottom: '#6d655a',
		skyPower: 1.6,
		panels: [{at: [-7, 7, 3], size: [4, 4], color: '#fff3df', power: 28}],
	},
	dusk: {
		top: '#141a33',
		horizon: '#b4624a',
		bottom: '#0b0a10',
		skyPower: 1.4,
		panels: [
			{at: [-10, 1, -4], size: [7, 1.5], color: '#ffb27a', power: 22},
			{at: [10, 4, 2], size: [1.5, 8], color: '#7f9dff', power: 12},
		],
	},
	night: {
		top: '#05060c',
		horizon: '#0b0e18',
		bottom: '#020203',
		skyPower: 1,
		panels: [
			{at: [6, 5, 6], size: [1, 7], color: '#cfdcff', power: 18},
			{at: [-7, 1, 4], size: [0.7, 7], color: '#f4ece6', power: 14},
		],
	},
} satisfies Record<string, Recipe>;

export type EnvName = keyof typeof RECIPES;

const buildEnvironmentScene = (recipe: Recipe) => {
	const scene = new Scene();
	const hdr = (hex: string, power: number) =>
		new Color(hex).multiplyScalar(power);

	const sky = new Mesh(
		new SphereGeometry(30, 32, 16),
		new ShaderMaterial({
			side: BackSide,
			depthWrite: false,
			uniforms: {
				top: {value: hdr(recipe.top, recipe.skyPower)},
				horizon: {value: hdr(recipe.horizon, recipe.skyPower)},
				bottom: {value: hdr(recipe.bottom, recipe.skyPower)},
			},
			vertexShader: /* glsl */ `
				varying vec3 vDirection;
				void main() {
					vDirection = normalize(position);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: /* glsl */ `
				uniform vec3 top;
				uniform vec3 horizon;
				uniform vec3 bottom;
				varying vec3 vDirection;
				void main() {
					float y = normalize(vDirection).y;
					vec3 colour = y > 0.0
						? mix(horizon, top, pow(y, 0.6))
						: mix(horizon, bottom, pow(-y, 0.45));
					gl_FragColor = vec4(colour, 1.0);
				}
			`,
		}),
	);
	scene.add(sky);

	for (const panel of recipe.panels) {
		const mesh = new Mesh(
			new PlaneGeometry(panel.size[0], panel.size[1]),
			new MeshBasicMaterial({
				color: hdr(panel.color, panel.power),
				side: DoubleSide,
			}),
		);
		mesh.position.set(...panel.at);
		mesh.lookAt(0, 0, 0);
		scene.add(mesh);
	}
	return scene;
};

const disposeScene = (scene: Scene) => {
	scene.traverse((object) => {
		const mesh = object as Mesh;
		mesh.geometry?.dispose();
		(mesh.material as MeshBasicMaterial | undefined)?.dispose();
	});
};

export type EnvLightProps = {
	preset?: EnvName;
	/** Strength of the reflections. */
	intensity?: number;
	/**
	 * How much it also lights matte surfaces, as a fraction of `intensity`.
	 * This light casts no shadows, so keep it low when using a SkyLight.
	 */
	diffuse?: number;
	/** Turns the reflections around the scene. Animate it for moving highlights. */
	rotate?: number;
};

/** Image-based light built in code, so a render never depends on a download. */
export const EnvLight: React.FC<EnvLightProps> = ({
	preset = 'studio',
	intensity = 1,
	diffuse = 0.35,
	rotate = 0,
}) => {
	const gl = useThree((state) => state.gl);
	const scene = useThree((state) => state.scene);

	const target = useMemo(() => {
		const generator = new PMREMGenerator(gl);
		const source = buildEnvironmentScene(RECIPES[preset]);
		const result = generator.fromScene(source, 0.02, 0.1, 100);
		disposeScene(source);
		generator.dispose();
		return result;
	}, [gl, preset]);

	useEffect(() => () => target.dispose(), [target]);

	useLayoutEffect(() => {
		scene.environment = target.texture;
		scene.environmentIntensity = intensity;
		// Stage applies this just before it draws. See shaderPatches.ts.
		scene.userData.environmentDiffuse = diffuse;
		scene.environmentRotation.set(0, MathUtils.degToRad(rotate), 0);
	});

	return null;
};

const applyShadowCamera = (
	light: DirectionalLight,
	extent: number,
	far: number,
	mapSize: number,
) => {
	const camera = light.shadow.camera;
	camera.left = -extent;
	camera.right = extent;
	camera.top = extent;
	camera.bottom = -extent;
	camera.near = 0.5;
	camera.far = far;
	camera.updateProjectionMatrix();
	light.shadow.mapSize.set(mapSize, mapSize);
};

export type SunLightProps = {
	position: Vec3;
	target?: Vec3;
	intensity?: number;
	color?: string;
	/**
	 * Size of the light in scene units. Shadows are sharp at the point of contact
	 * and soften with distance, as they do in reality. 0 gives hard shadows.
	 */
	softness?: number;
	/** Half the width of the area that receives shadows, in world units. */
	extent?: number;
	mapSize?: number;
	far?: number;
	bias?: number;
};

/** Directional light with shadows, for a key light or the sun. */
export const SunLight: React.FC<SunLightProps> = ({
	position,
	target = [0, 0, 0],
	intensity = 3,
	color = '#ffffff',
	softness = 0.5,
	extent = 6,
	mapSize = 2048,
	far = 60,
	bias = -0.0003,
}) => {
	const bus = useSampleBus();
	const light = useRef<DirectionalLight>(null);
	const aim = useMemo(() => new Object3D(), []);

	useLayoutEffect(() => {
		aim.position.set(...target);
		aim.updateMatrixWorld();
		const current = light.current;
		if (!current) {
			return;
		}
		current.target = aim;
		applyShadowCamera(current, extent, far, mapSize);
		current.shadow.radius = 1.5;
		current.shadow.bias = bias;
		current.shadow.normalBias = 0.015;
		bus.sun = current;
	});

	useEachSample(({pair}) => {
		const current = light.current;
		if (!current) {
			return;
		}
		const base = new Vector3(...position);
		const direction = base.clone().sub(aim.position).normalize();
		const side = new Vector3(0, 1, 0).cross(direction);
		if (side.lengthSq() < 1e-4) {
			side.set(1, 0, 0);
		}
		side.normalize();
		const lift = direction.clone().cross(side);
		const [u, v] = pair(11);
		const [x, y] = pointOnDisc(u, v);
		current.position
			.copy(base)
			.addScaledVector(side, x * softness)
			.addScaledVector(lift, y * softness);
	});

	return (
		<>
			<primitive object={aim} />
			<directionalLight
				ref={light}
				castShadow
				position={position}
				intensity={intensity}
				color={color}
			/>
		</>
	);
};

export type SkyLightProps = {
	intensity?: number;
	/** Colour of light arriving from straight above. */
	zenith?: string;
	/** Colour of light arriving from low down. */
	horizon?: string;
	/** Middle of the area that receives the light. */
	centre?: Vec3;
	extent?: number;
	mapSize?: number;
	/** Main direction the light comes from, for example out through a window. */
	axis?: Vec3;
	/** Width of the sky around `axis`, in degrees. 90 is the whole sky. */
	spread?: number;
};

/**
 * Soft light from the whole sky, blocked by whatever is in its way. It darkens
 * corners, the undersides of things and the ground around objects, which is what
 * makes them look like they are really sitting in a space.
 */
export const SkyLight: React.FC<SkyLightProps> = ({
	intensity = 2,
	zenith = '#dbe7ff',
	horizon = '#fff1df',
	centre = [0, 0, 0],
	extent = 6,
	mapSize = 1024,
	axis = [0, 1, 0],
	spread = 80,
}) => {
	const light = useRef<DirectionalLight>(null);
	const aim = useMemo(() => new Object3D(), []);
	const colours = useMemo(
		() => ({top: new Color(zenith), low: new Color(horizon)}),
		[zenith, horizon],
	);
	const distance = extent * 4;

	useLayoutEffect(() => {
		aim.position.set(...centre);
		aim.updateMatrixWorld();
		const current = light.current;
		if (!current) {
			return;
		}
		current.target = aim;
		applyShadowCamera(current, extent, distance * 2, mapSize);
		// The negative radius marks this light as diffuse-only. See shaderPatches.ts.
		current.shadow.radius = -2;
		current.shadow.bias = -0.0008;
		current.shadow.normalBias = 0.03;
	});

	useEachSample(({pair}) => {
		const current = light.current;
		if (!current) {
			return;
		}
		const [u, v] = pair(23);
		const radius = Math.sqrt(u) * Math.sin(MathUtils.degToRad(spread));
		const angle = 2 * Math.PI * v;
		const direction = new Vector3(
			radius * Math.cos(angle),
			Math.sqrt(1 - radius * radius),
			radius * Math.sin(angle),
		).applyQuaternion(
			new Quaternion().setFromUnitVectors(
				new Vector3(0, 1, 0),
				new Vector3(...axis).normalize(),
			),
		);
		// Sky light always comes from above, however wide the spread is.
		direction.y = Math.max(Math.abs(direction.y), 0.03);
		direction.normalize();
		current.position.copy(aim.position).addScaledVector(direction, distance);
		current.color.lerpColors(
			colours.low,
			colours.top,
			MathUtils.clamp(direction.y, 0, 1),
		);
	});

	return (
		<>
			<primitive object={aim} />
			<directionalLight ref={light} castShadow intensity={intensity} />
		</>
	);
};
