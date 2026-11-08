import {useThree} from '@react-three/fiber';
import React, {useLayoutEffect, useMemo} from 'react';
import {CatmullRomCurve3, MathUtils, PerspectiveCamera, Vector3} from 'three';
import {EASE, wobble} from './motion';
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

const useCameraPose = ({position, target, fov, roll}: Pose) => {
	const camera = useThree((state) => state.camera) as PerspectiveCamera;
	useLayoutEffect(() => {
		camera.fov = fov;
		camera.position.copy(position);
		camera.up.set(0, 1, 0);
		camera.lookAt(target);
		if (roll !== 0) {
			camera.rotateZ(MathUtils.degToRad(roll));
		}
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld();
	});
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

export type CameraKey = {position: Vec3; target: Vec3; fov?: number};

export type PathCameraProps = {
	/** Points the camera passes through, evenly spaced in time. */
	keys: CameraKey[];
	fov?: number;
	easing?: (t: number) => number;
	/** Handheld-style movement, in world units. 0 is locked off. */
	drift?: number;
	roll?: number;
	/** Limits the move to part of the shot, in seconds. */
	start?: number;
	end?: number;
};

/** Moves the camera smoothly through a list of positions and aim points. */
export const PathCamera: React.FC<PathCameraProps> = ({
	keys,
	fov = 35,
	easing = EASE.glide,
	drift = 0,
	roll = 0,
	start,
	end,
}) => {
	const {time, duration} = useShot();
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

	const from = start ?? 0;
	const to = end ?? duration;
	const linear = MathUtils.clamp((time - from) / Math.max(to - from, 1e-6), 0, 1);
	const t = easing(linear);

	const segment = t * (keys.length - 1);
	const index = Math.min(Math.floor(segment), Math.max(keys.length - 2, 0));
	const fovA = keys[index].fov ?? fov;
	const fovB = keys[Math.min(index + 1, keys.length - 1)].fov ?? fov;

	useCameraPose(
		addDrift(
			{
				position: curves
					? curves.position.getPoint(t)
					: new Vector3(...keys[0].position),
				target: curves ? curves.target.getPoint(t) : new Vector3(...keys[0].target),
				fov: MathUtils.lerp(fovA, fovB, segment - index),
				roll,
			},
			drift,
			time,
		),
	);
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
};

/** Circles the camera around a point. */
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
}) => {
	const {time, progress} = useShot();
	const t = easing(progress);
	const angle = MathUtils.degToRad(MathUtils.lerp(fromDeg, toDeg, t));
	const radius = MathUtils.lerp(distance, endDistance ?? distance, t);
	const centre = new Vector3(...target);
	useCameraPose(
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
	);
	return null;
};
