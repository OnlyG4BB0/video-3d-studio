import React, {useMemo} from 'react';
import {LatheGeometry, Vector2} from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
 */
export const useLathe = (
	points: ProfilePoint[],
	{segments = 160, steps = 8}: {segments?: number; steps?: number} = {},
) =>
	useMemo(
		() => new LatheGeometry(roundedProfile(points, steps), segments),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[JSON.stringify(points), segments, steps],
	);

export const useRoundedBox = (
	width: number,
	height: number,
	depth: number,
	radius = 0.03,
	segments = 4,
) =>
	useMemo(
		() => new RoundedBoxGeometry(width, height, depth, segments, radius),
		[width, height, depth, radius, segments],
	);

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
