"""
Pocket TTS bridge for screenwright.
Generates WAV audio from text using Kyutai's Pocket TTS (MLX).

Usage:
  python main.py --text "Hello world" --output output.wav [--voice marius] [--max-tokens 500]
  python main.py --text-file script.txt --output output.wav [--voice marius]
"""

import argparse
import json
import sys
import time
import numpy as np
import soundfile as sf
from pocket_tts_mlx import TTSModel


def main():
    parser = argparse.ArgumentParser(description="Pocket TTS bridge for screenwright")
    parser.add_argument("--text", type=str, help="Text to synthesize")
    parser.add_argument("--text-file", type=str, help="File containing text to synthesize")
    parser.add_argument("--output", type=str, required=True, help="Output WAV path")
    parser.add_argument("--voice", type=str, default="marius", help="Voice name (default: marius)")
    parser.add_argument("--temp", type=float, default=0.7, help="Sampling temperature (default: 0.7)")
    parser.add_argument("--max-tokens", type=int, default=50, help="Max tokens per chunk (default: 50)")
    parser.add_argument("--warmup-frames", type=int, default=1, help="Warmup frames to discard (default: 1)")
    parser.add_argument("--trim-start-ms", type=int, default=40, help="Trim start ms (default: 40)")
    parser.add_argument("--fade-in-ms", type=int, default=15, help="Fade-in ms (default: 15)")
    args = parser.parse_args()

    if args.text_file:
        with open(args.text_file, "r") as f:
            text = f.read().strip()
    elif args.text:
        text = args.text
    else:
        parser.error("Either --text or --text-file is required")

    if not text:
        parser.error("Text is empty")

    t0 = time.time()

    # Load model
    model = TTSModel.load_model(temp=args.temp)
    t_load = time.time()

    # Select voice
    state = model.get_state_for_audio_prompt(args.voice)
    t_voice = time.time()

    # Generate audio
    audio = model.generate_audio(
        model_state=state,
        text_to_generate=text,
        max_tokens=args.max_tokens,
        warmup_frames=args.warmup_frames,
        trim_start_ms=args.trim_start_ms,
        fade_in_ms=args.fade_in_ms,
    )
    t_gen = time.time()

    # Convert to numpy and save
    audio_np = np.array(audio)
    sf.write(args.output, audio_np, model.sample_rate)
    t_save = time.time()

    duration_s = audio_np.shape[0] / model.sample_rate

    # Output JSON metadata to stdout for the Node.js caller
    result = {
        "output": args.output,
        "voice": args.voice,
        "sample_rate": model.sample_rate,
        "duration_ms": round(duration_s * 1000),
        "samples": audio_np.shape[0],
        "timing": {
            "model_load_s": round(t_load - t0, 2),
            "voice_load_s": round(t_voice - t_load, 2),
            "generation_s": round(t_gen - t_voice, 2),
            "save_s": round(t_save - t_gen, 2),
            "total_s": round(t_save - t0, 2),
        },
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
