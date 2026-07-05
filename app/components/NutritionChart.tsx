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
  totalConsumptionCalories?: number;
  date: string;
};

export default function NutritionChart({ totals, profile, consumptionCalories, totalConsumptionCalories, date }: Props) {
  const recommended = useMemo(() => getDRI(profile as any), [profile]);

  const fatPctAvg = ((recommended.fat_pct_min ?? 20) + (recommended.fat_pct_max ?? 30)) / 2;
  const carbsPctAvg = ((recommended.carbs_pct_min ?? 50) + (recommended.carbs_pct_max ?? 65)) / 2;
  const recFatG = Math.round(((recommended.kcal * (fatPctAvg / 100)) / 9) * 10) / 10;
  const recCarbsG = Math.round(((recommended.kcal * (carbsPctAvg / 100)) / 4) * 10) / 10;

  const simpleBars = {
    barThickness: 14,
    maxBarThickness: 18,
    categoryPercentage: 0.55,
    barPercentage: 0.7,
  };

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 10,
          font: {
            size: 12,
            weight: "bold" as const,
          },
        },
      },
      title: { display: true, text: "", font: { size: 13, weight: "bold" as const } },
      tooltip: {
        titleFont: { size: 12, weight: "bold" as const },
        bodyFont: { size: 12 },
      },
    },
    scales: {
      y: { beginAtZero: true },
    },
  };

  const makeTwoBarChart = (title: string, intake: number, recommendedValue: number) => ({
    data: {
      labels: [title],
      datasets: [
        {
          label: "摂取",
          backgroundColor: "rgba(54,162,235,0.8)",
          data: [intake],
          ...simpleBars,
        },
        {
          label: "推奨",
          backgroundColor: "rgba(75,192,192,0.75)",
          data: [recommendedValue],
          ...simpleBars,
        },
      ],
    },
    options: {
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        title: { display: true, text: `${title}比較 (${date})`, font: { size: 13, weight: "bold" as const } },
      },
    },
  });

  const caloriesChart = {
    data: {
      labels: ["カロリー(kcal)"],
      datasets: [
        {
          label: "摂取カロリー（青）",
          backgroundColor: "rgba(54,162,235,0.8)",
          data: [totals.calories],
          ...simpleBars,
        },
        {
          label: "運動消費（ピンク）",
          backgroundColor: "rgba(255,99,132,0.75)",
          data: [consumptionCalories ?? 0],
          ...simpleBars,
        },
        {
          label: "DRI推奨摂取（緑）",
          backgroundColor: "rgba(75,192,192,0.75)",
          data: [recommended.kcal],
          ...simpleBars,
        },
        {
          label: "総消費（オレンジ）",
          backgroundColor: "rgba(245,158,11,0.85)",
          data: [totalConsumptionCalories ?? 0],
          ...simpleBars,
        },
      ],
    },
    options: {
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        title: { display: true, text: `カロリー比較 (${date})`, font: { size: 13, weight: "bold" as const } },
      },
    },
  };

  const carbsChart = makeTwoBarChart("炭水化物(g)", totals.carbs, recCarbsG);
  const proteinChart = makeTwoBarChart("タンパク質(g)", totals.protein, recommended.protein);
  const fatChart = makeTwoBarChart("脂質(g)", totals.fat, recFatG);
  const saltChart = makeTwoBarChart("食塩相当量(g)", totals.salt, recommended.salt);

  return (
    <div className="metric-chart-grid">
      <div className="metric-row-1">
        <div className="metric-panel">
          <Bar data={caloriesChart.data} options={caloriesChart.options} />
        </div>
      </div>
      <small className="metric-legend-note">判定: 青=橙で維持 / 青&gt;橙で増 / 青&lt;橙で減</small>
      <div className="metric-row-2">
        <div className="metric-panel">
          <Bar data={carbsChart.data} options={carbsChart.options} />
        </div>
        <div className="metric-panel">
          <Bar data={proteinChart.data} options={proteinChart.options} />
        </div>
      </div>
      <div className="metric-row-3">
        <div className="metric-panel">
          <Bar data={fatChart.data} options={fatChart.options} />
        </div>
        <div className="metric-panel">
          <Bar data={saltChart.data} options={saltChart.options} />
        </div>
      </div>
    </div>
  );
}
