# Toolkit reference

Everything here is imported from `../kit` inside a scene. Lengths are in scene units: treat 1 unit as roughly 10 cm for a product and 1 m for a room.

## Contents

- Command line
- Shot basics
- Stage and picture finish
- Camera
- Light
- Materials and textures
- Geometry
- Text, logos and models
- Motion

## Command line

Run from the project folder. `--set name=value` overrides any prop of the shot and works the same in every shell. Write `\n` in text for a line break.

| Command | Purpose |
|---|---|
| `node tools/stills.mjs Shot --count 5` | Evenly spaced review images in `out/review/` |
| `node tools/stills.mjs Shot --frames 0,30,60 --scale 1` | Specific frames at full size |
| `node tools/check-motion.mjs Shot` | Scans every frame for flashes and jumps |
| `node tools/render.mjs Shot --out out/name.mp4` | Final MP4 |
| `node tools/render.mjs Shot --quality draft` | Half-size test render |
| `npm run check` | Type-check the code |
| `npm run studio` | Live preview in the browser, for the user |

All three tools take `--props-file shot.json` and `--gl angle` or `--gl swangle`. `render` and `check-motion` also take `--concurrency 2`.

Common props: `format` (`vertical`, `wide`, `square`), `seconds`, `fps`.

## Shot basics

Scene props extend `ShotProps`. Register each scene in `Root.tsx` with `calculateMetadata={fitShot}` and default props.

`useShot()` returns `frame`, `fps`, `width`, `height`, `aspect`, `durationInFrames`, `time` (seconds), `duration` (seconds), `progress` (0 on the first frame, 1 on the last) and `loop` (like progress but never reaches 1, for seamless cycles such as `Math.sin(loop * Math.PI * 2)`).

## Stage and picture finish

```tsx
<Stage background="#111" shadows finish={{tone: 'neutral', bloom: 0.1, vignette: 0.3, grain: 0.03}}>
  ...
</Stage>
```

| `finish` option | Meaning | Useful range |
|---|---|---|
| `tone` | `neutral` keeps colours true, `aces` adds contrast, `agx` is gentle on very bright scenes | |
| `exposure` | Overall brightness | 0.8 to 1.6 |
| `bloom` | Glow around highlights | 0 to 0.3, higher only for neon |
| `bloomThreshold` | How bright something must be to glow | 1 to 2.5 |
| `bloomRadius` | How far the glow spreads | 0.3 to 0.8 |
| `highlightLimit` | Caps extreme highlights, so a brief reflection cannot flood the frame | 2 for flat shiny things, default 6 |
| `vignette` | Darker corners | 0.2 to 0.45 |
| `grain` | Film grain, also hides banding | 0.02 to 0.04 |
| `focus` | `{target, aperture, maxBlur}` blurs what is away from `target` | aperture 0.001 to 0.006 |

## Camera

`lensFov(mm, aspect)` converts a lens to a field of view. `fitDistance(radius, fov, aspect, margin)` gives the distance that fits a sphere in any format, `fitWidth(width, fov, aspect, margin)` the distance that fits a width, and `visibleAt(distance, fov, aspect)` the size of the picture at a distance.

```tsx
<OrbitCamera target={[0, 1, 0]} distance={6} endDistance={5.6} height={0.7}
  fromDeg={-30} toDeg={25} fov={fov} drift={0.012} />

<PathCamera fov={fov} drift={0.02} keys={[
  {position: [3, 1.2, 4], target: [0, 1, 0]},
  {position: [2, 1, 3.4], target: [0, 1, 0], fov: 28},
]} />
```

Both accept `easing` and `roll`. `PathCamera` also accepts `start` and `end` in seconds. `drift` adds small handheld movement in world units.

## Light

`<EnvLight preset intensity rotate />` is image-based light and what shiny things reflect. Presets are `studio` (dark with softboxes), `showcase` (adds a large panel behind the camera for flat metal faces), `daylight`, `dusk` and `night`. Animate `rotate` to move highlights across a still object.

`<SunLight position target intensity color extent mapSize blur />` is the shadow-casting key. Set `extent` just large enough to cover the subject, because a smaller area gives finer shadows.

R3F's own lights work too: `<pointLight />`, `<hemisphereLight />`. They cast no shadows here.

## Materials and textures

```tsx
<meshPhysicalMaterial {...LOOKS.powderCoat('#1f4e46')} roughness={0.44} bumpMap={noise} bumpScale={0.35} />
```

`LOOKS` has `chrome`, `brushedMetal`, `gold`, `powderCoat`, `glossPlastic`, `ceramic`, `rubber`, `velvet`, `stone`, `plaster` and `glass`.

`useNoiseTexture({seed, repeat, periods, contrast})` makes grey noise for `bumpMap` or `roughnessMap`. `usePlankTexture({base, planks, repeat})` makes a timber floor. `useRadialFade(solidUntil)` makes an `alphaMap` that dissolves a floor into the background.

## Geometry

`useLathe(points, {segments, steps})` spins an outline into a solid. Give points as `[radius, height]` or `[radius, height, cornerRounding]`, from the bottom up, starting and ending at radius 0.

`useRoundedBox(width, height, depth, radius)` returns a box with soft edges. `<Cyclorama color radius height curve />` is a seamless studio backdrop that allows a full orbit.

## Text, logos and models

These hooks load files, so call them in the scene component, outside `<Stage>`.

```tsx
const font = useFontFile(fontFile);          // null while loading; default is Archivo Black
const word = useWord(font, 'HELLO', {size: 1, depth: 0.25, bevel: 0.02, tracking: 0.03});
// word.letters[i]: geometry, x, y, width, height, index, count, line
// word.width, word.height, word.bottom

const svg = useSvgFile(logoFile);            // null while loading or with no file
const logo = useExtrudedSvg(svg ?? FALLBACK, {width: 2, depth: 0.3, bevel: 0.025});
// logo.parts[i]: geometry, color. Put them in a group with scale={[logo.scale, -logo.scale, logo.scale]}

const model = useModelFile('product.glb', 2.6); // null while loading; stands on y = 0
// {model && <primitive object={model} />}
```

`useWord` stops the render with a clear error if the font lacks a character. SVGs must use filled shapes, so strokes need converting to outlines first. `usePublicFile(file, parse)` loads any other file type.

## Motion

- `span(time, start, end, easing)` goes from 0 to 1 between two times in seconds.
- `landing(frame, fps, delay, feel)` is a spring that may overshoot. `feel` is `firm`, `soft` or `bouncy`.
- `EASE` has `glide`, `arrive`, `depart` and `steady`.
- `wobble(seed, time, speed)` is smooth repeatable noise, about -1 to 1.
- `scatter(seed, index)` is a repeatable random number from 0 to 1, for placing things.
