const config = {
  // TTS — Gemini Pro with Fenrir voice
  ttsProvider: "gemini",
  geminiVoice: "Fenrir",
  geminiTtsInstructions: "Speak in a warm, clear, and reassuring tone. Pace yourself slowly and deliberately — your audience is older professionals who appreciate clarity over speed. Pause naturally between sentences. Think of a patient, friendly colleague walking someone through something on their computer for the first time. Never rush.",

  // Video — 4:3 aspect ratio, 11fps matches M2 MacBook capture rate
  fps: 11,
  resolution: { width: 1440, height: 1080 },
  outputDir: "./output",

  // Browser
  locale: "en-US",
  colorScheme: "light",
  timezoneId: "America/New_York",

  // CPPA branding
  branding: {
    brandColor: "#1E3A5F",
    textColor: "#FFFFFF",
    fontFamily: "Inter",
  },
};

export default config;
