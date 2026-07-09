'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import supabase, { isSupabaseConfigured } from '../lib/supabase';
import NutritionChart from './components/NutritionChart';
import { getDRI } from '../lib/dri';

type Sex = 'male' | 'female';
type ActivityLevel = 'low' | 'moderate' | 'high';
type LabelDisplayUnit = 'per100g' | 'perPiece' | 'per100ml' | 'perServing';
type LabelAmountUnit = 'g' | 'ml' | '個' | '食分';

type NutritionEstimate = {
  name: string;
  amountText: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  salt: number;
  description: string;
  imageUrl?: string;
};

type EditableEstimate = NutritionEstimate & {
  tempId: string;
  fileName: string;
  quantity: number;
  multiplier: number;
  baseCalories: number;
  baseProtein: number;
  baseFat: number;
  baseCarbs: number;
  baseSalt: number;
};

type PendingFood = {
  id: string;
  mode: 'food' | 'label' | 'text';
  file?: File;
  fileName: string;
  previewUrl?: string;
  foodName?: string;
  foodAmount?: string;
  description: string;
  consumedGrams: number;
  labelDisplayUnit: LabelDisplayUnit;
  labelBaseAmount: number;
  labelBaseUnit: LabelAmountUnit;
  actualAmount: number;
  actualUnit: LabelAmountUnit;
  quantity: number;
  multiplier: number;
};

type NutritionRecord = NutritionEstimate & {
  id: string;
  createdAt: string;
  createdAtRaw?: string;
  multiplier: number;
  source: 'photo' | 'favorite' | 'exercise';
};

type FavoriteFood = {
  id: string;
  name: string;
  amountText: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  salt: number;
};

type NutritionRecordInsert = {
  name: string;
  amount_text: string | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  salt: number;
  multiplier?: number;
  source?: string;
  description?: string | null;
  image_url?: string | null;
};

const normalizeSource = (source: unknown) => String(source ?? '').trim().toLowerCase();

const isExerciseSource = (source: unknown) => normalizeSource(source) === 'exercise';

const isExerciseRecord = (record: Pick<NutritionRecord, 'source' | 'name' | 'description'>) => {
  if (isExerciseSource(record.source)) return true;
  const name = String(record.name || '').toLowerCase();
  const description = String(record.description || '').toLowerCase();
  return /ランニング|筋トレ|運動|exercise/.test(name) || /met|exercise/.test(description);
};
const jstDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const toJstDateString = (input?: string | Date | null) => {
  const d = input ? new Date(input) : new Date();
  return jstDateFormatter.format(d);
};

const isValidFavorite = (v: any): v is FavoriteFood => {
  return !!v && typeof v.id === 'string' && typeof v.name === 'string';
};

const isLegacyInoras120 = (v: FavoriteFood) => {
  const id = String(v.id || '').toLowerCase();
  const name = String(v.name || '').toLowerCase();
  return id.includes('120') || name.includes('120ml') || name.includes('120ml') || name.includes('120ml');
};

const STORAGE_RECORDS = 'nutrition_records';
const STORAGE_FAVORITES = 'nutrition_favorites';
const STORAGE_PROFILE = 'nutrition_profile';
const STORAGE_MULTIPLIER_OVERRIDES = 'nutrition_multiplier_overrides';

const defaultFavorites: FavoriteFood[] = [
  {
    id: 'inonoras',
    name: 'イノラス 1袋(187.5mL)',
    amountText: '1袋(187.5mL)',
    calories: 300,
    protein: 13.5,
    fat: 9.0,
    carbs: 42.0,
    salt: 0.6,
  },
  {
    id: 'inoras-125-200',
    name: 'イノラス 125mL（200kcal）',
    amountText: '125mL',
    calories: 200,
    protein: 8.8,
    fat: 5.6,
    carbs: 28.4,
    salt: 0.68,
  },
  {
    id: 'soy-sauce-tsp1',
    name: '醤油 小さじ1',
    amountText: '小さじ1',
    calories: 4,
    protein: 0.4,
    fat: 0,
    carbs: 0.5,
    salt: 0.9,
  },
  {
    id: 'mayo-tbsp1',
    name: 'マヨネーズ 大さじ1',
    amountText: '大さじ1',
    calories: 100,
    protein: 0.4,
    fat: 11,
    carbs: 0.4,
    salt: 0.2,
  },
  {
    id: 'honey-tbsp1',
    name: 'はちみつ 大さじ1',
    amountText: '大さじ1',
    calories: 69,
    protein: 0.1,
    fat: 0,
    carbs: 17.2,
    salt: 0,
  },
  {
    id: 'ensure-liquid-h-250',
    name: 'エンシュアリキッドH 250ml',
    amountText: '250ml',
    calories: 250,
    protein: 10.5,
    fat: 8.8,
    carbs: 31.3,
    salt: 0.49,
  },
];

const activityLabels: Record<ActivityLevel, string> = {
  low: '低い(デスク中心)',
  moderate: '普通(立ち仕事/ウォーキング)',
  high: '高い(運動習慣あり)',
};

const labelDisplayUnitOptions: Record<LabelDisplayUnit, { label: string; baseAmount: number; baseUnit: LabelAmountUnit; defaultActualUnit: LabelAmountUnit }> = {
  per100g: { label: '100gあたり', baseAmount: 100, baseUnit: 'g', defaultActualUnit: 'g' },
  perPiece: { label: '1個（1本・1袋）あたり', baseAmount: 1, baseUnit: '個', defaultActualUnit: '個' },
  per100ml: { label: '100mlあたり', baseAmount: 100, baseUnit: 'ml', defaultActualUnit: 'ml' },
  perServing: { label: '1食分あたり', baseAmount: 1, baseUnit: '食分', defaultActualUnit: '食分' },
};

export default function HomePage() {
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [scanMode, setScanMode] = useState<'food' | 'label' | 'text'>('food');
  const [consumedGrams, setConsumedGrams] = useState(100);
  const [labelDisplayUnit, setLabelDisplayUnit] = useState<LabelDisplayUnit>('per100g');
  const [actualAmount, setActualAmount] = useState(100);
  const [actualUnit, setActualUnit] = useState<LabelAmountUnit>('g');
  const [exerciseTab, setExerciseTab] = useState<'run' | 'manual' | 'met'>('run');
  const [estimates, setEstimates] = useState<EditableEstimate[]>([]);
  const [records, setRecords] = useState<NutritionRecord[]>([]);
  const [favorites, setFavorites] = useState<FavoriteFood[]>(defaultFavorites);
  const [profile, setProfile] = useState({ age: 35, sex: 'male' as Sex, weight: 60, activity: 'moderate' as ActivityLevel });
  const [dateFilter, setDateFilter] = useState(toJstDateString());
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');
  const [textFoodName, setTextFoodName] = useState('');
  const [textFoodAmount, setTextFoodAmount] = useState('');
  const [pendingFoods, setPendingFoods] = useState<PendingFood[]>([]);
  const [recordMultiplierDrafts, setRecordMultiplierDrafts] = useState<Record<string, string>>({});
  const [recordSaveStates, setRecordSaveStates] = useState<Record<string, 'idle' | 'saving' | 'success' | 'error'>>({});
  const recordSaveResetTimers = useRef<Record<string, number>>({});

  const scheduleRecordSaveStateReset = (id: string, nextState: 'success' | 'error') => {
    const existingTimer = recordSaveResetTimers.current[id];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    setRecordSaveStates((prev) => ({ ...prev, [id]: nextState }));
    recordSaveResetTimers.current[id] = window.setTimeout(() => {
      setRecordSaveStates((prev) => ({ ...prev, [id]: 'idle' }));
      delete recordSaveResetTimers.current[id];
    }, 1200);
  };

  const getMultiplierOverrides = () => {
    try {
      const raw = localStorage.getItem(STORAGE_MULTIPLIER_OVERRIDES);
      if (!raw) return {} as Record<string, number>;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {} as Record<string, number>;
      const next: Record<string, number> = {};
      Object.entries(parsed).forEach(([key, value]) => {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) {
          next[key] = n;
        }
      });
      return next;
    } catch {
      return {} as Record<string, number>;
    }
  };

  const setMultiplierOverride = (id: string, multiplier: number) => {
    try {
      const current = getMultiplierOverrides();
      current[id] = Math.max(0.1, Number(multiplier) || 1);
      localStorage.setItem(STORAGE_MULTIPLIER_OVERRIDES, JSON.stringify(current));
    } catch (e) {
      console.warn('[multiplier:local-fallback] set failed', { id, multiplier, error: e });
    }
  };

  const clearMultiplierOverride = (id: string) => {
    try {
      const current = getMultiplierOverrides();
      if (!(id in current)) return;
      delete current[id];
      localStorage.setItem(STORAGE_MULTIPLIER_OVERRIDES, JSON.stringify(current));
    } catch (e) {
      console.warn('[multiplier:local-fallback] clear failed', { id, error: e });
    }
  };

  useEffect(() => {
    const savedFavorites = localStorage.getItem(STORAGE_FAVORITES);
    const savedProfile = localStorage.getItem(STORAGE_PROFILE);

    if (savedFavorites) {
      try {
        const parsed = JSON.parse(savedFavorites);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter(isValidFavorite)
            .map((f) => ({
              id: String(f.id),
              name: String(f.name),
              amountText: String(f.amountText || '1単位'),
              calories: Number(f.calories) || 0,
              protein: Number(f.protein) || 0,
              fat: Number(f.fat) || 0,
              carbs: Number(f.carbs) || 0,
              salt: Number(f.salt) || 0,
            }))
            .filter((f) => !isLegacyInoras120(f));
          setFavorites(normalized);
        } else {
          setFavorites(defaultFavorites);
        }
      } catch {
        setFavorites(defaultFavorites);
      }
    } else {
      setFavorites(defaultFavorites);
    }

    if (savedProfile) {
      try {
        setProfile(JSON.parse(savedProfile));
      } catch {
        setProfile(profile);
      }
    }

    // fetch records from Supabase
    (async () => {
      try {
        if (!isSupabaseConfigured) {
          setStatusMessage('Supabase が未設定です。環境変数を確認してください。');
          return;
        }

        const { data, error } = await supabase
          .from('nutrition_records')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Supabase fetch error', error);
          setStatusMessage('Supabase からの取得に失敗しました。');
        } else if (data) {
          const mapped = data.map((r: any) => ({
            id: r.id,
            name: r.name || '',
            amountText: r.amount_text || '',
            calories: Number(r.calories) || 0,
            protein: Number(r.protein) || 0,
            fat: Number(r.fat) || 0,
            carbs: Number(r.carbs) || 0,
            salt: Number(r.salt) || 0,
            description: r.description || '',
            imageUrl: r.image_url || undefined,
            createdAt: toJstDateString(r.created_at),
            createdAtRaw: r.created_at || undefined,
            multiplier: Number(r.multiplier) || 1,
            source: (normalizeSource(r.source || 'photo') as NutritionRecord['source']),
          }));
          const overrides = getMultiplierOverrides();
          const withLocalMultiplier = mapped.map((record: NutritionRecord) => {
            const localMultiplier = overrides[record.id];
            if (!localMultiplier || Math.abs(localMultiplier - (record.multiplier || 1)) < 0.0001) {
              return record;
            }
            return applyMultiplierToRecord(record, localMultiplier);
          });

          setRecords(withLocalMultiplier as NutritionRecord[]);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    if (photoFiles.length === 0) {
      setPhotoPreviews([]);
      return;
    }
    const urls = photoFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photoFiles]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const jstDate = toJstDateString(record.createdAtRaw || record.createdAt);
      return jstDate === dateFilter;
    });
  }, [records, dateFilter]);

  const totals = useMemo(() => {
    // intake totals only (exclude exercise records)
    return filteredRecords.reduce(
      (acc, record) => {
        if (!isExerciseRecord(record)) {
          acc.calories += record.calories;
          acc.protein += record.protein;
          acc.fat += record.fat;
          acc.carbs += record.carbs;
          acc.salt += record.salt;
        }
        return acc;
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0, salt: 0 }
    );
  }, [filteredRecords]);

  const exerciseCalories = useMemo(() => {
    return filteredRecords.reduce(
      (acc, record) => (isExerciseRecord(record) ? acc + (record.calories || 0) : acc),
      0
    );
  }, [filteredRecords]);

  const recommended = useMemo(() => getDRI(profile), [profile]);

  const estimatedEnergy = useMemo(() => {
    // estimated daily energy requirement (simple PAL model)
    const base = profile.sex === 'male' ? 24 * profile.weight : 22 * profile.weight; // basal ~ kcal/day
    const pal = profile.activity === 'low' ? 1.4 : profile.activity === 'high' ? 1.75 : 1.55;
    return Math.round(base * pal);
  }, [profile]);

  const basalMetabolism = useMemo(() => {
    return Math.round(profile.sex === 'male' ? 24 * profile.weight : 22 * profile.weight);
  }, [profile]);

  const totalConsumptionCalories = useMemo(() => {
    return basalMetabolism + exerciseCalories;
  }, [basalMetabolism, exerciseCalories]);

  // records are persisted in Supabase; no localStorage sync needed

  useEffect(() => {
    localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(STORAGE_RECORDS, JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    return () => {
      Object.values(recordSaveResetTimers.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, []);

  const round1 = (n: number) => Math.round((Number(n) || 0) * 10) / 10;

  const formatSupabaseError = (error: any) => {
    if (!error) return '不明なエラー';
    return [error.message, error.details, error.hint].filter(Boolean).join(' / ');
  };

  const insertNutritionRecordsWithFallback = async (rows: NutritionRecordInsert[]) => {
    let { data, error } = await supabase.from('nutrition_records').insert(rows).select();

    if (error) {
      const message = formatSupabaseError(error).toLowerCase();
      const mayBeSchemaMismatch = /column|schema cache|does not exist|unknown/.test(message);

      if (mayBeSchemaMismatch) {
        const fallbackRows = rows.map((target) => ({
          name: target.name,
          amount_text: target.amount_text,
          calories: target.calories,
          protein: target.protein,
          fat: target.fat,
          carbs: target.carbs,
          salt: target.salt,
          description: target.description || null,
        }));

        const fallbackResult = await supabase.from('nutrition_records').insert(fallbackRows).select();
        data = fallbackResult.data;
        error = fallbackResult.error;
      }
    }

    return { data, error };
  };

  const mapNutritionRecord = (row: any, fallback?: Partial<NutritionRecord>): NutritionRecord => ({
    id: row.id,
    name: row.name || fallback?.name || '',
    amountText: row.amount_text || fallback?.amountText || '',
    calories: Number(row.calories) || fallback?.calories || 0,
    protein: Number(row.protein) || fallback?.protein || 0,
    fat: Number(row.fat) || fallback?.fat || 0,
    carbs: Number(row.carbs) || fallback?.carbs || 0,
    salt: Number(row.salt) || fallback?.salt || 0,
    description: row.description || fallback?.description || '',
    imageUrl: row.image_url || fallback?.imageUrl || undefined,
    createdAt: toJstDateString(row.created_at),
    createdAtRaw: row.created_at || undefined,
    multiplier: Number(row.multiplier) || fallback?.multiplier || 1,
    source: (normalizeSource(row.source || fallback?.source || 'exercise') as NutritionRecord['source']),
  });

  const recalcEstimate = (estimate: EditableEstimate): EditableEstimate => {
    const quantity = Math.max(0.1, Number(estimate.quantity) || 1);
    const multiplier = Math.max(0.1, Number(estimate.multiplier) || 1);
    const scale = quantity * multiplier;
    return {
      ...estimate,
      quantity,
      multiplier,
      calories: round1(estimate.baseCalories * scale),
      protein: round1(estimate.baseProtein * scale),
      fat: round1(estimate.baseFat * scale),
      carbs: round1(estimate.baseCarbs * scale),
      salt: round1(estimate.baseSalt * scale),
    };
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setPhotoFiles(files);
  };

  const updateLabelDisplayUnit = (nextUnit: LabelDisplayUnit) => {
    const meta = labelDisplayUnitOptions[nextUnit];
    setLabelDisplayUnit(nextUnit);
    setActualUnit(meta.defaultActualUnit);
    setActualAmount(meta.baseAmount);
    if (meta.baseUnit === 'g') {
      setConsumedGrams(meta.baseAmount);
    }
  };

  const addPendingFood = () => {
    if (scanMode === 'text') {
      if (!textFoodName.trim()) {
        setStatusMessage('食品名・料理名を入力してください。');
        return;
      }
      const queued: PendingFood = {
        id: crypto.randomUUID(),
        mode: 'text',
        fileName: textFoodName.trim(),
        foodName: textFoodName.trim(),
        foodAmount: textFoodAmount.trim(),
        description,
        consumedGrams,
        labelDisplayUnit,
        labelBaseAmount: labelDisplayUnitOptions[labelDisplayUnit].baseAmount,
        labelBaseUnit: labelDisplayUnitOptions[labelDisplayUnit].baseUnit,
        actualAmount,
        actualUnit,
        quantity: 1,
        multiplier: 1,
      };
      setPendingFoods((prev) => [queued, ...prev]);
      setTextFoodName('');
      setTextFoodAmount('');
      setStatusMessage('食品をリストに追加しました。');
      return;
    }

    if (photoFiles.length === 0) {
      setStatusMessage('写真を1枚以上選択してください。');
      return;
    }

    const queued = photoFiles.map((file) => ({
      id: crypto.randomUUID(),
      mode: scanMode,
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      description,
      consumedGrams,
      labelDisplayUnit,
      labelBaseAmount: labelDisplayUnitOptions[labelDisplayUnit].baseAmount,
      labelBaseUnit: labelDisplayUnitOptions[labelDisplayUnit].baseUnit,
      actualAmount,
      actualUnit,
      quantity: 1,
      multiplier: scanMode === 'label' ? Math.max(0.1, Number(actualAmount) || 1) : 1,
    } as PendingFood));

    setPendingFoods((prev) => [...queued, ...prev]);
    setPhotoFiles([]);
    setStatusMessage(`${queued.length}件の食品をリストに追加しました。`);
  };

  const removePendingFood = (id: string) => {
    setPendingFoods((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const updatePendingFood = (id: string, patch: Partial<Pick<PendingFood, 'quantity' | 'multiplier'>>) => {
    setPendingFoods((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleEstimate = async () => {
    if (pendingFoods.length === 0) {
      setStatusMessage('先に食品を1件以上リストへ追加してください。');
      return;
    }

    setLoading(true);
    setEstimates([]);
    setStatusMessage(`推定中... 0/${pendingFoods.length}`);

    try {
      const next: EditableEstimate[] = [];
      let successCount = 0;

      for (let i = 0; i < pendingFoods.length; i += 1) {
        const item = pendingFoods[i];
        setStatusMessage(`推定中... ${i + 1}/${pendingFoods.length} (${item.fileName})`);

        const formData = new FormData();
        formData.append('description', item.description);
        formData.append('mode', item.mode);
        if (item.mode === 'text') {
          formData.append('foodName', item.foodName || item.fileName);
          formData.append('foodAmount', item.foodAmount || '1人前');
        } else if (item.file) {
          formData.append('photo', item.file);
        }
        if (item.mode === 'label') {
          formData.append('consumedGrams', String(item.consumedGrams));
          formData.append('labelDisplayUnit', item.labelDisplayUnit);
          formData.append('labelBaseAmount', String(item.labelBaseAmount));
          formData.append('labelBaseUnit', item.labelBaseUnit);
          formData.append('actualAmount', String(item.actualAmount));
          formData.append('actualUnit', item.actualUnit);
        }

        const response = await fetch('/api/vision', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (!response.ok || result.error) {
          continue;
        }

        let estimateResponse: NutritionEstimate;
        if (result.estimate.mode === 'label') {
          const selectedBaseAmount = Math.max(0.1, Number(item.labelBaseAmount) || 100);
          const selectedBaseUnit = item.labelBaseUnit;
          const intakeAmount = Math.max(0.1, Number(item.actualAmount) || selectedBaseAmount);
          const intakeUnit = item.actualUnit;
          estimateResponse = {
            name: result.estimate.name || '不明な食品',
            amountText: `${intakeAmount}${intakeUnit}`,
            calories: Number(result.estimate.calories) || 0,
            protein: Number(result.estimate.protein) || 0,
            fat: Number(result.estimate.fat) || 0,
            carbs: Number(result.estimate.carbs) || 0,
            salt: Number(result.estimate.salt) || 0,
            description: `${item.description} (${selectedBaseAmount}${selectedBaseUnit}あたりの栄養表示。実際の入力量 ${intakeAmount}${intakeUnit} を倍率として適用)`,
            imageUrl: item.previewUrl,
          };
        } else {
          estimateResponse = {
            name: result.estimate.name || item.foodName || '不明な料理',
            amountText: result.estimate.amountText || item.foodAmount || '1品',
            calories: Number(result.estimate.calories) || 0,
            protein: Number(result.estimate.protein) || 0,
            fat: Number(result.estimate.fat) || 0,
            carbs: Number(result.estimate.carbs) || 0,
            salt: Number(result.estimate.salt) || 0,
            description: item.description,
            imageUrl: item.previewUrl,
          };
        }

        next.push(recalcEstimate({
          ...estimateResponse,
          tempId: item.id,
          fileName: item.fileName,
          quantity: item.quantity,
          multiplier: item.mode === 'label' ? Math.max(0.1, Number(item.actualAmount) || 1) : item.multiplier,
          baseCalories: estimateResponse.calories,
          baseProtein: estimateResponse.protein,
          baseFat: estimateResponse.fat,
          baseCarbs: estimateResponse.carbs,
          baseSalt: estimateResponse.salt,
        }));
        successCount += 1;
      }

      setEstimates(next);
      setStatusMessage(`推定完了: ${successCount}/${pendingFoods.length} 件`);
    } catch (error) {
      setStatusMessage('サーバーに接続できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  const updateEstimate = (tempId: string, patch: Partial<EditableEstimate>) => {
    setEstimates((prev) => prev.map((estimate) => {
      if (estimate.tempId !== tempId) return estimate;
      return recalcEstimate({ ...estimate, ...patch });
    }));
  };

  const saveAllEstimates = async () => {
    if (estimates.length === 0) {
      setStatusMessage('保存する推定結果がありません。');
      return;
    }

    setLoading(true);
    try {
      // Keep keys aligned with nutrition_records snake_case columns.
      const inserts: NutritionRecordInsert[] = estimates.map((target) => ({
        name: target.name,
        amount_text: target.amountText || null,
        calories: round1(target.calories),
        protein: round1(target.protein),
        fat: round1(target.fat),
        carbs: round1(target.carbs),
        salt: round1(target.salt),
        multiplier: round1((target.quantity || 1) * (target.multiplier || 1)),
        source: 'photo',
        description: target.description || null,
        image_url: target.imageUrl || null,
      }));

      if (!isSupabaseConfigured) {
        setStatusMessage('Supabase が未設定です。保存できません。');
        return;
      }

      const { data, error } = await insertNutritionRecordsWithFallback(inserts);

      if (error) {
        console.error('Supabase insert error', error);
        setStatusMessage(`保存に失敗しました: ${formatSupabaseError(error)}`);
      } else if (data) {
        const created = data.map((r: any) => ({
          id: r.id,
          name: r.name || '',
          amountText: r.amount_text || '',
          calories: Number(r.calories) || 0,
          protein: Number(r.protein) || 0,
          fat: Number(r.fat) || 0,
          carbs: Number(r.carbs) || 0,
          salt: Number(r.salt) || 0,
          description: r.description || '',
          imageUrl: r.image_url || undefined,
          createdAt: toJstDateString(r.created_at),
          multiplier: Number(r.multiplier) || 1,
          source: (r.source || 'photo') as NutritionRecord['source'],
        }));
        setRecords((prev) => [...created, ...prev]);
        setEstimates([]);
        setPendingFoods((prev) => {
          prev.forEach((item) => {
            if (item.previewUrl) {
              URL.revokeObjectURL(item.previewUrl);
            }
          });
          return [];
        });
        setStatusMessage(`${created.length}件を保存しました。`);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('保存中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const addFavoriteRecord = async (favorite: FavoriteFood) => {
    const insert: NutritionRecordInsert = {
      name: favorite.name,
      amount_text: favorite.amountText || null,
      calories: favorite.calories,
      protein: favorite.protein,
      fat: favorite.fat,
      carbs: favorite.carbs,
      salt: favorite.salt,
      multiplier: 1,
      source: 'favorite',
      description: favorite.name,
    };
    try {
      if (!isSupabaseConfigured) {
        setStatusMessage('Supabase が未設定です。保存できません。');
        return;
      }

      const { data, error } = await insertNutritionRecordsWithFallback([insert]);
      if (error) {
        console.error('Supabase insert error', error);
        setStatusMessage(`保存に失敗しました: ${formatSupabaseError(error)}`);
      } else if (data && data[0]) {
        const r = data[0];
        const record: NutritionRecord = {
          id: r.id,
          name: r.name || favorite.name,
          amountText: r.amount_text || favorite.amountText,
          calories: Number(r.calories) || favorite.calories,
          protein: Number(r.protein) || favorite.protein,
          fat: Number(r.fat) || favorite.fat,
          carbs: Number(r.carbs) || favorite.carbs,
          salt: Number(r.salt) || favorite.salt,
          description: r.description || favorite.name,
          imageUrl: r.image_url || undefined,
          createdAt: toJstDateString(r.created_at),
          multiplier: Number(r.multiplier) || 1,
          source: r.source || 'favorite',
        };
        setRecords((prev) => [record, ...prev]);
        setStatusMessage(`${favorite.name} を記録しました。`);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('保存中にエラーが発生しました。');
    }
  };

  const addFavorite = () => {
    if (!favoriteName.trim()) {
      setStatusMessage('お気に入りの食品名を入力してください。');
      return;
    }
    const newFavorite: FavoriteFood = {
      id: crypto.randomUUID(),
      name: favoriteName.trim(),
      amountText: '1単位',
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      salt: 0,
    };
    setFavorites([newFavorite, ...favorites]);
    setFavoriteName('');
    setStatusMessage('マイ定番食品に保存しました。');
  };

  const removeFavorite = (id: string) => {
    if (!window.confirm('この定番食品を削除しますか？')) {
      return;
    }
    setFavorites(favorites.filter((f) => f.id !== id));
    setStatusMessage('定番食品を削除しました。');
  };

  const removeRecord = (id: string) => {
    if (!window.confirm('この記録を削除しますか？')) {
      return;
    }
    (async () => {
      try {
        const { error } = await supabase.from('nutrition_records').delete().eq('id', id);
        if (error) {
          console.error('Supabase delete error', error);
          setStatusMessage('削除に失敗しました。');
          return;
        }
        setRecords(records.filter((record) => record.id !== id));
        setStatusMessage('記録を削除しました。');
      } catch (e) {
        console.error(e);
        setStatusMessage('削除中にエラーが発生しました。');
      }
    })();
  };

  const applyMultiplierToRecord = (record: NutritionRecord, nextMultiplier: number): NutritionRecord => {
    const prevMultiplier = Math.max(0.1, Number(record.multiplier) || 1);
    const safeMultiplier = Math.max(0.1, Number(nextMultiplier) || 1);
    const ratio = safeMultiplier / prevMultiplier;
    return {
      ...record,
      multiplier: safeMultiplier,
      calories: round1(record.calories * ratio),
      protein: round1(record.protein * ratio),
      fat: round1(record.fat * ratio),
      carbs: round1(record.carbs * ratio),
      salt: round1(record.salt * ratio),
    };
  };

  const updateRecordMultiplier = async (id: string, value: number): Promise<boolean> => {
    try {
      console.log('[multiplier:update] entered', { id, value });

      const nextMultiplier = Math.max(0.1, Number(value) || 1);
      const currentRecord = records.find((record) => record.id === id);

      console.log('[multiplier:update] lookup', {
        id,
        recordCount: records.length,
        found: Boolean(currentRecord),
        currentRecord,
        isSupabaseConfigured,
      });

      if (!currentRecord) {
        console.warn('[multiplier:update] record not found', { id, value, records });
        return false;
      }

      const updatedRecord = applyMultiplierToRecord(currentRecord, nextMultiplier);

      setRecords((prev) => prev.map((record) => (record.id === id ? updatedRecord : record)));

      setMultiplierOverride(id, nextMultiplier);

      if (!isSupabaseConfigured) {
        setStatusMessage('Supabase が未設定のため、倍率はこの端末にのみ保存しました。');
        return false;
      }

      const payload = {
        calories: updatedRecord.calories,
        protein: updatedRecord.protein,
        fat: updatedRecord.fat,
        carbs: updatedRecord.carbs,
        salt: updatedRecord.salt,
        multiplier: updatedRecord.multiplier,
      };

      try {
        console.log('[multiplier:update] request', {
          id,
          idType: typeof id,
          idLength: String(id).length,
          payload,
        });
      } catch (logError) {
        console.warn('[multiplier:update] request log failed', logError);
      }

      try {
        console.log('[multiplier:update] before supabase update', { id, payload });
      } catch (logError) {
        console.warn('[multiplier:update] before-query log failed', logError);
      }

      let updateResult = await supabase
        .from('nutrition_records')
        .update(payload, { count: 'exact' })
        .eq('id', id)
        .select('id,multiplier');

      let { data, error, count } = updateResult;

      try {
        console.log('[multiplier:update] after supabase update', {
          id,
          updateResult,
          count,
          dataLength: data?.length ?? 0,
          error,
        });
      } catch (logError) {
        console.warn('[multiplier:update] after-query log failed', logError);
      }

      if (error || !Array.isArray(data) || data.length === 0) {
        console.warn('[multiplier:update] retry with minimal payload', { id, error, count });
        const retry = await supabase
          .from('nutrition_records')
          .update({ multiplier: payload.multiplier }, { count: 'exact' })
          .eq('id', id)
          .select('id,multiplier');
        console.log('[multiplier:update] retry result', retry);
        data = retry.data;
        error = retry.error;
        count = retry.count;
      }

      try {
        console.log('[multiplier:update] response', { id, count, dataLength: data?.length ?? 0, error });
      } catch (logError) {
        console.warn('[multiplier:update] response log failed', logError);
      }

      if (error) {
        console.error('[multiplier:update] query error', { id, payload, error });
        const message = formatSupabaseError(error).toLowerCase();
        const missingMultiplierColumn = /multiplier/.test(message) && /column|does not exist|schema cache/.test(message);
        if (missingMultiplierColumn) {
          setStatusMessage('倍率列が見つかりません。db/supabase_create_table.sql の ALTER TABLE を実行してください（端末には保存済み）。');
        } else {
          setStatusMessage(`倍率の保存に失敗しました（端末には保存済み）: ${formatSupabaseError(error)}`);
        }
        return false;
      }

      const updatedRow = Array.isArray(data) ? data[0] : undefined;
      const updatedMultiplier = Number(updatedRow?.multiplier);
      const expectedMultiplier = Number(payload.multiplier);

      if (!updatedRow || !Number.isFinite(updatedMultiplier) || Math.abs(updatedMultiplier - expectedMultiplier) > 0.0001) {
        const verify = await supabase
          .from('nutrition_records')
          .select('id,multiplier,source,created_at')
          .eq('id', id)
          .maybeSingle();

        console.error('[multiplier:update] verification failed', {
          id,
          expectedMultiplier,
          updatedRow,
          count,
          verifyData: verify.data,
          verifyError: verify.error,
        });

        setStatusMessage('倍率の保存に失敗しました。RLSポリシーまたは更新権限を確認してください（端末には保存済み）。');
        return false;
      }

      console.log('[multiplier:update] success', { id, payload, count, updatedMultiplier });
      clearMultiplierOverride(id);
      return true;
    } catch (e) {
      console.error('[multiplier:update] unexpected error', { id, value, error: e });
      setStatusMessage('倍率の保存中に予期しないエラーが発生しました（端末には保存済み）。');
      return false;
    }
  };

  const handleRecordMultiplierInput = (id: string, rawValue: string) => {
    setRecordMultiplierDrafts((prev) => ({ ...prev, [id]: rawValue }));
  };

  const saveRecordMultiplier = async (id: string) => {
    try {
      console.log('[multiplier:save-click] entered', { id });
      const rawValue = recordMultiplierDrafts[id];
      if (rawValue === undefined || !rawValue.trim()) {
        console.warn('[multiplier:save-click] no draft value', { id, rawValue });
        return;
      }

      const nextMultiplier = Math.max(0.1, Number(rawValue) || 1);
      if (!Number.isFinite(nextMultiplier)) {
        return;
      }

      try {
        console.log('[multiplier:save-click] trigger save', { id, rawValue, nextMultiplier });
      } catch (logError) {
        console.warn('[multiplier:save-click] log failed', logError);
      }

      setRecordSaveStates((prev) => ({ ...prev, [id]: 'saving' }));
      console.log('[multiplier:save-click] before updateRecordMultiplier', { id, nextMultiplier });
      const saved = await updateRecordMultiplier(id, nextMultiplier);
      console.log('[multiplier:save-click] after updateRecordMultiplier', { id, nextMultiplier, saved });

      if (!saved) {
        scheduleRecordSaveStateReset(id, 'error');
        return;
      }

      scheduleRecordSaveStateReset(id, 'success');

      setRecordMultiplierDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (e) {
      console.error('[multiplier:save-click] unexpected error', { id, error: e });
      scheduleRecordSaveStateReset(id, 'error');
    }
  };

  return (
    <main>
      <div className="page-card">
        <h1 className="section-title">栄養管理アプリ</h1>
        <p>スマホで食事写真をアップロードし、Claude Visionで栄養を推定して記録します。</p>
        <p>500円玉を基準物として写すと量推定の精度が上がります。</p>
      </div>

      <div className="page-card">
        <h2 className="section-title">食事記録</h2>
        <div className="field-grid">
          <div>
            <div className="scan-mode-tabs" role="tablist" aria-label="食事記録モード">
              <button
                type="button"
                role="tab"
                aria-selected={scanMode === 'food'}
                className={`scan-mode-tab ${scanMode === 'food' ? 'is-active' : ''}`}
                onClick={() => setScanMode('food')}
              >
                料理写真
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scanMode === 'label'}
                className={`scan-mode-tab ${scanMode === 'label' ? 'is-active' : ''}`}
                onClick={() => setScanMode('label')}
              >
                栄養表示ラベル
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scanMode === 'text'}
                className={`scan-mode-tab ${scanMode === 'text' ? 'is-active' : ''}`}
                onClick={() => setScanMode('text')}
              >
                テキスト入力
              </button>
            </div>
            <small>
              {scanMode === 'food'
                ? '料理全体を撮影して栄養推定します。'
                : scanMode === 'label'
                  ? 'パッケージの栄養表示を撮影して数値を読み取ります。'
                  : '食品名だけで推定できます。写真なしでも入力内容から類推します。'}
            </small>
          </div>

          {scanMode !== 'text' ? (
            <div className="camera-upload-field">
              <span className="camera-upload-label">写真</span>
              <input
                id="meal-photo-upload"
                className="camera-upload-input"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handlePhotoChange}
              />
              <label className="camera-upload-button" htmlFor="meal-photo-upload">📷 撮影・選択</label>
            </div>
          ) : null}

          {scanMode === 'label' ? (
            <div className="field-grid field-grid-3">
              <label>
                表示単位
                <select value={labelDisplayUnit} onChange={(e) => updateLabelDisplayUnit(e.target.value as LabelDisplayUnit)}>
                  <option value="per100g">100gあたり</option>
                  <option value="perPiece">1個（1本・1袋）あたり</option>
                  <option value="per100ml">100mlあたり</option>
                  <option value="perServing">1食分あたり</option>
                </select>
              </label>
              <label>
                実際に食べた量
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={actualAmount}
                  onChange={(e) => {
                    const next = Number(e.target.value) || 0;
                    setActualAmount(next);
                    if (actualUnit === 'g') {
                      setConsumedGrams(next);
                    }
                  }}
                />
              </label>
              <label>
                入力単位
                <select
                  value={actualUnit}
                  onChange={(e) => {
                    const next = e.target.value as LabelAmountUnit;
                    setActualUnit(next);
                    if (next === 'g') {
                      setConsumedGrams(actualAmount);
                    }
                  }}
                >
                  <option value="g">g（固形）</option>
                  <option value="ml">ml（液体）</option>
                  <option value="個">個（個数）</option>
                  <option value="食分">食分</option>
                </select>
              </label>
            </div>
          ) : null}

          {scanMode === 'text' ? (
            <>
              <label>
                食品名・料理名
                <input value={textFoodName} onChange={(e) => setTextFoodName(e.target.value)} placeholder="例: ざるそば1人前 / バナナ1本 / マクドナルド ビッグマック" />
              </label>
              <label>
                量（任意）
                <input value={textFoodAmount} onChange={(e) => setTextFoodAmount(e.target.value)} placeholder="例: 1人前、2個、Mサイズ" />
              </label>
            </>
          ) : null}

          {photoPreviews.length > 0 ? (
            <div className="card-row">
              {photoPreviews.map((src, idx) => (
                <img key={`${src}-${idx}`} className="image-preview" src={src} alt={`preview-${idx + 1}`} style={{ maxWidth: 140 }} />
              ))}
            </div>
          ) : null}

          <label>
            店名・商品名・メーカー名など(任意)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例: ガスト チーズINハンバーグ" />
          </label>

          <button className="button-secondary" type="button" onClick={addPendingFood}>
            食品を追加
          </button>
        </div>
      </div>

      <div className="page-card">
        <h2 className="section-title">マイ定番食品</h2>
        <p>よく使う組成が固定された食品を登録して、ワンタップで記録できます。</p>
        <div className="field-grid field-grid-2">
          <label>
            新しい定番食品名
            <input value={favoriteName} onChange={(e) => setFavoriteName(e.target.value)} placeholder="例: おにぎり" />
          </label>
          <button className="button-secondary" type="button" onClick={addFavorite}>
            定番食品に追加
          </button>
        </div>
        <div className="card-row">
          {favorites.map((favorite) => (
            <div key={favorite.id} className="favorite-item">
              <button className="button-small" type="button" onClick={() => addFavoriteRecord(favorite)}>
                {favorite.name}
              </button>
              <button className="button-danger" type="button" onClick={() => removeFavorite(favorite.id)}>
                削除
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="page-card">
        <h2 className="section-title">推定待ち食品リスト</h2>
        {pendingFoods.length === 0 ? (
          <p><small>まだ食品が追加されていません。上の「食品を追加」ボタンから登録してください。</small></p>
        ) : (
          <div className="field-grid">
            {pendingFoods.map((item) => (
              <div key={item.id} className="pending-row">
                <div className="pending-main">
                  <strong>{item.mode === 'text' ? (item.foodName || item.fileName) : item.fileName}</strong>
                  <small>{item.mode === 'label' ? `栄養ラベル ${labelDisplayUnitOptions[item.labelDisplayUnit].label} / 実際 ${item.actualAmount}${item.actualUnit}` : item.mode === 'text' ? (item.foodAmount || '1人前') : '料理写真'}</small>
                </div>
                <label>
                  個数
                  <input type="number" min="0.1" step="0.1" value={item.quantity} onChange={(e) => updatePendingFood(item.id, { quantity: Number(e.target.value) || 1 })} />
                </label>
                <label>
                  倍率
                  <input type="number" min="0.1" step="0.1" value={item.multiplier} onChange={(e) => updatePendingFood(item.id, { multiplier: Number(e.target.value) || 1 })} />
                </label>
                <button type="button" className="button-danger pending-remove" onClick={() => removePendingFood(item.id)}>
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
        <button className="button-primary" type="button" onClick={handleEstimate} disabled={loading}>
          {loading ? '推定中...' : `推定開始（${pendingFoods.length}件）`}
        </button>
        {statusMessage ? <p><small>{statusMessage}</small></p> : null}
      </div>

      {estimates.length > 0 ? (
        <div className="page-card">
          <h2 className="section-title">推定結果の確認と修正（{estimates.length}件）</h2>
          <div className="field-grid">
            {estimates.map((estimate) => (
              <div key={estimate.tempId} className="page-card estimate-card" style={{ marginBottom: 8 }}>
                <p><small>{estimate.fileName}</small></p>
                {estimate.imageUrl ? <img className="image-preview estimate-image" src={estimate.imageUrl} alt={estimate.fileName} style={{ maxWidth: 220 }} /> : null}
                <div className="field-grid field-grid-2 estimate-meta-grid">
                  <label>
                    料理名
                    <input value={estimate.name} onChange={(e) => updateEstimate(estimate.tempId, { name: e.target.value })} />
                  </label>
                  <label>
                    推定量の表示
                    <input value={estimate.amountText} onChange={(e) => updateEstimate(estimate.tempId, { amountText: e.target.value })} />
                  </label>
                  <label>
                    個数
                    <input type="number" min="0.1" step="0.1" value={estimate.quantity} onChange={(e) => updateEstimate(estimate.tempId, { quantity: Number(e.target.value) || 1 })} />
                  </label>
                  <label>
                    倍率
                    <input type="number" min="0.1" step="0.1" value={estimate.multiplier} onChange={(e) => updateEstimate(estimate.tempId, { multiplier: Number(e.target.value) || 1 })} />
                  </label>
                </div>
                <div className="estimate-nutrients-grid">
                  <label className="estimate-inline-field">
                    <span>kcal</span>
                    <input type="number" value={estimate.baseCalories} onChange={(e) => updateEstimate(estimate.tempId, { baseCalories: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="estimate-inline-field">
                    <span>P(g)</span>
                    <input type="number" value={estimate.baseProtein} onChange={(e) => updateEstimate(estimate.tempId, { baseProtein: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="estimate-inline-field">
                    <span>F(g)</span>
                    <input type="number" value={estimate.baseFat} onChange={(e) => updateEstimate(estimate.tempId, { baseFat: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="estimate-inline-field">
                    <span>C(g)</span>
                    <input type="number" value={estimate.baseCarbs} onChange={(e) => updateEstimate(estimate.tempId, { baseCarbs: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="estimate-inline-field">
                    <span>塩(g)</span>
                    <input type="number" step="0.1" value={estimate.baseSalt} onChange={(e) => updateEstimate(estimate.tempId, { baseSalt: Number(e.target.value) || 0 })} />
                  </label>
                </div>
                <div className="summary-item" style={{ marginTop: 8 }}>
                  <span>再計算後</span>
                  <strong>{estimate.calories.toFixed(1)} kcal / P {estimate.protein.toFixed(1)}g / F {estimate.fat.toFixed(1)}g / C {estimate.carbs.toFixed(1)}g / 塩 {estimate.salt.toFixed(1)}g</strong>
                </div>
              </div>
            ))}
          </div>
          <button className="button-primary" type="button" onClick={saveAllEstimates} disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      ) : null}

        <div className="page-card">
        <h2 className="section-title">運動記録</h2>
        <div style={{display:'flex', gap:8, marginBottom:8}}>
          <button type="button" onClick={() => setExerciseTab('run')} style={{padding:8, borderRadius:6, background: exerciseTab==='run' ? '#0b74de' : '#eee', color: exerciseTab==='run' ? '#fff' : '#000'}}>ランニング</button>
          <button type="button" onClick={() => setExerciseTab('manual')} style={{padding:8, borderRadius:6, background: exerciseTab==='manual' ? '#0b74de' : '#eee', color: exerciseTab==='manual' ? '#fff' : '#000'}}>手動</button>
          <button type="button" onClick={() => setExerciseTab('met')} style={{padding:8, borderRadius:6, background: exerciseTab==='met' ? '#0b74de' : '#eee', color: exerciseTab==='met' ? '#fff' : '#000'}}>筋トレ</button>
        </div>
        <div>
          {exerciseTab === 'run' && (
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <input id="run-km" type="number" step="0.1" min="0" defaultValue={0} style={{width:120}} />
              <button className="button-secondary" onClick={async () => {
                const el = document.getElementById('run-km') as HTMLInputElement | null;
                const km = el ? Number(el.value) : 0;
                if (!km || km <= 0) { setStatusMessage('距離を入力してください。'); return; }
                const caloriesBurned = Math.round(profile.weight * km * 1.036);
                const insert: NutritionRecordInsert = { name: `ランニング ${km} km`, amount_text: null, calories: caloriesBurned, protein: 0, fat: 0, carbs: 0, salt: 0, multiplier: 1, source: 'exercise', description: null, image_url: null };
                if (!isSupabaseConfigured) { setStatusMessage('Supabase 未設定で保存できません。'); return; }
                const { data, error } = await insertNutritionRecordsWithFallback([insert]);
                if (error) { console.error(error); setStatusMessage(`保存に失敗しました: ${formatSupabaseError(error)}`); return; }
                if (data && data[0]) { const record = mapNutritionRecord(data[0], { name: insert.name, calories: insert.calories, protein: insert.protein, fat: insert.fat, carbs: insert.carbs, salt: insert.salt, multiplier: insert.multiplier, source: 'exercise' }); setRecords((prev) => [record, ...prev]); setStatusMessage('ランニング記録を保存しました。'); }
              }}>保存</button>
            </div>
          )}
          {exerciseTab === 'manual' && (
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <input id="manual-cal" type="number" step="1" min="0" defaultValue={0} style={{width:120}} />
              <button className="button-secondary" onClick={async () => {
                const el = document.getElementById('manual-cal') as HTMLInputElement | null;
                const kcal = el ? Math.round(Number(el.value)) : 0;
                if (!kcal || kcal <= 0) { setStatusMessage('消費カロリーを入力してください。'); return; }
                const insert: NutritionRecordInsert = { name: `運動（手動）`, amount_text: null, calories: kcal, protein: 0, fat: 0, carbs: 0, salt: 0, multiplier: 1, source: 'exercise', description: null, image_url: null };
                if (!isSupabaseConfigured) { setStatusMessage('Supabase 未設定で保存できません。'); return; }
                const { data, error } = await insertNutritionRecordsWithFallback([insert]);
                if (error) { console.error(error); setStatusMessage(`保存に失敗しました: ${formatSupabaseError(error)}`); return; }
                if (data && data[0]) { const record = mapNutritionRecord(data[0], { name: insert.name, calories: insert.calories, protein: insert.protein, fat: insert.fat, carbs: insert.carbs, salt: insert.salt, multiplier: insert.multiplier, source: 'exercise' }); setRecords((prev) => [record, ...prev]); setStatusMessage('運動記録を保存しました。'); }
              }}>保存</button>
            </div>
          )}
          {exerciseTab === 'met' && (
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <select id="met-select">
                <option value="3.5">軽め - MET 3.5</option>
                <option value="6.0">強め - MET 6.0</option>
                <option value="7.0">高強度 - MET 7.0</option>
              </select>
              <input id="met-min" type="number" defaultValue={30} min={1} style={{width:80}} />
              <button className="button-secondary" onClick={async () => {
                const metEl = document.getElementById('met-select') as HTMLSelectElement | null;
                const minEl = document.getElementById('met-min') as HTMLInputElement | null;
                const met = metEl ? Number(metEl.value) : 0;
                const min = minEl ? Number(minEl.value) : 0;
                if (!met || !min) { setStatusMessage('METと時間を入力してください。'); return; }
                const hours = min / 60;
                const kcal = Math.round(met * profile.weight * hours);
                const insert: NutritionRecordInsert = { name: `筋トレ ${min}分`, amount_text: null, calories: kcal, protein: 0, fat: 0, carbs: 0, salt: 0, multiplier: 1, source: 'exercise', description: `MET ${met}`, image_url: null };
                if (!isSupabaseConfigured) { setStatusMessage('Supabase 未設定で保存できません。'); return; }
                const { data, error } = await insertNutritionRecordsWithFallback([insert]);
                if (error) { console.error(error); setStatusMessage(`保存に失敗しました: ${formatSupabaseError(error)}`); return; }
                if (data && data[0]) { const record = mapNutritionRecord(data[0], { name: insert.name, calories: insert.calories, protein: insert.protein, fat: insert.fat, carbs: insert.carbs, salt: insert.salt, multiplier: insert.multiplier, source: 'exercise' }); setRecords((prev) => [record, ...prev]); setStatusMessage('筋トレ記録を保存しました。'); }
              }}>保存</button>
            </div>
          )}
        </div>
      </div>

      <div className="page-card">
        <h2 className="section-title">日次集計</h2>
        <label>
          日付を選択
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        </label>
        <div className="summary-item">
          <span>総カロリー</span>
          <strong>{totals.calories.toFixed(0)} kcal</strong>
        </div>
        <div className="summary-item">
          <span>タンパク質</span>
          <strong>{totals.protein.toFixed(1)} g</strong>
        </div>
        <div className="summary-item">
          <span>脂質</span>
          <strong>{totals.fat.toFixed(1)} g</strong>
        </div>
        <div className="summary-item">
          <span>炭水化物</span>
          <strong>{totals.carbs.toFixed(1)} g</strong>
        </div>
        <div className="summary-item">
          <span>食塩相当量</span>
          <strong>{totals.salt.toFixed(1)} g</strong>
        </div>
        <div className="summary-item">
          <span>基礎代謝の目安</span>
          <strong>{basalMetabolism.toFixed(0)} kcal</strong>
        </div>
        <div className="summary-item">
          <span>運動による消費カロリー</span>
          <strong>{exerciseCalories.toFixed(0)} kcal</strong>
        </div>
        <div className="summary-item">
          <span>総消費カロリー（基礎代謝＋運動）</span>
          <strong>{totalConsumptionCalories.toFixed(0)} kcal</strong>
        </div>
        <div className="summary-item">
          <span>推定エネルギー必要量</span>
          <strong>{estimatedEnergy.toFixed(0)} kcal</strong>
        </div>
        <div className="summary-item">
          <span>推奨（DRI 2025 暫定）</span>
          <strong>
            {recommended.kcal} kcal / P:{recommended.protein}g 
            F: {Math.round(((recommended.kcal * (((recommended.fat_pct_min ?? 20) + (recommended.fat_pct_max ?? 30)) / 2) / 100) / 9) * 10) / 10}g 
            C: {Math.round(((recommended.kcal * (((recommended.carbs_pct_min ?? 50) + (recommended.carbs_pct_max ?? 65)) / 2) / 100) / 4) * 10) / 10}g 
            Na: {recommended.salt}g
          </strong>
        </div>
        <div className="summary-item">
          <span>必要量との差</span>
          <strong>{(totals.calories - estimatedEnergy).toFixed(0)} kcal</strong>
        </div>
        <p><small>グラフの赤い棒は運動記録に入力した消費カロリーのみで、基礎代謝は含みません。</small></p>
        <div className="chart-wrapper">
          <NutritionChart totals={totals} profile={profile} consumptionCalories={exerciseCalories} totalConsumptionCalories={totalConsumptionCalories} date={dateFilter} />
        </div>
      </div>

      <div className="page-card">
        <h2 className="section-title">記録一覧</h2>
        {filteredRecords.length === 0 ? (
          <p>この日の記録はまだありません。</p>
        ) : (
          <div className="field-grid">
            {filteredRecords.map((record) => (
              <div key={record.id} className="record-row">
                <div className="record-head">
                  <div className="record-main">
                    <strong className="record-name">{record.name}</strong>
                    <span className="record-kcal">{record.calories.toFixed(0)} kcal</span>
                  </div>
                  <label className="record-multiplier-field" aria-label="倍率入力">
                    <span className="record-multiplier-prefix">x</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      inputMode="decimal"
                      value={recordMultiplierDrafts[record.id] ?? String(record.multiplier ?? 1)}
                      onChange={(e) => {
                        handleRecordMultiplierInput(record.id, e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void saveRecordMultiplier(record.id);
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className={`button-secondary record-save record-save-${recordSaveStates[record.id] || 'idle'}`}
                    disabled={(recordSaveStates[record.id] || 'idle') === 'saving'}
                    onClick={() => {
                      void saveRecordMultiplier(record.id);
                    }}
                  >
                    {(recordSaveStates[record.id] || 'idle') === 'saving'
                      ? '保存中'
                      : (recordSaveStates[record.id] || 'idle') === 'success'
                        ? '✓'
                        : '保存'}
                  </button>
                  <button type="button" className="button-danger record-delete" aria-label="削除" onClick={() => removeRecord(record.id)}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="page-card">
        <h2 className="section-title">プロフィール</h2>
        <div className="profile-grid">
          <label>
            年齢
            <input type="number" value={profile.age} onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) })} />
          </label>
          <label>
            体重(kg)
            <input type="number" value={profile.weight} onChange={(e) => setProfile({ ...profile, weight: Number(e.target.value) })} />
          </label>
          <label>
            性別
            <select value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value as Sex })}>
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
          </label>
          <label>
            身体活動レベル
            <select value={profile.activity} onChange={(e) => setProfile({ ...profile, activity: e.target.value as ActivityLevel })}>
              <option value="low">低い</option>
              <option value="moderate">普通</option>
              <option value="high">高い</option>
            </select>
          </label>
        </div>
        <p><small>推定エネルギー必要量は体重と活動レベルを元に簡易計算しています。</small></p>
      </div>
    </main>
  );
}
