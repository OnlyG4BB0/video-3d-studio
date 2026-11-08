import {useFrame, useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useContext, useEffect, useLayoutEffect, useMemo} from 'react';
import {getInputProps, useCurrentFrame, useVideoConfig} from 'remotion';
import {
	ACESFilmicToneMapping,
	AgXToneMapping,
	HalfFloatType,
	NeutralToneMapping,
	PCFShadowMap,
	PerspectiveCamera,
	Vector2,
	WebGLRenderer,
	WebGLRenderTarget,
} from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {AccumulatePass, BeamOptions, FocusOptions} from './accumulate';
import {SampleBus, SampleContext} from './samples';
import './shaderPatches';

const TONES = {
	aces: ACESFilmicToneMapping,
	agx: AgXToneMapping,
	neutral: NeutralToneMapping,
};

const DEFAULT_SAMPLES = 16;

export type FinishOptions = {
	tone?: keyof typeof TONES;
	exposure?: number;
	/** Glow around the brightest areas. 0 turns it off. */
	bloom?: number;
	bloomThreshold?: number;
	bloomRadius?: number;
	/** Caps extreme highlights so that a brief reflection cannot flood the frame. */
	highlightLimit?: number;
	/** Keeps one point sharp and blurs what is nearer or further, like a real lens. */
	focus?: FocusOptions;
	/** Visible shafts of light in the air, from the SunLight. */
	beams?: BeamOptions;
	/** Adds an S-curve to the picture, 0 to 1. */
	contrast?: number;
	/** 1 leaves colours unchanged. */
	saturation?: number;
	/** Positive is warmer, negative is cooler. About -0.1 to 0.1. */
	warmth?: number;
	/** Lens colour fringing towards the corners. About 0 to 0.003. */
	fringe?: number;
	/** Darkening of the corners, 0 to 1. */
	vignette?: number;
	/** Film grain, 0 to about 0.08. It also prevents banding in gradients. */
	grain?: number;
};

const GradeShader = {
	name: 'GradeShader',
	uniforms: {
		tDiffuse: {value: null},
		frame: {value: 0},
		grain: {value: 0},
		vignette: {value: 0},
		contrast: {value: 0},
		saturation: {value: 1},
		warmth: {value: 0},
		fringe: {value: 0},
	},
	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: /* glsl */ `
		uniform sampler2D tDiffuse;
		uniform float frame;
		uniform float grain;
		uniform float vignette;
		uniform float contrast;
		uniform float saturation;
		uniform float warmth;
		uniform float fringe;
		varying vec2 vUv;

		float hash(vec3 p) {
			p = fract(p * 0.1031);
			p += dot(p, p.zyx + 31.32);
			return fract((p.x + p.y) * p.z);
		}

		void main() {
			vec2 centred = vUv - 0.5;
			float radius = dot(centred, centred);
			vec2 shift = centred * radius * fringe * 4.0;
			vec3 colour = vec3(
				texture2D(tDiffuse, vUv + shift).r,
				texture2D(tDiffuse, vUv).g,
				texture2D(tDiffuse, vUv - shift).b
			);

			colour = clamp(colour, 0.0, 1.0);
			colour = mix(colour, colour * colour * (3.0 - 2.0 * colour), contrast);
			float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
			colour = max(mix(vec3(luma), colour, saturation), 0.0);
			colour *= vec3(1.0 + warmth, 1.0, 1.0 - warmth);

			colour *= 1.0 - vignette * smoothstep(0.32, 0.82, length(centred));

			float seed = mod(frame, 251.0);
			float noise = hash(vec3(gl_FragCoord.xy, seed))
				+ hash(vec3(gl_FragCoord.yx + 17.0, seed + 3.0)) - 1.0;
			colour += noise * grain * mix(1.0, 0.45, luma);
			gl_FragColor = vec4(colour, 1.0);
		}
	`,
};

const Finish: React.FC<FinishOptions & {samples: number}> = ({
	samples,
	tone = 'aces',
	exposure = 1,
	bloom = 0.15,
	bloomThreshold = 1,
	bloomRadius = 0.55,
	highlightLimit = 6,
	focus,
	beams,
	contrast = 0,
	saturation = 1,
	warmth = 0,
	fringe = 0.0006,
	vignette = 0.22,
	grain = 0.025,
}) => {
	const gl = useThree((state) => state.gl) as WebGLRenderer;
	const scene = useThree((state) => state.scene);
	const camera = useThree((state) => state.camera) as PerspectiveCamera;
	const bus = useContext(SampleContext)!;
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();

	const pipeline = useMemo(() => {
		const target = new WebGLRenderTarget(width, height, {type: HalfFloatType});
		const composer = new EffectComposer(gl, target);
		const accumulate = new AccumulatePass(scene, camera, bus, width, height);
		composer.addPass(accumulate);
		const bloomPass = new UnrealBloomPass(
			new Vector2(width, height),
			0,
			bloomRadius,
			bloomThreshold,
		);
		composer.addPass(bloomPass);
		composer.addPass(new OutputPass());
		const gradePass = new ShaderPass(GradeShader);
		composer.addPass(gradePass);
		return {composer, accumulate, bloomPass, gradePass};
		// Numeric options are applied every frame below, so they can be animated.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gl, scene, camera, bus, width, height]);

	useEffect(
		() => () => {
			pipeline.accumulate.dispose();
			pipeline.composer.dispose();
		},
		[pipeline],
	);

	useLayoutEffect(() => {
		gl.toneMapping = TONES[tone];
		gl.toneMappingExposure = exposure;
		pipeline.accumulate.settings = {
			count: samples,
			limit: highlightLimit,
			focus,
			beams,
		};
		pipeline.bloomPass.enabled = bloom > 0;
		pipeline.bloomPass.strength = bloom;
		pipeline.bloomPass.radius = bloomRadius;
		pipeline.bloomPass.threshold = bloomThreshold;
		const grade = pipeline.gradePass.uniforms;
		grade.frame.value = frame;
		grade.grain.value = grain;
		grade.vignette.value = vignette;
		grade.contrast.value = contrast;
		grade.saturation.value = saturation;
		grade.warmth.value = warmth;
		grade.fringe.value = fringe;
	});

	useFrame(() => {
		pipeline.composer.render();
	}, 1);

	return null;
};

const samplesFromTools = () => {
	const value = getInputProps().renderSamples;
	return typeof value === 'number' ? value : undefined;
};

export type StageProps = {
	background?: string;
	shadows?: boolean;
	/** Passes per frame. Normally set by the tools: more is smoother and slower. */
	samples?: number;
	finish?: FinishOptions;
	children: React.ReactNode;
};

/** The 3D canvas of a shot, with its picture finish. Put everything 3D inside it. */
export const Stage: React.FC<StageProps> = ({
	background = '#000000',
	shadows = true,
	samples,
	finish,
	children,
}) => {
	const {width, height} = useVideoConfig();
	const bus = useMemo(() => new SampleBus(), []);
	const count = Math.max(1, samples ?? samplesFromTools() ?? DEFAULT_SAMPLES);

	return (
		<ThreeCanvas
			width={width}
			height={height}
			dpr={1}
			shadows={shadows ? {type: PCFShadowMap} : false}
			gl={{
				antialias: false,
				preserveDrawingBuffer: true,
				powerPreference: 'high-performance',
			}}
			camera={{fov: 35, near: 0.05, far: 300, position: [0, 0, 10]}}
		>
			<SampleContext.Provider value={bus}>
				<color attach="background" args={[background]} />
				{children}
				<Finish {...finish} samples={count} />
			</SampleContext.Provider>
		</ThreeCanvas>
	);
};
