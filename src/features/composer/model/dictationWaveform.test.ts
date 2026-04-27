import { describe, expect, it } from "vitest";
import {
  appendDictationWaveSample,
  createInitialDictationWaveSamples,
  DICTATION_WAVE_SAMPLE_COUNT,
  getDictationWaveSampleHeight,
  getDictationWaveSampleOpacity,
} from "./dictationWaveform";

describe("dictation waveform model", () => {
  it("creates a fixed silent waveform", () => {
    const samples = createInitialDictationWaveSamples();

    expect(samples).toHaveLength(DICTATION_WAVE_SAMPLE_COUNT);
    expect(samples.every((sample) => sample.level === 0)).toBe(true);
  });

  it("appends audio samples while preserving the display width", () => {
    const initialSamples = createInitialDictationWaveSamples(4);
    const nextSamples = appendDictationWaveSample(initialSamples, 0.8, 1);

    expect(nextSamples).toHaveLength(4);
    expect(nextSamples.slice(0, 3)).toEqual(initialSamples.slice(1));
    expect(nextSamples[3].level).toBeGreaterThan(0);
    expect(nextSamples[3].level).toBeLessThanOrEqual(1);
  });

  it("normalizes invalid audio levels and hides silent bars", () => {
    const nextSamples = appendDictationWaveSample(createInitialDictationWaveSamples(2), Number.NaN, 1);
    const latestSample = nextSamples[1];

    expect(latestSample.level).toBe(0);
    expect(getDictationWaveSampleHeight(latestSample)).toBe(2);
    expect(getDictationWaveSampleOpacity(latestSample)).toBe(0);
  });
});
