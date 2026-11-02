import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BatteryCoolingMode,
  BatteryEnduranceReport,
  BatteryTestConfig,
  BatteryWorkloadStage,
  DeviceTier,
} from '../types/benchmark';
import { DEFAULT_BATTERY_STAGES, DEVICE_TIER_META } from '../data/hardwareDatabase';
import { simulateBatteryEndurance } from '../engine/benchmarkMath';
import {
  Activity,
  BatteryCharging,
  Camera,
  Cpu,
  Film,
  Flame,
  Gamepad2,
  Gauge,
  Globe,
  Maximize2,
  Minimize2,
  Navigation,
  ShieldAlert,
  Smartphone,
  Thermometer,
  Wind,
  Zap,
} from 'lucide-react';

interface BatterySimulatorViewProps {
  selectedTier: DeviceTier;
  onTierChange: (tier: DeviceTier) => void;
}

interface HostBatteryStatus {
  supported: boolean;
  levelPct: number;
  charging: boolean;
}

export const BatterySimulatorView: React.FC<BatterySimulatorViewProps> = ({
  selectedTier,
  onTierChange,
}) => {
  const [capacityMah, setCapacityMah] = useState<number>(5000);
  const [brightnessNits, setBrightnessNits] = useState<number>(350);
  const [refreshRateHz, setRefreshRateHz] = useState<60 | 90 | 120 | 144>(120);
  const [networkMode, setNetworkMode] = useState<'wifi6' | '5g' | 'lte'>('wifi6');
  const [batteryHealthPct, setBatteryHealthPct] = useState<number>(96);
  const [ambientTempC, setAmbientTempC] = useState<number>(26);
  const [coolingMode, setCoolingMode] =
    useState<BatteryCoolingMode>('vapor-chamber');
  const [backgroundSyncLoad, setBackgroundSyncLoad] = useState<
    'low' | 'medium' | 'high'
  >('medium');
  const [stages, setStages] = useState(DEFAULT_BATTERY_STAGES);

  const [activePreviewStage, setActivePreviewStage] =
    useState<BatteryWorkloadStage>('video-4k');
  const [isSimulatingLive, setIsSimulatingLive] = useState<boolean>(false);
  const [isBatteryFullscreen, setIsBatteryFullscreen] = useState<boolean>(false);
  const [batteryAbortReason, setBatteryAbortReason] = useState<string | null>(
    null
  );
  const [simTick, setSimTick] = useState<number>(0);
  const [inspectedStepIdx, setInspectedStepIdx] = useState<number>(12);
  const [hostBattery, setHostBattery] = useState<HostBatteryStatus>({
    supported: false,
    levelPct: 100,
    charging: true,
  });

  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const enteredNativeFullscreenRef = useRef<boolean>(false);

  // Probe real Web Battery Status API if available in browser
  useEffect(() => {
    let mounted = true;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener?: (type: string, listener: () => void) => void;
      }>;
    };
    if (nav && typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((bat) => {
          if (!mounted) return;
          setHostBattery({
            supported: true,
            levelPct: Math.round(bat.level * 100),
            charging: bat.charging,
          });
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, []);

  const abortFullscreenBatterySim = useCallback((reason: string) => {
    setIsSimulatingLive(false);
    setIsBatteryFullscreen(false);
    setBatteryAbortReason(reason);
    enteredNativeFullscreenRef.current = false;
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const startFullscreenBatterySim = useCallback(() => {
    setBatteryAbortReason(null);
    setIsBatteryFullscreen(true);
    setIsSimulatingLive(true);
    enteredNativeFullscreenRef.current = false;
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
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isBatteryFullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        abortFullscreenBatterySim(
          '電池續航模擬已中斷：偵測到按下 ESC 跳出全螢幕測試視窗。'
        );
      }
    };

    const handleFullscreenChange = () => {
      if (typeof document === 'undefined') return;
      if (document.fullscreenElement) {
        enteredNativeFullscreenRef.current = true;
      } else if (enteredNativeFullscreenRef.current) {
        abortFullscreenBatterySim(
          '電池續航模擬已中斷：偵測到跳出瀏覽器全螢幕模式。'
        );
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        abortFullscreenBatterySim(
          '電池續航模擬已中斷：偵測到切換瀏覽器分頁或背景執行。'
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isBatteryFullscreen, abortFullscreenBatterySim]);

  // Sync default battery capacity & cooling when device tier changes
  const handlePresetTierSelect = (tier: DeviceTier) => {
    onTierChange(tier);
    if (tier === 'mobile-low') {
      setCapacityMah(5000);
      setRefreshRateHz(60);
      setBrightnessNits(250);
      setCoolingMode('passive');
    } else if (tier === 'mobile-mid') {
      setCapacityMah(5000);
      setRefreshRateHz(120);
      setBrightnessNits(350);
      setCoolingMode('vapor-chamber');
    } else if (tier === 'mobile-high') {
      setCapacityMah(5400);
      setRefreshRateHz(120);
      setBrightnessNits(450);
      setCoolingMode('vapor-chamber');
    } else if (tier === 'desktop-low') {
      setCapacityMah(13500);
      setRefreshRateHz(60);
      setBrightnessNits(300);
      setCoolingMode('passive');
    } else if (tier === 'desktop-mid') {
      setCapacityMah(18500);
      setRefreshRateHz(144);
      setBrightnessNits(350);
      setCoolingMode('active-fan');
    } else {
      setCapacityMah(24000);
      setRefreshRateHz(144);
      setBrightnessNits(500);
      setCoolingMode('active-fan');
    }
  };

  // One-click real-world usage scenario presets
  const applyScenarioPreset = (
    preset: 'balanced' | 'media-social' | 'outdoor-travel' | 'extreme-gaming'
  ) => {
    if (preset === 'balanced') {
      setBrightnessNits(320);
      setRefreshRateHz(120);
      setNetworkMode('wifi6');
      setAmbientTempC(25);
      setBackgroundSyncLoad('medium');
      setStages(DEFAULT_BATTERY_STAGES);
    } else if (preset === 'media-social') {
      setBrightnessNits(420);
      setRefreshRateHz(120);
      setNetworkMode('wifi6');
      setAmbientTempC(26);
      setBackgroundSyncLoad('medium');
      setStages(
        DEFAULT_BATTERY_STAGES.map((st) => ({
          ...st,
          weightPct:
            st.id === 'video-4k'
              ? 40
              : st.id === 'social-scroll'
                ? 40
                : st.id === 'web-browsing'
                  ? 10
                  : 5,
        }))
      );
      setActivePreviewStage('social-scroll');
    } else if (preset === 'outdoor-travel') {
      setBrightnessNits(820);
      setRefreshRateHz(120);
      setNetworkMode('5g');
      setAmbientTempC(34);
      setBackgroundSyncLoad('high');
      setStages(
        DEFAULT_BATTERY_STAGES.map((st) => ({
          ...st,
          weightPct:
            st.id === 'camera-4k'
              ? 35
              : st.id === 'nav-5g-gps'
                ? 35
                : st.id === 'social-scroll'
                  ? 20
                  : 5,
        }))
      );
      setActivePreviewStage('camera-4k');
    } else if (preset === 'extreme-gaming') {
      setBrightnessNits(550);
      setRefreshRateHz(144);
      setNetworkMode('5g');
      setAmbientTempC(31);
      setBackgroundSyncLoad('high');
      setStages(
        DEFAULT_BATTERY_STAGES.map((st) => ({
          ...st,
          weightPct:
            st.id === 'gaming-standby'
              ? 55
              : st.id === 'camera-4k'
                ? 15
                : st.id === 'video-4k'
                  ? 15
                  : 5,
        }))
      );
      setActivePreviewStage('gaming-standby');
    }
  };

  const currentConfig: BatteryTestConfig = {
    deviceTier: selectedTier,
    capacityMah,
    voltageNominal: selectedTier.startsWith('desktop') ? 11.4 : 3.88,
    brightnessNits,
    refreshRateHz,
    networkMode,
    batteryHealthPct,
    ambientTempC,
    coolingMode,
    backgroundSyncLoad,
    stages,
  };

  const report: BatteryEnduranceReport = simulateBatteryEndurance(currentConfig);
  const inspectedPoint =
    report.dischargeCurve[
      Math.max(0, Math.min(report.dischargeCurve.length - 1, inspectedStepIdx))
    ] || report.dischargeCurve[0];

  // Live visual simulation loop for the active daily usage stage
  useEffect(() => {
    let timer: number | undefined;
    if (isSimulatingLive) {
      timer = window.setInterval(() => {
        setSimTick((prev) => {
          const next = prev + 1;
          const stageOrder: BatteryWorkloadStage[] = [
            'video-4k',
            'social-scroll',
            'web-browsing',
            'camera-4k',
            'nav-5g-gps',
            'gaming-standby',
          ];
          if (next % 5 === 0) {
            const idx = Math.floor(next / 5) % stageOrder.length;
            setActivePreviewStage(stageOrder[idx]);
          }
          setInspectedStepIdx((step) => (step + 1) % report.dischargeCurve.length);
          return next;
        });
      }, 550);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isSimulatingLive, report.dischargeCurve.length]);

  // Procedural Canvas Renderer for Video 4K, Camera 4K AI ISP, 5G GPS Navigation, and 3D Gaming
  useEffect(() => {
    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let t = 0;
    const renderPreview = () => {
      t += 0.04;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#07090E';
      ctx.fillRect(0, 0, w, h);

      if (activePreviewStage === 'video-4k') {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#083344');
        grad.addColorStop(0.5, '#1E1B4B');
        grad.addColorStop(1, '#451A03');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.strokeStyle =
            i % 2 === 0
              ? 'rgba(6, 182, 212, 0.55)'
              : 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = 2;
          for (let x = 0; x <= w; x += 12) {
            const y =
              h * 0.5 +
              Math.sin(x * 0.02 + t + i * 0.8) * (24 + i * 8) +
              Math.cos(t * 0.7 - i) * 10;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // HDR10+ / AV1 Hardware Decode Telemetry HUD
        ctx.fillStyle = 'rgba(11, 14, 23, 0.82)';
        ctx.fillRect(10, 10, 215, 22);
        ctx.fillStyle = '#22D3EE';
        ctx.font = '10px monospace';
        ctx.fillText('AV1 10-bit HDR10+ · 3840x2160 @ 60fps', 16, 24);

        ctx.fillStyle = 'rgba(11, 14, 23, 0.85)';
        ctx.fillRect(12, h - 34, w - 24, 22);
        ctx.fillStyle = '#06B6D4';
        const barW = (Math.sin(t * 0.3) * 0.5 + 0.5) * (w - 48) + 12;
        ctx.fillRect(20, h - 25, barW, 4);
      } else if (activePreviewStage === 'camera-4k') {
        // Simulated 4K 60fps Dolby Vision Camera Viewfinder + AI ISP Focus Matrix + Live RGB Histogram
        const camGrad = ctx.createRadialGradient(
          w * 0.5,
          h * 0.5,
          15,
          w * 0.5,
          h * 0.5,
          w * 0.65
        );
        camGrad.addColorStop(0, '#164E63');
        camGrad.addColorStop(0.6, '#0F172A');
        camGrad.addColorStop(1, '#020617');
        ctx.fillStyle = camGrad;
        ctx.fillRect(0, 0, w, h);

        // Rule-of-thirds grid
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w / 3, 0);
        ctx.lineTo(w / 3, h);
        ctx.moveTo((w * 2) / 3, 0);
        ctx.lineTo((w * 2) / 3, h);
        ctx.moveTo(0, h / 3);
        ctx.lineTo(w, h / 3);
        ctx.moveTo(0, (h * 2) / 3);
        ctx.lineTo(w, (h * 2) / 3);
        ctx.stroke();

        // Moving OIS & NPU Subject Tracking Box
        const fx = w * 0.5 + Math.sin(t * 1.1) * 55;
        const fy = h * 0.5 + Math.cos(t * 0.85) * 28;
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(fx - 36, fy - 36, 72, 72);

        // REC indicator & Bitrate
        ctx.fillStyle = 'rgba(11, 14, 23, 0.86)';
        ctx.fillRect(10, 10, 240, 24);
        ctx.fillStyle = Math.sin(t * 4) > 0 ? '#F43F5E' : '#881337';
        ctx.beginPath();
        ctx.arc(22, 22, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '10px monospace';
        ctx.fillText('REC 4K60 Dolby Vision · 118 Mbps · ISP+NPU', 34, 26);

        // Live Luminance Histogram bars bottom-right
        ctx.fillStyle = 'rgba(11, 14, 23, 0.82)';
        ctx.fillRect(w - 118, h - 54, 106, 42);
        for (let b = 0; b < 16; b++) {
          const bh =
            8 + Math.abs(Math.sin(t * 1.4 + b * 0.45)) * 28;
          ctx.fillStyle = b > 12 ? '#F43F5E' : b > 8 ? '#F59E0B' : '#22D3EE';
          ctx.fillRect(w - 112 + b * 6, h - 16 - bh, 4, bh);
        }
      } else if (activePreviewStage === 'nav-5g-gps') {
        // Simulated Outdoor 5G + Dual-Band L1+L5 GNSS Vector Map & Satellite Radar
        ctx.fillStyle = '#06131F';
        ctx.fillRect(0, 0, w, h);

        // Vector road grid
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
        ctx.lineWidth = 1;
        const offset = (t * 18) % 32;
        for (let x = -32; x < w + 32; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x + offset, 0);
          ctx.lineTo(x - 40 + offset, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += 28) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        // Active Navigation Route Polyline
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(40, h - 25);
        ctx.lineTo(w * 0.38, h * 0.58);
        ctx.lineTo(w * 0.62, h * 0.42);
        ctx.lineTo(w - 45, 32);
        ctx.stroke();

        // Pulsing GPS Position Beacon
        const bx = w * 0.38 + Math.sin(t * 0.7) * 14;
        const by = h * 0.58 - Math.sin(t * 0.7) * 9;
        ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
        ctx.beginPath();
        ctx.arc(bx, by, 14 + Math.sin(t * 3) * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#10B981';
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(11, 14, 23, 0.88)';
        ctx.fillRect(10, 10, 265, 24);
        ctx.fillStyle = '#34D399';
        ctx.font = '10px monospace';
        ctx.fillText('5G SA Sub-6 (-89dBm) · L1+L5 GNSS (28 Sats)', 16, 25);
      } else if (activePreviewStage === 'gaming-standby') {
        // Render isometric wireframe cyber arena
        ctx.strokeStyle = '#06B6D4';
        ctx.lineWidth = 1.5;
        const cx = w / 2;
        const cy = h / 2;
        for (let r = 20; r <= 100; r += 25) {
          ctx.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * Math.PI * 2 + t * 0.5;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r * 0.65;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(11, 14, 23, 0.86)';
        ctx.fillRect(10, 10, 240, 22);
        ctx.fillStyle = '#F59E0B';
        ctx.font = '10px monospace';
        ctx.fillText('PBR Shader Loop + Opus Voice Codec Active', 16, 24);
      }

      animId = requestAnimationFrame(renderPreview);
    };

    animId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(animId);
  }, [activePreviewStage]);

  const handleStageWeightChange = (id: BatteryWorkloadStage, val: number) => {
    setStages((prev) =>
      prev.map((st) => (st.id === id ? { ...st, weightPct: val } : st))
    );
  };

  // Compute live thermal zone temperatures for the 2D Infrared Chassis Heatmap
  const activeStageMeta =
    stages.find((s) => s.id === activePreviewStage) || stages[0];
  const activeStageBreakdown =
    report.stageBreakdown.find((b) => b.stage === activePreviewStage) ||
    report.stageBreakdown[0];
  const socHotspotTempC = Number(
    Math.min(
      54.5,
      inspectedPoint.tempCelsius + (activeStageMeta.thermalFactor - 0.9) * 3.8
    ).toFixed(1)
  );
  const ispZoneTempC = Number(
    (
      inspectedPoint.tempCelsius +
      (activePreviewStage === 'camera-4k' ? 3.4 : 0.6)
    ).toFixed(1)
  );
  const batteryCellTempC = inspectedPoint.tempCelsius;
  const chassisSkinTempC = inspectedPoint.skinTempCelsius;

  const getThermalColorHex = (temp: number) => {
    if (temp >= 43) return '#F43F5E'; // Hot rose-red
    if (temp >= 38.5) return '#F59E0B'; // Warm amber
    if (temp >= 34) return '#10B981'; // Nominal emerald
    return '#06B6D4'; // Cool cyan
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Configuration & Electro-Thermal Physics Column */}
      <div className="lg:col-span-4 space-y-5">
        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-100">
                電化學與日常續航壓測配置
              </h2>
              {hostBattery.supported && (
                <span
                  className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-[11px] font-mono text-emerald-300"
                  title="瀏覽器 Web Battery API 實測本機電量狀態"
                >
                  本機電量 {hostBattery.levelPct}%{' '}
                  {hostBattery.charging ? '⚡' : '🔋'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              耦合鋰電池內阻壓降 (I·R)、焦耳發熱 (I²R)、SoC 熱傳導與六大日常高負載情境。
            </p>
          </div>

          {/* One-Click Real-World Usage Scenario Presets */}
          <div>
            <span className="block text-xs font-medium text-slate-300 mb-1.5">
              1. 一鍵真實使用情境預設 (Scenario Presets)
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => applyScenarioPreset('balanced')}
                data-testid="battery-preset-balanced"
                className="px-2.5 py-2 rounded border border-slate-800 bg-slate-900/90 hover:border-cyan-500/50 text-left text-xs text-slate-200 transition-colors cursor-pointer"
              >
                <div className="font-semibold text-cyan-400">日常均衡混合</div>
                <div className="text-[10px] text-slate-400">
                  Wi-Fi 6 · 320nits · 綜合續航
                </div>
              </button>
              <button
                type="button"
                onClick={() => applyScenarioPreset('media-social')}
                data-testid="battery-preset-media"
                className="px-2.5 py-2 rounded border border-slate-800 bg-slate-900/90 hover:border-cyan-500/50 text-left text-xs text-slate-200 transition-colors cursor-pointer"
              >
                <div className="font-semibold text-emerald-400">重度影音與社群</div>
                <div className="text-[10px] text-slate-400">
                  4K HDR + 120Hz 高刷動態牆
                </div>
              </button>
              <button
                type="button"
                onClick={() => applyScenarioPreset('outdoor-travel')}
                data-testid="battery-preset-outdoor-thermal"
                className="px-2.5 py-2 rounded border border-amber-500/30 bg-amber-950/20 hover:border-amber-400 text-left text-xs text-slate-200 transition-colors cursor-pointer"
              >
                <div className="font-semibold text-amber-400">
                  戶外 5G 導航 + 4K 旅拍
                </div>
                <div className="text-[10px] text-slate-400">
                  820nits · 34°C 高發熱壓測
                </div>
              </button>
              <button
                type="button"
                onClick={() => applyScenarioPreset('extreme-gaming')}
                data-testid="battery-preset-gaming"
                className="px-2.5 py-2 rounded border border-rose-500/30 bg-rose-950/20 hover:border-rose-400 text-left text-xs text-slate-200 transition-colors cursor-pointer"
              >
                <div className="font-semibold text-rose-400">
                  3D 電競與高溫極限
                </div>
                <div className="text-[10px] text-slate-400">
                  144Hz · 5G · 高倍率放電
                </div>
              </button>
            </div>
          </div>

          {/* Device Tier Preset Selector */}
          <div>
            <label
              htmlFor="battery-tier-select"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              2. 硬體平台定位 (手機 / 筆電高、中、低階)
            </label>
            <select
              id="battery-tier-select"
              value={selectedTier}
              onChange={(e) =>
                handlePresetTierSelect(e.target.value as DeviceTier)
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              {DEVICE_TIER_META.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {t.typicalSpec}
                </option>
              ))}
            </select>
          </div>

          {/* Battery Capacity & SOH Health Sliders */}
          <div className="space-y-3 pt-1 border-t border-slate-800/80">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <label htmlFor="battery-mah-slider" className="text-slate-300">
                  出廠額定容量 / 實效可用容量
                </label>
                <span className="font-mono font-semibold text-cyan-400 tabular-nums">
                  {capacityMah.toLocaleString()} →{' '}
                  {report.effectiveCapacityMah.toLocaleString()} mAh (
                  {report.wattHoursTotal} Wh)
                </span>
              </div>
              <input
                id="battery-mah-slider"
                type="range"
                min={3000}
                max={26000}
                step={200}
                value={capacityMah}
                onChange={(e) => setCapacityMah(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <label htmlFor="battery-soh-slider" className="text-slate-300">
                  電池健康度 (SOH 老化與內阻倍率)
                </label>
                <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                  {batteryHealthPct}% · 內阻 {report.avgInternalResistanceMohm} mΩ
                </span>
              </div>
              <input
                id="battery-soh-slider"
                type="range"
                min={70}
                max={100}
                step={1}
                value={batteryHealthPct}
                onChange={(e) => setBatteryHealthPct(Number(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <label htmlFor="battery-nits-slider" className="text-slate-300">
                  螢幕亮度 (HDR 激發 / 陽光尼特)
                </label>
                <span className="font-mono font-semibold text-amber-400 tabular-nums">
                  {brightnessNits} nits
                </span>
              </div>
              <input
                id="battery-nits-slider"
                type="range"
                min={100}
                max={1000}
                step={20}
                value={brightnessNits}
                onChange={(e) => setBrightnessNits(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <label
                  htmlFor="battery-ambient-slider"
                  className="text-slate-300"
                >
                  環境溫度基準 (影響內阻與散熱壓差)
                </label>
                <span className="font-mono font-semibold text-rose-400 tabular-nums">
                  {ambientTempC}°C
                </span>
              </div>
              <input
                id="battery-ambient-slider"
                type="range"
                min={10}
                max={40}
                step={1}
                value={ambientTempC}
                onChange={(e) => setAmbientTempC(Number(e.target.value))}
                className="w-full accent-rose-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Cooling Architecture, Refresh Rate & Network Mode */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <div>
              <span className="block text-xs text-slate-300 mb-1.5">
                機身散熱架構 (Cooling System)
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'passive', label: '被動石墨片' },
                    { id: 'vapor-chamber', label: 'VC 均熱板' },
                    { id: 'active-fan', label: '主動散熱扇' },
                  ] as { id: BatteryCoolingMode; label: string }[]
                ).map((cm) => (
                  <button
                    key={cm.id}
                    type="button"
                    onClick={() => setCoolingMode(cm.id)}
                    className={`py-1.5 px-2 rounded text-xs font-medium border transition-colors cursor-pointer ${
                      coolingMode === cm.id
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cm.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <span className="block text-xs text-slate-300 mb-1.5">
                  螢幕更新率
                </span>
                <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-md border border-slate-800">
                  {([60, 90, 120, 144] as const).map((hz) => (
                    <button
                      key={hz}
                      type="button"
                      onClick={() => setRefreshRateHz(hz)}
                      className={`py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                        refreshRateHz === hz
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {hz}Hz
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs text-slate-300 mb-1.5">
                  無線基頻模式
                </span>
                <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-md border border-slate-800">
                  {(
                    [
                      { id: 'wifi6', label: 'Wi-Fi 6' },
                      { id: '5g', label: '5G SA' },
                      { id: 'lte', label: '4G LTE' },
                    ] as const
                  ).map((net) => (
                    <button
                      key={net.id}
                      type="button"
                      onClick={() => setNetworkMode(net.id)}
                      className={`py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
                        networkMode === net.id
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {net.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 6-Stage Workload Weight Sliders */}
          <div className="border-t border-slate-800 pt-3 space-y-2.5">
            <div className="text-xs font-semibold text-slate-200">
              3. 六大日常高負載情境時間權重配置
            </div>
            {stages.map((st) => (
              <div key={st.id} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 truncate pr-2">{st.name}</span>
                  <span className="font-mono text-cyan-400 tabular-nums shrink-0">
                    {st.weightPct}% · 發熱 {st.thermalFactor}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={70}
                  step={5}
                  aria-label={st.name}
                  value={st.weightPct}
                  onChange={(e) =>
                    handleStageWeightChange(st.id, Number(e.target.value))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Main Electro-Thermal Simulation, Chassis Heatmap & Discharge Curve Column */}
      <div className="lg:col-span-8 space-y-5">
        {/* Top 4-Card Electro-Thermal KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5">
            <div className="text-[11px] text-slate-400">預估綜合續航時間</div>
            <div
              className="text-xl sm:text-2xl font-mono font-bold text-cyan-400 mt-1 tabular-nums"
              data-testid="battery-duration-readout"
            >
              {report.FormattedDuration}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
              實效 {report.effectiveCapacityMah}mAh ({report.wattHoursTotal}Wh)
            </div>
          </div>

          <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5">
            <div className="text-[11px] text-slate-400">
              平均功耗 / 放電倍率 (C-Rate)
            </div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-slate-100 mt-1 tabular-nums">
              {report.avgDischargeWatts}
              <span className="text-xs font-normal text-slate-400 ml-1">W</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
              平均 {report.avgCurrentMa}mA · {report.avgCRate}C 倍率
            </div>
          </div>

          <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5">
            <div className="text-[11px] text-slate-400">
              峰值核心溫升 / 表面溫度
            </div>
            <div
              className={`text-xl sm:text-2xl font-mono font-bold mt-1 tabular-nums ${
                report.peakTempC >= 42 ? 'text-rose-400' : 'text-emerald-400'
              }`}
              data-testid="battery-peak-temp"
            >
              {report.peakTempC.toFixed(1)}
              <span className="text-xs font-normal text-slate-400 ml-1">°C</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
              外殼 {report.peakSkinTempC}°C · 降頻 {report.thermalThrottleCount}{' '}
              次
            </div>
          </div>

          <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5">
            <div className="text-[11px] text-slate-400">
              內阻焦耳熱損耗 (I²R)
            </div>
            <div
              className="text-xl sm:text-2xl font-mono font-bold text-amber-400 mt-1 tabular-nums"
              data-testid="battery-joule-heat"
            >
              {report.totalJouleHeatWh}
              <span className="text-xs font-normal text-slate-400 ml-1">Wh</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
              內阻 {report.avgInternalResistanceMohm}mΩ · 最低 {report.minVoltageV}V
            </div>
          </div>
        </div>

        {/* Abort Banner if User Exited Fullscreen During Battery Test */}
        {batteryAbortReason && (
          <div
            className="bg-rose-950/40 border border-rose-500/50 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-rose-200"
            data-testid="battery-abort-banner"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{batteryAbortReason}</span>
            </div>
            <button
              type="button"
              onClick={() => setBatteryAbortReason(null)}
              className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-100 rounded text-[11px] cursor-pointer shrink-0"
            >
              關閉提示
            </button>
          </div>
        )}

        {/* Interactive Daily Usage Simulator Preview & 6-Stage Switcher */}
        <div
          className={
            isBatteryFullscreen
              ? 'fixed inset-0 z-50 bg-[#07090E] p-6 overflow-y-auto flex flex-col justify-between'
              : 'bg-[#0B0E17] border border-slate-800 rounded-lg p-5'
          }
          data-testid="battery-simulator-stage"
          data-fullscreen={isBatteryFullscreen ? 'true' : 'false'}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                日常六大高負載與發熱即時模擬視窗 (Real-Time Electro-Thermal Workload Simulator)
              </h3>
              <p className="text-xs text-slate-400">
                支援看 4K 影片、120Hz 滑社群、網頁多工、4K60 AI 錄影、戶外 5G 導航與 3D 遊戲壓測（全螢幕跳出即中斷）。
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isBatteryFullscreen ? (
                <button
                  type="button"
                  onClick={() =>
                    abortFullscreenBatterySim(
                      '電池續航模擬已中斷：使用者手動跳出全螢幕續航測試模式。'
                    )
                  }
                  data-testid="battery-exit-fullscreen-abort-btn"
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>跳出全螢幕（中斷測試 ESC）</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startFullscreenBatterySim}
                  data-testid="battery-start-fullscreen-btn"
                  className="px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>啟動全螢幕輪播續航壓測</span>
                </button>
              )}
            </div>
          </div>

          {/* 6-Stage Selector Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
            {(
              [
                { id: 'video-4k', label: '看影片 4K', icon: Film },
                { id: 'social-scroll', label: '滑社交 120Hz', icon: Smartphone },
                { id: 'web-browsing', label: '網頁與多工', icon: Globe },
                { id: 'camera-4k', label: '4K60 錄影 ISP', icon: Camera },
                { id: 'nav-5g-gps', label: '戶外 5G 導航', icon: Navigation },
                { id: 'gaming-standby', label: '3D 遊戲壓測', icon: Gamepad2 },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activePreviewStage === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePreviewStage(tab.id)}
                  data-testid={`battery-stage-tab-${tab.id}`}
                  className={`px-2.5 py-2 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Visual Workload Viewport + Stage Electro-Thermal Telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch bg-[#07090E] border border-slate-800 rounded-lg p-4">
            <div className="md:col-span-7 h-[215px] rounded border border-slate-800 overflow-hidden relative bg-slate-950 flex items-center justify-center">
              {(activePreviewStage === 'video-4k' ||
                activePreviewStage === 'camera-4k' ||
                activePreviewStage === 'nav-5g-gps' ||
                activePreviewStage === 'gaming-standby') && (
                <canvas
                  ref={videoCanvasRef}
                  width={460}
                  height={215}
                  className="w-full h-full object-cover"
                />
              )}

              {activePreviewStage === 'social-scroll' && (
                <div className="w-full h-full p-3 space-y-2.5 overflow-hidden">
                  <div className="text-[11px] font-mono text-cyan-400">
                    ● 120Hz VRR 慣性捲動與短影音解碼中 (Frame #{simTick * 12 + 104})
                  </div>
                  {[1, 2, 3].map((card) => (
                    <div
                      key={card}
                      className="p-2.5 bg-slate-900 border border-slate-800 rounded flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded bg-cyan-500/20 border border-cyan-500/30 shrink-0 flex items-center justify-center text-xs font-mono text-cyan-300">
                        REEL
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate">
                          社群高幀率短影音與動態流項目 #{card + (simTick % 5)}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          GPU 合成層 + 觸控取樣 240Hz + 5G/Wi-Fi 預載緩衝區更新
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activePreviewStage === 'web-browsing' && (
                <div className="w-full h-full p-3.5 space-y-2 overflow-hidden">
                  <div className="text-xs font-semibold text-slate-200">
                    DOM 複雜排版重繪與 SVG 財經圖表腳本執行
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    模擬載入大型技術文件、即時股市走勢圖與多執行緒 JSON 解析，考驗 CPU 單核突發頻率與能效核心調度能力。
                  </p>
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {[78, 92, 64, 85].map((v, i) => (
                      <div
                        key={i}
                        className="bg-slate-900 border border-slate-800 p-2 rounded text-center font-mono text-xs text-cyan-300"
                      >
                        DOM #{i + 1}: {v}ms
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stage Electro-Thermal Telemetry Details */}
            <div className="md:col-span-5 flex flex-col justify-between bg-[#0B0E17] border border-slate-800 rounded p-3.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-cyan-400">
                    當前模擬階段與熱力學指標
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[11px]">
                    發熱倍率 {activeStageMeta.thermalFactor}x
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-100 mt-1">
                  {activeStageMeta.name}
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {activeStageMeta.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-800 font-mono text-xs tabular-nums">
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    階段實效功耗 / 電流
                  </span>
                  <span className="text-amber-400 font-semibold">
                    {activeStageBreakdown.avgStageWatts} W (
                    {Math.round(
                      (activeStageBreakdown.avgStageWatts /
                        currentConfig.voltageNominal) *
                        1000
                    )}{' '}
                    mA)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    階段預估峰值溫度
                  </span>
                  <span
                    className={`font-semibold ${
                      activeStageBreakdown.peakStageTempC >= 41.5
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {activeStageBreakdown.peakStageTempC}°C
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    階段耗電佔比
                  </span>
                  <span className="text-slate-100 font-semibold">
                    {activeStageBreakdown.pctOfTotalDrain}% (
                    {activeStageBreakdown.mahConsumed} mAh)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    預估分攤運行時數
                  </span>
                  <span className="text-cyan-400 font-semibold">
                    {activeStageBreakdown.hoursSpent} 小時
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* NEW: Infrared Device Thermal Heatmap + 5-Rail Hardware Component Power Breakdown */}
        <div
          className="grid grid-cols-1 md:grid-cols-12 gap-5 bg-[#0B0E17] border border-slate-800 rounded-lg p-5"
          data-testid="battery-thermal-and-rails-panel"
        >
          {/* Left: 2D Infrared Chassis Thermal Distribution Map */}
          <div className="md:col-span-5 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-400" />
                  <span>紅外線機身熱成像分佈 (FLIR Thermal Map)</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-400">
                  SoC / 電芯 / 機殼
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                即時模擬主機板 SoC 核心、相機 ISP 模組與鋰電池組之焦耳熱傳導分佈。
              </p>
            </div>

            <div className="my-3 flex items-center justify-around bg-[#07090E] border border-slate-800 rounded-lg p-3">
              {/* SVG Infrared Device Silhouette */}
              <svg
                viewBox="0 0 130 210"
                className="w-28 h-44 shrink-0 select-none"
                aria-label="Device Infrared Thermal Distribution"
              >
                <defs>
                  <radialGradient id="socHeatGrad" cx="55%" cy="28%" r="42%">
                    <stop
                      offset="0%"
                      stopColor={getThermalColorHex(socHotspotTempC)}
                      stopOpacity="0.88"
                    />
                    <stop
                      offset="60%"
                      stopColor="#F59E0B"
                      stopOpacity="0.35"
                    />
                    <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="batHeatGrad" cx="50%" cy="66%" r="44%">
                    <stop
                      offset="0%"
                      stopColor={getThermalColorHex(batteryCellTempC)}
                      stopOpacity="0.72"
                    />
                    <stop
                      offset="70%"
                      stopColor="#06B6D4"
                      stopOpacity="0.22"
                    />
                    <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Device Outer Frame */}
                <rect
                  x="12"
                  y="6"
                  width="106"
                  height="198"
                  rx="16"
                  fill="#0B0F19"
                  stroke="#334155"
                  strokeWidth="2"
                />

                {/* Thermal Glow Overlays */}
                <rect
                  x="16"
                  y="10"
                  width="98"
                  height="190"
                  rx="13"
                  fill="url(#socHeatGrad)"
                />
                <rect
                  x="16"
                  y="10"
                  width="98"
                  height="190"
                  rx="13"
                  fill="url(#batHeatGrad)"
                />

                {/* Camera ISP Module Outline */}
                <rect
                  x="22"
                  y="18"
                  width="36"
                  height="40"
                  rx="6"
                  fill="rgba(15, 23, 42, 0.55)"
                  stroke={getThermalColorHex(ispZoneTempC)}
                  strokeWidth="1.4"
                />
                <text
                  x="40"
                  y="41"
                  textAnchor="middle"
                  className="fill-slate-100 text-[9px] font-mono font-bold"
                >
                  {ispZoneTempC}°
                </text>

                {/* SoC Mainboard Hotspot Zone */}
                <rect
                  x="64"
                  y="24"
                  width="42"
                  height="38"
                  rx="5"
                  fill="rgba(15, 23, 42, 0.55)"
                  stroke={getThermalColorHex(socHotspotTempC)}
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
                <text
                  x="85"
                  y="40"
                  textAnchor="middle"
                  className="fill-rose-300 text-[8px] font-mono"
                >
                  SoC Die
                </text>
                <text
                  x="85"
                  y="52"
                  textAnchor="middle"
                  className="fill-white text-[10px] font-mono font-bold"
                >
                  {socHotspotTempC}°C
                </text>

                {/* Dual-Cell Lithium Battery Pack Outline */}
                <rect
                  x="24"
                  y="74"
                  width="82"
                  height="108"
                  rx="8"
                  fill="rgba(15, 23, 42, 0.45)"
                  stroke={getThermalColorHex(batteryCellTempC)}
                  strokeWidth="1.5"
                />
                <text
                  x="65"
                  y="116"
                  textAnchor="middle"
                  className="fill-slate-300 text-[9px] font-mono"
                >
                  Li-Ion Cell (I²R)
                </text>
                <text
                  x="65"
                  y="132"
                  textAnchor="middle"
                  className="fill-amber-300 text-[12px] font-mono font-bold"
                >
                  {batteryCellTempC}°C
                </text>
                <text
                  x="65"
                  y="148"
                  textAnchor="middle"
                  className="fill-cyan-300 text-[9px] font-mono"
                >
                  {inspectedPoint.internalResistanceMohm}mΩ ·{' '}
                  {inspectedPoint.jouleHeatMw}mW
                </text>
              </svg>

              {/* Zone Temperature Legend Readout */}
              <div className="space-y-2 text-xs font-mono tabular-nums">
                <div className="p-2 rounded bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400">SoC 運算核心熱點</div>
                  <div className="text-sm font-bold text-rose-400">
                    {socHotspotTempC}°C
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400">電芯內部工作溫度</div>
                  <div className="text-sm font-bold text-amber-400">
                    {batteryCellTempC}°C
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400">機身背蓋表面溫度</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {chassisSkinTempC}°C
                  </div>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-300 bg-slate-900/80 border border-slate-800 rounded px-3 py-2">
              {report.thermalSafetyVerdict}
            </div>
          </div>

          {/* Right: 5-Rail Hardware Component Power Breakdown */}
          <div className="md:col-span-7 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span>五路硬體供電軌功耗拆解 (5-Rail Power Breakdown)</span>
                </h3>
                <span className="text-xs font-mono text-cyan-400 tabular-nums">
                  總計 {report.avgDischargeWatts} W
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                量化顯示面板、運算核心、射頻基頻、記憶體感測器與電芯內阻焦耳損耗之真實耗電比例。
              </p>
            </div>

            <div className="space-y-2.5">
              {report.componentBreakdown.map((rail) => (
                <div
                  key={rail.id}
                  className="bg-[#07090E] border border-slate-800 rounded-md p-2.5"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-200 font-medium truncate pr-2">
                      {rail.name}
                    </span>
                    <span className="font-mono text-slate-100 tabular-nums shrink-0">
                      <strong style={{ color: rail.colorHex }}>
                        {rail.watts} W
                      </strong>{' '}
                      <span className="text-slate-400">({rail.sharePct}%)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.min(100, Math.max(4, rail.sharePct))}%`,
                        backgroundColor: rail.colorHex,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 100% -> 0% Electro-Thermal Discharge, Voltage Sag & Temperature Curve + Interactive Scrubber */}
        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                電池放電、端電壓壓降與焦耳溫升曲線 (100% → 0% SoC / Voltage Sag / Thermal Curve)
              </h3>
              <p className="text-xs text-slate-400">
                青色實線為剩餘電量 (%)，橘色虛線為電芯工作溫度 (°C)，底部可拖曳檢視任意時間點之內阻壓降與焦耳發熱功率。
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-400 tabular-nums">
              總續航：{report.FormattedDuration} · 能效評分 {report.efficiencyScore}/100
            </span>
          </div>

          <svg
            viewBox="0 0 720 185"
            className="w-full h-[175px] overflow-visible select-none"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
              const y = 15 + r * 135;
              const pct = Math.round((1 - r) * 100);
              const tempLabel = Math.round(50 - r * 25);
              return (
                <g key={idx}>
                  <line
                    x1={40}
                    y1={y}
                    x2={680}
                    y2={y}
                    stroke="#1E293B"
                    strokeWidth="1"
                  />
                  <text
                    x={34}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-cyan-500/80 text-[10px] font-mono"
                  >
                    {pct}%
                  </text>
                  <text
                    x={686}
                    y={y + 3}
                    textAnchor="start"
                    className="fill-amber-400/80 text-[10px] font-mono"
                  >
                    {tempLabel}°C
                  </text>
                </g>
              );
            })}

            {/* Battery % Polyline */}
            <polyline
              fill="none"
              stroke="#06B6D4"
              strokeWidth="2.5"
              points={report.dischargeCurve
                .map((pt, i) => {
                  const x =
                    40 + (i / (report.dischargeCurve.length - 1)) * 640;
                  const y = 15 + (1 - pt.batteryPct / 100) * 135;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(' ')}
            />

            {/* Temperature Polyline */}
            <polyline
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2"
              strokeDasharray="4 3"
              points={report.dischargeCurve
                .map((pt, i) => {
                  const x =
                    40 + (i / (report.dischargeCurve.length - 1)) * 640;
                  const normT = Math.max(
                    0,
                    Math.min(1, (pt.tempCelsius - 25) / 25)
                  );
                  const y = 15 + (1 - normT) * 135;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(' ')}
            />

            {/* Inspected Step Vertical Cursor Line */}
            {(() => {
              const cx =
                40 +
                (inspectedStepIdx /
                  Math.max(1, report.dischargeCurve.length - 1)) *
                  640;
              const cy = 15 + (1 - inspectedPoint.batteryPct / 100) * 135;
              return (
                <g>
                  <line
                    x1={cx}
                    y1={15}
                    x2={cx}
                    y2={150}
                    stroke="#38BDF8"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <circle cx={cx} cy={cy} r={4.5} fill="#06B6D4" />
                </g>
              );
            })()}

            {/* Time Axis Labels */}
            {[0, 6, 12, 18, 24].map((stepIdx) => {
              const pt = report.dischargeCurve[stepIdx];
              if (!pt) return null;
              const x = 40 + (stepIdx / 24) * 640;
              return (
                <text
                  key={stepIdx}
                  x={x}
                  y={168}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {pt.hourFormatted} ({pt.voltageV}V)
                </text>
              );
            })}
          </svg>

          {/* Interactive Discharge Timeline Point Scrubber & Readout */}
          <div className="bg-[#07090E] border border-slate-800 rounded-md p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <label
                htmlFor="discharge-step-scrubber"
                className="font-medium text-slate-300"
              >
                放電時間軸取樣點檢視器 (拖曳檢視低電量內阻急升與端電壓壓降)：
              </label>
              <span className="font-mono text-cyan-400 font-semibold tabular-nums">
                時間 {inspectedPoint.hourFormatted} · 剩餘電量{' '}
                {inspectedPoint.batteryPct}%
              </span>
            </div>
            <input
              id="discharge-step-scrubber"
              type="range"
              min={0}
              max={report.dischargeCurve.length - 1}
              step={1}
              value={inspectedStepIdx}
              onChange={(e) => setInspectedStepIdx(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1 font-mono text-xs tabular-nums">
              <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                <div className="text-[10px] text-slate-400">閉路端電壓</div>
                <div className="text-slate-100 font-semibold">
                  {inspectedPoint.voltageV} V
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                <div className="text-[10px] text-slate-400">瞬時放電電流</div>
                <div className="text-cyan-400 font-semibold">
                  {inspectedPoint.currentMa} mA ({inspectedPoint.cRate}C)
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                <div className="text-[10px] text-slate-400">即時極化內阻</div>
                <div className="text-amber-400 font-semibold">
                  {inspectedPoint.internalResistanceMohm} mΩ
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                <div className="text-[10px] text-slate-400">內阻焦耳發熱</div>
                <div className="text-rose-400 font-semibold">
                  {inspectedPoint.jouleHeatMw} mW
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                <div className="text-[10px] text-slate-400">電芯 / 表面溫度</div>
                <div className="text-emerald-400 font-semibold">
                  {inspectedPoint.tempCelsius}° / {inspectedPoint.skinTempCelsius}°C
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                <div className="text-[10px] text-slate-400">整機瞬時功耗</div>
                <div className="text-slate-100 font-semibold">
                  {inspectedPoint.powerWatts} W
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
