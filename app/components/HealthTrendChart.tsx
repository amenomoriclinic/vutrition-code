"use client";

import React, { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export type HealthTrendRange = 7 | 30 | 90;

export const HEALTH_TREND_RANGES: HealthTrendRange[] = [7, 30, 90];

// Structural subset of the page's HealthRecord; rows must be sorted by date ascending.
export type HealthTrendPoint = {
  date: string;
  weight: number | null;
  bodyFat: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  pulse: number | null;
};

type Props = {
  records: HealthTrendPoint[];
  range: HealthTrendRange;
  onRangeChange: (range: HealthTrendRange) => void;
  loading?: boolean;
};

// Validated categorical slots (light surface #f8fafc): blue / violet / red / green.
const COLOR_WEIGHT = "#2a78d6";
const COLOR_BODY_FAT = "#4a3aa7";
const COLOR_SYSTOLIC = "#e34948";
const COLOR_DIASTOLIC = "#2a78d6";
const COLOR_PULSE = "#008300";

const GRID_COLOR = "#e2e8f0";
const TICK_COLOR = "#64748b";

// A line needs at least two points to show a trend.
const MIN_POINTS = 2;

const shortDate = (date: string) => {
  const [, month, day] = date.split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : date;
};

export default function HealthTrendChart({ records, range, onRangeChange, loading }: Props) {
  const charts = useMemo(() => {
    // Each chart keeps only the dates where its own metric was recorded, so a day
    // with just a weight entry does not punch a hole in the pulse line.
    const build = (
      title: string,
      series: Array<{ label: string; color: string; pick: (row: HealthTrendPoint) => number | null }>
    ) => {
      const rows = records.filter((row) => series.some((s) => s.pick(row) != null));
      const pointCount = rows.length;
      const showLegend = series.length > 1;

      return {
        title,
        enough: pointCount >= MIN_POINTS,
        data: {
          labels: rows.map((row) => shortDate(row.date)),
          datasets: series.map((s) => ({
            label: s.label,
            data: rows.map((row) => s.pick(row)),
            borderColor: s.color,
            backgroundColor: s.color,
            borderWidth: 2,
            pointRadius: pointCount > 30 ? 0 : 4,
            pointHoverRadius: 6,
            tension: 0.2,
            spanGaps: true,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index" as const, intersect: false },
          plugins: {
            legend: {
              display: showLegend,
              position: "top" as const,
              labels: { boxWidth: 12, boxHeight: 12, padding: 10, font: { size: 12, weight: "bold" as const } },
            },
            title: { display: true, text: title, font: { size: 13, weight: "bold" as const } },
            tooltip: {
              titleFont: { size: 12, weight: "bold" as const },
              bodyFont: { size: 12 },
              callbacks: {
                // Axis ticks are abbreviated to M/D; the tooltip shows the full date.
                title: (items: any[]) => (items.length ? rows[items[0].dataIndex]?.date ?? "" : ""),
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: TICK_COLOR, autoSkip: true, maxTicksLimit: 8 } },
            y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        },
      };
    };

    return [
      build("体重 (kg)", [{ label: "体重", color: COLOR_WEIGHT, pick: (r) => r.weight }]),
      build("体脂肪率 (%)", [{ label: "体脂肪率", color: COLOR_BODY_FAT, pick: (r) => r.bodyFat }]),
      build("血圧 (mmHg)", [
        { label: "収縮期", color: COLOR_SYSTOLIC, pick: (r) => r.systolicBp },
        { label: "拡張期", color: COLOR_DIASTOLIC, pick: (r) => r.diastolicBp },
      ]),
      build("脈拍 (bpm)", [{ label: "脈拍", color: COLOR_PULSE, pick: (r) => r.pulse }]),
    ];
  }, [records]);

  return (
    <div>
      <div className="health-trend-controls">
        {HEALTH_TREND_RANGES.map((days) => (
          <button
            key={days}
            type="button"
            className={`health-trend-range-button${range === days ? ' health-trend-range-button-active' : ''}`}
            onClick={() => onRangeChange(days)}
          >
            {days}日間
          </button>
        ))}
      </div>
      <div className="health-trend-grid">
        {charts.map((chart) => (
          <div className="health-trend-panel" key={chart.title}>
            {loading ? (
              <div className="health-trend-empty">読み込み中...</div>
            ) : chart.enough ? (
              <Line data={chart.data} options={chart.options} />
            ) : (
              <div className="health-trend-empty">
                <span className="health-trend-empty-title">{chart.title}</span>
                データが不足しています
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
