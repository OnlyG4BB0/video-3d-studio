import {useMemo} from 'react';
import {Color, ExtrudeGeometry, Shape} from 'three';
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js';
import {usePublicFile} from './assets';

/** Reads an .svg from public/ as text. Returns null when no file is given. */
export const useSvgFile = (file?: string) =>
	usePublicFile(file, (response) => response.text());

export type SvgOptions = {
	/** Final width in world units. */
	width?: number;
	depth?: number;
	bevel?: number;
};

export type SvgPart = {geometry: ExtrudeGeometry; color: Color};

export type ExtrudedSvg = {
	parts: SvgPart[];
	/**
	 * Apply to the parent group as scale={[s, -s, s]}: SVG counts Y downwards and
	 * the negative scale turns it the right way up.
	 */
	scale: number;
	width: number;
	height: number;
};

const buildExtrudedSvg = (
	svg: string,
	{width = 2, depth = 0.2, bevel = 0.015}: SvgOptions,
): ExtrudedSvg => {
	const data = new SVGLoader().parse(svg);
	const shapes: {shape: Shape; color: Color}[] = data.paths.flatMap((path) =>
		path.toShapes().map((shape) => ({shape, color: path.color})),
	);
	if (shapes.length === 0) {
		throw new Error(
			'The SVG has no filled shapes. Convert strokes to outlines and try again.',
		);
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const {shape} of shapes) {
		for (const point of shape.getPoints(24)) {
			minX = Math.min(minX, point.x);
			maxX = Math.max(maxX, point.x);
			minY = Math.min(minY, point.y);
			maxY = Math.max(maxY, point.y);
		}
	}

	const scale = width / (maxX - minX);
	const centreX = (minX + maxX) / 2;
	const centreY = (minY + maxY) / 2;

	const parts = shapes.map(({shape, color}) => {
		const geometry = new ExtrudeGeometry(shape, {
			depth: depth / scale,
			curveSegments: 32,
			bevelEnabled: bevel > 0,
			bevelThickness: bevel / scale,
			bevelSize: bevel / scale,
			bevelOffset: -(bevel / scale) * 0.5,
			bevelSegments: 5,
		});
		geometry.translate(-centreX, -centreY, -depth / scale / 2);
		return {geometry, color};
	});

	return {parts, scale, width, height: (maxY - minY) * scale};
};

/** Turns the filled shapes of an SVG into solid 3D parts. */
export const useExtrudedSvg = (svg: string, options: SvgOptions = {}) =>
	useMemo(
		() => buildExtrudedSvg(svg, options),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[svg, JSON.stringify(options)],
	);
