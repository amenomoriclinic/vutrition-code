'use client';

import { useEffect, useMemo, useState } from 'react';
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
  source: 'photo' | 'favorite';
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
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);
  const [records, setRecords] = useState<NutritionRecord[]>([]);
  const [favorites, setFavorites] = useState<FavoriteFood[]>(defaultFavorites);
  const [profile, setProfile] = useState({ age: 35, sex: 'male' as Sex, weight: 60, activity: 'moderate' as ActivityLevel });
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');

  useEffect(() => {
    const savedRecords = localStorage.getItem(STORAGE_RECORDS);
    const savedFavorites = localStorage.getItem(STORAGE_FAVORITES);
    const savedProfile = localStorage.getItem(STORAGE_PROFILE);

    if (savedRecords) {
      try {
        setRecords(JSON.parse(savedRecords));
      } catch {
        setRecords([]);
      }
    }

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
    return filteredRecords.reduce(
      (acc, record) => {
        acc.calories += record.calories;
        acc.protein += record.protein;
        acc.fat += record.fat;
        acc.carbs += record.carbs;
        acc.salt += record.salt;
        return acc;
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0, salt: 0 }
    );
  }, [filteredRecords]);

  const recommended = useMemo(() => getDRI(profile), [profile]);

  const estimatedEnergy = useMemo(() => {
    const base = profile.sex === 'male' ? 24 * profile.weight : 22 * profile.weight;
    const pal = profile.activity === 'low' ? 1.4 : profile.activity === 'high' ? 1.75 : 1.55;
    return Math.round(base * pal);
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(STORAGE_RECORDS, JSON.stringify(records));
  }, [records]);

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

      const estimateResponse: NutritionEstimate = {
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

      setEstimate(estimateResponse);
      setStatusMessage('推定結果を確認して保存してください。');
    } catch (error) {
      setStatusMessage('サーバーに接続できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  const saveRecord = () => {
    if (!estimate) return;
    const record: NutritionRecord = {
      ...estimate,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString().slice(0, 10),
      source: 'photo',
    };
    setRecords([record, ...records]);
    // Google Sheets に保存（失敗してもアプリは継続）
    try {
      fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          name: record.name,
          calories: record.calories,
          protein: record.protein,
          fat: record.fat,
          carbs: record.carbs,
          salt: record.salt,
        }),
      }).catch(() => {});
    } catch {}
    setEstimate(null);
    setPhotoFile(null);
    setPhotoPreview('');
    setDescription('');
    setStatusMessage('記録を保存しました。');
  };

  const addFavoriteRecord = (favorite: FavoriteFood) => {
    const record: NutritionRecord = {
      ...favorite,
      description: favorite.name,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString().slice(0, 10),
      source: 'favorite',
    };
    setRecords([record, ...records]);
    try {
      fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          name: record.name,
          calories: record.calories,
          protein: record.protein,
          fat: record.fat,
          carbs: record.carbs,
          salt: record.salt,
        }),
      }).catch(() => {});
    } catch {}
    setStatusMessage(`${favorite.name} を記録しました。`);
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
          <label>
            食事写真
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
          </label>
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
          </div>
          <button className="button-primary" type="button" onClick={saveRecord}>
            記録として保存する
          </button>
        </div>
      ) : null}

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
        <div className="field-grid field-grid-2">
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
          <span>推定エネルギー必要量</span>
          <strong>{estimatedEnergy.toFixed(0)} kcal</strong>
        </div>
        <div className="summary-item">
          <span>推奨（DRI 2025 暫定）</span>
          <strong>{recommended.kcal} kcal / P:{recommended.protein}g F:{recommended.fat}g C:{recommended.carbs}g Na:{recommended.salt}g</strong>
        </div>
        <div className="summary-item">
          <span>必要量との差</span>
          <strong>{(totals.calories - estimatedEnergy).toFixed(0)} kcal</strong>
        </div>
        <div style={{ marginTop: 16 }}>
          <NutritionChart totals={totals} profile={profile} date={dateFilter} />
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
                  <div><small>{record.source === 'favorite' ? '定番食品' : '写真推定'}</small></div>
                </div>
                <div>{record.calories.toFixed(0)} kcal</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
