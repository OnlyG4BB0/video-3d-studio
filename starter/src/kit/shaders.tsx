import React, {useLayoutEffect, useMemo} from 'react';
import {
	BackSide,
	Color,
	MeshDepthMaterial,
	MeshPhysicalMaterial,
	MeshPhysicalMaterialParameters,
	RGBADepthPacking,
	ShaderMaterial,
} from 'three';
import {useShot} from './shot';

// Smooth gradient noise in three dimensions, plus layered versions of it.
const NOISE_GLSL = /* glsl */ `
	vec3 noiseGradient(vec3 p) {
		p = vec3(
			dot(p, vec3(127.1, 311.7, 74.7)),
			dot(p, vec3(269.5, 183.3, 246.1)),
			dot(p, vec3(113.5, 271.9, 124.6))
		);
		return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
	}

	float gradientNoise(vec3 p) {
		vec3 i = floor(p);
		vec3 f = fract(p);
		vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
		return mix(
			mix(
				mix(dot(noiseGradient(i), f), dot(noiseGradient(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
				mix(dot(noiseGradient(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(noiseGradient(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x),
				u.y
			),
			mix(
				mix(dot(noiseGradient(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(noiseGradient(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
				mix(dot(noiseGradient(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(noiseGradient(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x),
				u.y
			),
			u.z
		);
	}

	float layeredNoise(vec3 p) {
		return gradientNoise(p) * 0.6
			+ gradientNoise(p * 2.03 + 11.3) * 0.28
			+ gradientNoise(p * 4.11 + 27.1) * 0.12;
	}
`;

export type AuroraBackdropProps = {
	/** From the darkest areas to the brightest. */
	colors?: [string, string, string];
	intensity?: number;
	speed?: number;
	seed?: number;
};

/** Slowly drifting folds of colour behind everything, for dark abstract scenes. */
export const AuroraBackdrop: React.FC<AuroraBackdropProps> = ({
	colors = ['#050610', '#1d1538', '#7a3a4a'],
	intensity = 1,
	speed = 0.08,
	seed = 0,
}) => {
	const {time} = useShot();
	const material = useMemo(
		() =>
			new ShaderMaterial({
				side: BackSide,
				depthWrite: false,
				depthTest: false,
				fog: false,
				uniforms: {
					time: {value: 0},
					seed: {value: 0},
					intensity: {value: 1},
					low: {value: new Color()},
					middle: {value: new Color()},
					high: {value: new Color()},
				},
				vertexShader: /* glsl */ `
					varying vec3 vDirection;
					void main() {
						vDirection = normalize(position);
						gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
					}
				`,
				fragmentShader: /* glsl */ `
					uniform float time;
					uniform float seed;
					uniform float intensity;
					uniform vec3 low;
					uniform vec3 middle;
					uniform vec3 high;
					varying vec3 vDirection;
					${NOISE_GLSL}

					void main() {
						vec3 p = normalize(vDirection) * 1.7 + seed;
						vec3 warp = vec3(
							layeredNoise(p + vec3(0.0, 0.0, time)),
							layeredNoise(p + vec3(5.2, 1.3, -time)),
							layeredNoise(p + vec3(2.1, 7.7, time * 0.6))
						);
						float folds = layeredNoise(p + warp * 2.4) * 1.6 + 0.5;
						folds = clamp(folds, 0.0, 1.0);
						vec3 colour = mix(low, middle, smoothstep(0.1, 0.6, folds));
						colour = mix(colour, high, smoothstep(0.55, 1.0, folds));
						gl_FragColor = vec4(colour * intensity, 1.0);
					}
				`,
			}),
		[],
	);

	useLayoutEffect(() => {
		material.uniforms.time.value = time * speed;
		material.uniforms.seed.value = seed;
		material.uniforms.intensity.value = intensity;
		material.uniforms.low.value.set(colors[0]);
		material.uniforms.middle.value.set(colors[1]);
		material.uniforms.high.value.set(colors[2]);
	});

	return (
		<mesh renderOrder={-100} material={material} frustumCulled={false}>
			<sphereGeometry args={[150, 48, 24]} />
		</mesh>
	);
};

export type LiquidOptions = {
	/** How far the surface bulges. */
	amplitude?: number;
	/** How many bulges fit across the shape. */
	frequency?: number;
	speed?: number;
};

const LIQUID_VERTEX_PARS = /* glsl */ `
	uniform float liquidTime;
	uniform float liquidAmplitude;
	uniform float liquidFrequency;
	${NOISE_GLSL}

	vec3 liquidPoint(vec3 p) {
		vec3 direction = normalize(p);
		vec3 q = direction * liquidFrequency;
		vec3 drift = vec3(0.0, liquidTime, liquidTime * 0.6);
		float swell = gradientNoise(q + drift) * 0.78
			+ gradientNoise(q * 1.85 - drift * 1.3 + 4.1) * 0.22;
		return p + direction * swell * liquidAmplitude;
	}
`;

const patchLiquid = (
	shader: {vertexShader: string; uniforms: Record<string, {value: unknown}>},
	uniforms: Record<string, {value: number}>,
	withNormals: boolean,
) => {
	Object.assign(shader.uniforms, uniforms);
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', `#include <common>\n${LIQUID_VERTEX_PARS}`)
		.replace(
			'#include <begin_vertex>',
			'vec3 transformed = liquidPoint(position);',
		);
	if (withNormals) {
		shader.vertexShader = shader.vertexShader.replace(
			'#include <beginnormal_vertex>',
			/* glsl */ `
			vec3 surfaceNormal = normalize(position);
			vec3 tangentA = normalize(cross(surfaceNormal, abs(surfaceNormal.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
			vec3 tangentB = cross(surfaceNormal, tangentA);
			float reach = 0.012 * length(position);
			vec3 centre = liquidPoint(position);
			vec3 alongA = liquidPoint(position + tangentA * reach) - centre;
			vec3 alongB = liquidPoint(position + tangentB * reach) - centre;
			vec3 objectNormal = normalize(cross(alongB, alongA));
			if (dot(objectNormal, surfaceNormal) < 0.0) objectNormal = -objectNormal;
			`,
		);
	}
};

/**
 * A material that makes a sphere ripple like slow liquid, for any look.
 * Use it on a finely divided sphere, with both returned materials:
 * <mesh material={liquid.material} customDepthMaterial={liquid.depthMaterial} />
 */
export const useLiquidMaterial = (
	look: MeshPhysicalMaterialParameters,
	{amplitude = 0.3, frequency = 1.6, speed = 0.18}: LiquidOptions = {},
) => {
	const {time} = useShot();
	const uniforms = useMemo(
		() => ({
			liquidTime: {value: 0},
			liquidAmplitude: {value: amplitude},
			liquidFrequency: {value: frequency},
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	const result = useMemo(() => {
		const material = new MeshPhysicalMaterial(look);
		material.onBeforeCompile = (shader) => patchLiquid(shader, uniforms, true);
		const depthMaterial = new MeshDepthMaterial({depthPacking: RGBADepthPacking});
		depthMaterial.onBeforeCompile = (shader) =>
			patchLiquid(shader, uniforms, false);
		return {material, depthMaterial};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [uniforms, JSON.stringify(look)]);

	useLayoutEffect(() => {
		uniforms.liquidTime.value = time * speed;
		uniforms.liquidAmplitude.value = amplitude;
		uniforms.liquidFrequency.value = frequency;
	});

	return result;
};
