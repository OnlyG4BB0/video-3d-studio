import {useThree} from '@react-three/fiber';
import React, {useMemo} from 'react';
import {CatmullRomCurve3, MathUtils, PerspectiveCamera, Vector3} from 'three';
import {EASE, Key, Shake, shakeAt, track, wobble} from './motion';
import {useMotion} from './samples';
import {useShot} from './shot';

export type Vec3 = [number, number, number];

/**
 * Vertical field of view for a lens in mm on a full-frame sensor.
 * Tall formats use the sensor upright, as a phone or rotated camera would.
 */
export const lensFov = (mm: number, aspect: number) => {
	const sensorHeight = aspect < 1 ? 36 : 24;
	return MathUtils.radToDeg(2 * Math.atan(sensorHeight / (2 * mm)));
};

/** Camera distance at which a sphere of `radius` fits the frame in every format. */
export const fitDistance = (
	radius: number,
	fov: number,
	aspect: number,
	margin = 1.15,
) => {
	const halfVertical = MathUtils.degToRad(fov) / 2;
	const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
	return (radius * margin) / Math.sin(Math.min(halfVertical, halfHorizontal));
};

/** Camera distance at which something `width` wide fills the frame's width. */
export const fitWidth = (
	width: number,
	fov: number,
	aspect: number,
	margin = 1.12,
) => {
	const halfVertical = MathUtils.degToRad(fov) / 2;
	return ((width / 2) * margin) / (Math.tan(halfVertical) * aspect);
};

/** Width and height of the picture at a given distance from the camera. */
export const visibleAt = (distance: number, fov: number, aspect: number) => {
	const height = 2 * distance * Math.tan(MathUtils.degToRad(fov) / 2);
	return {width: height * aspect, height};
};

type Pose = {position: Vector3; target: Vector3; fov: number; roll: number};

const applyPose = (camera: PerspectiveCamera, {position, target, fov, roll}: Pose) => {
	camera.fov = fov;
	camera.position.copy(position);
	camera.up.set(0, 1, 0);
	camera.lookAt(target);
	if (roll !== 0) {
		camera.rotateZ(MathUtils.degToRad(roll));
	}
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld();
};

const addDrift = (pose: Pose, drift: number, time: number): Pose => {
	if (drift === 0) {
		return pose;
	}
	return {
		...pose,
		position: pose.position
			.clone()
			.add(
				new Vector3(
					wobble(11, time, 0.22) * drift,
					wobble(23, time, 0.19) * drift,
					wobble(37, time, 0.17) * drift,
				),
			),
		target: pose.target
			.clone()
			.add(
				new Vector3(
					wobble(41, time, 0.2) * drift * 0.4,
					wobble(53, time, 0.16) * drift * 0.4,
					0,
				),
			),
	};
};

const addShake = (pose: Pose, shake: Shake[] | undefined, time: number): Pose => {
	if (!shake || shake.length === 0) {
		return pose;
	}
	const [x, y, z] = shakeAt(time, shake, 61);
	const offset = new Vector3(x, y, z);
	return {...pose, position: pose.position.clone().add(offset), target: pose.target.clone().addScaledVector(offset, 0.6)};
};

export type CameraKey = {
	position: Vec3;
	target: Vec3;
	fov?: number;
	/**
	 * Seconds at which the camera passes this point. Give it on every key or on
	 * none: without it the keys are spread evenly over the move.
	 */
	at?: number;
};

export type PathCameraProps = {
	/** Points the camera passes through. */
	keys: CameraKey[];
	fov?: number;
	/** Pacing of the whole move, when the keys have no `at`. */
	easing?: (t: number) => number;
	/** Handheld-style movement, in world units. 0 is locked off. */
	drift?: number;
	roll?: number;
	/** Limits the move to part of the shot, in seconds, when the keys have no `at`. */
	start?: number;
	end?: number;
	/** Jolts from impacts, for example `[{at: 2.4, amount: 0.05}]`. */
	shake?: Shake[];
};

/**
 * Moves the camera smoothly through a list of positions and aim points. The
 * move is motion blurred, as through a real camera.
 */
export const PathCamera: React.FC<PathCameraProps> = ({
	keys,
	fov = 35,
	easing = EASE.glide,
	drift = 0,
	roll = 0,
	start,
	end,
	shake,
}) => {
	const camera = useThree((state) => state.camera) as PerspectiveCamera;
	const {duration} = useShot();
	const curves = useMemo(() => {
		const positions = keys.map((key) => new Vector3(...key.position));
		const targets = keys.map((key) => new Vector3(...key.target));
		return keys.length > 1
			? {
					position: new CatmullRomCurve3(positions, false, 'centripetal'),
					target: new CatmullRomCurve3(targets, false, 'centripetal'),
				}
			: null;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [JSON.stringify(keys)]);
	const timing: Key[] | null =
		keys.length > 1 && keys.every((key) => key.at !== undefined)
			? keys.map((key, index) => [key.at as number, index])
			: null;
	const from = start ?? 0;
	const to = end ?? duration;

	useMotion((time) => {
		// How far along the keys the camera is, from 0 to the last key's index.
		const segment = timing
			? track(time, timing)
			: easing(MathUtils.clamp((time - from) / Math.max(to - from, 1e-6), 0, 1)) * (keys.length - 1);
		const t = keys.length > 1 ? segment / (keys.length - 1) : 0;
		const index = Math.min(Math.floor(segment), Math.max(keys.length - 2, 0));
		const fovA = keys[index].fov ?? fov;
		const fovB = keys[Math.min(index + 1, keys.length - 1)].fov ?? fov;
		applyPose(
			camera,
			addShake(
				addDrift(
					{
						position: curves ? curves.position.getPoint(t) : new Vector3(...keys[0].position),
						target: curves ? curves.target.getPoint(t) : new Vector3(...keys[0].target),
						fov: MathUtils.lerp(fovA, fovB, segment - index),
						roll,
					},
					drift,
					time,
				),
				shake,
				time,
			),
		);
	});
	return null;
};

export type OrbitCameraProps = {
	target?: Vec3;
	distance: number;
	/** Distance at the end of the shot, for a slow push in or pull out. */
	endDistance?: number;
	/** Camera height above the target. */
	height?: number;
	fromDeg: number;
	toDeg: number;
	fov?: number;
	easing?: (t: number) => number;
	drift?: number;
	roll?: number;
	/** Jolts from impacts, for example `[{at: 2.4, amount: 0.05}]`. */
	shake?: Shake[];
};

/** Circles the camera around a point, with motion blur. */
export const OrbitCamera: React.FC<OrbitCameraProps> = ({
	target = [0, 0, 0],
	distance,
	endDistance,
	height = 0,
	fromDeg,
	toDeg,
	fov = 35,
	easing = EASE.steady,
	drift = 0,
	roll = 0,
	shake,
}) => {
	const camera = useThree((state) => state.camera) as PerspectiveCamera;
	const {fps, durationInFrames} = useShot();
	const centre = useMemo(() => new Vector3(...target), [target[0], target[1], target[2]]);
	useMotion((time) => {
		// The same progress as useShot(), but for any moment rather than whole frames.
		const progress = durationInFrames > 1 ? MathUtils.clamp((time * fps) / (durationInFrames - 1), 0, 1) : 0;
		const t = easing(progress);
		const angle = MathUtils.degToRad(MathUtils.lerp(fromDeg, toDeg, t));
		const radius = MathUtils.lerp(distance, endDistance ?? distance, t);
		applyPose(
			camera,
			addShake(
				addDrift(
					{
						position: new Vector3(
							centre.x + Math.sin(angle) * radius,
							centre.y + height,
							centre.z + Math.cos(angle) * radius,
						),
						target: centre,
						fov,
						roll,
					},
					drift,
					time,
				),
				shake,
				time,
			),
		);
	});
	return null;
};
