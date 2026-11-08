import {useFrame, useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useEffect, useLayoutEffect, useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {
	ACESFilmicToneMapping,
	AgXToneMapping,
	HalfFloatType,
	NeutralToneMapping,
	PCFShadowMap,
	PerspectiveCamera,
	Vector2,
	Vector3,
	WebGLRenderer,
	WebGLRenderTarget,
} from 'three';
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type {Vec3} from './camera';

const TONES = {
	aces: ACESFilmicToneMapping,
	agx: AgXToneMapping,
	neutral: NeutralToneMapping,
};

export type FocusOptions = {
	/** The point in the scene that stays sharp. */
	target: Vec3;
	/** Strength of the background blur. Around 0.001 to 0.006 is useful. */
	aperture?: number;
	maxBlur?: number;
};

export type FinishOptions = {
	tone?: keyof typeof TONES;
	exposure?: number;
	/** Glow around the brightest areas. 0 turns it off. */
	bloom?: number;
	bloomThreshold?: number;
	bloomRadius?: number;
	/** Caps extreme highlights so that a brief reflection cannot flood the frame. */
	highlightLimit?: number;
	/** Darkening of the corners, 0 to 1. */
	vignette?: number;
	/** Film grain, 0 to about 0.08. It also prevents banding in gradients. */
	grain?: number;
	focus?: FocusOptions;
};

const GradeShader = {
	name: 'GradeShader',
	uniforms: {
		tDiffuse: {value: null},
		frame: {value: 0},
		grain: {value: 0},
		vignette: {value: 0},
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
		varying vec2 vUv;

		float hash(vec3 p) {
			p = fract(p * 0.1031);
			p += dot(p, p.zyx + 31.32);
			return fract((p.x + p.y) * p.z);
		}

		void main() {
			vec4 colour = texture2D(tDiffuse, vUv);
			float edge = smoothstep(0.32, 0.82, length(vUv - 0.5));
			colour.rgb *= 1.0 - vignette * edge;

			float seed = mod(frame, 251.0);
			float noise = hash(vec3(gl_FragCoord.xy, seed))
				+ hash(vec3(gl_FragCoord.yx + 17.0, seed + 3.0)) - 1.0;
			float luma = dot(colour.rgb, vec3(0.2126, 0.7152, 0.0722));
			colour.rgb += noise * grain * mix(1.0, 0.45, luma);
			gl_FragColor = colour;
		}
	`,
};

const HighlightLimitShader = {
	name: 'HighlightLimitShader',
	uniforms: {
		tDiffuse: {value: null},
		limit: {value: 6},
	},
	vertexShader: GradeShader.vertexShader,
	fragmentShader: /* glsl */ `
		uniform sampler2D tDiffuse;
		uniform float limit;
		varying vec2 vUv;
		void main() {
			vec4 colour = texture2D(tDiffuse, vUv);
			gl_FragColor = vec4(min(colour.rgb, vec3(limit)), colour.a);
		}
	`,
};

/** Depth of field that also works where the background shows through. */
class FocusPass extends BokehPass {
	render(...args: Parameters<BokehPass['render']>) {
		const background = this.scene.background;
		this.scene.background = null;
		super.render(...args);
		this.scene.background = background;
	}
}

const Finish: React.FC<FinishOptions> = ({
	tone = 'aces',
	exposure = 1,
	bloom = 0.25,
	bloomThreshold = 1,
	bloomRadius = 0.55,
	highlightLimit = 6,
	vignette = 0.22,
	grain = 0.03,
	focus,
}) => {
	const gl = useThree((state) => state.gl) as WebGLRenderer;
	const scene = useThree((state) => state.scene);
	const camera = useThree((state) => state.camera) as PerspectiveCamera;
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const hasFocus = focus !== undefined;

	const pipeline = useMemo(() => {
		const target = new WebGLRenderTarget(width, height, {
			type: HalfFloatType,
			samples: 8,
		});
		const composer = new EffectComposer(gl, target);
		composer.addPass(new RenderPass(scene, camera));
		const focusPass = hasFocus
			? new FocusPass(scene, camera, {focus: 10, aperture: 0.002, maxblur: 0.01})
			: null;
		if (focusPass) {
			composer.addPass(focusPass);
		}
		const limitPass = new ShaderPass(HighlightLimitShader);
		composer.addPass(limitPass);
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
		return {composer, focusPass, limitPass, bloomPass, gradePass};
		// Numeric options are applied every frame below, so they can be animated.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gl, scene, camera, width, height, hasFocus]);

	useEffect(() => () => pipeline.composer.dispose(), [pipeline]);

	useLayoutEffect(() => {
		gl.toneMapping = TONES[tone];
		gl.toneMappingExposure = exposure;
		pipeline.limitPass.uniforms.limit.value = highlightLimit;
		pipeline.bloomPass.enabled = bloom > 0;
		pipeline.bloomPass.strength = bloom;
		pipeline.bloomPass.radius = bloomRadius;
		pipeline.bloomPass.threshold = bloomThreshold;
		pipeline.gradePass.uniforms.frame.value = frame;
		pipeline.gradePass.uniforms.grain.value = grain;
		pipeline.gradePass.uniforms.vignette.value = vignette;
		if (pipeline.focusPass && focus) {
			const uniforms = pipeline.focusPass.uniforms as Record<
				string,
				{value: number}
			>;
			uniforms.focus.value = camera.position.distanceTo(
				new Vector3(...focus.target),
			);
			uniforms.aperture.value = focus.aperture ?? 0.002;
			uniforms.maxblur.value = focus.maxBlur ?? 0.01;
			uniforms.aspect.value = camera.aspect;
		}
	});

	useFrame(() => {
		pipeline.composer.render();
	}, 1);

	return null;
};

export type StageProps = {
	background?: string;
	shadows?: boolean;
	finish?: FinishOptions;
	children: React.ReactNode;
};

/** The 3D canvas of a shot, with its picture finish. Put everything 3D inside it. */
export const Stage: React.FC<StageProps> = ({
	background = '#000000',
	shadows = true,
	finish,
	children,
}) => {
	const {width, height} = useVideoConfig();
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
			<color attach="background" args={[background]} />
			{children}
			<Finish {...finish} />
		</ThreeCanvas>
	);
};
