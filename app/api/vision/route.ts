import { NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_API_URL = process.env.CLAUDE_API_URL ?? 'https://api.anthropic.com/v1/responses';

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
  const imageDataUrl = `data:${photo.type};base64,${base64}`;

  const prompt = `あなたは栄養管理アプリのサーバーです。以下の指示に従ってください。

画像に写っている料理について、以下をJSONで返してください。
- 料理名
- 推定量（グラムまたは個数などのわかりやすい表現）
- カロリー
- タンパク質
- 脂質
- 炭水化物
- 食塩相当量

もし500円玉が画像に含まれていれば、その基準物を使って量を推定してください。
追加情報: ${description || 'なし'}

出力は必ず厳密なJSONとして返してください。例:
{
  "name": "ガスト チーズINハンバーグ",
  "amountText": "1個(約200g)",
  "calories": 630,
  "protein": 28,
  "fat": 44,
  "carbs": 28,
  "salt": 2.4
}`;

  const body = {
    model: 'claude-3.5-vision',
    input: [
      { type: 'text', text: prompt },
      { type: 'image', image_url: imageDataUrl }
    ]
  };

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANTHROPIC_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: `Claude API error: ${response.status} ${errorText}` }, { status: 500 });
  }

  const result = await response.json();
  const output = Array.isArray(result.output) ? result.output : result;
  const text = extractText(output);

  try {
    const jsonText = extractJson(text);
    const parsed = JSON.parse(jsonText);
    return NextResponse.json({ estimate: parsed });
  } catch (error) {
    return NextResponse.json({ error: 'Unable to parse Claude response as JSON.', raw: text }, { status: 500 });
  }
}

function extractText(output: any): string {
  if (!output) return '';
  if (Array.isArray(output)) {
    return output
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.text) return item.text;
        if (Array.isArray(item?.content)) return item.content.map((c: any) => c.text || '').join('');
        return '';
      })
      .join('\n');
  }
  if (typeof output === 'string') return output;
  if (output?.text) return output.text;
  if (Array.isArray(output?.content)) return output.content.map((c: any) => c.text || '').join('');
  return JSON.stringify(output);
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON not found');
  }
  return text.slice(start, end + 1);
}
