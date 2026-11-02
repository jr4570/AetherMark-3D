import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BenchmarkAbortInfo,
  BenchmarkConfig,
  BenchmarkReport,
  DetectedHardwareInfo,
  DeviceTier,
  DurationMode,
  EnvironmentCalibrationResult,
  ReferenceDevice,
  StressIntensity,
  TelemetrySample,
  WorkloadTarget,
} from './types/benchmark';
import {
  BENCHMARK_SUITES,
  DEVICE_TIER_META,
} from './data/hardwareDatabase';
import {
  buildBenchmarkReport,
  generateSyntheticBenchmarkRun,
  getIntensityMultiplier,
  getTierHardwareEnvelope,
  runEnvironmentBaselineCalibration,
} from './engine/benchmarkMath';
import { detectSystemHardware } from './utils/hardwareDetector';
import { ThreeStressCanvas } from './components/ThreeStressCanvas';
import { LiveTelemetryWaveform, LoopStabilityChart } from './components/TelemetryCharts';
import { BatterySimulatorView } from './components/BatterySimulatorView';
import { HardwareCompareView } from './components/HardwareCompareView';
import { ReportModalView } from './components/ReportModalView';
import { EnvironmentProbeModal } from './components/EnvironmentProbeModal';
import {
  Activity,
  Maximize2,
  Play,
  ShieldAlert,
  Sliders,
} from 'lucide-react';

type ActiveTab =
  | 'stress-console'
  | 'battery-suite'
  | 'report-view'
  | 'hardware-compare';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('stress-console');
  const [hardwareInfo, setHardwareInfo] = useState<DetectedHardwareInfo>(() =>
    detectSystemHardware()
  );

  // Active Benchmark Configuration State (Default: Wild Life Pro / Mobile High)
  const [config, setConfig] = useState<BenchmarkConfig>(
    BENCHMARK_SUITES[1].defaultConfig
  );

  // Live Run & Fullscreen State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isFullscreenTest, setIsFullscreenTest] = useState<boolean>(false);
  const [abortInfo, setAbortInfo] = useState<BenchmarkAbortInfo | null>(null);

  // Pre-Flight Automated Environment Calibration State
  const [showProbeModal, setShowProbeModal] = useState<boolean>(false);
  const [calibrationResult, setCalibrationResult] =
    useState<EnvironmentCalibrationResult>(() =>
      runEnvironmentBaselineCalibration({
        config: BENCHMARK_SUITES[1].defaultConfig,
        hardware: detectSystemHardware(),
      })
    );

  const [samples, setSamples] = useState<TelemetrySample[]>(() =>
    generateSyntheticBenchmarkRun(BENCHMARK_SUITES[1].defaultConfig)
  );
  const [customDevices, setCustomDevices] = useState<ReferenceDevice[]>([]);

  // Latest generated Benchmark Report
  const [latestReport, setLatestReport] = useState<BenchmarkReport>(() => {
    const initialHw = detectSystemHardware();
    const initialSamples = generateSyntheticBenchmarkRun(
      BENCHMARK_SUITES[1].defaultConfig
    );
    return buildBenchmarkReport(
      BENCHMARK_SUITES[1].defaultConfig,
      initialHw,
      initialSamples
    );
  });

  // Re-evaluate baseline calibration whenever config tier or intensity changes
  useEffect(() => {
    setCalibrationResult(
      runEnvironmentBaselineCalibration({
        config,
        hardware: hardwareInfo,
      })
    );
  }, [config.deviceTier, config.intensity, hardwareInfo]);

  // Check for ?autostart=1 query parameter & Battery API probe on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      setSamples([]);
      setAbortInfo(null);
      setIsRunning(true);
      setIsPaused(false);
      setIsFullscreenTest(true);
    }

    const nav = navigator as any;
    if (typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((bat: any) => {
          if (bat && typeof bat.level === 'number') {
            setHardwareInfo((prev) => ({
              ...prev,
              batterySupported: true,
              initialBatteryPct: Math.round(bat.level * 100),
            }));
          }
        })
        .catch(() => {});
    }
  }, []);

  // Track whether browser native fullscreen was entered so we know when fullscreenchange means exit
  const enteredNativeFullscreenRef = useRef<boolean>(false);

  const handleAbortFromFullscreen = useCallback(
    (reason: BenchmarkAbortInfo['reason']) => {
      setIsRunning(false);
      setIsPaused(false);
      setIsFullscreenTest(false);
      enteredNativeFullscreenRef.current = false;

      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      const lastSample =
        samples.length > 0 ? samples[samples.length - 1] : null;
      const reasonMap: Record<BenchmarkAbortInfo['reason'], string> = {
        'exit-fullscreen':
          '壓力測試已中斷：偵測到使用者跳出全螢幕測試視窗（全螢幕防作弊與恆定負載保護機制已觸發）。',
        'escape-key':
          '壓力測試已中斷：偵測到按下 ESC 鍵退出全螢幕模式，本次測試不予計分。',
        'visibility-hidden':
          '壓力測試已中斷：偵測到切換瀏覽器分頁或背景化視窗，GPU/CPU 連續負載已中斷。',
        'manual-abort': '壓力測試已由使用者手動中斷。',
      };

      setAbortInfo({
        abortedAtIso: new Date().toISOString(),
        reason,
        reasonLabel: reasonMap[reason],
        elapsedSecBeforeAbort: lastSample ? lastSample.elapsedSec : 0,
        loopAtAbort: lastSample ? lastSample.loopIndex : 1,
      });
    },
    [samples]
  );

  // Listen for native fullscreen exit or tab visibility loss during active fullscreen test
  useEffect(() => {
    if (!isRunning || !isFullscreenTest) return;

    const handleFullscreenChange = () => {
      if (typeof document === 'undefined') return;
      if (document.fullscreenElement) {
        enteredNativeFullscreenRef.current = true;
      } else if (enteredNativeFullscreenRef.current) {
        handleAbortFromFullscreen('exit-fullscreen');
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        handleAbortFromFullscreen('visibility-hidden');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRunning, isFullscreenTest, handleAbortFromFullscreen]);

  // Select a full preset suite
  const handleSelectSuite = (suiteId: string) => {
    const found = BENCHMARK_SUITES.find((s) => s.id === suiteId);
    if (!found) return;
    setIsRunning(false);
    setIsPaused(false);
    setIsFullscreenTest(false);
    setConfig(found.defaultConfig);
    const synth = generateSyntheticBenchmarkRun(found.defaultConfig);
    setSamples(synth);
    setLatestReport(
      buildBenchmarkReport(found.defaultConfig, hardwareInfo, synth)
    );
  };

  const handleTierChange = (tier: DeviceTier) => {
    setConfig((prev) => ({ ...prev, deviceTier: tier }));
  };

  const handleIntensityChange = (intensity: StressIntensity) => {
    const meta = getIntensityMultiplier(intensity);
    setConfig((prev) => ({
      ...prev,
      intensity,
      instanceCount: meta.instanceCount,
      resolutionScale: meta.resolutionScale,
    }));
  };

  const handleDurationModeChange = (mode: DurationMode) => {
    setConfig((prev) => {
      let targetLoops = prev.targetLoops;
      let loopDurationSec = prev.loopDurationSec;
      if (mode === 'single') {
        targetLoops = 1;
        loopDurationSec = 10;
      } else if (mode === 'short-loop') {
        targetLoops = 5;
        loopDurationSec = 8;
      } else if (mode === 'long-stability') {
        targetLoops = 20;
        loopDurationSec = 12;
      }
      return {
        ...prev,
        durationMode: mode,
        targetLoops,
        loopDurationSec,
      };
    });
  };

  // Run Pre-Flight Automated Environment Calibration Modal before starting
  const handleOpenEnvironmentProbe = () => {
    const freshCal = runEnvironmentBaselineCalibration({
      config,
      hardware: hardwareInfo,
    });
    setCalibrationResult(freshCal);
    setShowProbeModal(true);
  };

  // Launch Fullscreen Benchmark directly (after calibration confirmation)
  const launchFullscreenBenchmarkWithConfig = (activeCfg: BenchmarkConfig) => {
    setShowProbeModal(false);
    setAbortInfo(null);
    setSamples([]);
    setIsRunning(true);
    setIsPaused(false);
    setIsFullscreenTest(true);
    setActiveTab('stress-console');

    if (
      typeof document !== 'undefined' &&
      document.documentElement.requestFullscreen &&
      !document.fullscreenElement
    ) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          enteredNativeFullscreenRef.current = true;
        })
        .catch(() => {
          enteredNativeFullscreenRef.current = false;
        });
    }
    // Ensure config is synced if recommendation was applied
    setConfig(activeCfg);
  };

  const handleApplyRecommendationOnly = () => {
    const recMult = getIntensityMultiplier(
      calibrationResult.recommendedIntensity
    );
    const updatedCfg: BenchmarkConfig = {
      ...config,
      deviceTier: calibrationResult.recommendedTier,
      intensity: calibrationResult.recommendedIntensity,
      instanceCount: recMult.instanceCount,
      resolutionScale: recMult.resolutionScale,
    };
    setConfig(updatedCfg);
    setShowProbeModal(false);
  };

  const handleApplyRecommendationAndStart = () => {
    const recMult = getIntensityMultiplier(
      calibrationResult.recommendedIntensity
    );
    const updatedCfg: BenchmarkConfig = {
      ...config,
      deviceTier: calibrationResult.recommendedTier,
      intensity: calibrationResult.recommendedIntensity,
      instanceCount: recMult.instanceCount,
      resolutionScale: recMult.resolutionScale,
    };
    launchFullscreenBenchmarkWithConfig(updatedCfg);
  };

  // Record incoming real-time sample from ThreeStressCanvas
  const handleSampleRecorded = (sample: TelemetrySample) => {
    setSamples((prev) => {
      const next = [...prev, sample];
      const totalRequiredSec = config.targetLoops * config.loopDurationSec;
      if (sample.elapsedSec >= totalRequiredSec) {
        setIsRunning(false);
        setIsPaused(false);
        setIsFullscreenTest(false);
        enteredNativeFullscreenRef.current = false;
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        const completedReport = buildBenchmarkReport(
          config,
          hardwareInfo,
          next
        );
        setLatestReport(completedReport);
      }
      return next;
    });
  };

  // Stop & Generate Report cleanly
  const handleStopAndReport = () => {
    setIsRunning(false);
    setIsPaused(false);
    setIsFullscreenTest(false);
    setAbortInfo(null);
    enteredNativeFullscreenRef.current = false;
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    const finalSamples =
      samples.length >= 4
        ? samples
        : generateSyntheticBenchmarkRun(config, samples);
    setSamples(finalSamples);
    const report = buildBenchmarkReport(config, hardwareInfo, finalSamples);
    setLatestReport(report);
    setActiveTab('report-view');
  };

  // Fast-Forward Complete all target loops & open report
  const handleFastForwardComplete = () => {
    setIsRunning(false);
    setIsPaused(false);
    setIsFullscreenTest(false);
    setAbortInfo(null);
    enteredNativeFullscreenRef.current = false;
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    const fullSamples = generateSyntheticBenchmarkRun(config, []);
    setSamples(fullSamples);
    const report = buildBenchmarkReport(config, hardwareInfo, fullSamples);
    setLatestReport(report);
    setActiveTab('report-view');
  };

  const handleResetSamples = () => {
    setIsRunning(false);
    setIsPaused(false);
    setIsFullscreenTest(false);
    setAbortInfo(null);
    const fresh = generateSyntheticBenchmarkRun(config, []);
    setSamples(fresh);
    setLatestReport(buildBenchmarkReport(config, hardwareInfo, fresh));
  };

  const latestSample =
    samples.length > 0 ? samples[samples.length - 1] : null;
  const currentLoop = latestSample ? latestSample.loopIndex : 1;
  const totalTargetSec = Math.max(
    1,
    config.targetLoops * config.loopDurationSec
  );
  const loopProgressPct = latestSample
    ? Math.min(100, (latestSample.elapsedSec / totalTargetSec) * 100)
    : 0;

  const currentEnvelope = useMemo(
    () => getTierHardwareEnvelope(config.deviceTier),
    [config.deviceTier]
  );

  const livePreviewReport = useMemo(
    () => buildBenchmarkReport(config, hardwareInfo, samples),
    [config, hardwareInfo, samples]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#07090E] text-slate-100">
      {/* Pre-Flight Automated Environment Calibration Modal */}
      {showProbeModal && (
        <EnvironmentProbeModal
          calibration={calibrationResult}
          config={config}
          onApplyRecommendationAndStart={handleApplyRecommendationAndStart}
          onProceedWithCurrentAndStart={() =>
            launchFullscreenBenchmarkWithConfig(config)
          }
          onApplyRecommendationOnly={handleApplyRecommendationOnly}
          onClose={() => setShowProbeModal(false)}
        />
      )}

      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="flex flex-wrap md:flex-nowrap items-center justify-between gap-y-2 gap-x-4 md:gap-8 px-4 sm:px-6 py-3 bg-[#0B0E17] border-b border-slate-800 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('stress-console');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          AetherMark 3D
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="主導覽列"
          className="order-3 md:order-2 w-full md:w-auto flex items-center justify-between sm:justify-start gap-3 sm:gap-5 overflow-x-auto text-xs sm:text-sm font-medium text-slate-300 pt-1.5 md:pt-0 border-t md:border-t-0 border-slate-800/80"
        >
          {(
            [
              { id: 'stress-console', label: '壓力測試主控台' },
              { id: 'battery-suite', label: '電池續航模擬' },
              { id: 'report-view', label: '效能與溫控報告' },
              { id: 'hardware-compare', label: '硬體性能對比' },
            ] as { id: ActiveTab; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === item.id
                  ? 'text-cyan-400 border-cyan-400 font-semibold'
                  : 'text-slate-400 border-transparent hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="order-2 md:order-3 flex items-center shrink-0">
          <button
            type="button"
            onClick={handleFastForwardComplete}
            className="px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            快速完成壓測報告
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5">
        {activeTab === 'stress-console' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Control & Parameter Column */}
            <aside className="lg:col-span-4 bg-[#0B0E17] border border-slate-800 rounded-lg p-4 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h1 className="text-base font-bold text-slate-100">
                  3DMark 級硬體壓力與穩定度配置
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  支援手機與電腦（低中高階），壓測前自動比對頻率/電壓基線，並鎖定全螢幕執行（跳出即中斷）。
                </p>
              </div>

              {/* Pre-Flight Environment Baseline Status Card */}
              <div
                className={`p-3 rounded-md border text-xs ${
                  calibrationResult.hasSignificantDeviation
                    ? 'bg-amber-950/25 border-amber-500/40'
                    : 'bg-[#07090E] border-slate-800'
                }`}
                data-testid="sidebar-calibration-card"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    自動環境檢測基線
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenEnvironmentProbe}
                    data-testid="sidebar-run-probe-btn"
                    className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                  >
                    檢視完整比對報告
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums py-1.5 border-y border-slate-800/80">
                  <div>
                    <span className="text-slate-400 block text-[10px]">
                      偵測 GPU 基線
                    </span>
                    <span className="text-cyan-400 font-semibold">
                      {calibrationResult.measuredGpuClockMHz}MHz
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">
                      偵測核心電壓
                    </span>
                    <span className="text-amber-400 font-semibold">
                      {calibrationResult.measuredVoltageV.toFixed(2)}V
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">
                      與所選階級偏差
                    </span>
                    <span
                      className={
                        calibrationResult.hasSignificantDeviation
                          ? 'text-amber-400 font-bold'
                          : 'text-emerald-400 font-semibold'
                      }
                    >
                      {calibrationResult.clockDeviationPct > 0 ? '+' : ''}
                      {calibrationResult.clockDeviationPct}%
                    </span>
                  </div>
                </div>

                {calibrationResult.hasSignificantDeviation ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-amber-200 truncate">
                      建議修正強度為{' '}
                      <strong>
                        {calibrationResult.recommendedIntensity.toUpperCase()}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyRecommendationOnly}
                      data-testid="sidebar-apply-rec-btn"
                      className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-[11px] rounded whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      一鍵套用建議
                    </button>
                  </div>
                ) : (
                  <div className="mt-1.5 text-[11px] text-emerald-400">
                    ● 基線與所選設備階級預設值相符
                  </div>
                )}
              </div>

              {/* 1. Benchmark Suite Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  1. 選擇基準測試場景套件 (Benchmark Suite)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {BENCHMARK_SUITES.map((suite) => {
                    const active = config.suiteId === suite.id;
                    return (
                      <button
                        key={suite.id}
                        type="button"
                        onClick={() => handleSelectSuite(suite.id)}
                        className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-cyan-500/15 border-cyan-500/60 text-slate-100'
                            : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-100 truncate">
                          {suite.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {suite.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Target Device Tier */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  2. 目標裝置硬體階級 (手機 / 電腦 低中高階)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {DEVICE_TIER_META.map((tier) => {
                    const active = config.deviceTier === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => handleTierChange(tier.id)}
                        className={`py-2 px-2 rounded border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tier.shortLabel}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1.5">
                  對應規格：
                  {
                    DEVICE_TIER_META.find((t) => t.id === config.deviceTier)
                      ?.typicalSpec
                  }
                </div>
              </div>

              {/* 3. Stress Intensity Degree */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  3. 壓力測試強度等級 (Stress Degree)
                </label>
                <div className="grid grid-cols-4 gap-1 bg-slate-900 p-1 rounded-md border border-slate-800">
                  {(
                    [
                      { id: 'light', label: '輕度' },
                      { id: 'medium', label: '中度' },
                      { id: 'high', label: '重度' },
                      { id: 'extreme', label: '極限' },
                    ] as { id: StressIntensity; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleIntensityChange(item.id)}
                      className={`py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                        config.intensity === item.id
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Workload Target */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  4. 測試處理器目標 (CPU / GPU 負載分配)
                </label>
                <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-md border border-slate-800">
                  {(
                    [
                      { id: 'hybrid-combined', label: 'CPU+GPU 雙烤' },
                      { id: 'gpu-3d', label: '純 GPU 圖形' },
                      { id: 'cpu-compute', label: '純 CPU 算力' },
                    ] as { id: WorkloadTarget; label: string }[]
                  ).map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({ ...prev, workloadTarget: w.id }))
                      }
                      className={`py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                        config.workloadTarget === w.id
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Test Mode & Sliders */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  5. 測試週期與循環模式 (單次 / 短期 / 長期迴圈)
                </label>
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {(
                    [
                      { id: 'single', label: '單次基準測試 (1 Loop)' },
                      { id: 'short-loop', label: '短期連續壓測 (5 Loops)' },
                      { id: 'long-stability', label: '長期熱穩定度 (20 Loops)' },
                      { id: 'custom-loop', label: '自訂迴圈與時間參數' },
                    ] as { id: DurationMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleDurationModeChange(m.id)}
                      className={`py-2 px-2.5 rounded border text-xs font-medium text-left transition-colors cursor-pointer ${
                        config.durationMode === m.id
                          ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3 bg-[#07090E] border border-slate-800 rounded-md p-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <label htmlFor="loop-count-slider" className="text-slate-300">
                        循環測試次數 (Loops)
                      </label>
                      <span className="font-mono text-cyan-400 font-semibold tabular-nums">
                        {config.targetLoops} 迴圈
                      </span>
                    </div>
                    <input
                      id="loop-count-slider"
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={config.targetLoops}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          durationMode: 'custom-loop',
                          targetLoops: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <label htmlFor="shard-count-slider" className="text-slate-300">
                        3D 動態幾何實例數 (Instanced Shards)
                      </label>
                      <span className="font-mono text-amber-400 font-semibold tabular-nums">
                        {config.instanceCount} 組
                      </span>
                    </div>
                    <input
                      id="shard-count-slider"
                      type="range"
                      min={48}
                      max={1000}
                      step={16}
                      value={config.instanceCount}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          instanceCount: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <label htmlFor="ambient-temp-slider" className="text-slate-300">
                        環境室溫基準 (Ambient Temp)
                      </label>
                      <span className="font-mono text-slate-200 font-semibold tabular-nums">
                        {config.thermalAmbientC}°C
                      </span>
                    </div>
                    <input
                      id="ambient-temp-slider"
                      type="range"
                      min={15}
                      max={40}
                      step={1}
                      value={config.thermalAmbientC}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          thermalAmbientC: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Execution Trigger Bar */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={
                    isRunning
                      ? handleStopAndReport
                      : handleOpenEnvironmentProbe
                  }
                  data-testid="sidebar-start-fullscreen-btn"
                  className={`w-full py-2.5 px-4 rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    isRunning
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  }`}
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>
                    {isRunning
                      ? '結束全螢幕壓測並檢視報告'
                      : '自動環境檢測並開始全螢幕壓測'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleFastForwardComplete}
                  className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 rounded-md font-medium text-xs transition-colors cursor-pointer"
                >
                  立即模擬完成 {config.targetLoops} 迴圈並產出完整報告
                </button>
              </div>
            </aside>

            {/* Right Main 3D Viewport & Live Multi-Channel Telemetry Stage */}
            <section className="lg:col-span-8 space-y-5">
              {/* Alert Banner when Fullscreen Test was Aborted by Exiting Fullscreen */}
              {abortInfo && (
                <div
                  className="bg-rose-950/45 border border-rose-500/60 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
                  data-testid="fullscreen-abort-alert"
                >
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <div className="font-bold text-rose-200 text-sm">
                        全螢幕壓測已中斷 (Benchmark Interrupted on Fullscreen Exit)
                      </div>
                      <p className="text-rose-100/90 mt-0.5">
                        {abortInfo.reasonLabel}（中斷於第 {abortInfo.loopAtAbort}{' '}
                        迴圈 · 累計 {abortInfo.elapsedSecBeforeAbort} 秒）
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOpenEnvironmentProbe}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded cursor-pointer"
                    >
                      重新檢測並啟動全螢幕壓測
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbortInfo(null)}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs rounded cursor-pointer"
                    >
                      關閉
                    </button>
                  </div>
                </div>
              )}

              {/* 3D WebGL Stress Viewport */}
              <ThreeStressCanvas
                config={config}
                isRunning={isRunning}
                isPaused={isPaused}
                isFullscreen={isFullscreenTest}
                latestSample={latestSample}
                currentLoop={currentLoop}
                loopProgressPct={loopProgressPct}
                onRequestPreFlightAndStart={handleOpenEnvironmentProbe}
                onRunEnvironmentProbeOnly={handleOpenEnvironmentProbe}
                onPauseToggle={() => setIsPaused((prev) => !prev)}
                onStopAndReport={handleStopAndReport}
                onFastForwardComplete={handleFastForwardComplete}
                onAbortFromFullscreen={handleAbortFromFullscreen}
                onReset={handleResetSamples}
                onSampleRecorded={handleSampleRecorded}
              />

              {/* Live Score & Thermal Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5">
                  <div className="text-[11px] font-mono text-slate-400">
                    預估 3DMARK 綜合總分
                  </div>
                  <div
                    className="text-2xl font-mono font-bold text-cyan-400 mt-0.5 tabular-nums"
                    data-testid="live-total-score"
                  >
                    {livePreviewReport.totalScore.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
                    GPU {livePreviewReport.gpuScore.toLocaleString()} · CPU{' '}
                    {livePreviewReport.cpuScore.toLocaleString()}
                  </div>
                </div>

                <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5">
                  <div className="text-[11px] font-mono text-slate-400">
                    迴圈幀率穩定度
                  </div>
                  <div
                    className={`text-2xl font-mono font-bold mt-0.5 tabular-nums ${
                      livePreviewReport.passedStability
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {livePreviewReport.frameStabilityPct.toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1">
                    {livePreviewReport.passedStability
                      ? '● 穩定通過 (≥97.0%)'
                      : '▲ 溫控降頻 (<97.0%)'}
                  </div>
                </div>

                <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5">
                  <div className="text-[11px] font-mono text-slate-400">
                    峰值溫度 / 降頻臨界
                  </div>
                  <div className="text-2xl font-mono font-bold text-slate-100 mt-0.5 tabular-nums">
                    {livePreviewReport.peakTempC.toFixed(1)}°C
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
                    臨界點 {currentEnvelope.throttleTempC}°C · 降頻{' '}
                    {livePreviewReport.maxThrottlePct}%
                  </div>
                </div>

                <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5">
                  <div className="text-[11px] font-mono text-slate-400">
                    平均功耗 / 能效比
                  </div>
                  <div className="text-2xl font-mono font-bold text-amber-400 mt-0.5 tabular-nums">
                    {livePreviewReport.avgPowerWatts}
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      W
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
                    每瓦效能 {livePreviewReport.perfPerWatt} pts/W
                  </div>
                </div>
              </div>

              {/* Live Multi-Channel Telemetry Waveform */}
              <LiveTelemetryWaveform
                samples={samples}
                throttleTempC={currentEnvelope.throttleTempC}
              />

              {/* Multi-Loop Stability Chart */}
              <LoopStabilityChart loops={livePreviewReport.loops} />
            </section>
          </div>
        )}

        {activeTab === 'battery-suite' && (
          <BatterySimulatorView
            selectedTier={config.deviceTier}
            onTierChange={handleTierChange}
          />
        )}

        {activeTab === 'report-view' && (
          <ReportModalView
            report={latestReport}
            onRunAgain={() => setActiveTab('stress-console')}
            onGoToComparison={() => setActiveTab('hardware-compare')}
          />
        )}

        {activeTab === 'hardware-compare' && (
          <HardwareCompareView
            latestReport={latestReport}
            customDevices={customDevices}
            onAddCustomDevice={(dev) =>
              setCustomDevices((prev) => [dev, ...prev])
            }
          />
        )}
      </main>

      {/* Clean Quiet Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#0B0E17] px-6 py-4 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-4">
        <div>
          AetherMark 3D — 開源跨平台硬體壓力測試與電池續航基準套件 (Apache-2.0 License)
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('report-view')}
            className="hover:text-slate-200 transition-colors cursor-pointer"
          >
            效能與溫控數據報告
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setActiveTab('hardware-compare')}
            className="hover:text-slate-200 transition-colors cursor-pointer"
          >
            跨階硬體性能排行榜
          </button>
        </div>
      </footer>
    </div>
  );
}
