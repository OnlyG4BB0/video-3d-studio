import type * as opentype from 'opentype.js';
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {AbsoluteFill} from 'remotion';
import {Color, InstancedMesh, Matrix4} from 'three';
import {
	Caption,
	EnvLight,
	lensFov,
	PathCamera,
	ShotMusic,
	ShotProps,
	SkyLight,
	Stage,
	SunLight,
	useFontFile,
	useRoundedBox,
	useShot,
	Vec3,
} from '../../kit';
import {FOOTER} from './common';

const COLUMNS = 130;
const ROWS = 84;
const COUNT = COLUMNS * ROWS;
const PITCH = 0.2;
const LENGTH = 8;
const RISE = 1.75;
// Both are fractions of the shot, so a longer clip keeps the same proportions.
const GATHER_START = 0.33;
const GATHER_LENGTH = 0.233;

export const filmMotionDefaults: ShotProps & {music: ShotMusic} = {
	format: 'wide',
	seconds: 12,
	// The big hit lands as the letters finish forming.
	music: {mood: 'build', hit: 0.585},
};

const useLetterMask = (font: opentype.Font | null, text: string, scale: number) =>
	useMemo(() => {
		const mask = new Float32Array(COUNT);
		if (!font) {
			return mask;
		}
		const fine = 4;
		const canvas = document.createElement('canvas');
		canvas.width = COLUMNS * fine;
		canvas.height = ROWS * fine;
		const context = canvas.getContext('2d', {willReadFrequently: true})!;
		const size = canvas.height * scale;
		const path = font.getPath(
			text,
			(canvas.width - font.getAdvanceWidth(text, size)) / 2,
			canvas.height * 0.5 + size * 0.35,
			size,
		);
		path.fill = '#ffffff';
		path.draw(context);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		for (let row = 0; row < ROWS; row++) {
			for (let column = 0; column < COLUMNS; column++) {
				let total = 0;
				for (let y = 0; y < fine; y++) {
					for (let x = 0; x < fine; x++) {
						total += pixels[((row * fine + y) * canvas.width + column * fine + x) * 4 + 3];
					}
				}
				mask[row * COLUMNS + column] = total / (255 * fine * fine);
			}
		}
		return mask;
	}, [font, text, scale]);

const smooth = (t: number) => {
	const c = Math.min(1, Math.max(0, t));
	return c * c * (3 - 2 * c);
};

const Field: React.FC<{mask: Float32Array}> = ({mask}) => {
	const {time, duration} = useShot();
	const begin = duration * GATHER_START;
	const gathering = duration * GATHER_LENGTH;
	const mesh = useRef<InstancedMesh>(null);
	const geometry = useRoundedBox(PITCH * 0.86, LENGTH, PITCH * 0.86, 0.024, 2);
	const scratch = useMemo(
		() => ({
			matrix: new Matrix4(),
			colour: new Color(),
			low: new Color('#3a4150'),
			middle: new Color('#a97a48'),
			high: new Color('#ffc477'),
		}),
		[],
	);

	useLayoutEffect(() => {
		const current = mesh.current;
		if (!current) {
			return;
		}
		const {matrix, colour, low, middle, high} = scratch;
		for (let row = 0; row < ROWS; row++) {
			for (let column = 0; column < COLUMNS; column++) {
				const at = row * COLUMNS + column;
				const x = (column - (COLUMNS - 1) / 2) * PITCH;
				const z = (row - (ROWS - 1) / 2) * PITCH;
				const distance = Math.hypot(x, z);

				const ripple =
					Math.sin(distance * 1.9 - time * 2.7) * Math.exp(-distance * 0.09) * 0.46 +
					Math.sin(x * 0.85 + time * 1.15) * Math.cos(z * 1.05 - time * 0.85) * 0.17;
				const gather = smooth((time - begin - distance * 0.1) / gathering);
				const letter = mask[at] * RISE + ripple * 0.1;
				const height = ripple + (letter - ripple) * gather;

				matrix.makeTranslation(x, height - LENGTH / 2, z);
				current.setMatrixAt(at, matrix);

				const level = Math.min(1, Math.max(0, (height + 0.55) / (RISE + 0.55)));
				colour.copy(low).lerp(middle, smooth(level * 2));
				colour.lerp(high, smooth(level * 2 - 1));
				const edge = smooth((Math.min(10.6, 13.3 - Math.abs(x)) + 1.5) / 6) * smooth((8.7 - Math.abs(z)) / 3);
				colour.multiplyScalar(edge);
				current.setColorAt(at, colour);
			}
		}
		current.instanceMatrix.needsUpdate = true;
		if (current.instanceColor) {
			current.instanceColor.needsUpdate = true;
		}
	});

	return (
		<instancedMesh
			ref={mesh}
			args={[geometry, undefined, COUNT]}
			castShadow
			receiveShadow
			frustumCulled={false}
		>
			<meshPhysicalMaterial metalness={0.82} roughness={0.34} clearcoat={0.3} clearcoatRoughness={0.3} />
		</instancedMesh>
	);
};

export const ChapterMotion: React.FC = () => {
	const {aspect, progress} = useShot();
	const font = useFontFile();
	const tall = aspect < 1;
	const mask = useLetterMask(font, '3D', tall ? 0.39 : 0.5);
	const fov = lensFov(40, aspect);
	const keys = tall
		? [
				{position: [-2.2, 17.5, 15.5] as Vec3, target: [0, 0, 0.9] as Vec3},
				{position: [1.2, 15.5, 14] as Vec3, target: [0, 0.4, 1] as Vec3},
			]
		: [
				{position: [-3.2, 11.2, 13] as Vec3, target: [0, 0, -0.3] as Vec3},
				{position: [1.8, 9.2, 11.6] as Vec3, target: [0, 0.4, -0.2] as Vec3},
			];

	return (
		<AbsoluteFill>
			<Stage
				background="#04050a"
				finish={{
					tone: 'neutral',
					bloom: 0.1,
					bloomThreshold: 1.3,
					bloomRadius: 0.5,
					contrast: 0.26,
					saturation: 1.12,
					vignette: 0.44,
					grain: 0.024,
					highlightLimit: 4,
					focus: {target: [0, 1, 0], aperture: 0.09},
				}}
			>
				<EnvLight preset="studio" intensity={0.9} diffuse={0.08} rotate={progress * 80} />
				<SkyLight intensity={0.5} centre={[0, 0, 0]} extent={14} mapSize={2048} />
				<SunLight
					position={[-11 + progress * 3, 4.6, -5 + progress * 2]}
					target={[0, 0, 0]}
					intensity={5.5}
					color="#ffdcb4"
					extent={15}
					softness={0.3}
					mapSize={4096}
					far={40}
				/>
				<Field mask={mask} />
				<PathCamera
					fov={fov}
					drift={0.02}
					keys={keys}
				/>
			</Stage>
			<Caption footer={FOOTER} index="04" title="MOTION" note={`${COUNT.toLocaleString('en-US')} columns driven by one formula, frame by frame`} />
		</AbsoluteFill>
	);
};
