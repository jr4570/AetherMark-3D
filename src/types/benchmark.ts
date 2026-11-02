export type DeviceTier =
  | 'mobile-low'
  | 'mobile-mid'
  | 'mobile-high'
  | 'desktop-low'
  | 'desktop-mid'
  | 'desktop-high';

export type StressIntensity = 'light' | 'medium' | 'high' | 'extreme';

export type WorkloadTarget = 'hybrid-combined' | 'gpu-3d' | 'cpu-compute';

export type DurationMode = 'single' | 'short-loop' | 'long-stability' | 'custom-loop';

export type CameraPreset = 'orbit' | 'macro' | 'flyby' | 'top';

export type MaterialFinish = 'titanium' | 'gold' | 'sapphire' | 'wireframe';

export interface BenchmarkConfig {
  suiteId: string;
  suiteName: string;
  deviceTier: DeviceTier;
  intensity: StressIntensity;
  workloadTarget: WorkloadTarget;
  durationMode: DurationMode;
  targetLoops: number;
  loopDurationSec: number;
  resolutionScale: number;
  instanceCount: number;
  cpuThreads: number;
  enableRaymarchLoad: boolean;
  thermalAmbientC: number;
}

export interface DetectedHardwareInfo {
  gpuRenderer: string;
  gpuVendor: string;
  cpuCores: number;
  deviceMemoryGb: number;
  userAgentSummary: string;
  isSoftwareGl: boolean;
  screenResolution: string;
  pixelRatio: number;
  batterySupported: boolean;
  initialBatteryPct: number | null;
}

export interface TelemetrySample {
  timestampMs: number;
  elapsedSec: number;
  loopIndex: number;
  fps: number;
  frameTimeMs: number;
  gpuLoadPct: number;
  cpuLoadPct: number;
  cpuGflops: number;
  tempCelsius: number;
  clockMHz: number;
  powerWatts: number;
  throttlePct: number;
}

export interface LoopSummary {
  loopNumber: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  p99FrameTimeMs: number;
  avgTempC: number;
  peakTempC: number;
  avgClockMHz: number;
  avgPowerWatts: number;
  loopScore: number;
}

export interface BenchmarkReport {
  id: string;
  timestampIso: string;
  config: BenchmarkConfig;
  hardware: DetectedHardwareInfo;
  totalScore: number;
  gpuScore: number;
  cpuScore: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  frameStabilityPct: number;
  passedStability: boolean;
  startTempC: number;
  peakTempC: number;
  thermalThrottleDetected: boolean;
  maxThrottlePct: number;
  avgPowerWatts: number;
  perfPerWatt: number;
  loops: LoopSummary[];
  samples: TelemetrySample[];
  recommendation: string;
}

export type BatteryWorkloadStage =
  | 'video-4k'
  | 'social-scroll'
  | 'web-browsing'
  | 'camera-4k'
  | 'nav-5g-gps'
  | 'gaming-standby';

export type BatteryCoolingMode = 'passive' | 'vapor-chamber' | 'active-fan';

export interface BatteryStageConfig {
  id: BatteryWorkloadStage;
  name: string;
  weightPct: number;
  avgCurrentMa: number;
  avgPowerWatts: number;
  targetFps: number;
  thermalFactor: number; // Heat generation multiplier (1.0 = baseline, >1.3 = high ISP/Modem/GPU heat)
  description: string;
}

export interface BatteryTestConfig {
  deviceTier: DeviceTier;
  capacityMah: number;
  voltageNominal: number;
  brightnessNits: number;
  refreshRateHz: 60 | 90 | 120 | 144;
  networkMode: 'wifi6' | '5g' | 'lte';
  batteryHealthPct?: number;      // 70 - 100% SOH (default 96%)
  ambientTempC?: number;          // 10 - 40°C (default 25°C)
  coolingMode?: BatteryCoolingMode; // default 'vapor-chamber'
  backgroundSyncLoad?: 'low' | 'medium' | 'high';
  stages: BatteryStageConfig[];
}

export interface BatteryDischargePoint {
  minute: number;
  hourFormatted: string;
  batteryPct: number;
  activeStage: BatteryWorkloadStage;
  powerWatts: number;
  currentMa: number;
  jouleHeatMw: number;
  internalResistanceMohm: number;
  tempCelsius: number;
  skinTempCelsius: number;
  voltageV: number;
  cRate: number;
  throttled: boolean;
}

export interface BatteryComponentPowerRail {
  id: 'display' | 'compute' | 'modem-gps' | 'joule-pmic' | 'memory-sensors';
  name: string;
  watts: number;
  sharePct: number;
  colorHex: string;
}

export interface BatteryEnduranceReport {
  id: string;
  timestampIso: string;
  config: BatteryTestConfig;
  effectiveCapacityMah: number;
  estimatedHours: number;
  estimatedMinutesTotal: number;
  FormattedDuration: string;
  wattHoursTotal: number;
  avgDischargeWatts: number;
  avgCurrentMa: number;
  avgCRate: number;
  avgInternalResistanceMohm: number;
  totalJouleHeatWh: number;
  peakTempC: number;
  peakSkinTempC: number;
  minVoltageV: number;
  thermalThrottleCount: number;
  efficiencyScore: number;
  thermalSafetyVerdict: string;
  componentBreakdown: BatteryComponentPowerRail[];
  stageBreakdown: {
    stage: BatteryWorkloadStage;
    name: string;
    hoursSpent: number;
    mahConsumed: number;
    pctOfTotalDrain: number;
    avgStageWatts: number;
    peakStageTempC: number;
  }[];
  dischargeCurve: BatteryDischargePoint[];
}

export interface RadarCapabilityMetrics {
  gpuPeak: number;          // 0 - 100
  thermalStability: number; // 0 - 100
  cpuMultiCore: number;     // 0 - 100
  powerEfficiency: number;  // 0 - 100
  memoryBandwidth: number;  // 0 - 100
  batteryEndurance: number; // 0 - 100
}

export interface ReferenceDevice {
  id: string;
  name: string;
  category: 'Mobile' | 'Desktop';
  tier: DeviceTier;
  tierLabel: string;
  socOrCpu: string;
  gpuName: string;
  ramSpec: string;
  tdpWatts: number;
  totalScore: number;
  gpuScore: number;
  cpuScore: number;
  avgFps: number;
  stabilityPct: number;
  peakTempC: number;
  batteryLifeHours: number;
  radar: RadarCapabilityMetrics;
}

export interface EnvironmentCalibrationResult {
  timestampIso: string;
  selectedTier: DeviceTier;
  expectedGpuClockMHz: number;
  measuredGpuClockMHz: number;
  expectedCpuClockMHz: number;
  measuredCpuClockMHz: number;
  expectedVoltageV: number;
  measuredVoltageV: number;
  probeGflops: number;
  probeFps: number;
  clockDeviationPct: number;
  voltageDeviationPct: number;
  hasSignificantDeviation: boolean;
  deviationDirection: 'underpowered' | 'overpowered' | 'matched';
  recommendedIntensity: StressIntensity;
  recommendedTier: DeviceTier;
  recommendedInstances: number;
  advisoryMessage: string;
}

export interface BenchmarkAbortInfo {
  abortedAtIso: string;
  reason: 'exit-fullscreen' | 'escape-key' | 'visibility-hidden' | 'manual-abort';
  reasonLabel: string;
  elapsedSecBeforeAbort: number;
  loopAtAbort: number;
}

