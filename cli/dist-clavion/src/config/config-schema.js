import { z } from 'zod';
export const openaiVoices = [
    'alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo',
    'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
];
export const geminiVoices = [
    'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
    'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
    'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
    'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
    'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];
export const DEFAULT_TTS_INSTRUCTIONS = 'Speak in an upbeat, enthusiastic tone. This is a tech product demo video. ' +
    'Be energetic and professional, like a friendly product evangelist.';
const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Must be a hex color like #4F46E5');
export const brandingSchema = z.object({
    brandColor: hexColor,
    textColor: hexColor,
    fontFamily: z.string().optional(),
});
export const configSchema = z.object({
    fps: z.number().int().min(1).max(60).default(16),
    piperVoice: z.string().default('en_US-amy-medium'),
    resolution: z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
    }).default({ width: 1280, height: 720 }),
    outputDir: z.string().default('./output'),
    locale: z.string().default('en-US'),
    colorScheme: z.enum(['light', 'dark']).default('light'),
    timezoneId: z.string().default('America/New_York'),
    ttsProvider: z.enum(['piper', 'openai', 'gemini', 'pocket']).default('piper'),
    openaiVoice: z.enum(openaiVoices).default('nova'),
    openaiTtsInstructions: z.string().default(DEFAULT_TTS_INSTRUCTIONS),
    geminiVoice: z.string().default('Kore'),
    geminiTtsInstructions: z.string().default(DEFAULT_TTS_INSTRUCTIONS),
    pocketVoice: z.string().default('marius'),
    pocketTemp: z.number().min(0).max(2).default(0.7),
    pocketMaxTokens: z.number().int().min(1).max(2000).default(500),
    branding: brandingSchema.optional(),
});
