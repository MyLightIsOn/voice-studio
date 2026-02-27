import { renderHook, act, waitFor } from '@testing-library/react';
import { useTTS } from '@/hooks/useTTS';
import type { TTSRequest } from '@/types';

// Build a fake NDJSON stream from base64 chunks
function makeNDJSONStream(chunks: string[]): ReadableStream<Uint8Array> {
  const lines = chunks.map(c =>
    JSON.stringify({ result: { audioContent: c } }) + '\n'
  );
  return new ReadableStream({
    start(controller) {
      lines.forEach(line => controller.enqueue(new TextEncoder().encode(line)));
      controller.close();
    },
  });
}

// Minimal valid LINEAR16 WAV chunk (44-byte header + 8 zero samples = 60 bytes)
function makeFakeWavChunk(): string {
  const pcmSamples = 8;
  const buf = new ArrayBuffer(44 + pcmSamples * 2);
  const view = new DataView(buf);
  // RIFF header
  [82, 73, 70, 70].forEach((b, i) => view.setUint8(i, b));
  view.setUint32(4, 36 + pcmSamples * 2, true);
  [87, 65, 86, 69].forEach((b, i) => view.setUint8(8 + i, b));
  [102, 109, 116, 32].forEach((b, i) => view.setUint8(12 + i, b));
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  [100, 97, 116, 97].forEach((b, i) => view.setUint8(36 + i, b));
  view.setUint32(40, pcmSamples * 2, true);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

describe('useTTS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const request: TTSRequest = {
    text: 'Hello',
    voiceId: 'Ashley',
    model: 'max',
    temperature: 0.8,
    speakingRate: 1.0,
  };

  it('starts in idle state', () => {
    const { result } = renderHook(() => useTTS());
    expect(result.current.state).toBe('idle');
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('transitions to loading then playing on play()', async () => {
    const chunk = makeFakeWavChunk();
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(makeNDJSONStream([chunk]), { status: 200 })
    );

    const { result } = renderHook(() => useTTS());

    await act(async () => {
      await result.current.play(request);
    });

    expect(result.current.state).toBe('playing');
    expect(result.current.analyser).not.toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"voiceId":"Ashley"'),
    }));
  });

  it('transitions to error state on fetch failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTTS());

    await act(async () => {
      await result.current.play(request);
    });

    expect(result.current.state).toBe('error');
  });

  it('transitions to error state on non-200 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    );

    const { result } = renderHook(() => useTTS());

    await act(async () => {
      await result.current.play(request);
    });

    expect(result.current.state).toBe('error');
  });

  it('returns to idle after playback ends', async () => {
    const chunk = makeFakeWavChunk();
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(makeNDJSONStream([chunk]), { status: 200 })
    );

    const { result } = renderHook(() => useTTS());

    await act(async () => {
      await result.current.play(request);
    });

    expect(result.current.state).toBe('playing');

    // Advance timers past the playback duration
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.state).toBe('idle');
  });

  it('stop() transitions to idle', async () => {
    const chunk = makeFakeWavChunk();
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(makeNDJSONStream([chunk]), { status: 200 })
    );

    const { result } = renderHook(() => useTTS());

    await act(async () => {
      await result.current.play(request);
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.state).toBe('idle');
  });
});
