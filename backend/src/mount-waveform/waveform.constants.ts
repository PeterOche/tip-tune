export const WAVEFORM_QUEUE = 'waveform';

export const WAVEFORM_JOBS = {
  GENERATE: 'generate',
} as const;

export const WAVEFORM_JOB_DEFAULTS = {
  /** Max BullMQ attempts before moving to failed */
  ATTEMPTS: 5,
  /** Exponential back-off: 30 s, 60 s, 120 s, 240 s, 480 s */
  BACKOFF_DELAY_MS: 30_000,
} as const;
