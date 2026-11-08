# Making a shot look good

Use this when choosing a lens, a light or a timing. Treat these as starting points and trust what the stills show.

## Lens

| Lens | Good for | Effect |
|---|---|---|
| 24 to 35 mm | Rooms, places | Shows the space, exaggerates depth |
| 50 mm | Titles, general use | Close to natural sight |
| 70 to 100 mm | Products, logos | Flattens perspective, makes objects look expensive and calm |

Wide lenses close to a product make it look distorted and cheap, which is the most common way a product shot goes wrong.

## Camera move

Pick one move per shot and let it run. A viewer can follow a single idea in a few seconds, and combining an orbit, a push and a tilt makes all three harder to read.

| Intent | Move |
|---|---|
| Show an object's form | Partial orbit of 40 to 70 degrees |
| Build importance | Slow push in, about 5 to 10% of the distance |
| Reveal a space | Sideways slide past something close to the lens |
| Calm, premium | Almost still, with `drift` only |

A round object looks identical while it orbits, so the movement of its shadow and reflections is what sells the turn. Make sure those are visible.

Keep the camera slightly above or below the subject's centre, since dead-level views look like diagrams. `height` is in scene units and long lenses sit far away, so set it relative to the distance: about 0.25 to 0.3 times the distance gives a three-quarter view that looks into cups and onto tabletops. Use a small `drift`, around 0.3% of the camera distance: a perfectly locked camera reads as computer graphics.

## Framing per format

The kit's fitting helpers keep the subject inside the frame, but each format needs its own composition.

- **9:16:** tall objects fill it well and wide ones end up small. Break long words onto separate lines or shorten them. Keep important content out of the top 14% and bottom 20%.
- **16:9:** there is room beside the subject. Off-centre framing with space on one side works well, and leaves room for added text.
- **1:1:** the most forgiving for a centred subject. Logos suit it.

## Light

Start by getting the exposure right with `bloom: 0`, then add glow back. Bloom hides exposure problems and can wash out a whole picture if bright surfaces cross its threshold.

Use the two kinds of light for different jobs. `EnvLight` fills the scene and gives shiny things something to reflect, while `SunLight` gives shape and shadow. If the picture is flat, lower the environment and raise the sun. If shadows are too black, do the opposite.

A shadow falling across the ground anchors an object. Place the key to the side and above so that the shadow is visible to the camera.

**Metal only shows what it reflects.** A flat metal face pointing at the camera reflects whatever is behind the camera, so with a dark environment it renders black no matter how strong the lights are. Use the `showcase` preset, or turn the object so the face catches a softbox. Rotating the environment slowly sends highlights across the surface.

The reverse problem is a flash. While a flat shiny face turns, its whole surface can mirror a bright panel at the same moment, and bloom spreads that across the frame. For anything flat and shiny, raise roughness to about 0.4, use `highlightLimit: 2`, and keep bloom below 0.2.

Tone mapping changes colour. `aces` pushes saturated warm colours towards orange and can turn gold into copper, so use `neutral` when colours have to match a brand. `agx` handles bright windows and sky without harsh clipping.

For interiors, nothing bounces automatically. Add a `hemisphereLight` whose ground colour matches the floor, and a soft `pointLight` near windows. Keep shiny floors fairly rough or a point light will show as a hot spot on them.

To light a room with dappled sun, put shapes outside the window between the sun and the opening. A sky plane closer to the window hides them from the camera without blocking their shadows, as `MorningRoom` does.

## Materials

Nothing real is perfectly smooth or perfectly uniform. A faint `bumpMap` or `roughnessMap` from `useNoiseTexture` does more for realism than any amount of extra geometry.

Avoid pure white and pure black surfaces. Real paint and plastic sit around `#e8e8e8` at the bright end and `#1a1a1a` at the dark end, and values beyond those lose detail.

Dark glossy surfaces facing upwards, such as coffee, mirror the overhead light and turn grey. Lower `specularIntensity` to about 0.2 to keep their colour.

Round every edge a little, because catching a thin highlight along an edge is what makes an object look solid. The `bevel` option and the third value in lathe points do this.

## Timing

Give the eye time to arrive. Start the main action after about 0.2 to 0.4 seconds, and hold the finished picture for at least a second at the end so that it can be read.

Text needs roughly 0.3 seconds per word on screen, after it has fully landed.

When several things appear, stagger them by 0.05 to 0.12 seconds. All at once looks mechanical, and much slower drags.

Springs bring things to life: `bouncy` suits playful pieces, `firm` suits most things, and `soft` suits heavy or premium ones.

For a seamless loop, drive everything from `loop` with whole cycles of sine, and use a full 360-degree orbit with `EASE.steady`.

## Finish

Keep it subtle. If someone can name the effect, it is probably too strong.

| Look | bloom | vignette | grain |
|---|---|---|---|
| Clean product | 0.05 | 0.3 | 0.025 |
| Interior | 0.06 | 0.3 | 0.03 |
| Metal title | 0.14 | 0.4 | 0.03 |
| Glowing logo | 0.18 | 0.45 | 0.03 |
