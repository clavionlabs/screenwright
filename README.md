# Screenwright — Clavion Labs Fork

[![Forked from](https://img.shields.io/badge/forked%20from-guidupuy%2Fscreenwright-blue)](https://github.com/guidupuy/screenwright)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Turn Playwright E2E tests into polished product demo videos — with unified TTS audio, versioned output, and production-grade rendering fixes.

This is the [Clavion Labs](https://github.com/clavionlabs) fork of [screenwright](https://github.com/guidupuy/screenwright) v0.3.0, extended for the **CPPA** (Conscious Physicians Psychedelic Academy) product walkthrough video pipeline.

## What Changed from Upstream

### Unified TTS Audio Pipeline
**Problem:** Upstream generates separate TTS audio for each narration segment (20+ API calls). Each call starts from a slightly different model state, causing audible pitch and tone inconsistency between segments.

**Solution:** Single TTS call for the entire script. Segment texts are joined with `\n\n...\n\n` separators (which the voice model interprets as natural pauses), then `ffmpeg silencedetect` identifies pause boundaries to map timing back to individual segments.

- `narration-preprocess.js` — Complete rewrite: `generateFullNarration()` replaces `pregenerateNarrations()`
- `action-helpers.js` — First segment carries the audio file reference; subsequent segments get `null` (Remotion plays one continuous audio track)

### Remotion Composition Fix (FPS + Chrome Frame)
**Problem:** Remotion's webpack bundler silently fails to execute `calculateMetadata`, causing fps/width/height to revert to defaults (30fps, wrong dimensions). Videos play back too fast and lack the browser chrome frame.

**Solution:** After `selectComposition()`, we override the composition object directly with values computed from the timeline metadata.

- `render.js` — Adds `CHROME_HEIGHT = 72` to viewport height, sets `composition.fps` from timeline, uses `totalOutputFrames()` for duration, multi-threaded rendering (75% of CPU cores)

### Versioned Output Directories
**Problem:** Upstream writes to a temp directory that gets cleaned up. Audio files, frames, and renders are lost between runs.

**Solution:** Every render creates a versioned directory: `output/<scenario>/v1/`, `v2/`, etc.

```
output/cppa-member-dashboard/
  v1/
    script.md          # Narration script with voice prompt + all segments
    audio/             # narration-full.wav + narration-manifest.json
    frames/            # Captured screenshots (with dedup)
    render.mp4         # Final composed video
  v2/
    ...
```

- `compose.js` — Major rewrite with `nextVersionDir()`, `findPreviousAudioDir()`, `--reuse-audio` flag, script.md generation
- `instrumented-page.js` — Accepts `opts.outputDir` to write frames into the version directory

### Performance Optimizations
- **Frame deduplication:** MD5 hash each screenshot, skip disk write if identical to previous frame (84% dedup rate achieved — 2111 of 2515 frames were static)
- **DPR=1 capture:** Record at device pixel ratio 1 during Playwright capture; Remotion's `scale: 2` handles final upscaling to 2x resolution
- **GPU rasterization:** `--enable-gpu-rasterization`, `--enable-zero-copy`, `--ignore-gpu-blocklist`
- **JPEG quality 75:** Reduced from 90 for faster frame I/O (Remotion re-encodes to H.264 anyway)
- **Pipelined writes:** Capture next frame while previous writes to disk

### Pipeline Progress UI
- `progress.js` — New file. Shows all pipeline steps upfront with pending markers (○)
- TTY mode: ANSI cursor movement updates lines in-place with elapsed time
- Non-TTY mode: Sequential line output fallback for piped/CI output

### Gemini TTS Support
- `gemini-engine.js` — Uses `gemini-2.5-pro-preview-tts` (Flash model has broken quota showing limit:0)
- Voice instructions prepended to content text (Gemini TTS controls speech style via natural language prompts in the content, not via `systemInstruction`)
- Configurable voice and instructions via `screenwright.config.js`

### Pocket TTS (Local Fallback)
- `pocket-engine.js` — Node.js bridge to [pocket-tts-mlx](https://github.com/nicobailon/pocket-tts-mlx) (Apple Silicon, no API key)
- Self-contained in `tools/pocket-tts/` with its own Python venv
- 8 voices: alba, marius, javert, jean, fantine, cosette, eponine, azelma
- Not natural enough for production — useful for testing the pipeline without burning API quota
- **Important:** `pocketMaxTokens` must be 50 (default). Higher values cause garbled audio.

## Repository Structure

```
screenwright-fork/
  cli/
    src/                   # Original TypeScript source (upstream, untouched)
    dist-clavion/          # Our modified JS distribution
      bin/screenwright.js   # CLI entry point
      src/
        commands/           # compose, progress (new), config, generate, init, preview, skill
        composition/        # render (fixed), DemoVideo, BrowserChrome, CursorOverlay, NarrationTrack
        runtime/            # narration-preprocess (rewritten), instrumented-page, action-helpers
        voiceover/          # gemini-engine, pocket-engine, openai-engine, piper-engine
        config/             # config-schema, defaults, load-config
        generator/          # prompts, scenario-generator
        timeline/           # schema, types
    package.json           # Points to dist-clavion/ (v0.4.0)
  projects/
    cppa/                  # CPPA product walkthrough project
      screenwright.config.js
      .env.example
      demos/
        cppa-member-dashboard.js
      assets/
        cppa-logo.webp
      output/
        cppa-member-dashboard/
          v1/
            script.md      # 20-segment narration script (ready for review)
            audio/         # Generated audio goes here
            frames/        # Captured frames go here
  tools/
    pocket-tts/            # Local TTS fallback (Apple Silicon MLX)
      main.py              # Single-text generation
      generate_segments.py # Per-segment generation with silence gaps
      pyproject.toml       # Python deps (pocket-tts-mlx)
  docs/                    # Upstream docs
  skill/                   # Claude Code skill definition
```

### Why `dist-clavion/` Instead of Modifying `src/`?

Our modifications are in compiled JavaScript (started as quick patches in `node_modules/`). The original TypeScript source remains in `cli/src/` as a reference. This separation means:

- **No destructive changes** to upstream source
- **`tsc` still works** on the original source → builds into `cli/dist/` for comparison
- **Our JS is the runtime** — `package.json` points all entry points at `dist-clavion/`
- **Future plan:** Port JS changes back to TypeScript source, then `dist-clavion/` becomes the build output

### Files We Modified (9 of 35)

| File | Change |
|------|--------|
| `composition/render.js` | Chrome frame fix, FPS override, multi-threaded render |
| `composition/DemoVideo.js` | Chrome frame uses scene boundaries instead of cursor targets |
| `runtime/instrumented-page.js` | DPR=1, GPU flags, frame dedup, outputDir support |
| `runtime/narration-preprocess.js` | Complete rewrite — unified single-audio pipeline |
| `runtime/action-helpers.js` | Null audioFile support for unified audio |
| `commands/compose.js` | Versioned output, unified audio, script.md, --reuse-audio |
| `commands/progress.js` | New file — pipeline progress UI |
| `voiceover/gemini-engine.js` | Gemini Pro TTS, voice instructions prepended to content |
| `voiceover/pocket-engine.js` | New — Node.js bridge to Pocket TTS Python process |
| `config/config-schema.js` | Pocket provider config (voice, temp, maxTokens default 50) |

### Files Without TypeScript Source (JS-only)

These files were created directly as JavaScript and have no corresponding `.ts` file in `cli/src/`:

- `commands/progress.js` — Pipeline progress UI (new feature)
- `composition/BrowserChrome.js` — Browser chrome overlay component
- `voiceover/gemini-engine.js` — Gemini TTS engine
- `voiceover/pocket-engine.js` — Pocket TTS bridge

## CPPA Project Setup

### Prerequisites
- Node.js >= 20
- Playwright browsers: `npx playwright install chromium`
- ffmpeg (for silence detection): `brew install ffmpeg`
- Gemini API key with TTS access

### Running

```bash
cd projects/cppa

# Set up environment
cp .env.example .env
# Edit .env with your GEMINI_API_KEY and CPPA test credentials

# Export env vars (screenwright doesn't use dotenv)
export GEMINI_API_KEY=your-key-here
export CPPA_TEST_EMAIL=your-email
export CPPA_TEST_PASSWORD=your-password

# Run the compose pipeline
npx screenwright compose demos/cppa-member-dashboard.js

# Reuse audio from a previous version (saves TTS quota)
npx screenwright compose demos/cppa-member-dashboard.js --reuse-audio

# Skip voiceover entirely (for testing recording/rendering)
npx screenwright compose demos/cppa-member-dashboard.js --no-voiceover
```

### TTS Configuration

**Gemini (production)**

| Setting | Value |
|---------|-------|
| Provider | Gemini Pro (`gemini-2.5-pro-preview-tts`) |
| Voice | Fenrir |
| Quota | 50 calls/day (Pro tier) |
| Voice prompt | Warm, clear, reassuring tone for older professional audience |

**Pocket TTS (local testing)**

| Setting | Value |
|---------|-------|
| Provider | `pocket-tts-mlx` (Apple Silicon only) |
| Voice | alba (8 available) |
| Max tokens | 50 (do not increase — causes garbled audio) |
| Setup | `cd tools/pocket-tts && uv sync` |

Switch providers in `screenwright.config.js` by changing `ttsProvider` to `"pocket"` or `"gemini"`.

### Video Configuration

| Setting | Value |
|---------|-------|
| FPS | 11 (matches M2 MacBook capture rate) |
| Resolution | 1440x1080 (4:3) |
| Remotion scale | 2x (final output: 2880x2160) |
| Codec | H.264, CRF 18, yuv420p |
| Branding | #1E3A5F blue, white text, Inter font |

## Workflow

1. **Edit the scenario** — `projects/cppa/demos/cppa-member-dashboard.js`
2. **Review the script** — Run with `--no-voiceover` first to generate `script.md` without using TTS quota
3. **Generate audio** — Run full pipeline (single TTS call generates unified audio)
4. **Iterate** — Next run creates `v2/`, `v3/`, etc. Use `--reuse-audio` to reuse previous audio

## Upstream

This fork tracks [guidupuy/screenwright](https://github.com/guidupuy/screenwright). The upstream remote is configured as `upstream`.

For the original README and documentation, see the [upstream repo](https://github.com/guidupuy/screenwright).

## License

[MIT](LICENSE)
