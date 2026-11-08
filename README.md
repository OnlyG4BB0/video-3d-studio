<div align="center">

# Video 3D Studio

**Describe a shot. Get a rendered 3D video.**

A free, open-source [Claude Code](https://claude.com/claude-code) skill that writes 3D scenes as code,<br>
checks its own work, and renders MP4 clips on your computer.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Claude Code skill](https://img.shields.io/badge/Claude%20Code-skill-d97757.svg)

[Italiano](README.it.md)

<table>
<tr>
<td align="center"><img src="docs/demo/product.gif" width="170" alt="A green flask on a stone plinth with the camera orbiting around it"><br><sub>Product orbit</sub></td>
<td align="center"><img src="docs/demo/coffee.gif" width="170" alt="A red coffee cup on a saucer with the word BUONGIORNO"><br><sub>Custom scene from a brief</sub></td>
<td align="center"><img src="docs/demo/logo.gif" width="230" alt="A metal hexagonal logo turning into place with a light passing behind it"><br><sub>Logo reveal</sub></td>
</tr>
</table>
<table>
<tr>
<td align="center"><img src="docs/demo/title.gif" width="340" alt="Gold 3D letters spelling STUDIO standing up on a reflective floor"><br><sub>Kinetic title</sub></td>
<td align="center"><img src="docs/demo/room.gif" width="340" alt="A sunlit room with a table, a vase and leaf shadows on a wooden floor"><br><sub>Interior</sub></td>
</tr>
</table>

<sub>Compressed previews. Full-quality MP4s are attached to the <a href="https://github.com/OnlyG4BB0/video-3d-studio/releases/latest">latest release</a>.</sub>

</div>

## What it can do

- **Product shots.** Orbit around an object built in code, or drop in your own `.glb` model.
- **3D logo reveals.** Give it an `.svg` and it extrudes, lights and animates it, with an optional tagline.
- **Kinetic titles.** Solid letters animated one by one, in the built-in font or your own `.ttf` / `.otf`, with accented characters.
- **Rooms and atmospheres.** Sunlight, window shadows, moving leaf shadows.
- **Custom scenes.** Ask for something new and Claude models it from the kit's building blocks.
- **Every social format.** 9:16, 16:9 and 1:1 from the same scene, with framing that adapts.
- **Notes in plain language.** "Warmer light" or "slower camera" changes that one thing.

### It checks its own work

Before the final render, Claude looks at still frames of the shot, then a tool scans **every frame** for flashes and sudden jumps. That scan exists because of a real bug: while this kit was being built, a logo flashed white for a few frames that the sampled stills had missed.

### Everything runs on your machine

There are no subscriptions, render credits or uploads. Lights and materials are generated in code, so a render does not depend on external assets. You need internet only to install it, and for the browser Remotion downloads the first time.

## Install

You need [Claude Code](https://claude.com/claude-code) and [Node.js](https://nodejs.org) 18 or newer. A graphics card helps but is not required.

**macOS / Linux**

```bash
git clone https://github.com/OnlyG4BB0/video-3d-studio.git ~/.claude/skills/video-3d-studio
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/OnlyG4BB0/video-3d-studio.git "$HOME\.claude\skills\video-3d-studio"
```

Then open a new Claude Code session. Or paste this into Claude Code and let it do the work:

```text
Install the skill from https://github.com/OnlyG4BB0/video-3d-studio into my personal Claude Code skills folder.
```

## Use it

Just describe what you want:

```text
Make a 6-second vertical 3D video of a green flask on a stone plinth, warm studio light.
```

```text
5-second 16:9 title animation: the word MILANO in gold 3D letters.
```

```text
Animate my logo in 3D. The file is logo.svg, black background, "Since 1985" underneath.
```

```text
Use my product.glb for an 8-second square video with the camera circling it.
```

```text
A bright room in the morning with leaf shadows on the floor, 16:9, 8 seconds.
```

If the skill does not start on its own, add "use the video-3d-studio skill" to your request.

## How it works

```mermaid
flowchart LR
    A[Your description] --> B[Shot plan]
    B --> C[Scene code]
    C --> D[Review stills]
    D -->|something is off| C
    D --> E[Scan every frame]
    E -->|flash or jump| C
    E --> F[Render MP4]
```

Each shot is a [Remotion](https://www.remotion.dev) composition built with [three.js](https://threejs.org). The kit provides:

| Part | What it gives you |
|---|---|
| Camera | Real lens sizes, orbit and path moves, subtle handheld drift, framing that fits any format |
| Light | Procedural studio, showcase, daylight, dusk and night environments, plus soft shadows |
| Materials | Chrome, brushed metal, gold, powder coat, gloss plastic, ceramic, rubber, velvet, stone, plaster, glass |
| Geometry | Revolved shapes with rounded corners, soft boxes, seamless studio backdrops |
| Files | SVG extrusion, TTF/OTF letters, GLB models |
| Motion | Springs, easing, staggering, repeatable noise for renders that come out the same every time |
| Finish | Tone mapping, bloom, depth of field, vignette, film grain |

Claude reads the [workflow](SKILL.md), the [toolkit reference](references/toolkit.md) and the [notes on lens, light and timing](references/craft.md) as it needs them.

### Commands inside a project

| Command | Purpose |
|---|---|
| `node tools/stills.mjs Shot --count 5` | Review images |
| `node tools/check-motion.mjs Shot` | Scan every frame for flashes and jumps |
| `node tools/render.mjs Shot --out out/name.mp4` | Final MP4 |
| `npm run studio` | Live preview in the browser |

Any setting can be changed with `--set`, for example `--set format=vertical --set "text=HELLO"`.

## Good to know

**Tested on** Windows 11 with an RTX 3060 and Node.js 23.2, where clips of 5 to 8 seconds rendered in 14 to 26 seconds. macOS and Linux should work but have not been tested yet, so reports are welcome. Without a graphics card, expect much longer renders.

**Disk space.** Each project takes about 1 GB, and the first render in each project downloads a 130 MB headless browser.

**Current limits**

- There is no true motion blur, so very fast moves can look stepped.
- Lighting is real-time rather than ray traced. Light does not bounce by itself, so interiors are the least photorealistic scenes.
- SVG logos need filled shapes, so strokes must be converted to outlines first.

## Licences

The code and text in this repository are [MIT](LICENSE) licensed.

**Remotion has its own licence.** It is free for individuals, non-profits and companies of up to 3 people. Larger companies need a [company licence](https://www.remotion.dev/license).

The bundled Archivo Black font is under the [SIL Open Font License](starter/public/fonts/ArchivoBlack-OFL.txt).

This is an independent project, not affiliated with or endorsed by Anthropic, Remotion or three.js.
