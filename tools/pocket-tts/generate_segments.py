"""
Generate per-segment TTS audio with silence gaps between segments.
Produces individual WAVs + a concatenated final WAV with natural pacing.

Usage:
  python generate_segments.py --manifest <path> --output <path> [--voice alba] [--gap-ms 1500] [--tempo 0.92]
"""

import argparse
import json
import os
import sys
import time
import subprocess
import numpy as np
import soundfile as sf
from pocket_tts_mlx import TTSModel


def main():
    parser = argparse.ArgumentParser(description="Per-segment TTS with silence gaps")
    parser.add_argument("--manifest", type=str, required=True, help="Path to narration-manifest.json")
    parser.add_argument("--output", type=str, required=True, help="Output WAV path for concatenated audio")
    parser.add_argument("--voice", type=str, default="alba", help="Voice name (default: alba)")
    parser.add_argument("--temp", type=float, default=0.7, help="Sampling temperature")
    parser.add_argument("--gap-ms", type=int, default=1500, help="Silence gap between segments in ms (default: 1500)")
    parser.add_argument("--tempo", type=float, default=1.0, help="Tempo multiplier <1 = slower (default: 1.0)")
    parser.add_argument("--output-dir", type=str, help="Directory for individual segment WAVs (optional)")
    args = parser.parse_args()

    # Load segment texts from manifest
    with open(args.manifest) as f:
        manifest = json.load(f)
    segments = manifest["segments"]
    texts = [s["text"] for s in segments]

    print(f"Generating {len(texts)} segments with voice={args.voice}, gap={args.gap_ms}ms, tempo={args.tempo}", file=sys.stderr)

    # Load model once
    t0 = time.time()
    model = TTSModel.load_model(temp=args.temp)
    state = model.get_state_for_audio_prompt(args.voice)
    sample_rate = model.sample_rate
    print(f"Model loaded in {time.time() - t0:.1f}s (sample_rate={sample_rate})", file=sys.stderr)

    # Generate each segment
    all_audio = []
    gap_samples = int(sample_rate * args.gap_ms / 1000)
    silence_gap = np.zeros(gap_samples, dtype=np.float32)
    segment_timings = []
    cursor_ms = 0

    output_dir = args.output_dir or os.path.dirname(args.output)

    for i, text in enumerate(texts):
        t_start = time.time()
        audio = model.generate_audio(
            model_state=state,
            text_to_generate=text,
            max_tokens=50,
            warmup_frames=1,
            trim_start_ms=40,
            fade_in_ms=15,
        )
        audio_np = np.array(audio, dtype=np.float32)
        gen_time = time.time() - t_start
        duration_ms = round(len(audio_np) / sample_rate * 1000)

        # Save individual segment WAV
        seg_path = os.path.join(output_dir, f"segment-{i+1:02d}.wav")
        sf.write(seg_path, audio_np, sample_rate)

        # Track timing
        segment_timings.append({
            "index": i,
            "text": text,
            "startMs": cursor_ms,
            "endMs": cursor_ms + duration_ms,
            "durationMs": duration_ms,
        })

        print(f"  [{i+1}/{len(texts)}] {duration_ms/1000:.1f}s ({gen_time:.1f}s gen) -- {text[:60]}{'...' if len(text) > 60 else ''}", file=sys.stderr)

        all_audio.append(audio_np)
        cursor_ms += duration_ms

        # Add silence gap (except after last segment)
        if i < len(texts) - 1:
            all_audio.append(silence_gap)
            cursor_ms += args.gap_ms

    # Concatenate all audio
    full_audio = np.concatenate(all_audio)
    total_duration_ms = round(len(full_audio) / sample_rate * 1000)

    # Apply tempo change if requested
    if args.tempo != 1.0:
        temp_path = args.output + ".tmp.wav"
        sf.write(temp_path, full_audio, sample_rate)
        subprocess.run([
            "ffmpeg", "-y", "-i", temp_path,
            "-af", f"atempo={args.tempo}",
            args.output,
        ], capture_output=True)
        os.unlink(temp_path)
        # Re-read to get actual duration
        info = sf.info(args.output)
        total_duration_ms = round(info.duration * 1000)
        # Scale all timings
        scale = 1.0 / args.tempo
        for s in segment_timings:
            s["startMs"] = round(s["startMs"] * scale)
            s["endMs"] = round(s["endMs"] * scale)
            s["durationMs"] = round(s["durationMs"] * scale)
        print(f"\nTempo adjusted to {args.tempo}x -> {total_duration_ms/1000:.1f}s total", file=sys.stderr)
    else:
        sf.write(args.output, full_audio, sample_rate)

    print(f"\nTotal: {total_duration_ms/1000:.1f}s ({len(texts)} segments + {len(texts)-1} gaps)", file=sys.stderr)

    # Output JSON result
    result = {
        "output": args.output,
        "voice": args.voice,
        "sample_rate": sample_rate,
        "duration_ms": total_duration_ms,
        "gap_ms": args.gap_ms,
        "tempo": args.tempo,
        "segments": segment_timings,
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
