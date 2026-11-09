---
name: video-3d-studio
description: Makes rendered 3D video clips from code with Remotion and three.js on the user's own computer, delivered as MP4 in 9:16, 16:9 or 1:1. Covers product shots and turntables, 3D logo reveals, extruded title cards, ad B-roll, looping brand clips, interiors, longer multi-chapter films and showreels, and original generated soundtracks. Use this skill whenever someone asks for a 3D video, 3D animation, animated logo, logo intro, rendered product video, 3D film or showreel, or a 3D reel, short or TikTok, including Italian requests such as "video 3D", "animazione 3D", "logo animato", "film 3D" or "spot prodotto", even if they never mention Remotion or three.js and only describe the shot they want. Not for editing existing footage, flat 2D motion graphics, or interactive 3D websites.
---

# Video 3D Studio

Build each shot as code, check still frames of it, then render an MP4 on the user's machine. Talk to the user in their own language and in plain terms. Many people asking for this have never written code.

## 1. Get a project ready

Look for an existing project first: a folder with `tools/render.mjs` and `src/kit/`. If there is one, add a new scene to it.

Otherwise check `node --version` (18 or newer), then create a project in the user's current folder, named after the shot:

```bash
node <this-skill-folder>/scripts/new-project.mjs video-<subject>
```

Tell the user this takes a couple of minutes and about 1 GB of disk, and that the first render also downloads a 130 MB headless browser. Every later command runs from inside the project folder.

## 2. Pin down the shot

Work out format, length, subject, mood, colours, exact wording, and any logo or model files. Ask only about what would change the result and has no sensible default. Defaults: 9:16 for social media, 16:9 otherwise, 5 to 8 seconds, 30 fps.

Write a short plan for yourself before building, since a shot with one clear idea reads better than one with several:

- **Subject:** the one thing the viewer should look at
- **Camera:** lens and a single move
- **Light:** where it comes from and what it reveals
- **Beat:** the moment when the main thing happens, in seconds

Files the user supplies go in the project's `public/` folder.

## 3. Build from the closest scene

| The request is mainly about | Start from | Takes |
|---|---|---|
| One object or product | `src/scenes/ProductOrbit.tsx` | `modelFile`, `color`, `backdrop` |
| A word or short title | `src/scenes/KineticTitle.tsx` | `text`, `fontFile`, `color`, `backdrop` |
| A logo | `src/scenes/LogoReveal.tsx` | `logoFile`, `tagline`, `color`, `glow`, `backdrop` |
| A room, place or atmosphere | `src/scenes/MorningRoom.tsx` | `wall`, `accent` |
| Something abstract, liquid or shader-driven | `src/scenes/LiquidForm.tsx` | `look` |
| Several ideas, or more than about 15 seconds | `src/scenes/Film.tsx`, see "Longer films" below | `chapters`, `dissolve` |

If the request only changes those settings, pass them with `--set` and leave the code alone. Otherwise copy the scene to a new file, add it to `src/scenes/registry.ts`, and change the copy, so the examples stay available as references.

Before writing scene code, read `references/toolkit.md`, which lists what the kit provides. For decisions about lens, light, material and timing, read `references/craft.md`.

Without a model file, build the object from the kit's pieces: `useLathe` for anything round, `useRoundedBox` for anything boxy, `useExtrudedSvg` for flat silhouettes, grouped together. Small details such as seams, rings, grip ridges, printed text and slightly rounded edges are what make a simple model believable, so give every object a few of them and a surface map from the kit. A plain colour on a smooth shape always looks like a placeholder.

### What keeps a render correct

Remotion renders frames out of order and in several browser tabs at once, so a frame cannot depend on the one before it:

- Compute everything that changes from `useShot()`. `useState`, `useFrame` animation, `Math.random()` and `Date` give flicker or jumps, so use `wobble` and `scatter` for randomness.
- Load only from `public/`, through `usePublicFile` or the hooks built on it. A render must not depend on the network.
- Keep 3D inside `<Stage>`. It owns the render pipeline, so do not add a second render loop or set tone mapping elsewhere.
- Every frame is drawn many times and averaged, which is where soft shadows, real focus blur and clean edges come from. Anything that should blur within a frame goes in `useEachSample`.
- Put small text in a normal `AbsoluteFill` above the Stage, as `LogoReveal` does. It stays sharper than 3D text at small sizes.

## 4. Check stills before rendering

```bash
npm run check
node tools/stills.mjs <Shot> --set format=vertical --count 5
```

Open every image the command lists and look at it. You cannot watch a video, so stills are how you see the shot. To judge motion, request frames close together around the beat, for example `--frames 20,24,28,32`.

Look for:

- The subject is in frame and clear of the edges on the first frame, the last frame and the middle of the move.
- In 9:16, nothing important sits in the top 14% or bottom 20%, where phone apps put their buttons.
- Highlights keep their detail and the picture is not washed out or muddy.
- Text is spelled correctly and every letter has appeared by the time it should be readable.
- Nothing floats, pokes through something else, or casts a shadow with visible stepping.

When something is off, change one thing and check again, so you can tell what fixed it. `references/troubleshooting.md` lists the usual symptoms and fixes.

Then scan every frame for flashes and jumps, using the same `--set` values:

```bash
node tools/check-motion.mjs <Shot> --set format=vertical
```

Stills sample only a few moments, so a flash lasting a few frames slips between them. Flat shiny surfaces are the usual cause, because they can mirror a bright light all at once. If the command reports `CHECK`, look at the frames it names and fix them before rendering, unless the sudden change is intended, such as a deliberate cut.

## 5. Render

```bash
node tools/render.mjs <Shot> --set format=vertical --out out/<name>.mp4
```

Use `--quality draft` for a half-resolution test. At full quality, shots of 5 to 8 seconds took 36 to 88 seconds on a desktop graphics card. Without one the tools drop to 4 passes per frame, which is much rougher and still far slower, so tell the user and run long renders in the background.

Give the user the path to the MP4, its format and length, and how long it took. Be clear that you checked stills and frame-to-frame changes, and did not watch the video play.

## 6. Handle notes

Apply exactly what the user asked for and leave everything else alone, so a note like "warmer light" does not also change the framing. Check stills again, then re-render.

## Longer films

A video with several ideas, or longer than about 15 seconds, works better as a film of short chapters. Each chapter is an ordinary scene with its own camera, light and timing. `src/scenes/Film.tsx` plays them in order and dissolves each into the next, and inside a chapter `useShot()` counts from the start of that chapter, so any scene works unchanged.

If the existing scenes are enough, write the film as a JSON file, with no code at all:

```json
{
  "format": "wide",
  "chapters": [
    {"scene": "KineticTitle", "seconds": 4, "props": {"text": "NORDA"}, "music": {"mood": "drone"}},
    {"scene": "ProductOrbit", "seconds": 6, "music": {"mood": "groove"}},
    {"scene": "LogoReveal", "seconds": 5, "props": {"tagline": "NEW"}, "music": {"mood": "resolve"}}
  ]
}
```

Pass it to every tool with `--props-file film.json`. For a chapter that needs new code, add a scene to `src/scenes/registry.ts` and use its name here. `src/scenes/film/` is a complete 90-second example to learn from and copy: a title, a day of moving sunlight, a watch built in code, nine materials, thousands of animated columns, liquid metal, gears and an end card.

Work in this order, because a mistake found late costs the most:

1. Build and check each chapter alone. Every scene is also a shot of its own: `node tools/stills.mjs FilmLight --count 4`.
2. Check the joins. `node tools/stills.mjs Film --props-file film.json --dissolves` renders the middle of every dissolve.
3. Scan the whole film with `check-motion`, then render a `--quality draft` to confirm the order and pacing.
4. Run the final render in the background. The 90-second example took 16 to 23 minutes on a desktop graphics card.

Aim for 8 to 15 seconds per chapter and one idea in each. Any chapter can also become a vertical clip with its own music: `node tools/render.mjs FilmMotion --set format=vertical --set seconds=15 --music`. Look at stills in that format first, since a wide composition often needs its own camera when `aspect < 1`.

## Music

Add `--music` to the render command to compose an original soundtrack and put it in the MP4. Do this when the user wants sound. It is synthesised from scratch, with no recordings or samples, and takes seconds.

In a film each chapter names a `mood`. For a single shot, name it on the command line: `--music warm`. The moods and their uses are in `references/toolkit.md`. Cues place individual sounds at exact moments so that they land with the picture. Work out their times from the same numbers as the animation, as `src/scenes/film/Title.tsx` does for its falling letters.

**You cannot hear the result.** The command prints the overall loudness and the level of each section, which catches a silent or overpowering chapter and nothing more. Tell the user you checked levels and timing but could not listen, and ask them to judge it. If they do not like it, `--seed 2` picks other progressions, `--transpose 3` moves the key, and the mood can be changed. A new version takes seconds with `node tools/music.mjs`, which saves a WAV the user can listen to before anything is re-rendered. Do not promise that automatic copyright systems on social platforms will never flag it.

## Limits to be upfront about

- You cannot hear generated music, or watch video play. Say which checks you did.
- There is no true motion blur, so very fast moves can look stepped. Keep them moderate, or try `--set fps=60`.
- Lighting is not full ray tracing. Shadows and sky occlusion are soft and accurate, but light does not bounce by itself, so interiors need added fill light.
- Remotion has its own licence: free for individuals and for companies of up to 3 people, while larger companies need a paid licence from remotion.dev. Mention this if the user seems to be working for a company.
