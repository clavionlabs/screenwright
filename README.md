# Screenwright

Turn Playwright E2E tests into polished product demo videos.

Screenwright analyzes your existing Playwright tests, generates a cinematic "demo scenario" with human pacing and narration, records it with video capture, then composites cursor animation and voiceover into a final MP4.

## How It Works

```
Playwright test → Demo scenario → Record with pacing → Compose video
                  (human data,     (Playwright +        (Remotion:
                   narration cues)  video capture)       cursor + audio)
```

1. **Analyze** your Playwright test
2. **Generate** a demo scenario with natural pacing, realistic data, and narration
3. **Record** the scenario in Playwright with video capture
4. **Compose** the final video with cursor overlay and voiceover via Remotion

## Installation

```bash
npm install -g @screenwright/cli
screenwright init
```

`screenwright init` creates a config file and downloads the Piper TTS voice model (~50MB).

### Prerequisites

- Node.js >= 20
- Playwright browsers: `npx playwright install chromium`

## Quick Start

### With Claude Code (recommended)

Install the skill, then:

```
/screenwright
```

The skill walks you through test selection, scenario generation, and video composition.

### With the CLI

```bash
# 1. Generate a demo scenario from a Playwright test
screenwright generate --test ./tests/checkout.spec.ts

# 2. Review and edit the generated scenario at ./demos/checkout-demo.ts

# 3. Compose the final video
screenwright compose ./demos/checkout-demo.ts

# 4. Or quickly preview without cursor/voiceover
screenwright preview ./demos/checkout-demo.ts
```

## CLI Reference

### `screenwright init`

Bootstrap config and download voice model.

```bash
screenwright init [--voice <model>] [--skip-voice-download]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--voice` | `en_US-amy-medium` | Piper TTS voice model |
| `--skip-voice-download` | false | Skip downloading voice model |

### `screenwright generate`

Generate a demo scenario from a Playwright test.

```bash
screenwright generate --test <path> [--out <path>] [--narration-style brief|detailed]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--test` | (required) | Path to Playwright test file |
| `--out` | `./demos/<name>-demo.ts` | Output path |
| `--narration-style` | `detailed` | `brief` or `detailed` narration |
| `--data-profile` | - | JSON app description for fixture replacement |

### `screenwright compose`

Record scenario and compose final MP4 with cursor overlay and voiceover.

```bash
screenwright compose <scenario> [--out <path>] [--resolution WxH]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--out` | `./output/<name>.mp4` | Output path |
| `--resolution` | `1280x720` | Video resolution |
| `--no-voiceover` | false | Skip voiceover audio |
| `--no-cursor` | false | Skip cursor overlay |
| `--keep-temp` | false | Keep intermediate files |

### `screenwright preview`

Quick preview — raw recording without cursor overlay or voiceover.

```bash
screenwright preview <scenario> [--out <path>]
```

## Demo Scenario API

Generated scenarios use the `sw` helper API:

```typescript
import type { ScreenwrightHelpers } from '@screenwright/cli';

export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('Getting Started');
  await sw.navigate('http://localhost:3000', {
    narration: "Let's open the app.",
  });
  await sw.click('[data-testid="login"]', {
    narration: 'Click the login button.',
  });
  await sw.fill('[data-testid="email"]', 'sarah@example.com');
  await sw.wait(2000);
}
```

### Available Helpers

| Method | Description |
|--------|-------------|
| `sw.scene(title, description?)` | Mark a scene/chapter boundary |
| `sw.navigate(url, { narration? })` | Navigate to URL |
| `sw.click(selector, { narration? })` | Click an element |
| `sw.fill(selector, value, { narration? })` | Type into an input (character by character) |
| `sw.hover(selector, { narration? })` | Hover over an element |
| `sw.press(key, { narration? })` | Press a keyboard key |
| `sw.wait(ms)` | Pause for pacing |
| `sw.narrate(text)` | Speak narration without an action |

## Configuration

`screenwright.config.ts` (created by `screenwright init`):

```typescript
const config = {
  voice: "en_US-amy-medium",
  resolution: { width: 1280, height: 720 },
  outputDir: "./output",
  locale: "en-US",
  colorScheme: "light",
  timezoneId: "America/New_York"
};

export default config;
```

## Troubleshooting

**"Playwright browsers not installed"**
```bash
npx playwright install chromium
```

**"Could not connect to the app"**
Make sure your dev server is running before composing.

**"Voiceover generation failed"**
Re-run `screenwright init` to download the Piper TTS binary. Or use `--no-voiceover` to skip.

**"Out of memory during rendering"**
Try a lower resolution: `--resolution 1280x720`

**"Timed out waiting for an element"**
Check that selectors in the scenario match your app's current DOM.

## Architecture

```
cli/
  src/
    commands/       # CLI commands (init, generate, compose, preview)
    runtime/        # Playwright instrumentation (sw.* helpers, timeline collector)
    composition/    # Remotion components (DemoVideo, CursorOverlay, NarrationTrack)
    voiceover/      # Piper TTS engine and narration timing
    generator/      # LLM prompt templates for scenario generation
    timeline/       # Timeline JSON types and Zod schema
    config/         # Configuration schema and defaults
skill/
  SKILL.md          # Claude Code skill definition
```

## License

Source-available. Free for personal and open-source use. Commercial license required for organizations.
