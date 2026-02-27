# Inworld Voice Studio

A live TTS playground built to explore the Inworld voice API — letting you audition voices, compare them side-by-side, and grab working code for your own projects.

> **Try it:** `npm install && npm run dev` → [localhost:3000](http://localhost:3000)
> Add your `INWORLD_BASIC` key to `.env.local` (see `.env.example`).

---

## What it does

**Explore** — Browse 12 voices across Character, Narrator, and Conversational categories. Search, filter, and click any voice to set it as the active speaker.

**Synthesize** — Type or pick a sample script, dial in temperature and speaking rate, hit play. Audio streams back in real time — the waveform animates from actual frequency data, not a simulation.

**Voice Casting** — Add up to 5 voices to a cast and play each against the same script. Useful for quickly finding the right voice for a game NPC, an audiobook, or a voice agent.

**API Code** — The code tab generates a ready-to-copy snippet that stays in sync with your current voice, model, and settings.

---

## How it's built

### Streaming audio pipeline

The play button calls a Next.js API route (`/api/tts`) rather than hitting Inworld directly. The route keeps the API key server-side and pipes the streaming response back to the browser as NDJSON. On the client, a `useTTS` hook reads the stream line-by-line, decodes each base64 LINEAR16 chunk (stripping the 44-byte WAV header), converts INT16 PCM to Float32, and schedules the buffers on an `AudioContext` with precise start times for gapless playback.

The waveform is driven by an `AnalyserNode` in the same audio graph — no fake animation.

### Architecture decisions

**Server-side proxy** — Credentials never reach the browser. The API route also validates the model against an allowlist before forwarding, so the URL can't be probed with arbitrary model strings.

**useTTS hook** — All audio state (loading, playing, error, idle) lives in one place. An `AbortController` cancels in-flight requests on stop or voice switch. A `useEffect` cleanup ensures the `AudioContext` is closed on unmount, avoiding the silent resource leak that's easy to miss with Web Audio.

**Stale closure guard** — `handlePlay` uses a ref alongside state to track the active voice ID. Without it, rapidly switching voices produces a race where the post-`await` cleanup clears the wrong voice's playing indicator.

### Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 (strict mode) |
| Audio | Web Audio API — `AudioContext`, `AnalyserNode`, `AudioBufferSourceNode` |
| Testing | Jest + Testing Library, 16 tests |
| Styling | Inline CSS — self-contained, no build step for styles |

---

## Testing

```bash
npm test
```

The test suite covers the full stack: API route behavior (auth, param forwarding, error passthrough), hook state transitions (idle → loading → playing → idle, abort, error), and component rendering. The hook tests use a hand-built LINEAR16 WAV fixture rather than a stub, so the PCM decoding path is actually exercised.

---

## Project layout

```
app/
  api/tts/route.ts     Server proxy — keeps API key out of the browser
  page.tsx             Renders VoiceStudio
components/
  VoiceStudio.tsx      Main playground — tabs, controls, state
  Waveform.tsx         AnalyserNode-driven frequency visualizer
  VoiceCard.tsx        Selectable voice tile
  CastRow.tsx          Casting comparison row
  LatencyBadge.tsx     Model latency indicator
hooks/
  useTTS.ts            Streaming audio hook — fetch, decode, schedule, clean up
types/
  index.ts             Shared interfaces (Voice, TTSRequest, PlayState, …)
```
