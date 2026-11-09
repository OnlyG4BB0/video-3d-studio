import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {
	BackSide,
	Color,
	FrontSide,
	MathUtils,
	NoColorSpace,
	ShaderMaterial,
	Texture,
	Vector3,
} from 'three';
import {
	Caption,
	EnvLight,
	lensFov,
	PathCamera,
	scatter,
	ShotMusic,
	ShotProps,
	SkyLight,
	Stage,
	SunLight,
	useCanvasTexture,
	useLathe,
	useNoiseTexture,
	useShot,
	Vec3,
} from '../../kit';
import {FOOTER} from './common';

const LENGTH = 44;
const COLUMN_X = -3.1;
const WALL_X = 3.2;
const STEP = 3.2;
const COLUMNS = Array.from({length: 15}, (_, index) => (index - 7) * STEP);
const LAMPS = [-9.6, -3.2, 3.2, 9.6];
const STONE = '#c9bda9';
const PLASTER = '#ddd2c0';

type Stop = {
	at: number;
	zenith: string;
	horizon: string;
	sun: string;
	power: number;
	sky: number;
};

// One day, from first light to the blue hour.
const DAY: Stop[] = [
	{at: 0, zenith: '#31497c', horizon: '#f2a57c', sun: '#ff9d5c', power: 6, sky: 1},
	{at: 0.22, zenith: '#3f73b8', horizon: '#f6d9bd', sun: '#ffd9a8', power: 9, sky: 1.5},
	{at: 0.5, zenith: '#2a66b8', horizon: '#c4dcf0', sun: '#fff3e2', power: 8.5, sky: 1.35},
	{at: 0.76, zenith: '#34508f', horizon: '#f5a36a', sun: '#ffb070', power: 9, sky: 1.2},
	{at: 0.88, zenith: '#1b2352', horizon: '#c8553a', sun: '#ff6a35', power: 4, sky: 0.65},
	{at: 1, zenith: '#070b24', horizon: '#26203f', sun: '#ff6a35', power: 0, sky: 0.16},
];

const smooth = (t: number) => t * t * (3 - 2 * t);

const dayAt = (progress: number) => {
	let index = 0;
	while (index < DAY.length - 2 && progress > DAY[index + 1].at) {
		index++;
	}
	const a = DAY[index];
	const b = DAY[index + 1];
	const t = smooth(MathUtils.clamp((progress - a.at) / (b.at - a.at), 0, 1));
	const mix = (x: string, y: string) => new Color(x).lerp(new Color(y), t);
	return {
		zenith: mix(a.zenith, b.zenith),
		horizon: mix(a.horizon, b.horizon),
		sun: mix(a.sun, b.sun),
		power: MathUtils.lerp(a.power, b.power, t),
		sky: MathUtils.lerp(a.sky, b.sky, t),
	};
};

const hex = (colour: Color) => `#${colour.getHexString()}`;

export const filmLightDefaults: ShotProps & {music: ShotMusic} = {
	format: 'wide',
	seconds: 14,
	music: {
		mood: 'warm',
		// One soft bell for each lamp coming on at dusk.
		cues: [0.83, 0.85, 0.87, 0.89].map((progress, index) => ({
			sound: 'bell',
			progress,
			note: 81 + [0, 3, 5, 7][index],
			amp: 0.1,
			pan: -0.45 + index * 0.3,
		})),
	},
};

const Block: React.FC<{
	at: Vec3;
	size: Vec3;
	color: string;
	roughness?: number;
	bump?: Texture;
}> = ({at, size, color, roughness = 0.9, bump}) => (
	<mesh position={at} castShadow receiveShadow>
		<boxGeometry args={size} />
		<meshStandardMaterial
			color={color}
			roughness={roughness}
			bumpMap={bump}
			bumpScale={bump ? 0.5 : 0}
			shadowSide={FrontSide}
		/>
	</mesh>
);

const Sky: React.FC<{
	zenith: Color;
	horizon: Color;
	sun: Color;
	cloud: Color;
	direction: Vector3;
	power: number;
	clock: number;
	gain: number;
}> = ({zenith, horizon, sun, cloud, direction, power, clock, gain}) => {
	const material = useMemo(
		() =>
			new ShaderMaterial({
				side: BackSide,
				depthWrite: false,
				depthTest: false,
				uniforms: {
					zenith: {value: new Color()},
					horizon: {value: new Color()},
					sunColour: {value: new Color()},
					cloud: {value: new Color()},
					direction: {value: new Vector3()},
					power: {value: 0},
					clock: {value: 0},
					gain: {value: 1.5},
				},
				vertexShader: /* glsl */ `
					varying vec3 vDirection;
					void main() {
						vDirection = position;
						gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
					}
				`,
				fragmentShader: /* glsl */ `
					uniform vec3 zenith;
					uniform vec3 horizon;
					uniform vec3 sunColour;
					uniform vec3 direction;
					uniform vec3 cloud;
					uniform float power;
					uniform float clock;
					uniform float gain;
					varying vec3 vDirection;

					float hash(vec2 p) {
						return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
					}
					float noise(vec2 p) {
						vec2 i = floor(p);
						vec2 f = fract(p);
						vec2 u = f * f * (3.0 - 2.0 * f);
						return mix(
							mix(hash(i), hash(i + vec2(1, 0)), u.x),
							mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x),
							u.y
						);
					}
					float clouds(vec2 p) {
						float value = 0.0;
						float weight = 0.5;
						for (int i = 0; i < 6; i++) {
							value += weight * noise(p);
							p = p * 2.03 + vec2(1.7, 9.2);
							weight *= 0.5;
						}
						return value;
					}

					void main() {
						vec3 d = normalize(vDirection);
						vec3 colour = mix(horizon, zenith, pow(max(d.y, 0.0), 0.8) * 1.5);
						colour = mix(colour, horizon * 0.62, smoothstep(0.0, -0.3, d.y));
						float s = max(dot(d, direction), 0.0);
						if (d.y > 0.0) {
							vec2 plane = d.xz / (d.y + 0.16);
							float mass = clouds(plane * 0.55 + vec2(clock, clock * 0.35));
							float cover = smoothstep(0.47, 0.72, mass) * smoothstep(0.0, 0.08, d.y);
							float edge = smoothstep(0.72, 0.5, mass);
							vec3 lit = cloud + sunColour * power * edge * (0.12 + pow(s, 6.0) * 0.9);
							colour = mix(colour, lit, cover * 0.88);
						}
						colour += sunColour * power * (pow(s, 1400.0) * 3.0 + pow(s, 48.0) * 0.12 + pow(s, 5.0) * 0.05);
						gl_FragColor = vec4(colour * gain, 1.0);
					}
				`,
			}),
		[],
	);
	useLayoutEffect(() => {
		material.uniforms.zenith.value.copy(zenith);
		material.uniforms.horizon.value.copy(horizon);
		material.uniforms.sunColour.value.copy(sun);
		material.uniforms.cloud.value.copy(cloud);
		material.uniforms.direction.value.copy(direction);
		material.uniforms.power.value = power;
		material.uniforms.clock.value = clock;
		material.uniforms.gain.value = gain;
	});
	return (
		<mesh renderOrder={-100} material={material} frustumCulled={false}>
			<sphereGeometry args={[200, 48, 32]} />
		</mesh>
	);
};

const useColumn = () => {
	const lathe = useLathe(
		[
			[0, 0],
			[0.5, 0, 0.01],
			[0.5, 0.14, 0.02],
			[0.42, 0.2, 0.04],
			[0.37, 0.34, 0.06],
			[0.36, 0.5, 0.01],
			[0.315, 4.5, 0.01],
			[0.31, 4.62, 0.04],
			[0.4, 4.78, 0.08],
			[0.52, 4.86, 0.02],
			[0.52, 5.0, 0.01],
			[0, 5.0],
		],
		{segments: 240, steps: 6},
	);
	return useMemo(() => {
		const geometry = lathe.clone();
		const position = geometry.attributes.position;
		for (let i = 0; i < position.count; i++) {
			const x = position.getX(i);
			const y = position.getY(i);
			const z = position.getZ(i);
			if (y > 0.48 && y < 4.52) {
				const flute = Math.abs(Math.cos(Math.atan2(z, x) * 10));
				const k = 1 - 0.07 * (1 - Math.pow(flute, 0.6));
				position.setXYZ(i, x * k, y, z * k);
			}
		}
		geometry.computeVertexNormals();
		return geometry;
	}, [lathe]);
};

const Portico: React.FC<{lamps: number}> = ({lamps}) => {
	const column = useColumn();
	const plaster = useNoiseTexture({seed: 17, repeat: [15, 2], periods: [16, 32, 64, 128]});
	const ceiling = useNoiseTexture({seed: 19, repeat: [3, 15], periods: [16, 32, 64, 128]});
	const grain = useNoiseTexture({seed: 23, repeat: [6, 20], periods: [32, 64, 128]});
	const slabs = useCanvasTexture((context, size) => {
		const cells = 8;
		const cell = size / cells;
		for (let y = 0; y < cells; y++) {
			for (let x = 0; x < cells; x++) {
				const shade = 0.56 + scatter(3, x * 13 + y) * 0.2;
				const base = new Color(STONE).multiplyScalar(shade);
				context.fillStyle = `#${base.getHexString()}`;
				context.fillRect(x * cell, y * cell, cell, cell);
			}
		}
		context.strokeStyle = 'rgba(40,32,24,0.75)';
		context.lineWidth = size * 0.0028;
		for (let i = 0; i <= cells; i++) {
			context.beginPath();
			context.moveTo(i * cell, 0);
			context.lineTo(i * cell, size);
			context.moveTo(0, i * cell);
			context.lineTo(size, i * cell);
			context.stroke();
		}
	}, {size: 2048, repeat: [1, 5]});
	const joints = useCanvasTexture((context, size) => {
		const cells = 8;
		const cell = size / cells;
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, size, size);
		context.strokeStyle = '#000000';
		context.lineWidth = size * 0.004;
		for (let i = 0; i <= cells; i++) {
			context.beginPath();
			context.moveTo(i * cell, 0);
			context.lineTo(i * cell, size);
			context.moveTo(0, i * cell);
			context.lineTo(size, i * cell);
			context.stroke();
		}
	}, {size: 2048, repeat: [1, 5], colorSpace: NoColorSpace});

	return (
		<group>
			<mesh position={[-0.9, -0.15, 0]} castShadow receiveShadow>
				<boxGeometry args={[8.6, 0.3, LENGTH]} />
				<meshPhysicalMaterial
					attach="material"
					map={slabs}
					bumpMap={joints}
					bumpScale={1.2}
					roughness={0.62}
					shadowSide={FrontSide}
				/>
			</mesh>

			{COLUMNS.map((z) => (
				<mesh key={z} geometry={column} position={[COLUMN_X, 0, z]} castShadow receiveShadow>
					<meshStandardMaterial
						color={STONE}
						roughness={0.8}
						bumpMap={grain}
						bumpScale={0.3}
						shadowSide={FrontSide}
					/>
				</mesh>
			))}

			<Block at={[COLUMN_X, 5.27, 0]} size={[1.2, 0.54, LENGTH]} color={STONE} bump={grain} />
			<Block at={[0, 5.68, 0]} size={[8.6, 0.28, LENGTH]} color={PLASTER} bump={ceiling} />
			<Block at={[WALL_X + 0.15, 2.85, 0]} size={[0.3, 5.9, LENGTH]} color={PLASTER} bump={plaster} />
			{COLUMNS.map((z) => (
				<Block key={z} at={[0.05, 5.3, z]} size={[6.3, 0.48, 0.5]} color={STONE} bump={grain} />
			))}

			{COLUMNS.map((z) => (
				<Block key={z} at={[WALL_X - 0.07, 2.65, z]} size={[0.14, 5.3, 0.8]} color={STONE} bump={grain} />
			))}
			<Block at={[WALL_X - 0.03, 0.14, 0]} size={[0.06, 0.28, LENGTH]} color={STONE} />

			{LAMPS.map((z) => (
				<group key={z} position={[0.4, 0, z]}>
					<mesh position={[0, 4.95, 0]}>
						<cylinderGeometry args={[0.012, 0.012, 1.2, 8]} />
						<meshStandardMaterial color="#26221d" metalness={0.8} roughness={0.4} />
					</mesh>
					<mesh position={[0, 4.28, 0]}>
						<sphereGeometry args={[0.16, 32, 24]} />
						<meshStandardMaterial
							color="#fff0d8"
							emissive="#ffc98c"
							emissiveIntensity={0.05 + lamps * 22}
							roughness={0.4}
						/>
					</mesh>
					<pointLight position={[0, 4.1, 0]} color="#ffbd7d" intensity={lamps * 16} distance={12} decay={2} />
				</group>
			))}
		</group>
	);
};

export const ChapterLight: React.FC = () => {
	const {aspect, progress, time} = useShot();
	const fov = lensFov(26, aspect);
	const day = dayAt(progress);
	const cloud = day.horizon
		.clone()
		.lerp(new Color('#ffffff'), 0.45 * Math.min(1, day.sky))
		.multiplyScalar(0.08 + day.sky * 0.5);

	const arc = MathUtils.clamp(progress / 0.9, 0, 1);
	const elevation = MathUtils.degToRad(4 + 33 * Math.sin(arc * Math.PI));
	const azimuth = MathUtils.degToRad(MathUtils.lerp(-68, 68, arc));
	const direction = new Vector3(
		-Math.cos(elevation) * Math.cos(azimuth),
		Math.sin(elevation),
		Math.cos(elevation) * Math.sin(azimuth),
	).normalize();
	const sunAt = direction.clone().multiplyScalar(30);
	const lamps = smooth(MathUtils.clamp((progress - 0.8) / 0.14, 0, 1));

	return (
		<AbsoluteFill>
			<Stage
				background="#101320"
				finish={{
					tone: 'agx',
					exposure: 1.55,
					bloom: 0.07,
					bloomThreshold: 2,
					bloomRadius: 0.4,
					contrast: 0.32,
					saturation: 1.2,
					vignette: 0.28,
					grain: 0.028,
					beams: {density: 0.0035, reach: 26, anisotropy: 0.6},
					focus: {target: [-1.4, 1.6, 0], aperture: 0.012},
				}}
			>
				<Sky
					zenith={day.zenith}
					horizon={day.horizon}
					sun={day.sun}
					cloud={cloud}
					direction={direction}
					power={Math.min(1, day.power)}
					clock={time * 0.3}
					gain={MathUtils.lerp(1.5, 0.62, smooth(MathUtils.clamp((progress - 0.82) / 0.18, 0, 1)))}
				/>
				<EnvLight preset="daylight" intensity={0.25 + day.sky * 0.2} diffuse={0.08} />
				<SkyLight
					intensity={day.sky * 3.4}
					axis={[-1, 0.55, 0]}
					spread={55}
					centre={[0, 2.5, 0]}
					extent={22}
					mapSize={2048}
					zenith={hex(day.zenith)}
					horizon={hex(day.horizon)}
				/>
				<hemisphereLight args={['#eef1f7', '#d9c6a8', 0.24 * day.sky]} />
				<SunLight
					position={[sunAt.x, sunAt.y, sunAt.z]}
					target={[0, 2, 0]}
					intensity={day.power}
					color={hex(day.sun)}
					extent={24}
					mapSize={4096}
					softness={0.45}
					far={70}
				/>

				<Portico lamps={lamps} />

				<PathCamera
					fov={fov}
					drift={0.02}
					keys={[
						{position: [1.5, 1.35, 11.5], target: [-1.5, 2.1, -6]},
						{position: [1.2, 1.55, 3.8], target: [-1.7, 2.2, -14]},
					]}
				/>
			</Stage>
			<Caption footer={FOOTER} index="01" title="LIGHT" note="A full day in fourteen seconds: moving sun, soft shadows, drifting clouds" />
		</AbsoluteFill>
	);
};
