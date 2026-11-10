import * as opentype from 'opentype.js';
import {useMemo} from 'react';
import {BufferGeometry, ExtrudeGeometry, ShapePath} from 'three';
import {usePublicFile} from './assets';
import {softenBevels} from './geometry';

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
	/** How lines line up with each other when there are several. */
	align?: 'left' | 'center' | 'right';
	/**
	 * Moves words onto new lines so that no line is wider than this, in scene
	 * units. Useful in 9:16, where a long word or title would end up tiny.
	 */
	maxWidth?: number;
};

export type Letter = {
	char: string;
	index: number;
	count: number;
	line: number;
	/** Which word of the text the letter belongs to, counting from 0. */
	word: number;
	/** Centred on the letter, so that rotation pivots around its middle. */
	geometry: BufferGeometry;
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

/** Breaks text into lines no wider than `maxWidth`, at spaces. */
const wrapText = (font: opentype.Font, text: string, size: number, tracking: number, maxWidth: number) =>
	text
		.split('\n')
		.map((paragraph) => {
			const widthOf = (line: string) =>
				font.getAdvanceWidth(line, size) + Math.max(0, [...line].length - 1) * tracking * size;
			const lines: string[] = [];
			let line = '';
			for (const word of paragraph.split(' ')) {
				const longer = line ? `${line} ${word}` : word;
				if (line && widthOf(longer) > maxWidth) {
					lines.push(line);
					line = word;
				} else {
					line = longer;
				}
			}
			lines.push(line);
			return lines.join('\n');
		})
		.join('\n');

const layoutWord = (
	font: opentype.Font,
	source: string,
	{size = 1, depth = 0.2, bevel = 0.02, tracking = 0, lineHeight = 1.15, align = 'center', maxWidth}: WordOptions,
): WordLayout => {
	const scale = size / font.unitsPerEm;
	const letters: Letter[] = [];
	const lineWidths: number[] = [];
	const lineStarts: number[] = [];
	const text = maxWidth ? wrapText(font, source, size, tracking, maxWidth) : source;
	let word = -1;

	text.split('\n').forEach((line, lineIndex) => {
		let pen = 0;
		const firstOfLine = letters.length;
		let previous: opentype.Glyph | null = null;
		let inWord = false;

		for (const char of line) {
			if (char.trim() === '') {
				inWord = false;
			} else if (!inWord) {
				inWord = true;
				word++;
			}
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
				const geometry = softenBevels(
					new ExtrudeGeometry(glyphShapes(glyph, scale), {
						depth,
						curveSegments: 16,
						bevelEnabled: bevel > 0,
						bevelThickness: bevel,
						bevelSize: bevel,
						bevelOffset: -bevel * 0.5,
						bevelSegments: 8,
					}),
				);
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
					word,
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

		lineWidths.push(pen - tracking * size);
		lineStarts.push(firstOfLine);
	});

	if (letters.length === 0) {
		return EMPTY_LAYOUT;
	}

	// Line the lines up, with the whole block centred on x = 0.
	const block = Math.max(...lineWidths);
	lineWidths.forEach((width, line) => {
		const shift = align === 'left' ? -block / 2 : align === 'right' ? block / 2 - width : -width / 2;
		const end = line + 1 < lineStarts.length ? lineStarts[line + 1] : letters.length;
		for (let i = lineStarts[line]; i < end; i++) {
			letters[i].x += shift;
		}
	});

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
