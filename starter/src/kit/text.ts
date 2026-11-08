import * as opentype from 'opentype.js';
import {useMemo} from 'react';
import {ExtrudeGeometry, ShapePath} from 'three';
import {usePublicFile} from './assets';

export const DEFAULT_FONT_FILE = 'fonts/ArchivoBlack-Regular.ttf';

/**
 * Loads a .ttf or .otf from public/ (the built-in font if none is given) and
 * holds the render until it is ready. Returns null while it is loading.
 */
export const useFontFile = (file: string = DEFAULT_FONT_FILE) =>
	usePublicFile(file, async (response) =>
		opentype.parse(await response.arrayBuffer()),
	);

export type WordOptions = {
	size?: number;
	depth?: number;
	bevel?: number;
	/** Extra space between letters, as a fraction of the size. */
	tracking?: number;
	lineHeight?: number;
};

export type Letter = {
	char: string;
	index: number;
	count: number;
	line: number;
	/** Centred on the letter, so that rotation pivots around its middle. */
	geometry: ExtrudeGeometry;
	x: number;
	y: number;
	width: number;
	height: number;
};

export type WordLayout = {
	letters: Letter[];
	width: number;
	height: number;
	/** Lowest point of the text, for standing it on a floor. */
	bottom: number;
};

const EMPTY_LAYOUT: WordLayout = {letters: [], width: 0, height: 0, bottom: 0};

const glyphShapes = (glyph: opentype.Glyph, scale: number) => {
	const path = new ShapePath();
	for (const command of glyph.path.commands) {
		if (command.type === 'M') {
			path.moveTo(command.x * scale, command.y * scale);
		} else if (command.type === 'L') {
			path.lineTo(command.x * scale, command.y * scale);
		} else if (command.type === 'Q') {
			path.quadraticCurveTo(
				command.x1 * scale,
				command.y1 * scale,
				command.x * scale,
				command.y * scale,
			);
		} else if (command.type === 'C') {
			path.bezierCurveTo(
				command.x1 * scale,
				command.y1 * scale,
				command.x2 * scale,
				command.y2 * scale,
				command.x * scale,
				command.y * scale,
			);
		}
	}
	return path.toShapes();
};

const layoutWord = (
	font: opentype.Font,
	text: string,
	{size = 1, depth = 0.2, bevel = 0.02, tracking = 0, lineHeight = 1.15}: WordOptions,
): WordLayout => {
	const scale = size / font.unitsPerEm;
	const letters: Letter[] = [];
	const lineWidths: number[] = [];

	text.split('\n').forEach((line, lineIndex) => {
		let pen = 0;
		const firstOfLine = letters.length;
		let previous: opentype.Glyph | null = null;

		for (const char of line) {
			const glyph = font.charToGlyph(char);
			if (glyph.index === 0 && char.trim() !== '') {
				throw new Error(
					`The font has no "${char}" character. Choose another font or change the text.`,
				);
			}
			if (previous) {
				pen += font.getKerningValue(previous, glyph) * scale;
			}
			if (char.trim() !== '') {
				const geometry = new ExtrudeGeometry(glyphShapes(glyph, scale), {
					depth,
					curveSegments: 12,
					bevelEnabled: bevel > 0,
					bevelThickness: bevel,
					bevelSize: bevel,
					bevelOffset: -bevel * 0.5,
					bevelSegments: 5,
				});
				geometry.computeBoundingBox();
				const box = geometry.boundingBox!;
				const centreX = (box.min.x + box.max.x) / 2;
				const centreY = (box.min.y + box.max.y) / 2;
				geometry.translate(-centreX, -centreY, -(box.min.z + box.max.z) / 2);
				letters.push({
					char,
					index: letters.length,
					count: 0,
					line: lineIndex,
					geometry,
					x: pen + centreX,
					y: centreY - lineIndex * size * lineHeight,
					width: box.max.x - box.min.x,
					height: box.max.y - box.min.y,
				});
			}
			pen += (glyph.advanceWidth ?? 0) * scale + tracking * size;
			previous = glyph;
		}

		const width = pen - tracking * size;
		lineWidths.push(width);
		for (let i = firstOfLine; i < letters.length; i++) {
			letters[i].x -= width / 2;
		}
	});

	if (letters.length === 0) {
		return EMPTY_LAYOUT;
	}

	const top = Math.max(...letters.map((letter) => letter.y + letter.height / 2));
	const low = Math.min(...letters.map((letter) => letter.y - letter.height / 2));
	const middle = (top + low) / 2;
	for (const letter of letters) {
		letter.count = letters.length;
		letter.y -= middle;
	}

	return {
		letters,
		width: Math.max(...lineWidths),
		height: top - low,
		bottom: low - middle,
	};
};

/** Builds one 3D mesh per letter, so that each can be animated separately. */
export const useWord = (
	font: opentype.Font | null,
	text: string,
	options: WordOptions = {},
) =>
	useMemo(
		() => (font ? layoutWord(font, text, options) : EMPTY_LAYOUT),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[font, text, JSON.stringify(options)],
	);
