export interface DictationWaveformSample {
  readonly level: number;
  readonly texture: number;
}

export const DICTATION_WAVE_SAMPLE_COUNT = 88;
export const DICTATION_WAVE_TICK_MS = 85;

const DICTATION_WAVE_MIN_VISIBLE_LEVEL = 0.025;
const DICTATION_WAVE_ATTACK = 0.72;
const DICTATION_WAVE_RELEASE = 0.24;

export function createInitialDictationWaveSamples(
  count = DICTATION_WAVE_SAMPLE_COUNT,
): DictationWaveformSample[] {
  return Array.from({ length: count }, (_, index) => createDictationWaveSample(0, index));
}

export function appendDictationWaveSample(
  samples: ReadonlyArray<DictationWaveformSample>,
  audioLevel: number,
  tick: number,
): DictationWaveformSample[] {
  const currentSamples = samples.length > 0 ? samples : createInitialDictationWaveSamples();
  const count = currentSamples.length;
  const previousLevel = currentSamples.at(-1)?.level ?? 0;
  const normalizedLevel = normalizeDictationAudioLevel(audioLevel);
  const smoothedLevel = normalizedLevel >= previousLevel
    ? previousLevel + (normalizedLevel - previousLevel) * DICTATION_WAVE_ATTACK
    : previousLevel + (normalizedLevel - previousLevel) * DICTATION_WAVE_RELEASE;
  const nextLevel = smoothedLevel < DICTATION_WAVE_MIN_VISIBLE_LEVEL ? 0 : smoothedLevel;
  const retainedSamples = currentSamples.slice(Math.max(0, currentSamples.length - count + 1));
  return [...retainedSamples, createDictationWaveSample(nextLevel, tick + count)];
}

export function getDictationWaveSampleHeight(sample: DictationWaveformSample): number {
  if (sample.level <= 0) {
    return 2;
  }
  return 2 + sample.level * (8 + sample.texture * 22);
}

export function getDictationWaveSampleOpacity(sample: DictationWaveformSample): number {
  if (sample.level <= 0) {
    return 0;
  }
  return Math.min(1, 0.18 + sample.level * 0.72);
}

function createDictationWaveSample(level: number, seed: number): DictationWaveformSample {
  return {
    level,
    texture: createDeterministicTexture(seed),
  };
}

function normalizeDictationAudioLevel(audioLevel: number): number {
  if (!Number.isFinite(audioLevel)) {
    return 0;
  }
  return Math.max(0, Math.min(1, audioLevel));
}

function createDeterministicTexture(seed: number): number {
  const primaryWave = (Math.sin(seed * 0.91) + 1) / 2;
  const secondaryWave = (Math.sin(seed * 2.17 + 0.7) + 1) / 2;
  return 0.42 + primaryWave * 0.36 + secondaryWave * 0.22;
}
