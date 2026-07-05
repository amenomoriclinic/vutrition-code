import driData from '../data/dri-2025.json';

type Profile = { age: number; sex: 'male' | 'female'; weight: number; activity: 'low' | 'moderate' | 'high' };

function ageRange(age: number): string {
  if (age >= 18 && age <= 29) return '18-29';
  if (age >= 30 && age <= 49) return '30-49';
  if (age >= 50 && age <= 64) return '50-64';
  if (age >= 65 && age <= 74) return '65-74';
  return '75+';
}

export function getDRI(profile: Profile) {
  const range = ageRange(profile.age);
  const sex = profile.sex;
  const base = (driData as any)[sex]?.[range];
  if (!base) {
    return { kcal: 2000, protein: 50, fat_pct_min: 20, fat_pct_max: 30, carbs_pct_min: 50, carbs_pct_max: 65, salt: 7 };
  }

  // base.kcal in the table corresponds to 'ふつう' (moderate). Apply small modifiers for activity.
  const pal = profile.activity === 'low' ? 0.95 : profile.activity === 'high' ? 1.1 : 1.0;
  const kcal = Math.round(base.kcal * pal);

  const protein = base.protein;
  const fat_pct_min = base.fat_pct_min ?? base.fat_pct_min;
  const fat_pct_max = base.fat_pct_max ?? base.fat_pct_max;
  const carbs_pct_min = base.carbs_pct_min ?? base.carbs_pct_min;
  const carbs_pct_max = base.carbs_pct_max ?? base.carbs_pct_max;
  const salt = base.salt;

  return { kcal, protein, fat_pct_min, fat_pct_max, carbs_pct_min, carbs_pct_max, salt };
}
