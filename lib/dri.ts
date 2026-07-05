import driData from '../data/dri-2025.json';

type Profile = { age: number; sex: 'male' | 'female'; weight: number; activity: 'low' | 'moderate' | 'high' };

function ageRange(age: number): string {
  if (age >= 18 && age <= 29) return '18-29';
  if (age >= 30 && age <= 49) return '30-49';
  if (age >= 50 && age <= 69) return '50-69';
  return '30-49';
}

export function getDRI(profile: Profile) {
  const range = ageRange(profile.age);
  const sex = profile.sex;
  const base = (driData as any)[sex]?.[range];
  if (!base) {
    return { kcal: 2000, protein: 50, fat: 60, carbs: 250, salt: 7 };
  }

  // Apply activity modifier to kcal
  const pal = profile.activity === 'low' ? 0.95 : profile.activity === 'high' ? 1.1 : 1.0;
  const kcal = Math.round(base.kcal * pal);

  // Protein can be adjusted by weight if available; keep base as guideline
  const protein = base.protein;
  const fat = base.fat;
  const carbs = base.carbs;
  const salt = base.salt;

  return { kcal, protein, fat, carbs, salt };
}
