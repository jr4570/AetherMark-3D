import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBenchmarkReport,
  buildPdfReportSummary,
  calculateBenchmarkScores,
  calculateFrameStability,
  computeRadarPolygonPoints,
  computeThermalStep,
  executeCpuStressKernel,
  formatReportAsCsv,
  generateSyntheticBenchmarkRun,
  getIntensityMultiplier,
  getTierElectricalBaseline,
  getTierHardwareEnvelope,
  runEnvironmentBaselineCalibration,
  simulateBatteryEndurance,
} from './benchmarkMath';
import { BenchmarkConfig, DetectedHardwareInfo } from '../types/benchmark';

const mockConfig: BenchmarkConfig = {
  suiteId: 'time-spy-apex',
  suiteName: 'Time Spy Apex 3D',
  deviceTier: 'desktop-high',
  intensity: 'high',
  workloadTarget: 'hybrid-combined',
  durationMode: 'short-loop',
  targetLoops: 5,
  loopDurationSec: 10,
  resolutionScale: 1.25,
  instanceCount: 520,
  cpuThreads: 16,
  enableRaymarchLoad: true,
  thermalAmbientC: 26,
};

const mockHardware: DetectedHardwareInfo = {
  gpuRenderer: 'NVIDIA GeForce RTX 4090 / PCIe / SSE2',
  gpuVendor: 'NVIDIA Corporation',
  cpuCores: 16,
  deviceMemoryGb: 32,
  userAgentSummary: 'Desktop Workstation x64',
  isSoftwareGl: false,
  screenResolution: '2560x1440',
  pixelRatio: 2,
  batterySupported: false,
  initialBatteryPct: null,
};

test('getTierHardwareEnvelope scales capability monotonically from mobile-low to desktop-high', () => {
  const mobileLow = getTierHardwareEnvelope('mobile-low');
  const mobileHigh = getTierHardwareEnvelope('mobile-high');
  const desktopHigh = getTierHardwareEnvelope('desktop-high');

  assert.equal(mobileLow.complexityScale < mobileHigh.complexityScale, true);
  assert.equal(mobileHigh.complexityScale < desktopHigh.complexityScale, true);
  assert.equal(mobileLow.tdpWatts < desktopHigh.tdpWatts, true);
});

test('executeCpuStressKernel executes floating-point math and returns positive GFLOPS', () => {
  const res = executeCpuStressKernel(4000);
  assert.equal(res.durationMs > 0, true);
  assert.equal(res.gflops >= 4.5, true);
  assert.equal(Number.isFinite(res.checksum), true);
});

test('computeThermalStep increases temperature under extreme stress and computes clock/power', () => {
  const step1 = computeThermalStep({
    prevTempC: 26.0,
    ambientTempC: 26.0,
    elapsedSec: 15,
    loopIndex: 1,
    tier: 'mobile-high',
    intensity: 'extreme',
    workloadTarget: 'hybrid-combined',
    measuredFps: 75,
  });

  assert.equal(step1.tempCelsius > 26.0, true);
  assert.equal(step1.clockMHz > 800, true);
  assert.equal(step1.powerWatts > 1.2, true);
  assert.equal(step1.gpuLoadPct >= 70, true);
});

test('generateSyntheticBenchmarkRun and buildBenchmarkReport produce valid 3DMark-style stability and scores', () => {
  const samples = generateSyntheticBenchmarkRun(mockConfig);
  assert.equal(samples.length >= 20, true);

  const report = buildBenchmarkReport(mockConfig, mockHardware, samples);
  assert.equal(report.loops.length, 5);
  assert.equal(report.totalScore > 1000, true);
  assert.equal(report.gpuScore > 1000, true);
  assert.equal(report.cpuScore > 1000, true);
  assert.equal(report.frameStabilityPct >= 50 && report.frameStabilityPct <= 100, true);

  const csv = formatReportAsCsv(report);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, samples.length + 1);
  assert.equal(lines[0].includes('FrameTimeMs'), true);
});

test('calculateFrameStability flags thermal throttling when later loops drop below 97%', () => {
  const stable = calculateFrameStability(
    [
      {
        loopNumber: 1,
        avgFps: 100,
        minFps: 95,
        maxFps: 105,
        p99FrameTimeMs: 11,
        avgTempC: 60,
        peakTempC: 62,
        avgClockMHz: 2500,
        avgPowerWatts: 200,
        loopScore: 10000,
      },
      {
        loopNumber: 2,
        avgFps: 98.5,
        minFps: 94,
        maxFps: 103,
        p99FrameTimeMs: 11.2,
        avgTempC: 68,
        peakTempC: 70,
        avgClockMHz: 2480,
        avgPowerWatts: 198,
        loopScore: 9850,
      },
    ],
    []
  );
  assert.equal(stable.stabilityPct, 98.5);
  assert.equal(stable.passedStability, true);

  const throttled = calculateFrameStability(
    [
      {
        loopNumber: 1,
        avgFps: 100,
        minFps: 95,
        maxFps: 105,
        p99FrameTimeMs: 11,
        avgTempC: 40,
        peakTempC: 42,
        avgClockMHz: 1800,
        avgPowerWatts: 12,
        loopScore: 10000,
      },
      {
        loopNumber: 20,
        avgFps: 82,
        minFps: 74,
        maxFps: 88,
        p99FrameTimeMs: 14.5,
        avgTempC: 51,
        peakTempC: 52,
        avgClockMHz: 1350,
        avgPowerWatts: 8.5,
        loopScore: 8200,
      },
    ],
    []
  );
  assert.equal(throttled.stabilityPct, 82.0);
  assert.equal(throttled.passedStability, false);
});

test('simulateBatteryEndurance computes realistic discharge curve, Joule heating, and 5-rail component breakdown', () => {
  const baseStages = [
    {
      id: 'video-4k' as const,
      name: '4K HDR 串流影音播放',
      weightPct: 25,
      avgCurrentMa: 420,
      avgPowerWatts: 1.85,
      targetFps: 60,
      thermalFactor: 1.05,
      description: 'Hardware AV1/HEVC decode & OLED HDR luminance load',
    },
    {
      id: 'social-scroll' as const,
      name: '社群動態高刷滑動',
      weightPct: 25,
      avgCurrentMa: 540,
      avgPowerWatts: 2.35,
      targetFps: 120,
      thermalFactor: 1.18,
      description: '120Hz touch inertia scroll, image decode & feed layout',
    },
    {
      id: 'camera-4k' as const,
      name: '4K 60fps 杜比視界拍攝',
      weightPct: 25,
      avgCurrentMa: 1120,
      avgPowerWatts: 4.65,
      targetFps: 60,
      thermalFactor: 1.58,
      description: 'Dual ISP + NPU HDR + OIS + UFS write',
    },
    {
      id: 'nav-5g-gps' as const,
      name: '戶外 5G 導航定位',
      weightPct: 25,
      avgCurrentMa: 780,
      avgPowerWatts: 3.28,
      targetFps: 60,
      thermalFactor: 1.38,
      description: '5G carrier aggregation + L1/L5 GNSS',
    },
  ];

  const reportHealthy = simulateBatteryEndurance({
    deviceTier: 'mobile-high',
    capacityMah: 5000,
    voltageNominal: 3.88,
    brightnessNits: 300,
    refreshRateHz: 120,
    networkMode: 'wifi6',
    batteryHealthPct: 98,
    ambientTempC: 24,
    coolingMode: 'active-fan',
    stages: baseStages,
  });

  const reportAgedHot = simulateBatteryEndurance({
    deviceTier: 'mobile-high',
    capacityMah: 5000,
    voltageNominal: 3.88,
    brightnessNits: 300,
    refreshRateHz: 120,
    networkMode: '5g',
    batteryHealthPct: 76,
    ambientTempC: 35,
    coolingMode: 'passive',
    stages: baseStages,
  });

  assert.equal(reportHealthy.estimatedHours > reportAgedHot.estimatedHours, true);
  assert.equal(
    reportAgedHot.avgInternalResistanceMohm > reportHealthy.avgInternalResistanceMohm,
    true
  );
  assert.equal(reportAgedHot.peakTempC > reportHealthy.peakTempC, true);
  assert.equal(reportHealthy.componentBreakdown.length, 5);
  assert.equal(reportHealthy.dischargeCurve.length, 25);
  assert.equal(reportHealthy.dischargeCurve[0].batteryPct, 100);
  assert.equal(
    reportHealthy.dischargeCurve[reportHealthy.dischargeCurve.length - 1].batteryPct,
    0
  );
});

test('computeRadarPolygonPoints returns 6 coordinate pairs', () => {
  const pts = computeRadarPolygonPoints({
    gpuPeak: 90,
    thermalStability: 95,
    cpuMultiCore: 88,
    powerEfficiency: 84,
    memoryBandwidth: 92,
    batteryEndurance: 80,
  });
  assert.equal(pts.split(' ').length, 6);
});

test('buildPdfReportSummary formats PDF filename and stability verdict accurately', () => {
  const samples = generateSyntheticBenchmarkRun(mockConfig);
  const report = buildBenchmarkReport(mockConfig, mockHardware, samples);
  const pdfMeta = buildPdfReportSummary(report);

  assert.equal(pdfMeta.filename.endsWith('-time-spy-apex-report.pdf'), true);
  assert.equal(pdfMeta.formattedTotalScore.length > 0, true);
  assert.equal(pdfMeta.temperatureSpanText.includes('°C →'), true);
});

test('runEnvironmentBaselineCalibration detects underpowered hardware vs desktop-high preset and recommends lower intensity', () => {
  const lowPowerHost: DetectedHardwareInfo = {
    ...mockHardware,
    cpuCores: 4,
    isSoftwareGl: true,
  };
  const extremeDesktopConfig: BenchmarkConfig = {
    ...mockConfig,
    deviceTier: 'desktop-high',
    intensity: 'extreme',
  };

  const result = runEnvironmentBaselineCalibration({
    config: extremeDesktopConfig,
    hardware: lowPowerHost,
  });

  assert.equal(result.hasSignificantDeviation, true);
  assert.equal(result.deviationDirection, 'underpowered');
  assert.equal(result.clockDeviationPct < -20, true);
  assert.equal(result.recommendedIntensity !== 'extreme', true);
});

test('runEnvironmentBaselineCalibration detects overpowered workstation vs mobile-low preset and recommends higher intensity', () => {
  const result = runEnvironmentBaselineCalibration({
    config: {
      ...mockConfig,
      deviceTier: 'mobile-low',
      intensity: 'light',
    },
    hardware: mockHardware,
  });

  assert.equal(result.hasSignificantDeviation, true);
  assert.equal(result.deviationDirection, 'overpowered');
  assert.equal(result.clockDeviationPct > 20, true);
  assert.equal(
    result.recommendedIntensity === 'high' ||
      result.recommendedIntensity === 'extreme',
    true
  );
});


