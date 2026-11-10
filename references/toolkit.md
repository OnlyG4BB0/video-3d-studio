# Toolkit reference

Everything here is imported from `../kit` inside a scene. Lengths are in scene units: treat 1 unit as roughly 10 cm for a product and 1 m for a room.

## Contents

- Command line
- Shot basics
- Stage and picture finish
- Motion blur
- Camera
- Light
- Materials and textures
- Shaders
- Geometry
- Text, logos and models
- Animated text
- Motion
- Films and captions
- Music

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
| `node tools/render.mjs Shot --music` | Final MP4 with original music. A film uses each chapter's mood |
| `node tools/render.mjs Shot --music warm` | The same with one mood for the whole shot |
| `node tools/music.mjs Shot --mood warm` | Only the music, as a WAV in `out/music/`, with its levels |
| `node tools/stills.mjs Film --dissolves` | The middle of every dissolve in a film |
| `node tools/render.mjs Shot --range 60-120` | Only those frames, for a quick look at one moment |
| `node tools/render.mjs Shot --shutter 0` | Without motion blur. `--shutter 1` doubles it |
| `npm run studio` | Live preview in the browser, for the user |

`render` with `--music` and `music` also take `--seed 2` for other progressions and `--transpose 3` to move the key in semitones.

All three tools take `--props-file shot.json`, `--gl angle` or `--gl swangle`, and `--samples 32` to set the passes per frame. `stills` and `render` also take `--shutter`. The defaults are 24 for stills, 4 for the motion check, 12 for a draft and 64 for a final render. `render` and `check-motion` also take `--concurrency 2`.

Common props: `format` (`vertical`, `wide`, `square`), `seconds`, `fps`.

## Shot basics

Scene props extend `ShotProps`. Add each scene to `src/scenes/registry.ts` with its default props. That makes it a shot of its own and lets a film use it as a chapter.

`useShot()` returns `frame`, `fps`, `width`, `height`, `aspect`, `durationInFrames`, `time` (seconds), `duration` (seconds), `progress` (0 on the first frame, 1 on the last) and `loop` (like progress but never reaches 1, for seamless cycles such as `Math.sin(loop * Math.PI * 2)`).

## Stage and picture finish

```tsx
<Stage background="#111" shadows finish={{tone: 'neutral', bloom: 0.1, contrast: 0.2, vignette: 0.3}}>
  ...
</Stage>
```

| `finish` option | Meaning | Useful range |
|---|---|---|
| `tone` | `neutral` keeps colours true, `aces` adds contrast, `agx` is gentle on very bright scenes | |
| `exposure` | Overall brightness | 0.8 to 1.8 |
| `bloom` | Glow around highlights | 0 to 0.3 |
| `bloomThreshold` | How bright something must be to glow | 1 to 2.5 |
| `bloomRadius` | How far the glow spreads | 0.3 to 0.8 |
| `highlightLimit` | Caps extreme highlights, so a brief reflection cannot flood the frame | 2 for flat shiny things, default 6 |
| `focus` | `{target, aperture}` real lens blur around a point. `aperture` is in scene units | 0.01 subtle, 0.05 product, 0.1 strong |
| `beams` | `{density, reach, anisotropy}` visible shafts of light from the `SunLight` | density 0.001 to 0.01 |
| `contrast` | S-curve over the picture | 0.15 to 0.35 |
| `saturation` | 1 leaves colours unchanged | 1 to 1.2 |
| `warmth` | Positive is warmer | -0.05 to 0.05 |
| `fringe` | Lens colour fringing towards the corners | 0 to 0.002 |
| `vignette` | Darker corners | 0.2 to 0.45 |
| `grain` | Film grain, also hides banding | 0.02 to 0.04 |
| `grade` | A ready-made colour grade: `clean`, `teal-orange`, `warm-film`, `night`, `noir` or `pastel`. Options given with it override it | |
| `split` | `{shadows, highlights, amount}` pushes one colour into the darks and another into the lights | amount 0.06 to 0.16 |
| `lift` | Raises the blacks towards grey, for a softer filmic look | 0 to 0.06 |
| `shutter` | Motion blur, as a fraction of a frame. 0.5 matches most cameras | 0 to 1 |

`useEachSample(({pair, index, count}) => { ... })` runs before each of a frame's passes, for effects that should blur. `pair(seed)` returns two evenly spread numbers from 0 to 1, and `pointOnDisc(u, v)` turns them into a point on a disc. `KineticTitle` uses it to make its floor reflection glossy.

## Motion blur

Each pass of a frame is taken at its own moment within the shutter, so anything that moves during the frame smears as it would through a real camera. `PathCamera` and `OrbitCamera` blur on their own. For an object, move it with `useMoving` inside `<Stage>`:

```tsx
const Gear: React.FC<{speed: number}> = ({speed}) => {
  const mesh = useMoving<Mesh>((object, time) => {
    object.rotation.z = time * speed;
  });
  return <mesh ref={mesh} geometry={gear} />;
};
```

Work everything out from the `time` it is given, in seconds, never from the frame number, and do not also pass the properties it changes as props. `springAt(time - delay, feel)` and `track(time, keys)` give smooth values at any moment. `useMotion((time) => ...)` does the same for anything that is not a single object, such as a group of instances. Both run at the frame's own time too, so stills and React stay in step.

Scenes that use it: `KineticTitle` and `FilmTitle` (falling letters), `FilmMechanics` (gears), `LogoReveal` (the turn) and `FilmEnd` (pieces flying in).

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

Both accept `easing`, `roll` and `shake`. `PathCamera` also accepts `start` and `end` in seconds. `drift` adds small handheld movement in world units.

Give every key of a `PathCamera` an `at` in seconds to set when the camera passes it. The move then flows through the keys without stopping, speeding up and slowing down to meet each time, and `easing`, `start` and `end` no longer apply.

`shake={[{at: 2.4, amount: 0.04, length: 0.6}]}` jolts the camera at 2.4 seconds and lets it settle over 0.6. `amount` is in world units, so about 0.3% of the camera distance is noticeable. Pair it with a `boom` or `impact` cue at the same time.

## Light

`<EnvLight preset intensity diffuse rotate />` is image-based light and what shiny things reflect. Presets are `studio` (dark with softboxes), `showcase` (adds a large panel behind the camera for flat metal faces), `neon` (coloured tubes for liquid metal), `daylight`, `dusk` and `night`. `diffuse` is how much it also lights matte surfaces. It casts no shadows, so keep it at 0.05 to 0.1 when using a `SkyLight`. Animate `rotate` to move highlights across a still object.

`<SkyLight intensity zenith horizon centre extent axis spread />` is soft light from the whole sky that objects block, which gives natural darkening in corners and around contact points. For a room, aim `axis` out through the window and narrow `spread` to about 40. Set `extent` just large enough to cover the scene.

`<SunLight position target intensity color softness extent mapSize far />` is the main light. `softness` is the size of the light in scene units: shadows stay sharp at the point of contact and soften with distance. Set `extent` just large enough to cover the subject, because a smaller area gives finer shadows.

R3F's own lights work too: `<pointLight />`, `<hemisphereLight />`. They cast no shadows here.

## Materials and textures

```tsx
<meshPhysicalMaterial {...LOOKS.powderCoat('#1f4e46')} roughness={0.44} bumpMap={noise} bumpScale={0.35} />
```

`LOOKS` has `chrome`, `brushedMetal`, `gold`, `anodized`, `powderCoat`, `glossPlastic`, `carPaint`, `ceramic`, `pearl`, `oilSlick`, `liquidChrome`, `rubber`, `velvet`, `stone`, `plaster` and `glass`.

| Hook | Use it for |
|---|---|
| `useTimber({light, dark, planks, repeat})` | Boards. Returns `map`, `roughnessMap` and `bumpMap` to spread onto a material |
| `useScratchMap({repeat, amount})` | `roughnessMap` of fingerprints and hairline scratches, for metal and gloss |
| `useBrushedMap({repeat})` | `roughnessMap` of fine lines along U, for turned metal |
| `useRidgeMap(count)` | `bumpMap` of grip ridges around a turned part |
| `useWeaveMap({repeat})` | `bumpMap` of woven cloth |
| `useSpeckleMap({base, flecks, density, maxSize, repeat})` | Colour map for terrazzo or speckled glaze |
| `useNoiseTexture({seed, repeat, periods, contrast})` | Grey noise for `bumpMap` or `roughnessMap` |
| `usePrintMap(font, lines, color)` | Text printed on a transparent sleeve above an object |
| `useCanvasTexture(draw, {repeat, key})` | Anything you can draw with the 2D canvas API |
| `useRadialFade(solidUntil)` | `alphaMap` that dissolves a floor into the background |

Lathe UVs are in scene units, so `repeat: [24, 24]` means 24 tiles per unit. Use whole numbers so that the texture joins up around the seam.

## Shaders

`<AuroraBackdrop colors intensity speed seed />` draws slowly drifting folds of colour behind everything, for dark abstract scenes.

`useLiquidMaterial(look, {amplitude, frequency, speed})` makes a finely divided sphere ripple like slow liquid, with correct reflections and shadows:

```tsx
const liquid = useLiquidMaterial(LOOKS.oilSlick(), {amplitude: 0.6, frequency: 1.15});
<mesh material={liquid.material} customDepthMaterial={liquid.depthMaterial} castShadow>
  <icosahedronGeometry args={[1, 96]} />
</mesh>
```

For a custom look, patch a material with `onBeforeCompile` as `shaders.tsx` does, and drive it from `useShot().time`.

## Geometry

`useLathe(points, {segments, steps})` spins an outline into a solid. Give points as `[radius, height]` or `[radius, height, cornerRounding]`, from the bottom up, starting and ending at radius 0.

`useRoundedBox(width, height, depth, radius)` returns a box with soft edges. `<Cyclorama color radius height curve />` is a seamless studio backdrop that allows a full orbit. `softenBevels(geometry)` smooths bevels on extruded shapes so highlights roll around the edge. Text and SVG logos already use it. `<GlossyReflection gloss={0.08}>` holds a second copy of the objects, mirrored under a part-transparent floor, for a reflection that is crisp at contact and melts above it.

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

`useWord` also takes `align` (`left`, `center`, `right`) for several lines, and `maxWidth` in scene units to move words onto new lines, which keeps a long title readable in 9:16. Each letter has a `word` index as well as `index` and `line`.

`useWord` stops the render with a clear error if the font lacks a character. SVGs must use filled shapes, so strokes need converting to outlines first. `usePublicFile(file, parse)` loads any other file type.

## Animated text

`TextReveal` sets normal text over the picture and animates it in and out. Put it next to `<Stage>`, inside the scene's `AbsoluteFill`:

```tsx
<TextReveal text="Every frame *written in code*" at={0.8} until={5} effect="type" font="mono" accent="#ffb35c" />
```

| Prop | Meaning | Default |
|---|---|---|
| `text` | Use `\n` for a new line and `*asterisks*` around words to colour them with `accent` | |
| `at`, `until` | Seconds when it starts to appear and to leave. Without `until` it stays | 0.3 |
| `effect` | `rise` slides letters up out of a mask, `fade` drifts words into focus, `pop` springs letters up with a bounce, `type` is a typewriter with a cursor, `decode` settles random characters into the text, `none` just shows it | `rise` |
| `by` | `letter`, `word` or `line`: what appears one after another | `word` for fade, `letter` otherwise |
| `stagger`, `duration` | Seconds between pieces, and for each piece to arrive | |
| `cps` | Characters per second for `type` | 14 |
| `font` | `display` (the bundled Archivo Black), `body` or `mono` | `display` |
| `size` | Pixels on a frame whose shorter side is 1080, so it scales with every format | 72 |
| `place` | `center`, `top`, `bottom`, `lower-left`, `upper-left`, or `none` to place it yourself. In 9:16 each stays clear of the apps' buttons | `center` |
| `align`, `maxWidth`, `tracking`, `lineHeight`, `weight`, `color`, `shadow` | Typography. `maxWidth` is a fraction of the frame's width | |

`typingCue(text, at, cps)` makes the `typing` sound for a `type` reveal, with one key per character at the times they appear, and `typingLength(text, cps)` says how long the typing takes. Use the same three values as the `TextReveal`. `plainText(text)` removes the asterisks. `DISPLAY_FONT`, `BODY_FONT`, `MONO_FONT` and `useDisplayFont()` are there for other text.

## Motion

- `span(time, start, end, easing)` goes from 0 to 1 between two times in seconds.
- `landing(frame, fps, delay, feel)` is a spring that may overshoot. `feel` is `firm`, `soft`, `bouncy` or `snappy`.
- `springAt(seconds, feel)` is the same spring at any moment rather than whole frames, for `useMoving`: `springAt(time - delay, 'bouncy')`.
- `cascade(time, index, {start, stagger, length, easing})` is the progress of item `index` in a staggered sequence.
- `track(time, [[0, 0], [1.2, 5], [3, 2]])` passes smoothly through keyframes of `[seconds, value]`, without overshooting between them.
- `shakeAt(time, hits, seed)` is the offset of a camera shake, for moving things other than the camera.
- `EASE` has `glide`, `arrive`, `depart`, `steady`, `overshoot`, `swift` and `bounce`.
- `wobble(seed, time, speed)` is smooth repeatable noise, about -1 to 1.
- `scatter(seed, index)` is a repeatable random number from 0 to 1, for placing things.

## Films and captions

The `Film` shot plays a list of chapters. Its props can come from a JSON file with `--props-file`.

| Film prop | Meaning | Default |
|---|---|---|
| `format` | `wide`, `vertical` or `square` | |
| `chapters` | The list below | |
| `dissolve` | Seconds each chapter takes to dissolve into the next. 0 is a hard cut | 0.8 |
| `fadeIn`, `fadeOut` | Seconds from and to black at the two ends | 0.8, 1.2 |

| Chapter field | Meaning |
|---|---|
| `scene` | Its name in `src/scenes/registry.ts` |
| `seconds` | Its length, including the dissolve into the next chapter |
| `props` | Settings on top of the scene's defaults |
| `music` | `{mood, cues, hit}`, see Music |

The film is shorter than the sum of its chapters, by one dissolve at each join. To build a different film in code, render `<Chapters {...props} scenes={SCENES} />` in a new component and register it in `Root.tsx` with `calculateMetadata={({props}) => fitFilm({props: withSceneMusic(props, SCENES)})}`.

A scene can carry its own sounds: give its registry entry `music: (props) => ({mood, cues})`, worked out from the same constants as the animation. `Root.tsx` then adds them whenever the scene is a shot or a chapter, together with any mood and cues given for it, through `sceneMusic` and `withSceneMusic`. `KineticTitle` and `TitleCard` work this way.

`<Caption index="01" title="LIGHT" note="One line of explanation" footer="Shown only in 9:16" />` goes next to `<Stage>`, inside the scene's `AbsoluteFill`. Its title rises letter by letter and its note drifts in word by word, over a soft shade that keeps the words readable, clear of phone app buttons in 9:16.

## Music

| Mood | Character | Suits |
|---|---|---|
| `drone` | Dark and still, a few bells | Openings, titles, things emerging from black |
| `warm` | Gentle, soft bell arpeggios | Places, daylight, calm products |
| `clockwork` | Ticking and plucked notes | Watches, instruments, close-ups of detail |
| `groove` | Steady beat and bass line | Product ranges, anything that keeps moving |
| `build` | Tension rising to one big hit | Reveals and transformations |
| `dreamy` | Wide and weightless, scattered sparkles | Abstract and liquid shots |
| `drive` | Fast and mechanical | Machines, energy, the run-up to an ending |
| `resolve` | Settles on a major chord | Logos, end cards, the last chapter |
| `elegy` | Slow felt piano in A minor, strings, a music box when it is long enough | Memories, empty places, quiet endings |
| `lofi` | Electric piano over a lazy swung beat and record crackle | Coding, cosy rooms, night, anything relaxed |
| `epic` | Driving strings, big drums and brass rising to a hit | Trailers, launches, anything heroic |
| `synthwave` | Eighties arpeggios and pads that wait, then a gated beat at `hit` | Sunsets, starts, retro |
| `dnb` | Drum and bass at 172 bpm with a Reese bass | Speed, chases, racing |
| `halftime` | Slow heavy snare and sliding 808, silent for a moment at `hit` | Slow motion, tension, a big turn |
| `industrial` | Metal hits in sixteenths and a distorted kick, full from `hit` | Machines, engines, factories |
| `acid` | Four to the floor with a squelching line that opens up to `hit` | Revving, building speed |
| `ascent` | Rising arpeggios over big chords, drums from `hit` | Pull-outs, reveals, lift-off |
| `nightdrive` | A dark steady synth pulse with echoing plucks | Night, city lights, driving |
| `anthem` | Piano chords, big drums and a lead that resolves | End cards, the last chapter |

`build`, `epic`, `synthwave`, `halftime`, `industrial`, `acid` and `ascent` take `hit`, the moment of the big hit as a fraction of the chapter, for example `{"mood": "build", "hit": 0.6}`. `epic` moves it to the nearest bar line.

| Chapter option | Values |
|---|---|
| `ambience` | `rain`, `wind`, `night` (wind and distant crickets) or `vinyl`, under the whole chapter |
| `transition` | `whoosh` (the default), `impact`, `swell` or `none`: the sound as this chapter dissolves in |

A cue is one sound at one moment: `{"sound": "clank", "at": 1.2}` in seconds from the start of the chapter, or `{"sound": "bell", "progress": 0.5}` as a fraction of it. Use `progress` for anything that scales with the chapter's length.

| Sound | Options |
|---|---|
| `bell` | `note` as a MIDI number, `amp`, `pan` |
| `piano` | `note`, `amp`, `pan`. One felt piano note |
| `clank` | `pitch` in Hz, `amp`, `pan`. A metal object landing |
| `impact` | `amp`. A deep hit, which briefly lowers the music |
| `boom` | `amp`. A deep falling drop under a big moment, which briefly lowers the music |
| `riser` | `length` in seconds, `amp`. Climbs and ends at the cue's time |
| `swell` | `length`, `amp`. Rising air that ends at the cue's time, like a cymbal played backwards |
| `whoosh` | `length`, `amp`, `pan`. Air rushing past, loudest at the cue's time: a camera move, something flying by |
| `shimmer` | `length`, `amp`. Sparkles that gather, for something appearing |
| `pop` | `pitch`, `amp`, `pan`. A soft blip for something popping onto the screen |
| `key` | `amp`, `pan`. One keyboard key |
| `typing` | `text`, `cps`, `amp`. A key for each character, at the times a `type` reveal shows them. Make it with `typingCue` |
| `tick`, `kick`, `snare`, `taiko` | `amp`, `pan` |
| `creak` | `amp`, `pan`, `up`. A rusty chain at the end of a swing |
| `rain`, `wind`, `crickets` | `length`, `amp`. A bed of sound starting at the cue's time |
| `engine` | Arrays sampled `rate` times a second: `rpm`, `load`, `gain`, `side`, `delay` (Doppler), `squeal`, `road`, optional `scale` (slow motion), `turns` (crank turns, to match the picture), `mech`, `seed`, `amp`. A flat-six as a camera hears it. Make it with `engineCue` in `src/scenes/race/world.ts` |
| `starter` | `length`, `amp`. A starter motor turning the engine over |
| `crowd` | `length`, `amp`, `note` (seconds to a cheer). A crowd in the stands |
| `clunk` | `amp`. A heavy relay, such as start lights switching |

A shot on its own can carry the same `music` object in its default props, as the film's chapters do.

The mix runs at 48 kHz through a plate reverb, a look-ahead limiter and gentle dither. In a film, each chapter is first levelled against the others so that a quiet piano chapter does not vanish next to a drum-heavy one. The result lands at -14 LUFS with true peaks under -1 dBTP, the level social and streaming apps expect.
