import driData from '../data/dri-2025.json';

// Daily energy and nutrient targets from:
// - 日本人の食事摂取基準（2025年版） (tables in data/dri-2025.json, with page numbers)
// - 国立健康・栄養研究所の式 (Ganpule et al., Eur J Clin Nutr 2007;61:1256-61),
//   as listed in the same report, エネルギー 表2 p.65.

export type Sex = 'male' | 'female';
export type ActivityLevel = 'low' | 'moderate' | 'high';
export type AgeGroup = '18-29' | '30-49' | '50-64' | '65-74' | '75+';

export type EnergyProfile = {
  age: number;
  sex: Sex;
  weight: number;
  height: number | null;
  activity: ActivityLevel;
};

export type Requirements = {
  ageGroup: AgeGroup;
  // Ganpule BMR (kcal/day), before rounding.
  bmr: number;
  // Activity level actually used (75+ has no 「高い」, which falls back to 「ふつう」).
  activity: ActivityLevel;
  pal: number;
  // BMR × PAL, the requirement before the day's exercise.
  baseEnergy: number;
  exerciseNet: number;
  // baseEnergy + exerciseNet: the energy all targets below are derived from.
  energy: number;
  proteinPct: number;
  proteinTargetPct: [number, number];
  proteinG: number;
  // 推奨量, shown separately to check intake does not fall below it.
  proteinRda: number;
  fatPct: number;
  fatG: number;
  carbsPct: number;
  carbsG: number;
  // 目標量: intake should stay below this.
  saltMaxG: number;
  warnings: string[];
};

export type RequirementsResult =
  | { ok: true; value: Requirements }
  | { ok: false; reason: string };

export const MIN_AGE = 18;
// Ganpule's equation was validated for ages 18-79 (derived from 20-74).
export const GANPULE_MAX_VALIDATED_AGE = 79;
export const FAT_PCT = 25;

type ActivityTable = Record<ActivityLevel, number | null>;
type ProteinRow = { rda: number; targetPct: [number, number] };

const palTable = driData.physicalActivityLevel as unknown as Record<AgeGroup, ActivityTable>;
const proteinTable = driData.protein as unknown as Record<Sex, Record<AgeGroup, ProteinRow>>;
const saltTable = driData.saltTarget as unknown as Record<Sex, number>;

export const ageGroupOf = (age: number): AgeGroup | null => {
  if (!Number.isFinite(age) || age < MIN_AGE) return null;
  if (age <= 29) return '18-29';
  if (age <= 49) return '30-49';
  if (age <= 64) return '50-64';
  if (age <= 74) return '65-74';
  return '75+';
};

export const hasHighActivityLevel = (age: number) => {
  const group = ageGroupOf(age);
  return group != null && palTable[group].high != null;
};

// 国立健康・栄養研究所の式: (0.0481W + 0.0234H − 0.0138A − c) × 1000 / 4.186,
// c = 0.4235 (male) / 0.9708 (female). W kg, H cm, A years → kcal/day.
export const ganpuleBmr = (sex: Sex, weight: number, height: number, age: number) => {
  const constant = sex === 'male' ? 0.4235 : 0.9708;
  return ((0.0481 * weight + 0.0234 * height - 0.0138 * age - constant) * 1000) / 4.186;
};

// Exercise adds only what it burns above rest; resting energy is already in BMR × PAL.
// METs: (MET − 1) × kg × h.
export const netMetKcal = (met: number, weightKg: number, hours: number) =>
  Math.max(0, met - 1) * weightKg * hours;

// Running (ACSM metabolic equation, horizontal component): net VO2 0.2 mL/kg/m,
// at ~5 kcal per litre of O2 → 1.0 kcal per kg per km.
export const netRunningKcal = (weightKg: number, km: number) => weightKg * km * 1.0;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function calcRequirements(profile: EnergyProfile, exerciseNetKcal = 0): RequirementsResult {
  const ageGroup = ageGroupOf(profile.age);
  if (!ageGroup) {
    return { ok: false, reason: '18歳未満は対象外です（成人向けの食事摂取基準と推定式を使っているため）。' };
  }
  if (!profile.height || profile.height <= 0) {
    return { ok: false, reason: '身長を入力すると計算できます。' };
  }
  if (!profile.weight || profile.weight <= 0) {
    return { ok: false, reason: '体重を入力すると計算できます。' };
  }

  const warnings: string[] = [];
  if (profile.age > GANPULE_MAX_VALIDATED_AGE) {
    warnings.push(`国立健康・栄養研究所の式の妥当性が確認されている年齢（18〜${GANPULE_MAX_VALIDATED_AGE}歳）を超えています。目安としてご覧ください。`);
  }

  const bmr = ganpuleBmr(profile.sex, profile.weight, profile.height, profile.age);
  const palRow = palTable[ageGroup];
  let activity = profile.activity;
  if (palRow[activity] == null) {
    activity = 'moderate';
    warnings.push('75歳以上には「高い」の区分がないため、「ふつう」で計算しています。');
  }
  const pal = palRow[activity] as number;

  const baseEnergy = Math.round(bmr * pal);
  const exerciseNet = Math.max(0, Math.round(exerciseNetKcal));
  const energy = baseEnergy + exerciseNet;

  const protein = proteinTable[profile.sex][ageGroup];
  const proteinPct = (protein.targetPct[0] + protein.targetPct[1]) / 2;
  const carbsPct = 100 - proteinPct - FAT_PCT;
  const proteinG = round1((energy * proteinPct) / 100 / 4);
  if (proteinG < protein.rda) {
    warnings.push(`たんぱく質の目標（${proteinG}g）が推奨量（${protein.rda}g）を下回っています。推奨量以上をとるようにしてください。`);
  }

  return {
    ok: true,
    value: {
      ageGroup,
      bmr,
      activity,
      pal,
      baseEnergy,
      exerciseNet,
      energy,
      proteinPct,
      proteinTargetPct: protein.targetPct,
      proteinG,
      proteinRda: protein.rda,
      fatPct: FAT_PCT,
      fatG: round1((energy * FAT_PCT) / 100 / 9),
      carbsPct,
      carbsG: round1((energy * carbsPct) / 100 / 4),
      saltMaxG: saltTable[profile.sex],
      warnings,
    },
  };
}
