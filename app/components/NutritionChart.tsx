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
  consumptionCalories?: number;
  date: string;
};

export default function NutritionChart({ totals, profile, consumptionCalories, date }: Props) {
  const recommended = useMemo(() => getDRI(profile as any), [profile]);

  const labels = [
    "カロリー(kcal)",
    "タンパク質(g)",
    "脂質(g)",
    "炭水化物(g)",
    "食塩相当量(g)",
  ];

  // convert percent-based recommendations to grams using kcal
  const fatPctAvg = ((recommended.fat_pct_min ?? 20) + (recommended.fat_pct_max ?? 30)) / 2;
  const carbsPctAvg = ((recommended.carbs_pct_min ?? 50) + (recommended.carbs_pct_max ?? 65)) / 2;
  const recFatG = Math.round(((recommended.kcal * (fatPctAvg / 100)) / 9) * 10) / 10;
  const recCarbsG = Math.round(((recommended.kcal * (carbsPctAvg / 100)) / 4) * 10) / 10;

  const data = {
    labels,
    datasets: [
      {
        label: "摂取カロリー・摂取量",
        backgroundColor: "rgba(54,162,235,0.8)",
        data: [totals.calories, totals.protein, totals.fat, totals.carbs, totals.salt],
      },
      {
        label: "運動による消費カロリー",
        backgroundColor: "rgba(255,99,132,0.75)",
        data: [consumptionCalories ?? 0, 0, 0, 0, 0],
      },
      {
        label: "推奨摂取量（DRI 2025）",
        backgroundColor: "rgba(75,192,192,0.75)",
        data: [recommended.kcal, recommended.protein, recFatG, recCarbsG, recommended.salt],
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          boxWidth: 18,
          boxHeight: 18,
          padding: 18,
          font: {
            size: 14,
            weight: "bold" as const,
          },
        },
      },
      title: { display: true, text: `日次栄養比較 (${date})`, font: { size: 16, weight: "bold" as const } },
      tooltip: {
        titleFont: { size: 14, weight: "bold" as const },
        bodyFont: { size: 13 },
      },
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  return (
    <div className="chart-container" style={{ maxWidth: 800 }}>
      <Bar data={data} options={options} />
    </div>
  );
}
