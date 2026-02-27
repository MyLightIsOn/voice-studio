/**
 * @jest-environment node
 */
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
