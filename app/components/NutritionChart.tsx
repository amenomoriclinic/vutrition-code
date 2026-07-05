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

  const data = {
    labels: ["カロリー(kcal)"],
    datasets: [
      {
        label: "摂取カロリー",
        backgroundColor: "rgba(54,162,235,0.8)",
        data: [totals.calories],
      },
      {
        label: "運動による消費カロリー",
        backgroundColor: "rgba(255,99,132,0.75)",
        data: [consumptionCalories ?? 0],
      },
      {
        label: "DRI 2025による推奨摂取カロリー",
        backgroundColor: "rgba(75,192,192,0.75)",
        data: [recommended.kcal],
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
      title: { display: true, text: `日次カロリー比較 (${date})`, font: { size: 16, weight: "bold" as const } },
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
