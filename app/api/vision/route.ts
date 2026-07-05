import { NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: Request) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }, { status: 500 });
  }

  const formData = await request.formData();
  const photo = formData.get('photo');
  const description = String(formData.get('description') || '').trim();

  if (!photo || !(photo instanceof File)) {
    return NextResponse.json({ error: 'Photo is required.' }, { status: 400 });
  }

  const buffer = Buffer.from(await photo.arrayBuffer());
  const base64 = buffer.toString('base64');

  const prompt = `画像に写っている料理について、以下をJSONで返してください。500円玉が写っていれば量の推定に使ってください。追加情報: ${description || 'なし'}
必ず以下の形式のJSONのみ返してください:
{"name":"料理名","amountText":"推定量","calories":0,"protein":0,"fat":0,"carbs":0,"salt":0}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: photo.type,
                data: base64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: `Claude API error: ${response.status} ${errorText}` }, { status: 500 });
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || '';

  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const parsed = JSON.parse(text.slice(start, end + 1));
    return NextResponse.json({ estimate: parsed });
  } catch {
    return NextResponse.json({ error: 'Unable to parse response.', raw: text }, { status: 500 });
  }
}