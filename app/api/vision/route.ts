import { NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: Request) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }, { status: 500 });
  }

  const formData = await request.formData();
  const photo = formData.get('photo');
  const description = String(formData.get('description') || '').trim();
  const mode = String(formData.get('mode') || 'food');
  const foodName = String(formData.get('foodName') || '').trim();
  const foodAmount = String(formData.get('foodAmount') || '').trim();
  const consumedGrams = Number(formData.get('consumedGrams') || 100);

  if (mode !== 'text' && (!photo || !(photo instanceof File))) {
    return NextResponse.json({ error: 'Photo is required.' }, { status: 400 });
  }

  const prompt = mode === 'text'
    ? `次の食品名・料理名から、一般的な日本の食品データベースを参考に、おおよその栄養素を推定してJSONだけを返してください。正確な商品名でなくても、類似品や一般的な分量を使って推定してください。入力: 食品名/料理名="${foodName || '不明'}", 量="${foodAmount || '未指定'}", 補足="${description || 'なし'}"。\n必ず以下の形式のJSONのみ返してください:\n{"name":"食品名","amountText":"1人前","calories":0,"protein":0,"fat":0,"carbs":0,"salt":0}`
    : mode === 'label'
      ? `この画像には食品パッケージの栄養成分表示が写っています。以下のJSONだけを返してください。食品名、栄養表示の基準量、100gあたりの栄養素値、または栄養表示の量を読み取ってください。追加情報: ${description || 'なし'}\n必ず以下の形式のJSONのみ返してください:\n{"mode":"label","name":"食品名","amountText":"100gあたり","baseAmount":100,"baseUnit":"g","calories":0,"protein":0,"fat":0,"carbs":0,"salt":0}`
      : `画像に写っている料理について、以下をJSONで返してください。500円玉が写っていれば量の推定に使ってください。追加情報: ${description || 'なし'}\n必ず以下の形式のJSONのみ返してください:\n{"name":"料理名","amountText":"推定量","calories":0,"protein":0,"fat":0,"carbs":0,"salt":0}`;

  const contentParts = mode === 'text'
    ? [{ type: 'text', text: prompt }]
    : [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: (photo as File).type,
            data: Buffer.from(await (photo as File).arrayBuffer()).toString('base64'),
          },
        },
        { type: 'text', text: prompt },
      ];

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
          content: contentParts,
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
    if (mode === 'label') {
      parsed.mode = 'label';
      parsed.consumedGrams = consumedGrams;
    }
    return NextResponse.json({ estimate: parsed });
  } catch {
    return NextResponse.json({ error: 'Unable to parse response.', raw: text }, { status: 500 });
  }
}