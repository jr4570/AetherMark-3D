import React from 'react';
import {
  BenchmarkConfig,
  EnvironmentCalibrationResult,
} from '../types/benchmark';
import { DEVICE_TIER_META } from '../data/hardwareDatabase';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gauge,
  Maximize2,
  Play,
  Sliders,
  X,
  Zap,
} from 'lucide-react';

interface EnvironmentProbeModalProps {
  calibration: EnvironmentCalibrationResult;
  config: BenchmarkConfig;
  onApplyRecommendationAndStart: () => void;
  onProceedWithCurrentAndStart: () => void;
  onApplyRecommendationOnly: () => void;
  onClose: () => void;
}

export const EnvironmentProbeModal: React.FC<EnvironmentProbeModalProps> = ({
  calibration,
  config,
  onApplyRecommendationAndStart,
  onProceedWithCurrentAndStart,
  onApplyRecommendationOnly,
  onClose,
}) => {
  const selectedTierLabel =
    DEVICE_TIER_META.find((t) => t.id === calibration.selectedTier)?.label ||
    calibration.selectedTier;
  const recommendedTierLabel =
    DEVICE_TIER_META.find((t) => t.id === calibration.recommendedTier)?.label ||
    calibration.recommendedTier;

  const isMatched = !calibration.hasSignificantDeviation;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="env-probe-title"
      data-testid="environment-probe-modal"
    >
      <div className="w-full max-w-2xl bg-[#0B0E17] border border-slate-700 rounded-lg overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#07090E] border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <h2
                id="env-probe-title"
                className="text-base font-bold text-slate-100"
              >
                壓測前自動環境檢測與頻率 / 電壓基線比對
              </h2>
              <p className="text-xs text-slate-400">
                Pre-Flight GPU/CPU Clock & Core Voltage Baseline Calibration
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉環境檢測視窗"
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Status Banner */}
          <div
            className={`p-3.5 rounded-md border flex items-start gap-3 ${
              isMatched
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-950/35 border-amber-500/50 text-amber-200'
            }`}
          >
            {isMatched ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="text-xs leading-relaxed">
              <div className="font-bold text-sm mb-0.5">
                {isMatched
                  ? '● 硬體基線吻合 — 頻率與電壓位於所選階級合理區間'
                  : `▲ 偵測到基線偏差 (${
                      calibration.clockDeviationPct > 0 ? '+' : ''
                    }${calibration.clockDeviationPct}%) — 系統建議自動修正壓力強度`}
              </div>
              <p className="text-slate-200">{calibration.advisoryMessage}</p>
            </div>
          </div>

          {/* 3-Column Baseline Comparison Matrix (GPU Clock / CPU Clock / Core Voltage) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs tabular-nums">
            <div className="bg-[#07090E] border border-slate-800 rounded-md p-3.5">
              <div className="text-[11px] text-slate-400">
                GPU 即時頻率基線 (Clock)
              </div>
              <div className="text-xl font-bold text-cyan-400 mt-1">
                {calibration.measuredGpuClockMHz}{' '}
                <span className="text-xs font-normal text-slate-400">MHz</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>階級預設基準：</span>
                  <span className="text-slate-200">
                    {calibration.expectedGpuClockMHz} MHz
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">頻率偏差率：</span>
                  <span
                    className={
                      Math.abs(calibration.clockDeviationPct) >= 18
                        ? 'text-amber-400 font-semibold'
                        : 'text-emerald-400 font-semibold'
                    }
                  >
                    {calibration.clockDeviationPct > 0 ? '+' : ''}
                    {calibration.clockDeviationPct}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#07090E] border border-slate-800 rounded-md p-3.5">
              <div className="text-[11px] text-slate-400">
                CPU 浮點頻率基線 (Compute)
              </div>
              <div className="text-xl font-bold text-slate-100 mt-1">
                {calibration.measuredCpuClockMHz}{' '}
                <span className="text-xs font-normal text-slate-400">MHz</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>階級預設基準：</span>
                  <span className="text-slate-200">
                    {calibration.expectedCpuClockMHz} MHz
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">探針微核吞吐：</span>
                  <span className="text-cyan-400 font-semibold">
                    {calibration.probeGflops} GFLOPS
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#07090E] border border-slate-800 rounded-md p-3.5">
              <div className="text-[11px] text-slate-400">
                核心電壓基線 (Core VID)
              </div>
              <div className="text-xl font-bold text-amber-400 mt-1">
                {calibration.measuredVoltageV.toFixed(3)}{' '}
                <span className="text-xs font-normal text-slate-400">V</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>階級預設電壓：</span>
                  <span className="text-slate-200">
                    {calibration.expectedVoltageV.toFixed(2)} V
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">電壓偏差率：</span>
                  <span
                    className={
                      Math.abs(calibration.voltageDeviationPct) >= 15
                        ? 'text-amber-400 font-semibold'
                        : 'text-emerald-400 font-semibold'
                    }
                  >
                    {calibration.voltageDeviationPct > 0 ? '+' : ''}
                    {calibration.voltageDeviationPct}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Preset vs Recommended Configuration Comparison */}
          <div className="bg-[#07090E] border border-slate-800 rounded-md p-3.5 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-400">
                目前選擇設定：
                <strong className="text-slate-100 ml-1">
                  {selectedTierLabel} · 強度 {config.intensity.toUpperCase()} (
                  {config.instanceCount} Shards)
                </strong>
              </span>
              {calibration.hasSignificantDeviation && (
                <span className="text-amber-400 font-mono font-semibold">
                  → 建議修正為：{recommendedTierLabel} · 強度{' '}
                  {calibration.recommendedIntensity.toUpperCase()} (
                  {calibration.recommendedInstances} Shards)
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/80 flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>
                全螢幕防作弊規範：壓力測試啟動後將鎖定全螢幕執行，測試期間若按 ESC、切換分頁或跳出全螢幕將立即中斷測試。
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 bg-[#07090E] border-t border-slate-800 flex flex-wrap items-center justify-end gap-2.5">
          {calibration.hasSignificantDeviation && (
            <>
              <button
                type="button"
                onClick={onApplyRecommendationOnly}
                data-testid="apply-recommendation-only-btn"
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-md text-xs font-medium cursor-pointer"
              >
                僅套用建議參數
              </button>
              <button
                type="button"
                onClick={onApplyRecommendationAndStart}
                data-testid="apply-recommendation-start-btn"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>套用建議強度並進入全螢幕壓測</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onProceedWithCurrentAndStart}
            data-testid="proceed-fullscreen-start-btn"
            className={`px-4 py-2 font-semibold text-xs rounded-md flex items-center gap-1.5 cursor-pointer ${
              calibration.hasSignificantDeviation
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>
              {calibration.hasSignificantDeviation
                ? '維持原設定強制全螢幕壓測'
                : '確認基線並進入全螢幕壓測'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
