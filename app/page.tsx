'use client';

import { useEffect, useMemo, useState } from 'react';
import supabase, { isSupabaseConfigured } from '../lib/supabase';
import NutritionChart from './components/NutritionChart';
import { getDRI } from '../lib/dri';

type Sex = 'male' | 'female';
type ActivityLevel = 'low' | 'moderate' | 'high';

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
  multiplier: number;
};

type NutritionRecord = NutritionEstimate & {
  id: string;
  createdAt: string;
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

const isExerciseSource = (source: unknown) => String(source ?? '').trim().toLowerCase() === 'exercise';
const JST_OFFSET_MINUTES = 9 * 60;

const toJstDateString = (input?: string | Date | null) => {
  const d = input ? new Date(input) : new Date();
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const jst = new Date(utcMs + JST_OFFSET_MINUTES * 60000);
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, '0');
  const day = String(jst.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const isValidFavorite = (v: any): v is FavoriteFood => {
  return !!v && typeof v.id === 'string' && typeof v.name === 'string';
};

const isLegacyInoras120 = (v: FavoriteFood) => {
  const id = String(v.id || '').toLowerCase();
  const name = String(v.name || '').toLowerCase();
  return id.includes('120') || name.includes('120ml') || name.includes('120ml') || name.includes('120ml');
};

const mergeFavorites = (saved: FavoriteFood[], defaults: FavoriteFood[]) => {
  const map = new Map<string, FavoriteFood>();
  for (const f of defaults) map.set(f.id, f);
  for (const f of saved) map.set(f.id, f);
  return Array.from(map.values());
};

const STORAGE_RECORDS = 'nutrition_records';
const STORAGE_FAVORITES = 'nutrition_favorites';
const STORAGE_PROFILE = 'nutrition_profile';

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

export default function HomePage() {
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [scanMode, setScanMode] = useState<'food' | 'label'>('food');
  const [consumedGrams, setConsumedGrams] = useState(100);
  const [exerciseTab, setExerciseTab] = useState<'run' | 'manual' | 'met'>('run');
  const [estimates, setEstimates] = useState<EditableEstimate[]>([]);
  const [records, setRecords] = useState<NutritionRecord[]>([]);
  const [favorites, setFavorites] = useState<FavoriteFood[]>(defaultFavorites);
  const [profile, setProfile] = useState({ age: 35, sex: 'male' as Sex, weight: 60, activity: 'moderate' as ActivityLevel });
  const [dateFilter, setDateFilter] = useState(toJstDateString());
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');

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
          setFavorites(mergeFavorites(normalized, defaultFavorites));
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
            source: (String(r.source || 'photo').toLowerCase() as NutritionRecord['source']),
          }));
          setRecords(mapped as NutritionRecord[]);
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
    return records.filter((record) => record.createdAt.startsWith(dateFilter));
  }, [records, dateFilter]);

  const totals = useMemo(() => {
    // intake totals only (exclude exercise records)
    return filteredRecords.reduce(
      (acc, record) => {
        if (!isExerciseSource(record.source)) {
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
      (acc, record) => (isExerciseSource(record.source) ? acc + (record.calories || 0) : acc),
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

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setPhotoFiles(files);
  };

  const handleEstimate = async () => {
    if (photoFiles.length === 0) {
      setStatusMessage('写真を1枚以上選択してください。');
      return;
    }

    setLoading(true);
    setEstimates([]);
    setStatusMessage(`推定中... 0/${photoFiles.length}`);

    try {
      const next: EditableEstimate[] = [];
      let successCount = 0;

      for (let i = 0; i < photoFiles.length; i += 1) {
        const file = photoFiles[i];
        setStatusMessage(`推定中... ${i + 1}/${photoFiles.length} (${file.name})`);

        const formData = new FormData();
        formData.append('photo', file);
        formData.append('description', description);
        formData.append('mode', scanMode);
        if (scanMode === 'label') {
          formData.append('consumedGrams', String(consumedGrams));
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
          const baseAmount = Number(result.estimate.baseAmount) || 100;
          const grams = Number(result.estimate.consumedGrams || consumedGrams) || consumedGrams;
          const scale = grams / baseAmount;
          estimateResponse = {
            name: result.estimate.name || '不明な食品',
            amountText: `${grams}g`,
            calories: Math.round((Number(result.estimate.calories) || 0) * scale * 10) / 10,
            protein: Math.round((Number(result.estimate.protein) || 0) * scale * 10) / 10,
            fat: Math.round((Number(result.estimate.fat) || 0) * scale * 10) / 10,
            carbs: Math.round((Number(result.estimate.carbs) || 0) * scale * 10) / 10,
            salt: Math.round((Number(result.estimate.salt) || 0) * scale * 10) / 10,
            description: `${description} (${baseAmount}gあたりの栄養表示を${grams}g換算)`,
            imageUrl: photoPreviews[i],
          };
        } else {
          estimateResponse = {
            name: result.estimate.name || '不明な料理',
            amountText: result.estimate.amountText || '1品',
            calories: Number(result.estimate.calories) || 0,
            protein: Number(result.estimate.protein) || 0,
            fat: Number(result.estimate.fat) || 0,
            carbs: Number(result.estimate.carbs) || 0,
            salt: Number(result.estimate.salt) || 0,
            description,
            imageUrl: photoPreviews[i],
          };
        }

        next.push({
          ...estimateResponse,
          tempId: `${Date.now()}-${i}`,
          fileName: file.name,
          multiplier: 1,
        });
        successCount += 1;
      }

      setEstimates(next);
      setStatusMessage(`推定完了: ${successCount}/${photoFiles.length} 件`);
    } catch (error) {
      setStatusMessage('サーバーに接続できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  const updateEstimate = (tempId: string, updater: (prev: EditableEstimate) => EditableEstimate) => {
    setEstimates((prev) => prev.map((e) => (e.tempId === tempId ? updater(e) : e)));
  };

  const saveRecord = async (target: EditableEstimate) => {
  const [scanMode, setScanMode] = useState<'food' | 'label' | 'text'>('food');
    try {
      const scale = Number(target.multiplier) || 1;
      const insert = {
        name: target.name,
        amount_text: target.amountText,
        calories: Math.round((target.calories || 0) * scale * 10) / 10,
        protein: Math.round((target.protein || 0) * scale * 10) / 10,
        fat: Math.round((target.fat || 0) * scale * 10) / 10,
        carbs: Math.round((target.carbs || 0) * scale * 10) / 10,
        salt: Math.round((target.salt || 0) * scale * 10) / 10,
        source: 'photo',
        description: target.description || null,
      } as any;

      if (!isSupabaseConfigured) {
        setStatusMessage('Supabase が未設定です。保存できません。');
        return;
      }

      const { data, error } = await supabase.from('nutrition_records').insert([insert]).select();
      if (error) {
        console.error('Supabase insert error', error);
        setStatusMessage('保存に失敗しました（ネットワークエラー）。');
      } else if (data && data[0]) {
        const r = data[0];
        const record: NutritionRecord = {
          id: r.id,
          name: r.name || target.name,
          amountText: r.amount_text || target.amountText,
          calories: Number(r.calories) || target.calories,
          protein: Number(r.protein) || target.protein,
          fat: Number(r.fat) || target.fat,
          carbs: Number(r.carbs) || target.carbs,
          salt: Number(r.salt) || target.salt,
          description: r.description || target.description,
          imageUrl: r.image_url || undefined,
          createdAt: toJstDateString(r.created_at),
          source: r.source || 'photo',
        };
        setRecords([record, ...records]);
        setEstimates((prev) => prev.filter((e) => e.tempId !== target.tempId));
        setStatusMessage('記録を保存しました。');
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('保存中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const addFavoriteRecord = async (favorite: FavoriteFood) => {
    const insert = {
      name: favorite.name,
      amount_text: favorite.amountText,
      calories: favorite.calories,
      protein: favorite.protein,
      fat: favorite.fat,
      carbs: favorite.carbs,
      salt: favorite.salt,
      source: 'favorite',
      description: favorite.name,
    } as any;
    try {
      if (!isSupabaseConfigured) {
        setStatusMessage('Supabase が未設定です。保存できません。');
        return;
      }

      const { data, error } = await supabase.from('nutrition_records').insert([insert]).select();
      if (error) {
        console.error('Supabase insert error', error);
        setStatusMessage('保存に失敗しました。');
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
          source: r.source || 'favorite',
        };
        setRecords([record, ...records]);
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
    setStatusMessage(scanMode === 'text' ? '推定中... テキスト入力を解析しています。' : `推定中... 0/${photoFiles.length}`);
      id: crypto.randomUUID(),
      name: favoriteName.trim(),
      amountText: '1単位',
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
        formData.append('mode', 'text');
        formData.append('foodName', textFoodName);
        formData.append('foodAmount', textFoodAmount);
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

  return (
    <main>
      <div className="page-card">
        <h1 className="section-title">栄養管理アプリ</h1>
        <p>スマホで食事写真をアップロードし、Claude Visionで栄養を推定して記録します。</p>
        <p>500円玉を基準物として写すと量推定の精度が上がります。</p>
      </div>

      <div className="page-card">
        <h2 className="section-title">写真・テキストから栄養推定</h2>
        <div className="field-grid">
          <div>
            <div style={{display:'flex', gap:8, marginBottom:8, flexWrap:'wrap'}}>
              <button type="button" onClick={() => setScanMode('food')} style={{padding:8, borderRadius:6, background: scanMode==='food' ? '#0b74de' : '#eee', color: scanMode==='food' ? '#fff' : '#000'}}>料理写真</button>
              <button type="button" onClick={() => setScanMode('label')} style={{padding:8, borderRadius:6, background: scanMode==='label' ? '#0b74de' : '#eee', color: scanMode==='label' ? '#fff' : '#000'}}>栄養表示ラベル</button>
              <button type="button" onClick={() => setScanMode('text')} style={{padding:8, borderRadius:6, background: scanMode==='text' ? '#0b74de' : '#eee', color: scanMode==='text' ? '#fff' : '#000'}}>テキスト入力</button>
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
            <label>
              写真
              <input type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoChange} />
            </label>
          ) : null}

          {scanMode === 'label' ? (
            <label>
              食べた量 (g)
              <input type="number" min="1" value={consumedGrams} onChange={(e) => setConsumedGrams(Number(e.target.value))} />
            </label>
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

          <button className="button-primary" type="button" onClick={handleEstimate} disabled={loading}>
            {loading ? '推定中...' : '推定開始'}
          </button>
          {statusMessage ? <p><small>{statusMessage}</small></p> : null}
        </div>
      </div>

      {estimates.length > 0 ? (
        <div className="page-card">
          <h2 className="section-title">推定結果の確認と修正（{estimates.length}件）</h2>
          <div className="field-grid">
            {estimates.map((estimate) => (
              <div key={estimate.tempId} className="page-card" style={{ marginBottom: 8 }}>
                <p><small>{estimate.fileName}</small></p>
                {estimate.imageUrl ? <img className="image-preview" src={estimate.imageUrl} alt={estimate.fileName} style={{ maxWidth: 220 }} /> : null}
                <div className="field-grid field-grid-2">
                  <label>
                    料理名
                    <input value={estimate.name} onChange={(e) => updateEstimate(estimate.tempId, (prev) => ({ ...prev, name: e.target.value }))} />
                  </label>
                  <label>
                    推定量
                    <input value={estimate.amountText} onChange={(e) => updateEstimate(estimate.tempId, (prev) => ({ ...prev, amountText: e.target.value }))} />
                  </label>
                  <label>
                    カロリー(kcal)
                    <input type="number" value={estimate.calories} onChange={(e) => updateEstimate(estimate.tempId, (prev) => ({ ...prev, calories: Number(e.target.value) }))} />
                  </label>
                  <label>
                    タンパク質(g)
                    <input type="number" value={estimate.protein} onChange={(e) => updateEstimate(estimate.tempId, (prev) => ({ ...prev, protein: Number(e.target.value) }))} />
                  </label>
                  <label>
                    脂質(g)
                    <input type="number" value={estimate.fat} onChange={(e) => updateEstimate(estimate.tempId, (prev) => ({ ...prev, fat: Number(e.target.value) }))} />
                  </label>
                  <label>
                    炭水化物(g)
                    <input type="number" value={estimate.carbs} onChange={(e) => updateEstimate(estimate.tempId, (prev) => ({ ...prev, carbs: Number(e.target.value) }))} />
                  </label>
                  <label>
                    食塩相当量(g)
                    <input type="number" step="0.1" value={estimate.salt} onChange={(e) => updateEstimate(estimate.tempId, (prev) => ({ ...prev, salt: Number(e.target.value) }))} />
                  </label>
                  <label>
                    量の倍率
                    <div style={{display:'flex', gap:8, alignItems:'center'}}>
                      <div style={{display:'flex', gap:6}}>
                        {[0.5,1,1.5,2].map((v) => (
                          <button key={v} type="button" onClick={() => updateEstimate(estimate.tempId, (prev) => ({ ...prev, multiplier: v }))} style={{padding:'6px 10px', borderRadius:6, background: estimate.multiplier===v ? '#0b74de' : '#eee', color: estimate.multiplier===v ? '#fff' : '#000'}}>{v}x</button>
                        ))}
                      </div>
                      <input type="number" step="0.1" min="0.1" value={estimate.multiplier} onChange={(e) => updateEstimate(estimate.tempId, (prev) => ({ ...prev, multiplier: Number(e.target.value) }))} style={{width:100}} />
                    </div>
                  </label>
                </div>
                <button className="button-primary" type="button" onClick={() => saveRecord(estimate)}>
                  この結果を保存
                </button>
              </div>
            ))}
          </div>
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
                const insert = { name: `ランニング ${km} km`, calories: caloriesBurned, protein: 0, fat:0, carbs:0, salt:0, source: 'exercise', description: null } as any;
                if (!isSupabaseConfigured) { setStatusMessage('Supabase 未設定で保存できません。'); return; }
                const { data, error } = await supabase.from('nutrition_records').insert([insert]).select();
                if (error) { console.error(error); setStatusMessage('保存に失敗しました。'); return; }
                if (data && data[0]) { const r = data[0]; setRecords([{ id: r.id, name: r.name, amountText: r.amount_text||'', calories: Number(r.calories)||0, protein:0, fat:0, carbs:0, salt:0, description:r.description||'', imageUrl: r.image_url||undefined, createdAt: toJstDateString(r.created_at), source:'exercise' }, ...records]); setStatusMessage('ランニング記録を保存しました。'); }
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
                const insert = { name: `運動（手動）`, calories: kcal, protein:0, fat:0, carbs:0, salt:0, source:'exercise', description:null } as any;
                if (!isSupabaseConfigured) { setStatusMessage('Supabase 未設定で保存できません。'); return; }
                const { data, error } = await supabase.from('nutrition_records').insert([insert]).select();
                if (error) { console.error(error); setStatusMessage('保存に失敗しました。'); return; }
                if (data && data[0]) { const r = data[0]; setRecords([{ id: r.id, name: r.name, amountText: r.amount_text||'', calories: Number(r.calories)||0, protein:0, fat:0, carbs:0, salt:0, description:r.description||'', imageUrl: r.image_url||undefined, createdAt: toJstDateString(r.created_at), source:'exercise' }, ...records]); setStatusMessage('運動記録を保存しました。'); }
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
                const insert = { name: `筋トレ ${min}分`, calories: kcal, protein:0, fat:0, carbs:0, salt:0, source:'exercise', description:`MET ${met}` } as any;
                if (!isSupabaseConfigured) { setStatusMessage('Supabase 未設定で保存できません。'); return; }
                const { data, error } = await supabase.from('nutrition_records').insert([insert]).select();
                if (error) { console.error(error); setStatusMessage('保存に失敗しました。'); return; }
                if (data && data[0]) { const r = data[0]; setRecords([{ id: r.id, name: r.name, amountText: r.amount_text||'', calories: Number(r.calories)||0, protein:0, fat:0, carbs:0, salt:0, description:r.description||'', imageUrl: r.image_url||undefined, createdAt: toJstDateString(r.created_at), source:'exercise' }, ...records]); setStatusMessage('筋トレ記録を保存しました。'); }
              }}>保存</button>
            </div>
          )}
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
              <div key={record.id} className="summary-item">
                <div>
                  <div><strong>{record.name}</strong> <small>{record.amountText}</small></div>
                  <div>
                    <small>
                      {record.source === 'favorite' ? '定番食品' : record.source === 'exercise' ? '運動記録' : '写真推定'}
                    </small>
                  </div>
                </div>
                <div className="record-actions">
                  <span>{record.calories.toFixed(0)} kcal</span>
                  <button type="button" className="button-danger" onClick={() => removeRecord(record.id)}>
                    🗑️ 削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
