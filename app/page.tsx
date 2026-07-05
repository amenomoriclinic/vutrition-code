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
];

const activityLabels: Record<ActivityLevel, string> = {
  low: '低い(デスク中心)',
  moderate: '普通(立ち仕事/ウォーキング)',
  high: '高い(運動習慣あり)',
};

export default function HomePage() {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [description, setDescription] = useState('');
  const [scanMode, setScanMode] = useState<'food' | 'label'>('food');
  const [consumedGrams, setConsumedGrams] = useState(100);
  const [quantityMultiplier, setQuantityMultiplier] = useState(1);
  const [exerciseTab, setExerciseTab] = useState<'run' | 'manual' | 'met'>('run');
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);
  const [records, setRecords] = useState<NutritionRecord[]>([]);
  const [favorites, setFavorites] = useState<FavoriteFood[]>(defaultFavorites);
  const [profile, setProfile] = useState({ age: 35, sex: 'male' as Sex, weight: 60, activity: 'moderate' as ActivityLevel });
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');

  useEffect(() => {
    const savedFavorites = localStorage.getItem(STORAGE_FAVORITES);
    const savedProfile = localStorage.getItem(STORAGE_PROFILE);

    if (savedFavorites) {
      try {
        const parsed = JSON.parse(savedFavorites);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFavorites(parsed);
        }
      } catch {
        setFavorites(defaultFavorites);
      }
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
            createdAt: r.created_at ? new Date(r.created_at).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
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
    if (photoFile) {
      const url = URL.createObjectURL(photoFile);
      setPhotoPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPhotoPreview('');
  }, [photoFile]);

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
    const file = event.target.files?.[0] ?? null;
    setPhotoFile(file);
  };

  const handleEstimate = async () => {
    if (!photoFile) {
      setStatusMessage('写真を選択してください。');
      return;
    }

    setLoading(true);
    setStatusMessage('推定中... Claude APIを呼び出しています。');
    setEstimate(null);

    try {
      const formData = new FormData();
      formData.append('photo', photoFile);
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
        setStatusMessage(result.error || '推定に失敗しました。');
        setLoading(false);
        return;
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
          imageUrl: photoPreview,
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
          imageUrl: photoPreview,
        };
      }

      setEstimate(estimateResponse);
      setStatusMessage('推定結果を確認して保存してください。');
    } catch (error) {
      setStatusMessage('サーバーに接続できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  const saveRecord = async () => {
    if (!estimate) return;
    setLoading(true);
    try {
      const scale = Number(quantityMultiplier) || 1;
      const insert = {
        name: estimate.name,
        amount_text: estimate.amountText,
        calories: Math.round((estimate.calories || 0) * scale * 10) / 10,
        protein: Math.round((estimate.protein || 0) * scale * 10) / 10,
        fat: Math.round((estimate.fat || 0) * scale * 10) / 10,
        carbs: Math.round((estimate.carbs || 0) * scale * 10) / 10,
        salt: Math.round((estimate.salt || 0) * scale * 10) / 10,
        source: 'photo',
        description: estimate.description || null,
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
          name: r.name || estimate.name,
          amountText: r.amount_text || estimate.amountText,
          calories: Number(r.calories) || estimate.calories,
          protein: Number(r.protein) || estimate.protein,
          fat: Number(r.fat) || estimate.fat,
          carbs: Number(r.carbs) || estimate.carbs,
          salt: Number(r.salt) || estimate.salt,
          description: r.description || estimate.description,
          imageUrl: r.image_url || undefined,
          createdAt: r.created_at ? new Date(r.created_at).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
          source: r.source || 'photo',
        };
        setRecords([record, ...records]);
        setStatusMessage('記録を保存しました。');
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('保存中にエラーが発生しました。');
    } finally {
      setEstimate(null);
      setPhotoFile(null);
      setPhotoPreview('');
      setDescription('');
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
          createdAt: r.created_at ? new Date(r.created_at).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
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
        <h2 className="section-title">写真から栄養推定</h2>
        <div className="field-grid">
          <div>
            <div style={{display:'flex', gap:8, marginBottom:8}}>
              <button type="button" onClick={() => setScanMode('food')} style={{padding:8, borderRadius:6, background: scanMode==='food' ? '#0b74de' : '#eee', color: scanMode==='food' ? '#fff' : '#000'}}>料理写真</button>
              <button type="button" onClick={() => setScanMode('label')} style={{padding:8, borderRadius:6, background: scanMode==='label' ? '#0b74de' : '#eee', color: scanMode==='label' ? '#fff' : '#000'}}>栄養表示ラベル</button>
            </div>
            <small>{scanMode==='food' ? '料理全体を撮影して栄養推定します。' : 'パッケージの栄養表示を撮影して数値を読み取ります。'}</small>
          </div>
          <label>
            写真
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
          </label>
          {scanMode === 'label' ? (
            <label>
              食べた量 (g)
              <input type="number" min="1" value={consumedGrams} onChange={(e) => setConsumedGrams(Number(e.target.value))} />
            </label>
          ) : null}
          {photoPreview ? <img className="image-preview" src={photoPreview} alt="preview" /> : null}
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

        {estimate ? (
        <div className="page-card">
          <h2 className="section-title">推定結果の確認と修正</h2>
          <div className="field-grid field-grid-2">
            <label>
              料理名
              <input value={estimate.name} onChange={(e) => setEstimate({ ...estimate, name: e.target.value })} />
            </label>
            <label>
              推定量
              <input value={estimate.amountText} onChange={(e) => setEstimate({ ...estimate, amountText: e.target.value })} />
            </label>
            <label>
              カロリー(kcal)
              <input type="number" value={estimate.calories} onChange={(e) => setEstimate({ ...estimate, calories: Number(e.target.value) })} />
            </label>
            <label>
              タンパク質(g)
              <input type="number" value={estimate.protein} onChange={(e) => setEstimate({ ...estimate, protein: Number(e.target.value) })} />
            </label>
            <label>
              脂質(g)
              <input type="number" value={estimate.fat} onChange={(e) => setEstimate({ ...estimate, fat: Number(e.target.value) })} />
            </label>
            <label>
              炭水化物(g)
              <input type="number" value={estimate.carbs} onChange={(e) => setEstimate({ ...estimate, carbs: Number(e.target.value) })} />
            </label>
            <label>
              食塩相当量(g)
              <input type="number" step="0.1" value={estimate.salt} onChange={(e) => setEstimate({ ...estimate, salt: Number(e.target.value) })} />
            </label>
            <label>
              量の倍率
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <div style={{display:'flex', gap:6}}>
                  {[0.5,1,1.5,2].map((v) => (
                    <button key={v} type="button" onClick={() => setQuantityMultiplier(v)} style={{padding:'6px 10px', borderRadius:6, background: quantityMultiplier===v ? '#0b74de' : '#eee', color: quantityMultiplier===v ? '#fff' : '#000'}}>{v}x</button>
                  ))}
                </div>
                <input type="number" step="0.1" min="0.1" value={quantityMultiplier} onChange={(e) => setQuantityMultiplier(Number(e.target.value))} style={{width:100}} />
              </div>
            </label>
          </div>
          <button className="button-primary" type="button" onClick={saveRecord}>
            記録として保存する
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
                const insert = { name: `ランニング ${km} km`, calories: caloriesBurned, protein: 0, fat:0, carbs:0, salt:0, source: 'exercise', description: null } as any;
                if (!isSupabaseConfigured) { setStatusMessage('Supabase 未設定で保存できません。'); return; }
                const { data, error } = await supabase.from('nutrition_records').insert([insert]).select();
                if (error) { console.error(error); setStatusMessage('保存に失敗しました。'); return; }
                if (data && data[0]) { const r = data[0]; setRecords([{ id: r.id, name: r.name, amountText: r.amount_text||'', calories: Number(r.calories)||0, protein:0, fat:0, carbs:0, salt:0, description:r.description||'', imageUrl: r.image_url||undefined, createdAt: r.created_at? new Date(r.created_at).toISOString().slice(0,10):new Date().toISOString().slice(0,10), source:'exercise' }, ...records]); setStatusMessage('ランニング記録を保存しました。'); }
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
                if (data && data[0]) { const r = data[0]; setRecords([{ id: r.id, name: r.name, amountText: r.amount_text||'', calories: Number(r.calories)||0, protein:0, fat:0, carbs:0, salt:0, description:r.description||'', imageUrl: r.image_url||undefined, createdAt: r.created_at? new Date(r.created_at).toISOString().slice(0,10):new Date().toISOString().slice(0,10), source:'exercise' }, ...records]); setStatusMessage('運動記録を保存しました。'); }
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
                if (data && data[0]) { const r = data[0]; setRecords([{ id: r.id, name: r.name, amountText: r.amount_text||'', calories: Number(r.calories)||0, protein:0, fat:0, carbs:0, salt:0, description:r.description||'', imageUrl: r.image_url||undefined, createdAt: r.created_at? new Date(r.created_at).toISOString().slice(0,10): new Date().toISOString().slice(0,10), source:'exercise' }, ...records]); setStatusMessage('筋トレ記録を保存しました。'); }
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
            <button key={favorite.id} className="button-small" type="button" onClick={() => addFavoriteRecord(favorite)}>
              {favorite.name}
            </button>
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
