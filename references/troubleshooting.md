# Troubleshooting

## What the picture looks like

| Symptom | Likely cause | Fix |
|---|---|---|
| Whole picture white or foggy | `beams.density` too high | Start at 0.002 and raise it slowly |
| Picture milky around bright areas | Bloom catching large bright areas | Raise `bloomThreshold` to 2 or more, then lower `bloom` |
| Colours washed out | Environment lighting matte surfaces | Lower `diffuse` on `EnvLight` to 0.05 to 0.1 |
| Objects look pasted on | No shading where they meet the ground | Add a `SkyLight` |
| Soft shadows show steps or several outlines | Too few passes | Raise `--samples`, or reduce `softness` |
| Bright patches on a ceiling | Light coming from below | Sky light is kept above the horizon, so check other lights |
| Liquid surface looks crumpled | Too much fine detail | Lower `frequency`, raise `amplitude` |
| Metal looks black with thin coloured lines | Base colour too dark | Use a light colour on metal |
| Metal face is black | Nothing to reflect | Use the `showcase` preset, or rotate the object or environment |
| Gold looks orange | `aces` tone mapping or a warm environment | Use `tone: 'neutral'` and a white-lit preset |
| Hot white spot on a floor | Point light reflecting on a shiny surface | Raise floor roughness or remove the light |
| Hard line where floor meets background | Floor ends in a visible horizon | Use `Cyclorama`, or a circle floor with `useRadialFade` |
| Interior looks flat | Too much even fill | Lower the hemisphere light and raise the sun |
| Shadows blocky | Shadow area too big | Reduce `extent` or raise `mapSize` to 4096 |
| Texture stretched on a turned object | Repeat too low for scene-unit UVs | Raise `repeat`, using whole numbers |
| Dark stripes on lit surfaces | Shadow bias | Set `bias` closer to -0.001 |
| Thin bright line in the corner of a room | Light leaking where two walls meet | Add `shadowSide={FrontSide}` to the wall material |
| Subject too small in 9:16 | Fit limited by something wide | Use a smaller radius in `fitDistance` when `aspect < 1` |
| Letters reflected too strongly | Bright copy under a thin floor | Raise the floor's `opacity` |
| A face or dial looks like a blank mirror | A lathe outline closes over it, because the outline must end on the axis | End the outline below the face, then place the face above it |
| Wood or a texture shows rays from the centre | Lathe UVs run around the shape | Lay a flat circle with its own map on top |
| Clip looks square after uploading to Instagram | The website crops video to 1:1 by default | Open the crop menu in the upload window and choose 9:16 |

## What the motion looks like

| Symptom | Likely cause | Fix |
|---|---|---|
| `check-motion` reports a flash | A flat shiny face mirroring a bright light, spread by bloom | Fade the light up after the turn, lower `highlightLimit` to 2, raise roughness to 0.4, keep bloom below 0.2 |
| Flicker or jumps between frames | Something depends on state or randomness | Compute it from `useShot()`, `wobble` or `scatter` |
| Everything looks frozen | Value not derived from the frame | Use `time`, `progress` or `frame` |
| A fast object shows several separate copies | Too few passes for how far it moves in one frame | Check the final render, which uses 64 passes, raise `--samples`, or slow the move |
| Something fast stays sharp while the camera blurs | It is moved through React props, which only change once per frame | Animate it with `useMoving` inside `<Stage>`, from the `time` it is given |
| Everything looks too smeared | The shutter is open too long for the speed | Lower `finish.shutter` to 0.25, or render with `--shutter 0.25` |
| `check-motion` reports a long stretch in spinning parts | A wheel turns too far each frame and strobes | Keep the fastest part under about 10 degrees per frame |
| A sound arrives before or after its moment | The cue time was typed by hand, or the chapter's length changed | Compute `at` from the animation's constants, or use `progress` |
| Typing sounds do not match the letters | The cue's text, start or speed differs from the `type` reveal | Make the cue with `typingCue(text, at, cps)`, using the same three values as the `TextReveal` |
| One chapter of music is much louder or quieter | A cue or ambience is much louder than its mood | Compare the levels that the music tool prints, then change the cue's `amp`. Chapters are already levelled against each other |
| The music tool reports a large limiter figure | A deep hit or drum is far louder than the rest | Above about 5 dB, lower that cue's `amp` |

`check-motion` measures how much the brightness of each frame differs from the one before, on a scale of 0 to 255, and flags 15 or more. Ordinary movement in the example scenes stayed below 9.

## Errors

| Message | Fix |
|---|---|
| `No shot called "X"` | The message lists valid names. Check `src/Root.tsx` |
| `No scene called "X"` in a film | Use a name from `src/scenes/registry.ts`. The message lists them |
| `Chapter "X" lasts ... no longer than its dissolve` | Lengthen the chapter or shorten `dissolve` |
| `Unknown mood "X"`, `Unknown cue sound "X"`, `Unknown ambience` or `Unknown transition` | The message lists the valid names |
| `This component has to be placed inside <Stage>` | `useMoving`, `useMotion` and `useEachSample` only work inside the Stage. Move them into a small component that the Stage contains, as `Turning` in `LogoReveal.tsx` does |
| `The music has an invalid sample` | An instrument produced NaN, usually from a power of a negative number in a custom sound. Keep envelope inputs at 0 or more |
| `Could not add the music to the video` | The WAV is in `out/music/` and the picture in `out/*.no-sound.mp4`. Check the disk space, then run the render again |
| `The font has no "X" character` | Pick a font that includes it. The default font covers Western European accented letters |
| `public/X was not found` | Put the file in `public/` and pass the name relative to that folder |
| `The SVG has no filled shapes` | Convert strokes to outlines in the design tool |
| WebGL or GPU errors | The tools fall back to software rendering automatically. To force it, use `--gl swangle` |
| Render times out or runs out of memory | Lower `--samples` or `--concurrency` to 1, reduce `mapSize`, or use fewer objects |
| `Unexpected end of JSON input` from webpack | Check that `concatenateModules: false` is still set in `tools/lib.mjs` and `remotion.config.ts` |
| `npm install` fails | Check the Node version, the network connection and the disk space, then run it again in the project |
