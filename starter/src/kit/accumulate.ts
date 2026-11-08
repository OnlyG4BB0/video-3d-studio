import {
	AddEquation,
	CustomBlending,
	DepthTexture,
	FloatType,
	HalfFloatType,
	Matrix4,
	NearestFilter,
	OneFactor,
	OneMinusSrcAlphaFactor,
	PerspectiveCamera,
	Scene,
	ShaderMaterial,
	SrcAlphaFactor,
	Vector3,
	WebGLRenderer,
	WebGLRenderTarget,
	ZeroFactor,
} from 'three';
import {FullScreenQuad, Pass} from 'three/examples/jsm/postprocessing/Pass.js';
import type {Vec3} from './camera';
import {pointOnDisc, SampleBus} from './samples';

export type FocusOptions = {
	/** The point in the scene that stays sharp. */
	target: Vec3;
	/** Size of the lens opening in scene units. 0.01 is subtle, 0.1 is strong. */
	aperture?: number;
};

export type BeamOptions = {
	/** Thickness of the air. 0.003 is a light haze, 0.02 is heavy. Depends on the light's strength. */
	density?: number;
	/** How far from the camera to look for beams, in scene units. */
	reach?: number;
	/** 0 glows evenly, values near 0.8 glow strongly when looking towards the light. */
	anisotropy?: number;
};

export type AccumulateSettings = {
	count: number;
	limit: number;
	focus?: FocusOptions;
	beams?: BeamOptions;
};

const STEPS = 14;

const compositeShader = {
	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = vec4(position.xy, 0.0, 1.0);
		}
	`,
	fragmentShader: /* glsl */ `
		uniform sampler2D tColor;
		uniform sampler2D tDepth;
		uniform sampler2DShadow tSun;
		uniform mat4 projectionInverse;
		uniform mat4 cameraWorld;
		uniform mat4 sunMatrix;
		uniform vec3 eye;
		uniform vec3 sunColor;
		uniform vec3 sunDirection;
		uniform float weight;
		uniform float limit;
		uniform float beamDensity;
		uniform float beamReach;
		uniform float beamAnisotropy;
		uniform float jitter;
		varying vec2 vUv;

		float hash(vec2 p) {
			vec3 q = fract(vec3(p.xyx) * 0.1031);
			q += dot(q, q.yzx + 33.33);
			return fract((q.x + q.y) * q.z);
		}

		void main() {
			vec3 colour = min(texture2D(tColor, vUv).rgb, vec3(limit));

			if (beamDensity > 0.0) {
				float depth = texture2D(tDepth, vUv).x;
				vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
				view /= view.w;
				vec3 delta = (cameraWorld * view).xyz - eye;
				float distanceToSurface = length(delta);
				vec3 direction = delta / distanceToSurface;
				float travelled = min(distanceToSurface, beamReach);
				float stepLength = travelled / float(${STEPS});
				float offset = fract(hash(gl_FragCoord.xy) + jitter);

				float lit = 0.0;
				for (int i = 0; i < ${STEPS}; i++) {
					vec3 point = eye + direction * (float(i) + offset) * stepLength;
					vec4 coord = sunMatrix * vec4(point, 1.0);
					if (coord.x > 0.0 && coord.x < 1.0 && coord.y > 0.0 && coord.y < 1.0 && coord.z < 1.0) {
						lit += texture(tSun, coord.xyz);
					}
				}

				float g = beamAnisotropy;
				float cosine = dot(direction, sunDirection);
				float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosine, 1.5) / 12.566;
				colour += sunColor * lit * stepLength * beamDensity * phase;
				colour = min(colour, vec3(limit));
			}

			gl_FragColor = vec4(colour, weight);
		}
	`,
};

const position = new Vector3();
const right = new Vector3();
const up = new Vector3();
const forward = new Vector3();
const toFocus = new Vector3();
const sunDirection = new Vector3();

/** Draws the scene many times per frame and averages the results. */
export class AccumulatePass extends Pass {
	settings: AccumulateSettings = {count: 12, limit: 6};

	private readonly sampleTarget: WebGLRenderTarget;
	private readonly material: ShaderMaterial;
	private readonly quad: FullScreenQuad;

	constructor(
		private readonly scene: Scene,
		private readonly camera: PerspectiveCamera,
		private readonly bus: SampleBus,
		private readonly width: number,
		private readonly height: number,
	) {
		super();
		this.needsSwap = false;

		const depthTexture = new DepthTexture(width, height, FloatType);
		depthTexture.minFilter = NearestFilter;
		depthTexture.magFilter = NearestFilter;
		this.sampleTarget = new WebGLRenderTarget(width, height, {
			type: HalfFloatType,
			depthTexture,
		});

		this.material = new ShaderMaterial({
			...compositeShader,
			uniforms: {
				tColor: {value: this.sampleTarget.texture},
				tDepth: {value: depthTexture},
				tSun: {value: null},
				projectionInverse: {value: new Matrix4()},
				cameraWorld: {value: new Matrix4()},
				sunMatrix: {value: new Matrix4()},
				eye: {value: new Vector3()},
				sunColor: {value: new Vector3()},
				sunDirection: {value: new Vector3()},
				weight: {value: 1},
				limit: {value: 6},
				beamDensity: {value: 0},
				beamReach: {value: 30},
				beamAnisotropy: {value: 0.5},
				jitter: {value: 0},
			},
			depthTest: false,
			depthWrite: false,
			transparent: true,
			blending: CustomBlending,
			blendEquation: AddEquation,
			blendSrc: SrcAlphaFactor,
			blendDst: OneMinusSrcAlphaFactor,
			blendSrcAlpha: OneFactor,
			blendDstAlpha: ZeroFactor,
		});
		this.quad = new FullScreenQuad(this.material);
	}

	private updateBeamUniforms() {
		const {beams} = this.settings;
		const sun = this.bus.sun;
		const uniforms = this.material.uniforms;
		const depthTexture = sun?.shadow.map?.depthTexture;
		if (!beams || !sun || !depthTexture) {
			uniforms.beamDensity.value = 0;
			return;
		}
		uniforms.tSun.value = depthTexture;
		uniforms.sunMatrix.value.copy(sun.shadow.matrix);
		sunDirection
			.setFromMatrixPosition(sun.matrixWorld)
			.sub(position.setFromMatrixPosition(sun.target.matrixWorld))
			.normalize();
		uniforms.sunDirection.value.copy(sunDirection);
		uniforms.sunColor.value
			.set(sun.color.r, sun.color.g, sun.color.b)
			.multiplyScalar(sun.intensity);
		uniforms.beamDensity.value = beams.density ?? 0.006;
		uniforms.beamReach.value = beams.reach ?? 40;
		uniforms.beamAnisotropy.value = beams.anisotropy ?? 0.5;
	}

	render(
		renderer: WebGLRenderer,
		_writeBuffer: WebGLRenderTarget,
		readBuffer: WebGLRenderTarget,
	) {
		const {count, limit, focus} = this.settings;
		const camera = this.camera;
		const uniforms = this.material.uniforms;
		const previousAutoClear = renderer.autoClear;
		const focalPixels =
			this.height / 2 / Math.tan((camera.fov * Math.PI) / 360);

		const home = camera.position.clone();
		camera.updateMatrixWorld();
		right.setFromMatrixColumn(camera.matrixWorld, 0);
		up.setFromMatrixColumn(camera.matrixWorld, 1);
		forward.setFromMatrixColumn(camera.matrixWorld, 2).negate();

		let focusDistance = 1;
		if (focus) {
			toFocus.set(...focus.target).sub(home);
			focusDistance = Math.max(toFocus.dot(forward), camera.near);
		}

		uniforms.limit.value = limit;

		for (let index = 0; index < count; index++) {
			const sample = this.bus.sample(index, count);
			const [pixelX, pixelY] = sample.pair(1);
			let offsetX = pixelX - 0.5;
			let offsetY = pixelY - 0.5;
			camera.position.copy(home);

			if (focus) {
				const [lensU, lensV] = sample.pair(2);
				const [discX, discY] = pointOnDisc(lensU, lensV);
				const lensX = discX * (focus.aperture ?? 0.02);
				const lensY = discY * (focus.aperture ?? 0.02);
				camera.position.addScaledVector(right, lensX).addScaledVector(up, lensY);
				// Shift the picture to match, so the point in focus does not move.
				offsetX -= (lensX * focalPixels) / focusDistance;
				offsetY += (lensY * focalPixels) / focusDistance;
			}

			camera.setViewOffset(
				this.width,
				this.height,
				offsetX,
				offsetY,
				this.width,
				this.height,
			);
			camera.updateMatrixWorld();

			for (const hook of this.bus.hooks) {
				hook(sample);
			}

			renderer.autoClear = true;
			renderer.setRenderTarget(this.sampleTarget);
			renderer.render(this.scene, camera);

			this.updateBeamUniforms();
			uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
			uniforms.cameraWorld.value.copy(camera.matrixWorld);
			uniforms.eye.value.copy(camera.position);
			uniforms.jitter.value = (index + 1) * 0.6180339887;
			uniforms.weight.value = 1 / (index + 1);

			renderer.autoClear = false;
			renderer.setRenderTarget(readBuffer);
			this.quad.render(renderer);
			renderer.getContext().flush();
		}

		camera.clearViewOffset();
		camera.position.copy(home);
		camera.updateMatrixWorld();
		renderer.autoClear = previousAutoClear;
	}

	dispose() {
		this.sampleTarget.dispose();
		this.sampleTarget.depthTexture?.dispose();
		this.material.dispose();
		this.quad.dispose();
	}
}
