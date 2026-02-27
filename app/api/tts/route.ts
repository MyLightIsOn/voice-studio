import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_MODELS = ['mini', 'max'];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body?.text || !body?.voiceId) {
    return NextResponse.json({ error: 'text and voiceId are required' }, { status: 400 });
  }

  const { text, voiceId, model = 'max', temperature, speakingRate } = body;

  if (!ALLOWED_MODELS.includes(model)) {
    return NextResponse.json(
      { error: `model must be one of: ${ALLOWED_MODELS.join(', ')}` },
      { status: 400 }
    );
  }

  const apiKey = process.env.INWORLD_BASIC;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  let inworldRes: Response;
  try {
    inworldRes = await fetch('https://api.inworld.ai/tts/v1/voice:stream', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: voiceId,
        model_id: `inworld-tts-1.5-${model}`,
        ...(temperature !== undefined && { temperature }),
        ...(speakingRate !== undefined && { speaking_rate: speakingRate }),
        audio_config: {
          audio_encoding: 'LINEAR16',
          sample_rate_hertz: 24000,
        },
      }),
    });
  } catch (err) {
    console.error('Inworld fetch failed:', err);
    return NextResponse.json({ error: 'Failed to reach Inworld API' }, { status: 500 });
  }

  if (!inworldRes.ok) {
    const errText = await inworldRes.text();
    console.error('Inworld API error:', inworldRes.status, errText);
    return NextResponse.json(
      { error: `Inworld API error: ${inworldRes.status}` },
      { status: 500 }
    );
  }

  if (!inworldRes.body) {
    console.error('Inworld API returned null body');
    return NextResponse.json({ error: 'Inworld API returned empty body' }, { status: 500 });
  }

  // Pipe the streaming NDJSON response directly to the client
  return new Response(inworldRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson',
    },
  });
}
