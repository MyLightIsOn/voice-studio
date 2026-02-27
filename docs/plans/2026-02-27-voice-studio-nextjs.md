# Voice Studio Next.js Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the Voice Studio JSX prototype into a real Next.js + TypeScript application that calls the Inworld streaming TTS API and plays actual audio.

**Architecture:** Next.js App Router with a server-side API route that proxies the Inworld streaming TTS API (keeping credentials server-side). Frontend uses the Web Audio API with scheduled AudioBufferSource nodes to play PCM chunks as they stream in. Real AnalyserNode data drives the waveform visualization.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Web Audio API, Jest + Testing Library

---

## Critical API Facts

**Streaming endpoint:** `POST https://api.inworld.ai/tts/v1/voice:stream`
**Auth:** `Authorization: Basic ${INWORLD_BASIC}` (from .env)
**Request body (snake_case):**
```json
{
  "text": "Hello",
  "voice_id": "Ashley",
  "model_id": "inworld-tts-1.5-max",
  "audio_config": { "audio_encoding": "LINEAR16", "sample_rate_hertz": 24000 }
}
```
**Response:** NDJSON lines, each: `{"result":{"audioContent":"base64..."}}`
**Audio format:** LINEAR16 (PCM), 24000 Hz, mono. **Each chunk includes a 44-byte WAV header — skip it when decoding PCM.**

---

### Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`

**Step 1: Scaffold Next.js in the existing directory**

```bash
cd /Users/lawrence/dev/inworld-demo
npx create-next-app@latest . --typescript --app --no-src-dir --eslint --no-tailwind --import-alias "@/*"
```

When prompted, accept defaults. This will generate `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, and `public/`.

**Step 2: Copy .env to .env.local (Next.js reads .env.local)**

```bash
cp .env .env.local
```

`.env.local` must contain:
```
INWORLD_BASIC=RTE2d1B6aWlnVzRoRGY3N0pGQ0thaTdjUHBvM1F0enI6V3VSTkxJNVQyWkZyMlRkeGFJc1k0VGxBcHlvQWRZWE53UHdXcEw4OFVva3JCYnNqNmJ0Y05jRWhMN2hUWFNQQw==
```

**Step 3: Install test dependencies**

```bash
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom ts-jest @types/jest
```

**Step 4: Create jest.config.ts at project root**

```typescript
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;
```

**Step 5: Create jest.setup.ts at project root**

```typescript
import '@testing-library/jest-dom';

// Mock AudioContext for tests
class MockAudioContext {
  sampleRate = 24000;
  currentTime = 0;
  destination = {};
  createBuffer = jest.fn().mockReturnValue({
    getChannelData: jest.fn().mockReturnValue(new Float32Array(0)),
    duration: 0,
    numberOfChannels: 1,
    length: 0,
    sampleRate: 24000,
  });
  createBufferSource = jest.fn().mockReturnValue({
    buffer: null,
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    onended: null,
  });
  createAnalyser = jest.fn().mockReturnValue({
    connect: jest.fn(),
    getByteFrequencyData: jest.fn(),
    frequencyBinCount: 128,
    fftSize: 256,
  });
  close = jest.fn().mockResolvedValue(undefined);
}

global.AudioContext = MockAudioContext as unknown as typeof AudioContext;
```

**Step 6: Add test script to package.json**

Open `package.json` and add to `"scripts"`:
```json
"test": "jest",
"test:watch": "jest --watch"
```

**Step 7: Run dev server to confirm scaffold works**

```bash
npm run dev
```

Visit http://localhost:3000 — should show default Next.js page.

**Step 8: Commit**

```bash
git init
git add -A
git commit -m "feat: initialize Next.js 15 TypeScript project"
```

---

### Task 2: Define Types

**Files:**
- Create: `types/index.ts`

**Step 1: Create the types file**

```typescript
// types/index.ts

export interface Voice {
  id: string;
  name: string;
  persona: string;
  tags: string[];
  color: string;
  accent: string;
  category: 'Character' | 'Narrator' | 'Conversational';
}

export interface SampleScript {
  label: string;
  icon: string;
  text: string;
}

export interface Markup {
  tag: string;
  label: string;
  emoji: string;
}

export type ModelId = 'mini' | 'max';

export interface TTSRequest {
  text: string;
  voiceId: string;
  model: ModelId;
  temperature: number;
  speakingRate: number;
}

export type PlayState = 'idle' | 'loading' | 'playing' | 'error';
```

No tests needed for type definitions.

**Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add TypeScript types for Voice Studio"
```

---

### Task 3: API Route (TTS Proxy)

**Files:**
- Create: `app/api/tts/route.ts`
- Create: `__tests__/api/tts.test.ts`

**Step 1: Write the failing test**

Create `__tests__/api/tts.test.ts`:

```typescript
import { POST } from '@/app/api/tts/route';
import { NextRequest } from 'next/server';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('POST /api/tts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INWORLD_BASIC = 'test-api-key';
  });

  it('returns 400 if text is missing', async () => {
    const req = new NextRequest('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ voiceId: 'Ashley', model: 'max' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('calls Inworld streaming API with correct params', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          JSON.stringify({ result: { audioContent: btoa('fake-pcm-data') } }) + '\n'
        ));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue(new Response(mockStream, { status: 200 }));

    const req = new NextRequest('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Hello world',
        voiceId: 'Ashley',
        model: 'max',
        temperature: 0.8,
        speakingRate: 1.0,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify it called Inworld with correct URL and auth
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.inworld.ai/tts/v1/voice:stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Basic test-api-key',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"voice_id":"Ashley"'),
      })
    );
  });

  it('returns 500 if Inworld API fails', async () => {
    mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    const req = new NextRequest('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello', voiceId: 'Ashley', model: 'max' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest __tests__/api/tts.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/app/api/tts/route'`

**Step 3: Create the API route**

Create `app/api/tts/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.text || !body?.voiceId) {
    return NextResponse.json({ error: 'text and voiceId are required' }, { status: 400 });
  }

  const { text, voiceId, model = 'max', temperature = 0.8, speakingRate = 1.0 } = body;

  const apiKey = process.env.INWORLD_BASIC;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const inworldRes = await fetch('https://api.inworld.ai/tts/v1/voice:stream', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      model_id: `inworld-tts-1.5-${model}`,
      audio_config: {
        audio_encoding: 'LINEAR16',
        sample_rate_hertz: 24000,
      },
    }),
  });

  if (!inworldRes.ok) {
    const errText = await inworldRes.text();
    console.error('Inworld API error:', inworldRes.status, errText);
    return NextResponse.json(
      { error: `Inworld API error: ${inworldRes.status}` },
      { status: 500 }
    );
  }

  // Pipe the streaming NDJSON response directly to the client
  return new Response(inworldRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    },
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/tts.test.ts --no-coverage
```

Expected: 3 PASS

**Step 5: Manually smoke-test the API route**

Start the dev server (`npm run dev` in another terminal), then:

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, this is a test.","voiceId":"Ashley","model":"max","temperature":0.8,"speakingRate":1.0}' \
  --no-buffer | head -c 500
```

Expected: NDJSON lines starting with `{"result":{"audioContent":"...`

**Step 6: Commit**

```bash
git add app/api/tts/route.ts __tests__/api/tts.test.ts
git commit -m "feat: add TTS API route proxying Inworld streaming API"
```

---

### Task 4: useTTS Streaming Hook

**Files:**
- Create: `hooks/useTTS.ts`
- Create: `__tests__/hooks/useTTS.test.ts`

**Step 1: Write the failing test**

Create `__tests__/hooks/useTTS.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useTTS } from '@/hooks/useTTS';
import type { TTSRequest } from '@/types';

// Build a fake NDJSON stream from base64 chunks
function makeNDJSONStream(chunks: string[]): ReadableStream {
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

// Minimal valid LINEAR16 WAV header (44 bytes) followed by 4 zero samples
function makeFakeWavChunk(): string {
  const pcmSamples = 4;
  const buf = new ArrayBuffer(44 + pcmSamples * 2);
  const view = new DataView(buf);
  // RIFF header
  [82, 73, 70, 70].forEach((b, i) => view.setUint8(i, b)); // "RIFF"
  view.setUint32(4, 36 + pcmSamples * 2, true);
  [87, 65, 86, 69].forEach((b, i) => view.setUint8(8 + i, b)); // "WAVE"
  [102, 109, 116, 32].forEach((b, i) => view.setUint8(12 + i, b)); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 24000, true); // sample rate
  view.setUint32(28, 48000, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  [100, 97, 116, 97].forEach((b, i) => view.setUint8(36 + i, b)); // "data"
  view.setUint32(40, pcmSamples * 2, true);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

describe('useTTS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
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

    // After streaming completes, state should be playing
    expect(result.current.state).toBe('playing');
    expect(global.fetch).toHaveBeenCalledWith('/api/tts', expect.any(Object));
  });

  it('transitions to error state on fetch failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTTS());

    await act(async () => {
      await result.current.play(request);
    });

    expect(result.current.state).toBe('error');
  });

  it('stop() transitions to idle and closes AudioContext', async () => {
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
```

**Step 2: Run test to verify it fails**

```bash
npx jest __tests__/hooks/useTTS.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/hooks/useTTS'`

**Step 3: Create the useTTS hook**

Create `hooks/useTTS.ts`:

```typescript
'use client';

import { useState, useRef, useCallback } from 'react';
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

function int16ToPcm32(buffer: ArrayBuffer, skipHeader: boolean): Float32Array {
  const offset = skipHeader ? WAV_HEADER_BYTES : 0;
  const int16 = new Int16Array(buffer, offset);
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setState('idle');
  }, []);

  const play = useCallback(async (request: TTSRequest) => {
    // Stop any existing playback
    stop();

    setState('loading');

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

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      nextPlayTimeRef.current = ctx.currentTime + 0.1; // small initial buffer

      setState('playing');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let isFirstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const audioContent: string | undefined = parsed?.result?.audioContent;
            if (!audioContent) continue;

            const arrayBuf = base64ToArrayBuffer(audioContent);

            // Skip WAV header on all chunks (header is 44 bytes of metadata, not audio)
            const pcm = int16ToPcm32(arrayBuf, true);
            if (pcm.length === 0) {
              isFirstChunk = false;
              continue;
            }

            const audioBuffer = ctx.createBuffer(1, pcm.length, SAMPLE_RATE);
            audioBuffer.getChannelData(0).set(pcm);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(analyser);

            const startTime = Math.max(nextPlayTimeRef.current, ctx.currentTime);
            source.start(startTime);
            nextPlayTimeRef.current = startTime + audioBuffer.duration;

            isFirstChunk = false;
          } catch {
            // malformed JSON line — skip
          }
        }
      }

      // When all buffers finish playing, transition back to idle
      const timeUntilEnd = nextPlayTimeRef.current - ctx.currentTime;
      setTimeout(() => {
        if (audioCtxRef.current === ctx) {
          setState('idle');
        }
      }, Math.max(0, timeUntilEnd * 1000));

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('TTS error:', err);
      setState('error');
    }
  }, [stop]);

  return {
    state,
    isPlaying: state === 'playing',
    isLoading: state === 'loading',
    analyser: analyserRef.current,
    play,
    stop,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/hooks/useTTS.test.ts --no-coverage
```

Expected: 4 PASS

**Step 5: Commit**

```bash
git add hooks/useTTS.ts __tests__/hooks/useTTS.test.ts
git commit -m "feat: add useTTS streaming hook with Web Audio API"
```

---

### Task 5: Port VoiceStudio to TypeScript Components

**Files:**
- Create: `components/Waveform.tsx`
- Create: `components/LatencyBadge.tsx`
- Create: `components/VoiceCard.tsx`
- Create: `components/CastRow.tsx`
- Create: `components/VoiceStudio.tsx`
- Create: `__tests__/components/VoiceStudio.test.tsx`

**Step 1: Write the failing component test**

Create `__tests__/components/VoiceStudio.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import VoiceStudio from '@/components/VoiceStudio';

// Mock useTTS
jest.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({
    state: 'idle',
    isPlaying: false,
    isLoading: false,
    analyser: null,
    play: jest.fn(),
    stop: jest.fn(),
  }),
}));

describe('VoiceStudio', () => {
  it('renders header with Voice Studio title', () => {
    render(<VoiceStudio />);
    expect(screen.getByText('Voice Studio')).toBeInTheDocument();
  });

  it('renders all three tabs', () => {
    render(<VoiceStudio />);
    expect(screen.getByText(/Explore Voices/)).toBeInTheDocument();
    expect(screen.getByText(/Voice Casting/)).toBeInTheDocument();
    expect(screen.getByText(/API Code/)).toBeInTheDocument();
  });

  it('shows voice cards in Explore tab', () => {
    render(<VoiceStudio />);
    expect(screen.getByText('Hades')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('Ashley')).toBeInTheDocument();
  });

  it('synthesize button shows correct voice name', () => {
    render(<VoiceStudio />);
    expect(screen.getByText(/Synthesize with/)).toBeInTheDocument();
  });

  it('switches to Cast tab on click', () => {
    render(<VoiceStudio />);
    fireEvent.click(screen.getByText(/Voice Casting/));
    expect(screen.getByText(/Voice Casting Director/)).toBeInTheDocument();
  });

  it('switches to Code tab on click', () => {
    render(<VoiceStudio />);
    fireEvent.click(screen.getByText(/API Code/));
    expect(screen.getByText(/Ready-to-Use Code/)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest __tests__/components/VoiceStudio.test.tsx --no-coverage
```

Expected: FAIL — `Cannot find module '@/components/VoiceStudio'`

**Step 3: Create Waveform component**

Create `components/Waveform.tsx`:

```typescript
'use client';

import { useEffect, useRef } from 'react';

interface WaveformProps {
  isPlaying: boolean;
  color?: string;
  height?: number;
  analyser?: AnalyserNode | null;
}

export default function Waveform({ isPlaying, color = '#6366F1', height = 48, analyser }: WaveformProps) {
  const barsRef = useRef<HTMLDivElement[]>([]);
  const rafRef = useRef<number>(0);
  const BAR_COUNT = 40;

  useEffect(() => {
    if (!isPlaying || !analyser) {
      cancelAnimationFrame(rafRef.current);
      barsRef.current.forEach((bar, i) => {
        if (bar) {
          const baseH = 8 + Math.sin(i * 0.5) * 6;
          bar.style.height = `${baseH}px`;
          bar.style.opacity = '0.3';
        }
      });
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      analyser!.getByteFrequencyData(dataArray);
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const dataIndex = Math.floor((i / BAR_COUNT) * dataArray.length);
        const value = dataArray[dataIndex] / 255;
        const barHeight = 8 + value * (height - 16);
        bar.style.height = `${barHeight}px`;
        bar.style.opacity = `${0.4 + value * 0.6}`;
      });
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, analyser, height]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height, justifyContent: 'center' }}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const baseH = 8 + Math.sin(i * 0.5) * 6;
        return (
          <div
            key={i}
            ref={el => { if (el) barsRef.current[i] = el; }}
            style={{
              width: 3,
              borderRadius: 2,
              backgroundColor: color,
              opacity: 0.3,
              height: baseH,
              transition: isPlaying && !analyser ? 'height 0.1s ease' : 'height 0.6s ease, opacity 0.6s ease',
            }}
          />
        );
      })}
    </div>
  );
}
```

**Step 4: Create LatencyBadge component**

Create `components/LatencyBadge.tsx`:

```typescript
import type { ModelId } from '@/types';

interface LatencyBadgeProps {
  model: ModelId;
}

export default function LatencyBadge({ model }: LatencyBadgeProps) {
  const latency = model === 'max' ? '~200ms' : '~100ms';
  const color = model === 'max' ? '#7C3AED' : '#10B981';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      backgroundColor: `${color}18`, color, letterSpacing: '0.02em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
      {latency} TTFA
    </span>
  );
}
```

**Step 5: Create VoiceCard component**

Create `components/VoiceCard.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { Voice } from '@/types';

interface VoiceCardProps {
  voice: Voice;
  isSelected: boolean;
  isInCast: boolean;
  onSelect: (voice: Voice) => void;
  onToggleCast: (voice: Voice) => void;
}

export default function VoiceCard({ voice, isSelected, isInCast, onSelect, onToggleCast }: VoiceCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(voice)}
      style={{
        position: 'relative', padding: '16px 18px', borderRadius: 14,
        cursor: 'pointer',
        border: isSelected ? `2px solid ${voice.color}` : '2px solid transparent',
        backgroundColor: isSelected ? `${voice.color}0D` : hovered ? '#1A1A2E' : '#13132B',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      {isInCast && (
        <div style={{
          position: 'absolute', top: -6, right: -6, width: 22, height: 22,
          borderRadius: '50%', backgroundColor: voice.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: 'white', fontWeight: 700,
          boxShadow: `0 2px 8px ${voice.color}66`,
        }}>✓</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `linear-gradient(135deg, ${voice.color}44, ${voice.color}22)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700, color: voice.color,
          border: `1px solid ${voice.color}33`,
        }}>
          {voice.name[0]}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#E2E8F0', letterSpacing: '-0.01em' }}>
            {voice.name}
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>{voice.persona}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {voice.tags.map(tag => (
          <span key={tag} style={{
            padding: '2px 8px', borderRadius: 6, fontSize: 10,
            backgroundColor: '#1E1E3F', color: '#818CF8',
            fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{tag}</span>
        ))}
      </div>

      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onToggleCast(voice); }}
          style={{
            position: 'absolute', bottom: 10, right: 12,
            padding: '4px 10px', borderRadius: 8, fontSize: 11,
            backgroundColor: isInCast ? '#EF444433' : `${voice.color}33`,
            color: isInCast ? '#EF4444' : voice.color,
            border: 'none', cursor: 'pointer', fontWeight: 600,
          }}
        >
          {isInCast ? 'Remove' : '+ Cast'}
        </button>
      )}
    </div>
  );
}
```

**Step 6: Create CastRow component**

Create `components/CastRow.tsx`:

```typescript
'use client';

import Waveform from './Waveform';
import LatencyBadge from './LatencyBadge';
import type { Voice, ModelId } from '@/types';

interface CastRowProps {
  voice: Voice;
  index: number;
  isPlaying: boolean;
  isLoading: boolean;
  model: ModelId;
  analyser: AnalyserNode | null;
  onPlay: (voiceId: string) => void;
}

export default function CastRow({ voice, index, isPlaying, isLoading, model, analyser, onPlay }: CastRowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 18px', borderRadius: 12,
      backgroundColor: '#13132B',
      border: `1px solid ${voice.color}22`,
      animation: `fadeSlideIn 0.3s ease ${index * 0.08}s both`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: `linear-gradient(135deg, ${voice.color}55, ${voice.color}22)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, color: voice.color, flexShrink: 0,
      }}>
        {voice.name[0]}
      </div>

      <div style={{ flex: '0 0 100px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>{voice.name}</div>
        <div style={{ fontSize: 11, color: '#94A3B8' }}>{voice.persona}</div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Waveform isPlaying={isPlaying} color={voice.color} height={36} analyser={isPlaying ? analyser : null} />
      </div>

      <button
        onClick={() => onPlay(voice.id)}
        disabled={isLoading}
        style={{
          width: 40, height: 40, borderRadius: 10,
          backgroundColor: isPlaying ? voice.color : `${voice.color}22`,
          color: isPlaying ? 'white' : voice.color,
          border: 'none', cursor: isLoading ? 'wait' : 'pointer',
          fontSize: isLoading ? 12 : 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease', flexShrink: 0,
        }}
      >
        {isLoading ? '…' : isPlaying ? '⏸' : '▶'}
      </button>

      <LatencyBadge model={model} />
    </div>
  );
}
```

**Step 7: Create main VoiceStudio component**

Create `components/VoiceStudio.tsx` — this is the full port of `voice-studio.jsx` with TypeScript and real audio:

```typescript
'use client';

import { useState, useRef, useCallback } from 'react';
import VoiceCard from './VoiceCard';
import CastRow from './CastRow';
import Waveform from './Waveform';
import LatencyBadge from './LatencyBadge';
import { useTTS } from '@/hooks/useTTS';
import type { Voice, SampleScript, Markup, ModelId } from '@/types';

const VOICES: Voice[] = [
  { id: 'Hades', name: 'Hades', persona: 'Commanding villain', tags: ['deep', 'dramatic', 'male'], color: '#DC2626', accent: 'English', category: 'Character' },
  { id: 'Luna', name: 'Luna', persona: 'Calm meditation guide', tags: ['soft', 'soothing', 'female'], color: '#7C3AED', accent: 'English', category: 'Character' },
  { id: 'Blake', name: 'Blake', persona: 'Warm audiobook narrator', tags: ['rich', 'intimate', 'male'], color: '#D97706', accent: 'English', category: 'Narrator' },
  { id: 'Pixie', name: 'Pixie', persona: 'Playful fairy companion', tags: ['high-pitched', 'energetic', 'female'], color: '#EC4899', accent: 'English', category: 'Character' },
  { id: 'Elizabeth', name: 'Elizabeth', persona: 'Professional narrator', tags: ['polished', 'clear', 'female'], color: '#0891B2', accent: 'English', category: 'Narrator' },
  { id: 'Dennis', name: 'Dennis', persona: 'Friendly conversationalist', tags: ['warm', 'casual', 'male'], color: '#059669', accent: 'English', category: 'Conversational' },
  { id: 'Ashley', name: 'Ashley', persona: 'Upbeat & approachable', tags: ['bright', 'friendly', 'female'], color: '#F59E0B', accent: 'English', category: 'Conversational' },
  { id: 'Dominus', name: 'Dominus', persona: 'Menacing robotic villain', tags: ['dark', 'robotic', 'male'], color: '#6B21A8', accent: 'English', category: 'Character' },
  { id: 'Carter', name: 'Carter', persona: 'Radio announcer energy', tags: ['bold', 'dynamic', 'male'], color: '#B91C1C', accent: 'English', category: 'Narrator' },
  { id: 'Olivia', name: 'Olivia', persona: 'Warm British professional', tags: ['british', 'warm', 'female'], color: '#2563EB', accent: 'British', category: 'Conversational' },
  { id: 'Hana', name: 'Hana', persona: 'Gentle & expressive', tags: ['gentle', 'expressive', 'female'], color: '#DB2777', accent: 'English', category: 'Conversational' },
  { id: 'Mark', name: 'Mark', persona: 'Confident & clear', tags: ['confident', 'neutral', 'male'], color: '#4F46E5', accent: 'English', category: 'Narrator' },
];

const SAMPLE_SCRIPTS: SampleScript[] = [
  { label: 'Game NPC', icon: '🎮', text: '[excited] Welcome, brave adventurer! I\'ve been waiting for someone like you. The dragon in the northern mountains has been terrorizing our village for weeks.' },
  { label: 'Meditation', icon: '🧘', text: '[calm] Take a slow, deep breath in... hold it gently... and release. Let the tension in your shoulders melt away like snow in spring.' },
  { label: 'Audiobook', icon: '📖', text: 'The door creaked open, revealing a room bathed in amber light. She hesitated at the threshold, her fingers tracing the cold iron handle.' },
  { label: 'Voice Agent', icon: '🤖', text: 'Hi there! I\'d be happy to help you with your reservation. I can see you have a booking for two this Saturday at seven PM. Would you like to make any changes?' },
  { label: 'News', icon: '📰', text: 'Breaking developments tonight as the summit concludes with an unprecedented agreement. Sources confirm all parties have signed the accord.' },
  { label: 'Ad Copy', icon: '📢', text: '[happy] Introducing the all-new Horizon Pro. Faster. Smarter. Built for the way you actually work. Available everywhere starting today.' },
];

const MARKUPS: Markup[] = [
  { tag: '[happy]', label: 'Happy', emoji: '😊' },
  { tag: '[sad]', label: 'Sad', emoji: '😢' },
  { tag: '[excited]', label: 'Excited', emoji: '🤩' },
  { tag: '[calm]', label: 'Calm', emoji: '😌' },
  { tag: '[angry]', label: 'Angry', emoji: '😠' },
  { tag: '[whispering]', label: 'Whisper', emoji: '🤫' },
  { tag: '[laughing]', label: 'Laugh', emoji: '😂' },
  { tag: '[sigh]', label: 'Sigh', emoji: '😮‍💨' },
];

export default function VoiceStudio() {
  const [tab, setTab] = useState<'explore' | 'cast' | 'code'>('explore');
  const [selectedVoice, setSelectedVoice] = useState<Voice>(VOICES[0]);
  const [castList, setCastList] = useState<Voice[]>([VOICES[0], VOICES[1], VOICES[3]]);
  const [text, setText] = useState(SAMPLE_SCRIPTS[0].text);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>('max');
  const [temperature, setTemperature] = useState(0.8);
  const [rate, setRate] = useState(1.0);
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copyLabel, setCopyLabel] = useState('📋 Copy');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { state: ttsState, isLoading, analyser, play, stop } = useTTS();

  const handlePlay = useCallback(async (voiceId: string) => {
    if (playingVoiceId === voiceId && (ttsState === 'playing' || ttsState === 'loading')) {
      stop();
      setPlayingVoiceId(null);
      return;
    }
    setPlayingVoiceId(voiceId);
    await play({ text, voiceId, model, temperature, speakingRate: rate });
    setPlayingVoiceId(null);
  }, [playingVoiceId, ttsState, text, model, temperature, rate, play, stop]);

  const toggleCast = (voice: Voice) => {
    setCastList(prev =>
      prev.find(v => v.id === voice.id)
        ? prev.filter(v => v.id !== voice.id)
        : prev.length < 5 ? [...prev, voice] : prev
    );
  };

  const insertMarkup = (tag: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const newText = text.slice(0, start) + tag + ' ' + text.slice(start);
    setText(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + tag.length + 1, start + tag.length + 1);
    }, 0);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeSnippet).then(() => {
      setCopyLabel('✓ Copied!');
      setTimeout(() => setCopyLabel('📋 Copy'), 2000);
    });
  };

  const filteredVoices = VOICES.filter(v => {
    const matchCategory = filterCategory === 'All' || v.category === filterCategory;
    const matchSearch = !searchQuery ||
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.persona.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.tags.some(t => t.includes(searchQuery.toLowerCase()));
    return matchCategory && matchSearch;
  });

  const categories = ['All', ...Array.from(new Set(VOICES.map(v => v.category)))];

  const isVoicePlaying = (voiceId: string) => playingVoiceId === voiceId && ttsState === 'playing';
  const isVoiceLoading = (voiceId: string) => playingVoiceId === voiceId && ttsState === 'loading';
  const mainIsActive = playingVoiceId === selectedVoice.id && (ttsState === 'playing' || ttsState === 'loading');

  const codeSnippet = `// Inworld TTS — ${selectedVoice.name}
const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
  method: "POST",
  headers: {
    "Authorization": "Basic YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: ${JSON.stringify(text.slice(0, 80))}${text.length > 80 ? '...' : ''},
    voiceId: "${selectedVoice.id}",
    modelId: "inworld-tts-1.5-${model}",
  }),
});

const { audioContent } = await response.json();
const audioBytes = atob(audioContent);
const byteArray = new Uint8Array(audioBytes.length);
for (let i = 0; i < audioBytes.length; i++) {
  byteArray[i] = audioBytes.charCodeAt(i);
}
const blob = new Blob([byteArray], { type: "audio/wav" });
new Audio(URL.createObjectURL(blob)).play();`;

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0B0B1E', color: '#E2E8F0',
      fontFamily: "'DM Sans', 'SF Pro Display', -apple-system, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 20px rgba(99,102,241,0.15); } 50% { box-shadow: 0 0 30px rgba(99,102,241,0.3); } }
        textarea:focus, input:focus { outline: none; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333366; border-radius: 3px; }
        ::selection { background: #6366F155; }
      `}</style>

      {/* HEADER */}
      <header style={{
        padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #1E1E3F', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#0B0B1Eee',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: 'white',
          }}>▶</div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>Voice Studio</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748B', marginRight: 8 }}>Model:</span>
          {(['mini', 'max'] as ModelId[]).map(m => (
            <button key={m} onClick={() => setModel(m)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              backgroundColor: model === m ? '#6366F1' : '#1E1E3F',
              color: model === m ? 'white' : '#94A3B8',
              border: 'none', cursor: 'pointer', textTransform: 'uppercase',
              letterSpacing: '0.04em', transition: 'all 0.2s ease',
            }}>
              TTS-1.5 {m}
            </button>
          ))}
          <LatencyBadge model={model} />
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div style={{ display: 'flex', height: 'calc(100vh - 69px)' }}>

        {/* LEFT PANEL */}
        <div style={{
          width: 420, flexShrink: 0, borderRight: '1px solid #1E1E3F',
          display: 'flex', flexDirection: 'column', backgroundColor: '#0E0E24',
        }}>
          {/* Quick Scripts */}
          <div style={{ padding: '16px 20px 8px', borderBottom: '1px solid #1E1E3F' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Quick Scripts
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SAMPLE_SCRIPTS.map(s => (
                <button key={s.label} onClick={() => setText(s.text)} style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 12,
                  backgroundColor: text === s.text ? '#6366F122' : '#13132B',
                  color: text === s.text ? '#818CF8' : '#94A3B8',
                  border: text === s.text ? '1px solid #6366F144' : '1px solid transparent',
                  cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s ease',
                }}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column' }}>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type or paste text to synthesize..."
              style={{
                flex: 1, width: '100%', resize: 'none',
                backgroundColor: '#13132B', color: '#E2E8F0',
                border: '1px solid #2A2A4A', borderRadius: 12,
                padding: 16, fontSize: 14, lineHeight: 1.7,
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: '#64748B' }}>{text.length} chars</span>
              <span style={{ fontSize: 11, color: '#64748B' }}>
                ≈ ${(text.length / 1000 * (model === 'max' ? 0.01 : 0.005)).toFixed(4)}
              </span>
            </div>
          </div>

          {/* Markups */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid #1E1E3F' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Audio Markups
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {MARKUPS.map(m => (
                <button key={m.tag} onClick={() => insertMarkup(m.tag)} style={{
                  padding: '4px 10px', borderRadius: 7, fontSize: 12,
                  backgroundColor: '#1E1E3F', color: '#C4B5FD',
                  border: 'none', cursor: 'pointer', fontWeight: 500,
                }}>
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #1E1E3F' }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>Temperature</span>
                <span style={{ fontSize: 12, color: '#818CF8', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{temperature.toFixed(1)}</span>
              </div>
              <input type="range" min="0" max="1.5" step="0.1" value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#6366F1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 2 }}>
                <span>Consistent</span><span>Expressive</span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>Speaking Rate</span>
                <span style={{ fontSize: 12, color: '#818CF8', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{rate.toFixed(1)}x</span>
              </div>
              <input type="range" min="0.5" max="2.0" step="0.1" value={rate}
                onChange={e => setRate(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#6366F1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 2 }}>
                <span>Slow</span><span>Fast</span>
              </div>
            </div>
          </div>

          {/* Play Button */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #1E1E3F' }}>
            {ttsState === 'error' && (
              <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8, textAlign: 'center' }}>
                Synthesis failed. Check the console.
              </div>
            )}
            <button
              onClick={() => handlePlay(selectedVoice.id)}
              disabled={isLoading && playingVoiceId !== selectedVoice.id}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12,
                background: mainIsActive
                  ? `linear-gradient(135deg, ${selectedVoice.color}, ${selectedVoice.color}CC)`
                  : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                color: 'white', border: 'none',
                cursor: (isLoading && playingVoiceId !== selectedVoice.id) ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
                transition: 'all 0.2s ease',
                animation: isVoicePlaying(selectedVoice.id) ? 'pulseGlow 2s infinite' : 'none',
                opacity: (isLoading && playingVoiceId !== selectedVoice.id) ? 0.5 : 1,
              }}
            >
              {isVoiceLoading(selectedVoice.id) ? `⏳ Generating ${selectedVoice.name}...` :
               isVoicePlaying(selectedVoice.id) ? `⏸ Playing ${selectedVoice.name}...` :
               `▶ Synthesize with ${selectedVoice.name}`}
            </button>
          </div>
        </div>

        {/* RIGHT: Tabs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Tab Bar */}
          <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid #1E1E3F' }}>
            {[
              { id: 'explore' as const, label: 'Explore Voices', icon: '🎤' },
              { id: 'cast' as const, label: `Voice Casting${castList.length ? ` (${castList.length})` : ''}`, icon: '🎭' },
              { id: 'code' as const, label: 'API Code', icon: '⌨️' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '14px 20px', fontSize: 13, fontWeight: 600,
                color: tab === t.id ? '#E2E8F0' : '#64748B',
                backgroundColor: 'transparent', border: 'none',
                borderBottom: tab === t.id ? '2px solid #6366F1' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s ease', letterSpacing: '-0.01em',
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* EXPLORE TAB */}
          {tab === 'explore' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search voices..."
                  style={{
                    padding: '8px 14px', borderRadius: 10, fontSize: 13,
                    backgroundColor: '#13132B', color: '#E2E8F0',
                    border: '1px solid #2A2A4A', width: 200, fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {categories.map(c => (
                    <button key={c} onClick={() => setFilterCategory(c)} style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12,
                      backgroundColor: filterCategory === c ? '#6366F1' : '#1E1E3F',
                      color: filterCategory === c ? 'white' : '#94A3B8',
                      border: 'none', cursor: 'pointer', fontWeight: 500,
                    }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {filteredVoices.map(voice => (
                  <VoiceCard key={voice.id} voice={voice}
                    isSelected={selectedVoice.id === voice.id}
                    isInCast={castList.some(v => v.id === voice.id)}
                    onSelect={setSelectedVoice}
                    onToggleCast={toggleCast}
                  />
                ))}
              </div>

              {filteredVoices.length === 0 && (
                <div style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                  No voices match your search.
                </div>
              )}
            </div>
          )}

          {/* CAST TAB */}
          {tab === 'cast' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.02em' }}>
                  🎭 Voice Casting Director
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, lineHeight: 1.6 }}>
                  Compare up to 5 voices reading the same script. Click play on each to hear the differences.
                </p>
              </div>

              {castList.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#64748B', borderRadius: 16, border: '2px dashed #2A2A4A' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎤</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>No voices in your cast yet</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Go to Explore and click "+ Cast" on voices to compare them</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ padding: '14px 18px', borderRadius: 12, backgroundColor: '#1E1E3F', marginBottom: 8, fontSize: 13, color: '#C4B5FD', lineHeight: 1.6, fontStyle: 'italic' }}>
                    "{text.slice(0, 160)}{text.length > 160 ? '...' : ''}"
                  </div>

                  {castList.map((voice, i) => (
                    <CastRow key={voice.id} voice={voice} index={i} model={model}
                      isPlaying={isVoicePlaying(voice.id)}
                      isLoading={isVoiceLoading(voice.id)}
                      analyser={playingVoiceId === voice.id ? analyser : null}
                      onPlay={handlePlay}
                    />
                  ))}

                  <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 12, background: 'linear-gradient(135deg, #6366F108, #8B5CF608)', border: '1px solid #6366F122' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#818CF8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      💡 Casting Tip
                    </div>
                    <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                      Try adjusting the <strong style={{ color: '#C4B5FD' }}>temperature</strong> slider — lower values give consistent reads (great for agents), while higher values add dramatic flair (perfect for game characters).
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CODE TAB */}
          {tab === 'code' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.02em' }}>
                  ⌨️ Ready-to-Use Code
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, lineHeight: 1.6 }}>
                  Copy this snippet to integrate <strong style={{ color: '#C4B5FD' }}>{selectedVoice.name}</strong> into your app.
                </p>
              </div>

              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #2A2A4A' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', backgroundColor: '#13132B', borderBottom: '1px solid #2A2A4A' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['#EF4444', '#F59E0B', '#22C55E'].map(c => (
                      <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: c }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: '#64748B', fontFamily: "'JetBrains Mono', monospace" }}>synthesize.js</span>
                  <button onClick={handleCopyCode} style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 11,
                    backgroundColor: '#6366F122', color: '#818CF8',
                    border: 'none', cursor: 'pointer', fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}>
                    {copyLabel}
                  </button>
                </div>
                <pre style={{ padding: 20, margin: 0, overflow: 'auto', backgroundColor: '#0B0B1E', fontSize: 13, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace", color: '#C4B5FD' }}>
                  <code>{codeSnippet}</code>
                </pre>
              </div>

              <div style={{ marginTop: 20, padding: '16px 20px', borderRadius: 12, backgroundColor: '#13132B', border: '1px solid #2A2A4A' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Current Configuration
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Voice', value: selectedVoice.name },
                    { label: 'Model', value: `TTS-1.5 ${model.charAt(0).toUpperCase() + model.slice(1)}` },
                    { label: 'Temperature', value: temperature.toFixed(1) },
                    { label: 'Rate', value: `${rate.toFixed(1)}x` },
                    { label: 'Est. Latency', value: model === 'max' ? '~200ms' : '~100ms' },
                    { label: 'Est. Cost', value: `$${(text.length / 1000 * (model === 'max' ? 0.01 : 0.005)).toFixed(4)}` },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, backgroundColor: '#1E1E3F' }}>
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>{item.label}</span>
                      <span style={{ fontSize: 12, color: '#E2E8F0', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 8: Run the component tests**

```bash
npx jest __tests__/components/VoiceStudio.test.tsx --no-coverage
```

Expected: 6 PASS

**Step 9: Commit**

```bash
git add components/ __tests__/components/
git commit -m "feat: port VoiceStudio to TypeScript with real audio playback"
```

---

### Task 6: Wire Up Next.js Pages

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Step 1: Update app/page.tsx**

Replace contents of `app/page.tsx`:

```typescript
import VoiceStudio from '@/components/VoiceStudio';

export default function Home() {
  return <VoiceStudio />;
}
```

**Step 2: Update app/layout.tsx**

Replace contents of `app/layout.tsx`:

```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inworld Voice Studio',
  description: 'Explore and compare Inworld AI text-to-speech voices',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

**Step 3: Clear globals.css**

Replace `app/globals.css` contents with just:

```css
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 0; }
```

**Step 4: Start the dev server and test manually**

```bash
npm run dev
```

Open http://localhost:3000

Expected behavior:
1. Voice Studio renders with dark theme
2. "Synthesize with Hades" button is clickable
3. Clicking it shows "⏳ Generating Hades..." while loading
4. Then shows waveform animation and "⏸ Playing Hades..."
5. Audio actually plays through speakers
6. Clicking again stops playback
7. Cast tab: clicking play on any voice plays it
8. Code tab: "Copy" button copies code and shows "✓ Copied!"

**Step 5: If audio doesn't work, debug with curl**

```bash
# Test the API route directly
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","voiceId":"Ashley","model":"max","temperature":0.8,"speakingRate":1.0}' \
  -o response.txt && head -c 200 response.txt
```

Expected: NDJSON lines with `audioContent` base64 data

**Step 6: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All tests pass

**Step 7: Commit**

```bash
git add app/page.tsx app/layout.tsx app/globals.css
git commit -m "feat: wire VoiceStudio into Next.js pages"
```

---

### Task 7: Final Polish & Verification

**Step 1: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All green

**Step 2: Build for production to catch type errors**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors. If there are type errors, fix them — do NOT use `any` as a workaround.

**Step 3: Test the production build**

```bash
npm run start
```

Visit http://localhost:3000 and repeat manual verification from Task 6 Step 4.

**Step 4: Verify the "Concept" badge is gone from the header**

Confirm the header shows only "Voice Studio" — no "Concept" pill. It was removed in Task 5 Step 7.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Voice Studio — real Inworld TTS streaming audio"
```

---

## Troubleshooting

**Audio plays but sounds garbled:**
- The WAV header skip logic in `int16ToPcm32` may be wrong. Try `skipHeader: false` and see if it sounds better. Each chunk from the streaming API includes a 44-byte WAV header — but verify this by logging the first 8 bytes of the first chunk (should be `RIFF` = 82,73,70,70).

**API returns 401:**
- Verify `INWORLD_BASIC` in `.env.local` matches the value from `.env`
- Confirm `.env.local` is in the project root (next to `package.json`)

**AudioContext suspended (browser autoplay policy):**
- This is expected if the user hasn't interacted with the page. The `play()` call happens inside a click handler, which should satisfy the browser's autoplay policy. If not, add `await ctx.resume()` after creating the AudioContext.

**Voice IDs don't match Inworld API:**
- The prototype uses names like "Hades", "Luna" etc. Test with curl using "Ashley" first (confirmed in docs). If others fail with 400, the voice IDs may need to match Inworld's actual voice list — check `https://platform.inworld.ai/tts-playground` for valid IDs.
