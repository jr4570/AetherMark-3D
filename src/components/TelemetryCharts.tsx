import React, { useState } from 'react';
import {
  LoopSummary,
  RadarCapabilityMetrics,
  TelemetrySample,
} from '../types/benchmark';
import { computeRadarPolygonPoints } from '../engine/benchmarkMath';

interface LiveTelemetryWaveformProps {
  samples: TelemetrySample[];
  throttleTempC: number;
}

export const LiveTelemetryWaveform: React.FC<LiveTelemetryWaveformProps> = ({
  samples,
  throttleTempC,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 760;
  const height = 195;
  const padLeft = 44;
  const padRight = 44;
  const padTop = 18;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const displaySamples = samples.slice(-48);

  if (displaySamples.length === 0) {
    return (
      <div className="h-[195px] flex flex-col items-center justify-center bg-[#0B0E17] border border-slate-800 rounded-lg text-center px-4">
        <p className="text-xs font-mono text-slate-400">
          尚無即時測試採樣數據 · 點擊「開始壓力測試」或「快速完成並出報告」以擷取時序波形
        </p>
      </div>
    );
  }

  const maxFps = Math.max(120, ...displaySamples.map((s) => s.fps * 1.15));
  const maxTemp = Math.max(95, ...displaySamples.map((s) => s.tempCelsius * 1.1));
  const minTemp = 20;

  const getX = (i: number) => {
    if (displaySamples.length <= 1) return padLeft + plotW / 2;
    return padLeft + (i / (displaySamples.length - 1)) * plotW;
  };

  const getFpsY = (fps: number) =>
    padTop + plotH - Math.min(1, Math.max(0, fps / maxFps)) * plotH;

  const getTempY = (temp: number) =>
    padTop +
    plotH -
    Math.min(1, Math.max(0, (temp - minTemp) / (maxTemp - minTemp))) * plotH;

  const fpsPoints = displaySamples
    .map((s, i) => `${getX(i).toFixed(1)},${getFpsY(s.fps).toFixed(1)}`)
    .join(' ');

  const tempPoints = displaySamples
    .map((s, i) => `${getX(i).toFixed(1)},${getTempY(s.tempCelsius).toFixed(1)}`)
    .join(' ');

  const throttleY = getTempY(throttleTempC);
  const activeSample =
    hoverIdx !== null && displaySamples[hoverIdx]
      ? displaySamples[hoverIdx]
      : displaySamples[displaySamples.length - 1];

  return (
    <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-4 text-xs">
          <span className="font-semibold text-slate-200">
            多通道即時遙測曲線 (FPS / 核心溫度 / 溫控閾值)
          </span>
          <span className="font-mono text-cyan-400">― 即時幀率 (FPS)</span>
          <span className="font-mono text-amber-400">- - 核心溫度 (°C)</span>
          <span className="font-mono text-rose-400">··· 降頻臨界線 ({throttleTempC}°C)</span>
        </div>

        {activeSample && (
          <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-300">
            <span>T+{activeSample.elapsedSec}s</span>
            <span>·</span>
            <span className="text-cyan-400">{activeSample.fps.toFixed(1)} FPS</span>
            <span>·</span>
            <span className="text-amber-400">{activeSample.tempCelsius.toFixed(1)}°C</span>
            <span>·</span>
            <span>{activeSample.clockMHz} MHz</span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[165px] overflow-visible select-none cursor-crosshair"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Horizontal calibration grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = padTop + ratio * plotH;
          const fpsLabel = Math.round(maxFps * (1 - ratio));
          const tempLabel = Math.round(maxTemp - ratio * (maxTemp - minTemp));
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#1E293B"
                strokeWidth="1"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-cyan-500/80 text-[10px] font-mono"
              >
                {fpsLabel}
              </text>
              <text
                x={width - padRight + 6}
                y={y + 3}
                textAnchor="start"
                className="fill-amber-500/80 text-[10px] font-mono"
              >
                {tempLabel}°
              </text>
            </g>
          );
        })}

        {/* Thermal throttle threshold line */}
        {throttleY >= padTop && throttleY <= padTop + plotH && (
          <line
            x1={padLeft}
            y1={throttleY}
            x2={width - padRight}
            y2={throttleY}
            stroke="#F43F5E"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}

        {/* FPS Line */}
        {displaySamples.length > 1 && (
          <polyline
            fill="none"
            stroke="#06B6D4"
            strokeWidth="2.2"
            points={fpsPoints}
          />
        )}

        {/* Temperature Line */}
        {displaySamples.length > 1 && (
          <polyline
            fill="none"
            stroke="#F59E0B"
            strokeWidth="2"
            strokeDasharray="5 3"
            points={tempPoints}
          />
        )}

        {/* Interactive hover vertical slice columns */}
        {displaySamples.map((s, i) => {
          const x = getX(i);
          const colW = plotW / Math.max(1, displaySamples.length);
          return (
            <g key={i}>
              <rect
                x={x - colW / 2}
                y={padTop}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
              {hoverIdx === i && (
                <>
                  <line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={padTop + plotH}
                    stroke="#94A3B8"
                    strokeWidth="1"
                  />
                  <circle
                    cx={x}
                    cy={getFpsY(s.fps)}
                    r="4"
                    fill="#06B6D4"
                  />
                  <circle
                    cx={x}
                    cy={getTempY(s.tempCelsius)}
                    r="4"
                    fill="#F59E0B"
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

interface LoopStabilityChartProps {
  loops: LoopSummary[];
}

export const LoopStabilityChart: React.FC<LoopStabilityChartProps> = ({
  loops,
}) => {
  if (loops.length === 0) {
    return null;
  }

  const maxScore = Math.max(100, ...loops.map((l) => l.loopScore));

  return (
    <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">
            迴圈穩定度與降頻趨勢 (Loop-by-Loop Stability Analysis)
          </h4>
          <p className="text-xs text-slate-400">
            對比第 1 迴圈至最終迴圈的幀率與分數保持率（3DMark 標準 ≥ 97.0% 為通過溫控穩定度測試）
          </p>
        </div>
        <div className="text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap shrink-0">
          共 {loops.length} 迴圈
        </div>
      </div>

      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
        {loops.map((loop) => {
          const widthPct = Math.max(12, (loop.loopScore / maxScore) * 100);
          const ratioToBest = (loop.loopScore / maxScore) * 100;
          return (
            <div
              key={loop.loopNumber}
              className="grid grid-cols-12 items-center gap-2 text-xs font-mono tabular-nums"
            >
              <div className="col-span-2 text-slate-300 whitespace-nowrap">
                Loop #{loop.loopNumber.toString().padStart(2, '0')}
              </div>
              <div className="col-span-5 bg-slate-900 h-6 rounded overflow-hidden border border-slate-800 relative flex items-center">
                <div
                  className={`
                    absolute inset-y-0 left-0 transition-all
                    ${
                      ratioToBest >= 97
                        ? 'bg-cyan-500/35'
                        : ratioToBest >= 90
                          ? 'bg-amber-500/35'
                          : 'bg-rose-500/35'
                    }
                  `}
                  style={{ width: `${widthPct}%` }}
                />
                <span className="relative z-10 px-2.5 text-[11px] text-slate-100 whitespace-nowrap">
                  {loop.loopScore.toLocaleString()} pts ({ratioToBest.toFixed(1)}%)
                </span>
              </div>
              <div className="col-span-5 text-right text-slate-300 whitespace-nowrap text-[11px]">
                {loop.avgFps.toFixed(1)} FPS · {loop.peakTempC.toFixed(1)}°C ·{' '}
                {loop.avgClockMHz}MHz
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface HardwareRadarChartProps {
  primaryName: string;
  primaryMetrics: RadarCapabilityMetrics;
  compareName?: string;
  compareMetrics?: RadarCapabilityMetrics;
}

export const HardwareRadarChart: React.FC<HardwareRadarChartProps> = ({
  primaryName,
  primaryMetrics,
  compareName,
  compareMetrics,
}) => {
  const cx = 150;
  const cy = 140;
  const maxR = 92;

  const axisLabels = [
    'GPU 峰值算力',
    '溫控穩定度',
    'CPU 多核吞吐',
    '能耗比效率',
    '記憶體頻寬',
    '電池續航力',
  ];

  const primaryPoly = computeRadarPolygonPoints(primaryMetrics, cx, cy, maxR);
  const comparePoly = compareMetrics
    ? computeRadarPolygonPoints(compareMetrics, cx, cy, maxR)
    : null;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 300 280" className="w-full max-w-[300px] h-auto select-none">
        {/* Concentric calibration hexagons */}
        {[0.25, 0.5, 0.75, 1.0].map((level) => {
          const pts = [0, 1, 2, 3, 4, 5]
            .map((i) => {
              const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
              const r = maxR * level;
              return `${(cx + r * Math.cos(angle)).toFixed(1)},${(
                cy +
                r * Math.sin(angle)
              ).toFixed(1)}`;
            })
            .join(' ');
          return (
            <polygon
              key={level}
              points={pts}
              fill="none"
              stroke="#1E293B"
              strokeWidth="1"
            />
          );
        })}

        {/* Radial Axes & Vertex Labels */}
        {axisLabels.map((label, i) => {
          const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
          const x2 = cx + maxR * Math.cos(angle);
          const y2 = cy + maxR * Math.sin(angle);
          const lx = cx + (maxR + 24) * Math.cos(angle);
          const ly = cy + (maxR + 18) * Math.sin(angle);
          return (
            <g key={label}>
              <line
                x1={cx}
                y1={cy}
                x2={x2}
                y2={y2}
                stroke="#1E293B"
                strokeWidth="1"
              />
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                className="fill-slate-300 text-[10px] font-mono"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Comparison Device Polygon */}
        {comparePoly && (
          <polygon
            points={comparePoly}
            fill="rgba(245, 158, 11, 0.16)"
            stroke="#F59E0B"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
        )}

        {/* Primary Device Polygon */}
        <polygon
          points={primaryPoly}
          fill="rgba(6, 182, 212, 0.22)"
          stroke="#06B6D4"
          strokeWidth="2.2"
        />
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono mt-1">
        <span className="text-cyan-400">■ {primaryName}</span>
        {compareName && <span className="text-amber-400">□ {compareName}</span>}
      </div>
    </div>
  );
};
