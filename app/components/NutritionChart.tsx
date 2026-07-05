"use client";

import React, { useMemo } from "react";
import { getDRI } from '../../lib/dri';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type Props = {
  totals: { calories: number; protein: number; fat: number; carbs: number; salt: number };
  profile: { age: number; sex: string; weight: number; activity: string };
  date: string;
};

export default function NutritionChart({ totals, profile, date }: Props) {
  const recommended = useMemo(() => getDRI(profile as any), [profile]);

  const labels = [
    "カロリー(kcal)",
    "タンパク質(g)",
    "脂質(g)",
    "炭水化物(g)",
    "食塩相当量(g)",
  ];

  const data = {
    labels,
    datasets: [
      {
        label: "実績",
        backgroundColor: "rgba(54,162,235,0.7)",
        data: [totals.calories, totals.protein, totals.fat, totals.carbs, totals.salt],
      },
      {
        label: "推奨",
        backgroundColor: "rgba(75,192,192,0.6)",
        data: [recommended.kcal, recommended.protein, recommended.fat, recommended.carbs, recommended.salt],
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: `日次栄養比較 (${date})` },
    },
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Bar data={data} options={options} />
    </div>
  );
}
