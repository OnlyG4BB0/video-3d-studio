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
	Scene,
	ShaderMaterial,
	SphereGeometry,
} from 'three';
import type {Vec3} from './camera';

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
	intensity?: number;
	/** Turns the reflections around the scene. Animate it for moving highlights. */
	rotate?: number;
};

/** Image-based light built in code, so a render never depends on a download. */
export const EnvLight: React.FC<EnvLightProps> = ({
	preset = 'studio',
	intensity = 1,
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
		scene.environmentRotation.set(0, MathUtils.degToRad(rotate), 0);
	});

	return null;
};

export type SunLightProps = {
	position: Vec3;
	target?: Vec3;
	intensity?: number;
	color?: string;
	/** Half the width of the area that receives shadows, in world units. */
	extent?: number;
	mapSize?: number;
	/** Shadow edge softness. */
	blur?: number;
	far?: number;
	bias?: number;
};

/** Directional light with shadows, for a key light or the sun. */
export const SunLight: React.FC<SunLightProps> = ({
	position,
	target = [0, 0, 0],
	intensity = 3,
	color = '#ffffff',
	extent = 6,
	mapSize = 2048,
	blur = 3,
	far = 60,
	bias = -0.0003,
}) => {
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
		const camera = current.shadow.camera;
		camera.left = -extent;
		camera.right = extent;
		camera.top = extent;
		camera.bottom = -extent;
		camera.near = 0.5;
		camera.far = far;
		camera.updateProjectionMatrix();
		current.shadow.mapSize.set(mapSize, mapSize);
		current.shadow.radius = blur;
		current.shadow.bias = bias;
		current.shadow.normalBias = 0.02;
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
