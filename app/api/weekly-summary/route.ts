import { NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

type WeeklySummaryRequest = {
  periodStart: string;
  periodEnd: string;
  averages: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    salt: number;
  };
  exerciseCaloriesTotal: number;
  // Null when targets cannot be calculated (under 18, or height/weight missing).
  recommendedDaily: {
    calories: number;
    protein: number;
    proteinRda: number;
    fat: number;
    carbs: number;
    salt: number;
  } | null;
  healthTrend?: Array<{
    date: string;
    weight: number | null;
    systolicBp: number | null;
    diastolicBp: number | null;
    pulse: number | null;
  }>;
  profile?: {
    age?: number;
    sex?: 'male' | 'female';
    weight?: number;
    activity?: 'low' | 'moderate' | 'high';
  };
};

const parseJsonFromText = (text: string) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON parse failed');
  }
  return JSON.parse(text.slice(start, end + 1));
};

export async function POST(request: Request) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }, { status: 500 });
  }

  const body = (await request.json()) as WeeklySummaryRequest;
  if (!body?.periodStart || !body?.periodEnd || !body?.averages) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const prompt = [
    'あなたは管理栄養士です。次の7日間データを分析し、簡潔で実用的なアドバイスを作成してください。',
    '出力は必ずJSONのみで、説明文やMarkdownは不要です。',
    'JSON形式は以下を厳守してください。',
    '{',
    '  "overview": "全体所見を1-2文",',
    '  "nutrientComparison": [',
    '    {"nutrient":"カロリー|タンパク質|脂質|炭水化物|食塩相当量","status":"不足|適正|過剰","comment":"理由を短く"}',
    '  ],',
    '  "patternInsights": ["食事パターンの傾向を短文で3件以内"],',
    '  "actionSuggestions": ["改善提案を具体的に3件以内"],',
    '  "healthTrend": ["体重・血圧の推移コメントを短文で3件以内"]',
    '}',
    '',
    `対象期間: ${body.periodStart} から ${body.periodEnd}`,
    `7日平均摂取: kcal=${body.averages.calories}, P=${body.averages.protein}g, F=${body.averages.fat}g, C=${body.averages.carbs}g, 塩=${body.averages.salt}g`,
    `7日運動消費カロリー合計: ${body.exerciseCaloriesTotal} kcal`,
    body.recommendedDaily
      ? `1日の目標（日本人の食事摂取基準2025年版と国立健康・栄養研究所の式による。エネルギー=基礎代謝×身体活動レベル＋週平均の運動(正味)）: kcal=${body.recommendedDaily.calories}, P=${body.recommendedDaily.protein}g（推奨量${body.recommendedDaily.proteinRda}g以上）, F=${body.recommendedDaily.fat}g, C=${body.recommendedDaily.carbs}g, 食塩相当量=${body.recommendedDaily.salt}g未満`
      : '1日の目標: 算出できません（18歳未満、または身長・体重が未入力）。目標との比較は行わないでください。',
    `健康記録推移: ${JSON.stringify(body.healthTrend || [])}`,
    `プロフィール: ${JSON.stringify(body.profile || {})}`,
  ].join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
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
    const parsed = parseJsonFromText(text);
    const analysis = {
      overview: String(parsed.overview || '先週のデータ分析が完了しました。'),
      nutrientComparison: Array.isArray(parsed.nutrientComparison)
        ? parsed.nutrientComparison.slice(0, 5).map((item: any) => ({
            nutrient: String(item?.nutrient || '不明'),
            status: (['不足', '適正', '過剰'].includes(String(item?.status)) ? String(item?.status) : '適正') as '不足' | '適正' | '過剰',
            comment: String(item?.comment || ''),
          }))
        : [],
      patternInsights: Array.isArray(parsed.patternInsights)
        ? parsed.patternInsights.slice(0, 3).map((item: any) => String(item || '')).filter(Boolean)
        : [],
      actionSuggestions: Array.isArray(parsed.actionSuggestions)
        ? parsed.actionSuggestions.slice(0, 3).map((item: any) => String(item || '')).filter(Boolean)
        : [],
      healthTrend: Array.isArray(parsed.healthTrend)
        ? parsed.healthTrend.slice(0, 3).map((item: any) => String(item || '')).filter(Boolean)
        : [],
    };

    return NextResponse.json({ analysis });
  } catch {
    return NextResponse.json({ error: 'Unable to parse Claude response.', raw: text }, { status: 500 });
  }
}
