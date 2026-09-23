"use client";

import React from "react";
import type { Requirements } from '../../lib/dri';
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
  // The day's targets from calcRequirements; null when they cannot be calculated,
  // in which case only intake is drawn.
  requirements: Requirements | null;
  date: string;
};

export default function NutritionChart({ totals, requirements, date }: Props) {

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

  const makeTwoBarChart = (
    title: string,
    intake: number,
    target: number | null,
    targetLabel = "目標",
    extra?: { label: string; value: number },
  ) => ({
    data: {
      labels: [title],
      datasets: [
        {
          label: "摂取",
          backgroundColor: "rgba(54,162,235,0.8)",
          data: [intake],
          ...simpleBars,
        },
        ...(target == null
          ? []
          : [{
              label: targetLabel,
              backgroundColor: "rgba(75,192,192,0.75)",
              data: [target],
              ...simpleBars,
            }]),
        ...(extra
          ? [{
              label: extra.label,
              backgroundColor: "rgba(148,163,184,0.8)",
              data: [extra.value],
              ...simpleBars,
            }]
          : []),
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

  // Intake next to the requirement, which is stacked from BMR × PAL and the day's
  // net exercise so both parts stay visible.
  const caloriesChart = {
    data: {
      labels: ["摂取", "必要量"],
      datasets: [
        {
          label: "摂取（青）",
          backgroundColor: "rgba(54,162,235,0.8)",
          data: [totals.calories, 0],
          stack: "kcal",
          ...simpleBars,
        },
        ...(requirements
          ? [
              {
                label: "基礎代謝×身体活動レベル（緑）",
                backgroundColor: "rgba(75,192,192,0.75)",
                data: [0, requirements.baseEnergy],
                stack: "kcal",
                ...simpleBars,
              },
              {
                label: "運動・正味（ピンク）",
                backgroundColor: "rgba(255,99,132,0.75)",
                data: [0, requirements.exerciseNet],
                stack: "kcal",
                ...simpleBars,
              },
            ]
          : []),
      ],
    },
    options: {
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        title: { display: true, text: `カロリー比較 (${date})`, font: { size: 13, weight: "bold" as const } },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true },
      },
    },
  };

  const carbsChart = makeTwoBarChart("炭水化物(g)", totals.carbs, requirements?.carbsG ?? null);
  const proteinChart = makeTwoBarChart(
    "タンパク質(g)",
    totals.protein,
    requirements?.proteinG ?? null,
    "目標",
    requirements ? { label: "推奨量（確認用）", value: requirements.proteinRda } : undefined,
  );
  const fatChart = makeTwoBarChart("脂質(g)", totals.fat, requirements?.fatG ?? null);
  const saltChart = makeTwoBarChart("食塩相当量(g)", totals.salt, requirements?.saltMaxG ?? null, "目標量（未満）");

  return (
    <div className="metric-chart-grid">
      <div className="metric-row-1">
        <div className="metric-panel">
          <Bar data={caloriesChart.data} options={caloriesChart.options} />
        </div>
      </div>
      <small className="metric-legend-note">判定: 摂取（青）が必要量（緑＋ピンク）と同じなら維持 / 多ければ増 / 少なければ減</small>
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
