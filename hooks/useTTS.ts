'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TTSRequest, PlayState } from '@/types';

const WAV_HEADER_BYTES = 44;
const SAMPLE_RATE = 24000;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function int16ToPcm32(buffer: ArrayBuffer): Float32Array {
  if (buffer.byteLength <= WAV_HEADER_BYTES) return new Float32Array(0);
  const int16 = new Int16Array(buffer, WAV_HEADER_BYTES);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

export interface UseTTSReturn {
  state: PlayState;
  isPlaying: boolean;
  isLoading: boolean;
  analyser: AnalyserNode | null;
  play: (request: TTSRequest) => Promise<void>;
  stop: () => void;
}

export function useTTS(): UseTTSReturn {
  const [state, setState] = useState<PlayState>('idle');
  const [analyserState, setAnalyserState] = useState<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef<PlayState>('idle');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateState = useCallback((s: PlayState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const stop = useCallback(() => {
    clearTimeout(idleTimerRef.current ?? undefined);
    abortRef.current?.abort();
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setAnalyserState(null);
    updateState('idle');
  }, [updateState]);

  const play = useCallback(async (request: TTSRequest) => {
    // Stop any existing playback
    abortRef.current?.abort();
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    updateState('loading');

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abort.signal,
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      if (!res.body) throw new Error('No response body');
      if (abort.signal.aborted) return;

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      setAnalyserState(analyser);
      nextPlayTimeRef.current = ctx.currentTime + 0.05;

      updateState('playing');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abort.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as { result?: { audioContent?: string } };
            const audioContent = parsed?.result?.audioContent;
            if (!audioContent) continue;

            const arrayBuf = base64ToArrayBuffer(audioContent);
            const pcm = int16ToPcm32(arrayBuf);
            if (pcm.length === 0) continue;

            const audioBuffer = ctx.createBuffer(1, pcm.length, SAMPLE_RATE);
            audioBuffer.getChannelData(0).set(pcm);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(analyser);

            const startTime = Math.max(nextPlayTimeRef.current, ctx.currentTime);
            source.start(startTime);
            nextPlayTimeRef.current = startTime + audioBuffer.duration;
          } catch {
            if (process.env.NODE_ENV === 'development') {
              console.warn('TTS: skipping unparseable line:', line.slice(0, 100));
            }
          }
        }
      }

      // Transition to idle after all buffers finish
      const timeUntilEnd = Math.max(0, nextPlayTimeRef.current - ctx.currentTime);
      clearTimeout(idleTimerRef.current ?? undefined);
      idleTimerRef.current = setTimeout(() => {
        if (audioCtxRef.current === ctx) {
          updateState('idle');
        }
      }, timeUntilEnd * 1000);

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('TTS error:', err);
      updateState('error');
    }
  }, [updateState]);

  return {
    state,
    isPlaying: state === 'playing',
    isLoading: state === 'loading',
    analyser: analyserState,
    play,
    stop,
  };
}
