import React, {useMemo} from 'react';
import {BufferGeometry, LatheGeometry, Vector2, Vector3} from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** [radius, height] or [radius, height, cornerRounding]. */
export type ProfilePoint = [number, number] | [number, number, number];

/** Turns a list of points into an outline with softly rounded corners. */
export const roundedProfile = (points: ProfilePoint[], steps = 8) => {
	const output: Vector2[] = [];
	points.forEach((point, index) => {
		const here = new Vector2(point[0], point[1]);
		const rounding = point[2] ?? 0;
		if (index === 0 || index === points.length - 1 || rounding === 0) {
			output.push(here);
			return;
		}
		const previous = new Vector2(points[index - 1][0], points[index - 1][1]);
		const next = new Vector2(points[index + 1][0], points[index + 1][1]);
		const toPrevious = previous.clone().sub(here);
		const toNext = next.clone().sub(here);
		const reach = Math.min(
			rounding,
			toPrevious.length() * 0.5,
			toNext.length() * 0.5,
		);
		const start = here.clone().add(toPrevious.setLength(reach));
		const end = here.clone().add(toNext.setLength(reach));
		for (let step = 0; step <= steps; step++) {
			const t = step / steps;
			const a = start.clone().lerp(here, t);
			const b = here.clone().lerp(end, t);
			output.push(a.lerp(b, t));
		}
	});
	return output;
};

/**
 * Solid of revolution. List the outline from the bottom up, starting and ending
 * on the axis (radius 0), so that the surface faces outwards.
 *
 * UVs are in scene units, so a texture with repeat [8, 8] tiles 8 times per unit
 * whatever the object's shape, and whole numbers join up around the seam.
 */
export const useLathe = (
	points: ProfilePoint[],
	{segments = 160, steps = 8}: {segments?: number; steps?: number} = {},
) =>
	useMemo(() => {
		const profile = roundedProfile(points, steps);
		const geometry = new LatheGeometry(profile, segments);

		const distances = [0];
		for (let i = 1; i < profile.length; i++) {
			distances.push(distances[i - 1] + profile[i].distanceTo(profile[i - 1]));
		}
		const widest = Math.max(...profile.map((point) => point.x));
		const around = Math.max(1, Math.round(2 * Math.PI * widest));

		const uv = geometry.attributes.uv;
		for (let ring = 0; ring <= segments; ring++) {
			for (let j = 0; j < profile.length; j++) {
				const at = ring * profile.length + j;
				uv.setXY(at, (ring / segments) * around, distances[j]);
			}
		}
		uv.needsUpdate = true;
		return geometry;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [JSON.stringify(points), segments, steps]);

export const useRoundedBox = (
	width: number,
	height: number,
	depth: number,
	radius = 0.03,
	segments = 6,
) =>
	useMemo(
		() => new RoundedBoxGeometry(width, height, depth, segments, radius),
		[width, height, depth, radius, segments],
	);

/**
 * Smooths the normals across the small facets of a bevel so that highlights roll
 * around the edge, while keeping large flat faces perfectly flat.
 */
export const softenBevels = <T extends BufferGeometry>(
	geometry: T,
	flatAxis: Vector3 = new Vector3(0, 0, 1),
) => {
	const result = toCreasedNormals(geometry, Math.PI / 4);
	const position = result.attributes.position;
	const normal = result.attributes.normal;
	const a = new Vector3();
	const b = new Vector3();
	const c = new Vector3();
	const faceNormal = new Vector3();
	for (let i = 0; i < position.count; i += 3) {
		a.fromBufferAttribute(position, i);
		b.fromBufferAttribute(position, i + 1);
		c.fromBufferAttribute(position, i + 2);
		faceNormal.copy(c.sub(b).cross(a.sub(b))).normalize();
		const alignment = faceNormal.dot(flatAxis);
		if (Math.abs(alignment) > 0.9999) {
			const sign = Math.sign(alignment);
			for (let v = 0; v < 3; v++) {
				normal.setXYZ(i + v, flatAxis.x * sign, flatAxis.y * sign, flatAxis.z * sign);
			}
		}
	}
	normal.needsUpdate = true;
	return result;
};

export type CycloramaProps = {
	color: string;
	radius?: number;
	height?: number;
	curve?: number;
	roughness?: number;
};

/**
 * A seamless photo-studio backdrop: a floor that curves up into a wall all the
 * way around, so the camera can orbit freely without ever finding a horizon.
 */
export const Cyclorama: React.FC<CycloramaProps> = ({
	color,
	radius = 12,
	height = 30,
	curve = 8,
	roughness = 0.75,
}) => {
	const outer = radius + curve;
	const geometry = useLathe(
		[
			[outer, height],
			[outer, 0, curve],
			[radius - 0.25, 0],
			[0, 0],
		],
		{segments: 128, steps: 28},
	);
	return (
		<mesh geometry={geometry} receiveShadow>
			<meshStandardMaterial color={color} roughness={roughness} />
		</mesh>
	);
};
