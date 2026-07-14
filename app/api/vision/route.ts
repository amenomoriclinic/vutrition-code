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
  const labelDisplayUnit = String(formData.get('labelDisplayUnit') || 'per100g');
  const labelBaseAmount = Number(formData.get('labelBaseAmount') || 100);
  const labelBaseUnit = String(formData.get('labelBaseUnit') || 'g').trim();
  const actualAmount = Number(formData.get('actualAmount') || labelBaseAmount || 100);
  const actualUnit = String(formData.get('actualUnit') || labelBaseUnit || 'g').trim();

  const unitText = labelDisplayUnit === 'perPiece'
    ? '1個（1本・1袋）あたり'
    : labelDisplayUnit === 'per100ml'
      ? '100mlあたり'
      : labelDisplayUnit === 'perServing'
        ? '1食分あたり'
        : '100gあたり';

  // Coerce Claude's detected unit (本/袋/枚/人前 ...) into one of our known units.
  const normalizeLabelUnit = (value: unknown): string => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'g' || raw.includes('グラム')) return 'g';
    if (raw === 'ml' || raw.includes('ミリ')) return 'ml';
    if (/個|本|袋|枚|杯|粒|切れ|piece|pcs?/.test(raw)) return '個';
    if (/食分|人前|食|serving|meal/.test(raw)) return '食分';
    return 'g';
  };

  const inferAbsorptionRate = (name: string, currentMode: string) => {
    if (currentMode === 'label') return 0.85;
    const n = name.toLowerCase();
    const processedHints = /イノラス|エンシュア|プロテイン|スナック|カップ麺|ハム|ソーセージ|加工|レトルト|缶詰|インスタント|ドレッシング|マヨ|調味料|ジュース|清涼飲料|菓子|パン/.test(n);
    return processedHints ? 0.85 : 0.5;
  };

  if (mode !== 'text' && (!photo || !(photo instanceof File))) {
    return NextResponse.json({ error: 'Photo is required.' }, { status: 400 });
  }

  const prompt = mode === 'text'
    ? `次の食品名・料理名から、一般的な日本の食品データベースを参考に、おおよその栄養素を推定してJSONだけを返してください。正確な商品名でなくても、類似品や一般的な分量を使って推定してください。リン含有量(mg)と吸収率も必ず返してください。吸収率ルール: 天然食品は0.5、加工食品・経腸栄養剤は0.85。入力: 食品名/料理名="${foodName || '不明'}", 量="${foodAmount || '未指定'}", 補足="${description || 'なし'}"。\n必ず以下の形式のJSONのみ返してください:\n{"name":"食品名","amountText":"1人前","calories":0,"protein":0,"fat":0,"carbs":0,"salt":0,"phosphorus":0,"phosphorusAbsorptionRate":0.5}`
    : mode === 'label'
      ? `この画像には食品パッケージの栄養成分表示が写っています。まず、栄養成分表示に記載されている「表示単位（基準量）」をラベルからそのまま読み取ってください。表示単位の例: 「100gあたり」「1個あたり」「1本あたり」「1袋あたり」「100mlあたり」「1食分あたり」など。読み取った表示単位を次の3つで返してください: amountText(例:"100gあたり")、baseAmount(数値、例:100 や 1)、baseUnit("g" | "ml" | "個" | "食分" のいずれか。1個/1本/1袋/1枚 は "個"、1食分/1人前 は "食分"）。栄養値はその表示単位「あたり」の値をそのまま返し、換算は行わないでください。表示単位が読み取れない場合のみ 100gあたり を用いてください。リン含有量(mg)も返し、吸収率は加工食品として0.85にしてください。追加情報: ${description || 'なし'}\n必ず以下の形式のJSONのみ返してください:\n{"mode":"label","name":"食品名","amountText":"100gあたり","baseAmount":100,"baseUnit":"g","calories":0,"protein":0,"fat":0,"carbs":0,"salt":0,"phosphorus":0,"phosphorusAbsorptionRate":0.85}`
      : `画像に写っている料理について、以下をJSONで返してください。500円玉が写っていれば量の推定に使ってください。リン含有量(mg)と吸収率も返してください。吸収率ルール: 天然食品は0.5、加工食品・経腸栄養剤は0.85。追加情報: ${description || 'なし'}\n必ず以下の形式のJSONのみ返してください:\n{"name":"料理名","amountText":"推定量","calories":0,"protein":0,"fat":0,"carbs":0,"salt":0,"phosphorus":0,"phosphorusAbsorptionRate":0.5}`;

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
    const parsedName = String(parsed.name || foodName || '食品');
    const fallbackAbsorptionRate = inferAbsorptionRate(parsedName, mode);
    const parsedPhosphorus = Number(parsed.phosphorus ?? parsed.phosphorous ?? parsed.phosphorusMg ?? parsed.phosphorus_mg);
    parsed.phosphorus = Number.isFinite(parsedPhosphorus) ? parsedPhosphorus : 0;
    const parsedRate = Number(parsed.phosphorusAbsorptionRate ?? parsed.phosphorus_absorption_rate ?? parsed.absorptionRate);
    parsed.phosphorusAbsorptionRate = Math.max(0, Math.min(1, Number.isFinite(parsedRate) ? parsedRate : fallbackAbsorptionRate));
    if (mode === 'label') {
      parsed.mode = 'label';
      parsed.consumedGrams = consumedGrams;
      const detectedBaseAmount = Number(parsed.baseAmount);
      parsed.baseAmount = Number.isFinite(detectedBaseAmount) && detectedBaseAmount > 0 ? detectedBaseAmount : (labelBaseAmount || 100);
      parsed.baseUnit = normalizeLabelUnit(parsed.baseUnit || labelBaseUnit);
      parsed.amountText = String(parsed.amountText || `${parsed.baseAmount}${parsed.baseUnit}あたり`);
      parsed.phosphorusAbsorptionRate = 0.85;
    }
    return NextResponse.json({ estimate: parsed });
  } catch {
    return NextResponse.json({ error: 'Unable to parse response.', raw: text }, { status: 500 });
  }
}