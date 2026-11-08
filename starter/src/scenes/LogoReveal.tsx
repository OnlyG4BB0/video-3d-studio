import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {
	AuroraBackdrop,
	EASE,
	EnvLight,
	fitDistance,
	landing,
	lensFov,
	LOOKS,
	PathCamera,
	ShotProps,
	span,
	Stage,
	SunLight,
	useExtrudedSvg,
	useScratchMap,
	useShot,
	useSvgFile,
} from '../kit';

export type LogoRevealProps = ShotProps & {
	/** An .svg in public/. Without one, the placeholder mark below is used. */
	logoFile?: string;
	tagline: string;
	color: string;
	glow: string;
	backdrop: string;
};

export const logoRevealDefaults: LogoRevealProps = {
	format: 'square',
	seconds: 5,
	tagline: 'YOUR TAGLINE',
	color: '#dcdde2',
	glow: '#9fc0ff',
	backdrop: '#06070b',
};

const PLACEHOLDER_MARK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
	<path fill-rule="evenodd" d="M100 8 L180 54 L180 146 L100 192 L20 146 L20 54 Z
		M100 50 L58 74 L58 126 L100 150 L142 126 L142 74 Z"/>
	<path d="M100 76 L124 100 L100 124 L76 100 Z"/>
</svg>`;

export const LogoReveal: React.FC<LogoRevealProps> = ({
	logoFile,
	tagline,
	color,
	glow,
	backdrop,
}) => {
	const {frame, fps, time, duration, aspect, width} = useShot();
	const loadedSvg = useSvgFile(logoFile);
	const logo = useExtrudedSvg(loadedSvg ?? PLACEHOLDER_MARK, {
		width: 2,
		depth: 0.3,
		bevel: 0.03,
	});
	const wear = useScratchMap({seed: 31, repeat: [1.2, 1.2], amount: 1.2});
	const look = useMemo(
		() => ({...LOOKS.brushedMetal(color), roughness: 0.46}),
		[color],
	);

	const fov = lensFov(85, aspect);
	const radius = Math.hypot(logo.width, logo.height) / 2;
	const distance = fitDistance(radius, fov, aspect, 1.3);

	const turn = landing(frame, fps, 0.15, 'soft');
	const sweep = span(time, 0.2, duration * 0.72, EASE.glide);
	const taglineIn = span(time, duration * 0.55, duration * 0.8, EASE.arrive);
	const lightsUp = span(time, 0.5, 1.6, EASE.glide);

	return (
		<AbsoluteFill>
			<Stage
				background={backdrop}
				finish={{
					// A flat face can mirror a bright light all at once. These keep that
					// a glint rather than a flash that fills the frame.
					highlightLimit: 2.2,
					bloom: 0.16,
					bloomThreshold: 1,
					bloomRadius: 0.5,
					contrast: 0.22,
					saturation: 1.05,
					vignette: 0.45,
					grain: 0.028,
					beams: {density: 0.0011, reach: distance * 1.7, anisotropy: 0.55},
				}}
			>
				<AuroraBackdrop
					colors={['#04050a', '#0c1126', '#1c2548']}
					intensity={0.6}
					speed={0.1}
				/>
				{/* The reflections fade up, so the logo emerges from the dark as it turns. */}
				<EnvLight
					preset="night"
					intensity={interpolate(lightsUp, [0, 1], [0.1, 0.9])}
					diffuse={0.1}
					rotate={-70 + sweep * 110}
				/>
				{/* Crosses behind the logo, so shafts of light pour through its shape. */}
				<SunLight
					position={[interpolate(sweep, [0, 1], [-4.5, 3.5]), 1.1, -9]}
					target={[0, 0, 0]}
					intensity={8 * lightsUp}
					color={glow}
					extent={3.4}
					softness={0.25}
					mapSize={4096}
					far={26}
				/>
				<pointLight
					position={[interpolate(sweep, [0, 1], [-3.5, 3.5]), 0.6, 2.2]}
					intensity={5}
					color={glow}
				/>

				<group rotation={[0, (turn - 1) * 1.35, 0]}>
					<group scale={[logo.scale, -logo.scale, logo.scale]}>
						{logo.parts.map((part, index) => (
							<mesh key={index} geometry={part.geometry} castShadow receiveShadow>
								<meshPhysicalMaterial {...look} roughnessMap={wear} />
							</mesh>
						))}
					</group>
				</group>

				<PathCamera
					fov={fov}
					drift={0.01}
					keys={[
						{position: [0.5, 0.15, distance * 1.12], target: [0, 0, 0]},
						{position: [0, 0, distance], target: [0, 0, 0]},
					]}
				/>
			</Stage>

			<AbsoluteFill
				style={{
					alignItems: 'center',
					justifyContent: 'flex-end',
					paddingBottom: '13%',
				}}
			>
				<div
					style={{
						color: '#f2f3f6',
						fontFamily: 'Helvetica, Arial, sans-serif',
						fontWeight: 500,
						fontSize: width * 0.034,
						letterSpacing: '0.34em',
						marginRight: '-0.34em',
						opacity: taglineIn,
						transform: `translateY(${(1 - taglineIn) * width * 0.018}px)`,
					}}
				>
					{tagline}
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
