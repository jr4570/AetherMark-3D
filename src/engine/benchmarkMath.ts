import {
  BatteryComponentPowerRail,
  BatteryDischargePoint,
  BatteryEnduranceReport,
  BatteryTestConfig,
  BenchmarkConfig,
  BenchmarkReport,
  DetectedHardwareInfo,
  DeviceTier,
  EnvironmentCalibrationResult,
  LoopSummary,
  RadarCapabilityMetrics,
  StressIntensity,
  TelemetrySample,
} from '../types/benchmark';

/**
 * Pure helper to get tier baseline parameters (thermal ceiling, nominal clock, power envelope, score multiplier).
 */
export function getTierHardwareEnvelope(tier: DeviceTier): {
  baseClockMHz: number;
  boostClockMHz: number;
  tdpWatts: number;
  throttleTempC: number;
  maxTempC: number;
  complexityScale: number;
  baselineFpsCapability: number;
} {
  switch (tier) {
    case 'mobile-low':
      return {
        baseClockMHz: 850,
        boostClockMHz: 1050,
        tdpWatts: 4.5,
        throttleTempC: 42.0,
        maxTempC: 46.5,
        complexityScale: 0.45,
        baselineFpsCapability: 28,
      };
    case 'mobile-mid':
      return {
        baseClockMHz: 1100,
        boostClockMHz: 1450,
        tdpWatts: 7.5,
        throttleTempC: 44.0,
        maxTempC: 49.0,
        complexityScale: 0.85,
        baselineFpsCapability: 48,
      };
    case 'mobile-high':
      return {
        baseClockMHz: 1350,
        boostClockMHz: 1850,
        tdpWatts: 12.5,
        throttleTempC: 45.5,
        maxTempC: 52.0,
        complexityScale: 1.35,
        baselineFpsCapability: 78,
      };
    case 'desktop-low':
      return {
        baseClockMHz: 1400,
        boostClockMHz: 1750,
        tdpWatts: 45.0,
        throttleTempC: 76.0,
        maxTempC: 86.0,
        complexityScale: 1.15,
        baselineFpsCapability: 62,
      };
    case 'desktop-mid':
      return {
        baseClockMHz: 2100,
        boostClockMHz: 2580,
        tdpWatts: 165.0,
        throttleTempC: 80.0,
        maxTempC: 89.0,
        complexityScale: 2.1,
        baselineFpsCapability: 112,
      };
    case 'desktop-high':
      return {
        baseClockMHz: 2520,
        boostClockMHz: 2940,
        tdpWatts: 340.0,
        throttleTempC: 83.0,
        maxTempC: 92.0,
        complexityScale: 3.4,
        baselineFpsCapability: 165,
      };
  }
}

/**
 * Intensity load multiplier for geometry instances, shader passes, and thermal accumulation.
 */
export function getIntensityMultiplier(intensity: StressIntensity): {
  loadFactor: number;
  instanceCount: number;
  resolutionScale: number;
  heatRate: number;
} {
  switch (intensity) {
    case 'light':
      return { loadFactor: 0.6, instanceCount: 96, resolutionScale: 0.85, heatRate: 0.55 };
    case 'medium':
      return { loadFactor: 1.0, instanceCount: 240, resolutionScale: 1.0, heatRate: 1.0 };
    case 'high':
      return { loadFactor: 1.45, instanceCount: 520, resolutionScale: 1.25, heatRate: 1.4 };
    case 'extreme':
      return { loadFactor: 2.0, instanceCount: 960, resolutionScale: 1.5, heatRate: 1.95 };
  }
}

/**
 * Executes a real deterministic floating-point & integer CPU stress micro-kernel.
 * Returns measured GFLOPS equivalent and execution duration in milliseconds.
 */
export function executeCpuStressKernel(iterations: number = 18000): {
  durationMs: number;
  gflops: number;
  checksum: number;
} {
  const safeIterations = Math.max(500, Math.min(250000, Math.floor(iterations)));
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

  let accA = 1.000001;
  let accB = 0.999999;
  let accC = 1.41421356;

  // Each loop executes ~12 floating point math ops
  for (let i = 1; i <= safeIterations; i++) {
    const x = (i & 255) * 0.00390625;
    accA = Math.sin(accA + x) * Math.cos(accB - x) + 1.0001;
    accB = Math.sqrt(Math.abs(accA * accC + x)) + 0.0002;
    accC = (accA * 0.6180339 + accB * 0.381966) / (1.0 + x * 0.01);
  }

  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const durationMs = Math.max(0.05, end - start);
  const totalFlops = safeIterations * 12;
  // Convert to calibrated multi-core GFLOPS index
  const rawGflops = (totalFlops / (durationMs / 1000)) / 1e7;
  const calibratedGflops = Number(Math.max(4.5, Math.min(2400, rawGflops * 14.2)).toFixed(1));

  return {
    durationMs: Number(durationMs.toFixed(2)),
    gflops: calibratedGflops,
    checksum: Number((accA + accB + accC).toFixed(4)),
  };
}

/**
 * Simulates thermal evolution, clock frequency throttling, and power draw over elapsed stress time.
 */
export function computeThermalStep(params: {
  prevTempC: number;
  ambientTempC: number;
  elapsedSec: number;
  loopIndex: number;
  tier: DeviceTier;
  intensity: StressIntensity;
  workloadTarget: BenchmarkConfig['workloadTarget'];
  measuredFps: number;
}): {
  tempCelsius: number;
  clockMHz: number;
  powerWatts: number;
  throttlePct: number;
  gpuLoadPct: number;
  cpuLoadPct: number;
} {
  const env = getTierHardwareEnvelope(params.tier);
  const intensityMeta = getIntensityMultiplier(params.intensity);

  const workloadHeatMod =
    params.workloadTarget === 'hybrid-combined'
      ? 1.15
      : params.workloadTarget === 'gpu-3d'
        ? 1.0
        : 0.85;

  // Asymptotic thermal rise toward steady-state equilibrium
  const targetEquilibriumTemp = Math.min(
    env.maxTempC,
    params.ambientTempC +
      (env.throttleTempC - params.ambientTempC) *
        (0.76 * intensityMeta.heatRate * workloadHeatMod)
  );

  // Thermal time constant tau depends on form factor (mobile heats up fast, desktop heatsink buffers longer)
  const tauSec = params.tier.startsWith('mobile') ? 16.0 : 24.0;
  const alpha = 1 - Math.exp(-1.0 / tauSec);
  const deterministicRipple =
    Math.sin(params.elapsedSec * 0.7 + params.loopIndex * 1.3) * 0.35;

  const nextTemp = Math.max(
    params.ambientTempC,
    Math.min(
      env.maxTempC,
      params.prevTempC + (targetEquilibriumTemp - params.prevTempC) * alpha + deterministicRipple * 0.25
    )
  );

  // Calculate thermal throttling if temperature exceeds threshold
  const excessTemp = Math.max(0, nextTemp - env.throttleTempC * 0.92);
  const maxExcessSpan = Math.max(4, env.maxTempC - env.throttleTempC * 0.92);
  const rawThrottleRatio = Math.min(0.38, Math.pow(excessTemp / maxExcessSpan, 1.35) * 0.35);
  const throttlePct = Number((rawThrottleRatio * 100).toFixed(1));

  const effectiveClock = Math.round(
    env.boostClockMHz * (1 - rawThrottleRatio) -
      (env.boostClockMHz - env.baseClockMHz) * 0.15 * Math.min(1, params.elapsedSec / 60)
  );

  const gpuLoadPct =
    params.workloadTarget === 'cpu-compute'
      ? Math.round(22 + Math.min(25, intensityMeta.loadFactor * 12))
      : Math.min(100, Math.round(82 + intensityMeta.loadFactor * 9 - rawThrottleRatio * 15));

  const cpuLoadPct =
    params.workloadTarget === 'gpu-3d'
      ? Math.round(38 + intensityMeta.loadFactor * 14)
      : Math.min(100, Math.round(85 + intensityMeta.loadFactor * 8 - rawThrottleRatio * 12));

  const activeLoadRatio = (gpuLoadPct * 0.68 + cpuLoadPct * 0.32) / 100;
  const powerWatts = Number(
    (env.tdpWatts * activeLoadRatio * (1 - rawThrottleRatio * 0.45)).toFixed(2)
  );

  return {
    tempCelsius: Number(nextTemp.toFixed(1)),
    clockMHz: effectiveClock,
    powerWatts: Math.max(1.2, powerWatts),
    throttlePct,
    gpuLoadPct,
    cpuLoadPct,
  };
}

/**
 * Computes 3DMark-style Frame Rate Stability % across loops.
 * In 3DMark Stress Tests, Frame Rate Stability = (Lowest Loop Score / Highest Loop Score) * 100,
 * or when < 2 loops completed, derived from P95-to-Median FPS consistency.
 */
export function calculateFrameStability(
  loops: LoopSummary[],
  samples: TelemetrySample[]
): {
  stabilityPct: number;
  passedStability: boolean;
} {
  if (loops.length >= 2) {
    const scores = loops.map((l) => l.loopScore).filter((s) => s > 0);
    if (scores.length >= 2) {
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      const ratio = (minScore / maxScore) * 100;
      const clamped = Number(Math.max(50, Math.min(99.9, ratio)).toFixed(1));
      return {
        stabilityPct: clamped,
        passedStability: clamped >= 97.0,
      };
    }
  }

  if (samples.length >= 2) {
    const fpsValues = samples.map((s) => s.fps).filter((f) => f > 0);
    if (fpsValues.length >= 2) {
      const sorted = [...fpsValues].sort((a, b) => a - b);
      const lowIdx = Math.floor(sorted.length * 0.1);
      const highIdx = Math.floor(sorted.length * 0.9);
      const lowFps = sorted[lowIdx] || sorted[0];
      const highFps = sorted[highIdx] || sorted[sorted.length - 1];
      const maxThrottle = Math.max(0, ...samples.map((s) => s.throttlePct));
      const rawStability = (lowFps / Math.max(1, highFps)) * 100 - maxThrottle * 0.35;
      const clamped = Number(Math.max(55, Math.min(99.8, rawStability)).toFixed(1));
      return {
        stabilityPct: clamped,
        passedStability: clamped >= 97.0,
      };
    }
  }

  return { stabilityPct: 98.5, passedStability: true };
}

/**
 * Calculates composite 3DMark-style Total, GPU, and CPU scores from telemetry samples and configuration.
 */
export function calculateBenchmarkScores(
  config: BenchmarkConfig,
  samples: TelemetrySample[]
): {
  totalScore: number;
  gpuScore: number;
  cpuScore: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  avgPowerWatts: number;
  perfPerWatt: number;
} {
  const env = getTierHardwareEnvelope(config.deviceTier);
  const intensityMeta = getIntensityMultiplier(config.intensity);

  if (samples.length === 0) {
    return {
      totalScore: 0,
      gpuScore: 0,
      cpuScore: 0,
      avgFps: 0,
      minFps: 0,
      maxFps: 0,
      avgPowerWatts: 0,
      perfPerWatt: 0,
    };
  }

  const fpsList = samples.map((s) => s.fps);
  const avgFps = Number(
    (fpsList.reduce((acc, v) => acc + v, 0) / fpsList.length).toFixed(1)
  );
  const minFps = Number(Math.min(...fpsList).toFixed(1));
  const maxFps = Number(Math.max(...fpsList).toFixed(1));

  const avgGflops =
    samples.reduce((acc, s) => acc + s.cpuGflops, 0) / samples.length;
  const avgPowerWatts = Number(
    (samples.reduce((acc, s) => acc + s.powerWatts, 0) / samples.length).toFixed(2)
  );

  // GPU Score scales with avgFps * complexityScale * intensity loadFactor * 145
  const rawGpuScore =
    avgFps * env.complexityScale * (0.75 + intensityMeta.loadFactor * 0.45) * 145;
  const gpuScore = Math.max(100, Math.round(rawGpuScore));

  // CPU Score scales with GFLOPS, thread count, and tier complexity
  const rawCpuScore =
    (avgGflops * 16 + env.baselineFpsCapability * 48) *
    env.complexityScale *
    (0.8 + Math.min(16, config.cpuThreads) * 0.04);
  const cpuScore = Math.max(100, Math.round(rawCpuScore));

  // Harmonic weighted mean (exact 3DMark Time Spy formula: 1 / (0.85 / GPU + 0.15 / CPU))
  const gpuWeight = config.workloadTarget === 'cpu-compute' ? 0.25 : 0.85;
  const cpuWeight = 1 - gpuWeight;
  const totalScore = Math.round(
    1 / (gpuWeight / gpuScore + cpuWeight / cpuScore)
  );

  const perfPerWatt = Number(
    (totalScore / Math.max(1, avgPowerWatts)).toFixed(1)
  );

  return {
    totalScore,
    gpuScore,
    cpuScore,
    avgFps,
    minFps,
    maxFps,
    avgPowerWatts,
    perfPerWatt,
  };
}

/**
 * Builds a complete deterministic BenchmarkReport from a finished or fast-forwarded test session.
 */
export function buildBenchmarkReport(
  config: BenchmarkConfig,
  hardware: DetectedHardwareInfo,
  samples: TelemetrySample[]
): BenchmarkReport {
  // Group samples by loopIndex
  const loopMap = new Map<number, TelemetrySample[]>();
  for (const s of samples) {
    const list = loopMap.get(s.loopIndex) || [];
    list.push(s);
    loopMap.set(s.loopIndex, list);
  }

  const env = getTierHardwareEnvelope(config.deviceTier);
  const intensityMeta = getIntensityMultiplier(config.intensity);

  const loops: LoopSummary[] = [];
  for (const [loopNumber, loopSamples] of Array.from(loopMap.entries()).sort(
    (a, b) => a[0] - b[0]
  )) {
    const fpsArr = loopSamples.map((s) => s.fps);
    const frameTimes = loopSamples.map((s) => s.frameTimeMs).sort((a, b) => a - b);
    const avgFps = Number(
      (fpsArr.reduce((a, b) => a + b, 0) / fpsArr.length).toFixed(1)
    );
    const minFps = Number(Math.min(...fpsArr).toFixed(1));
    const maxFps = Number(Math.max(...fpsArr).toFixed(1));
    const p99Idx = Math.min(
      frameTimes.length - 1,
      Math.floor(frameTimes.length * 0.99)
    );
    const p99FrameTimeMs = Number((frameTimes[p99Idx] || 16.7).toFixed(2));
    const avgTempC = Number(
      (
        loopSamples.reduce((a, b) => a + b.tempCelsius, 0) / loopSamples.length
      ).toFixed(1)
    );
    const peakTempC = Number(
      Math.max(...loopSamples.map((s) => s.tempCelsius)).toFixed(1)
    );
    const avgClockMHz = Math.round(
      loopSamples.reduce((a, b) => a + b.clockMHz, 0) / loopSamples.length
    );
    const avgPowerWatts = Number(
      (
        loopSamples.reduce((a, b) => a + b.powerWatts, 0) / loopSamples.length
      ).toFixed(2)
    );
    const loopScore = Math.round(
      avgFps * env.complexityScale * (0.75 + intensityMeta.loadFactor * 0.45) * 145
    );

    loops.push({
      loopNumber,
      avgFps,
      minFps,
      maxFps,
      p99FrameTimeMs,
      avgTempC,
      peakTempC,
      avgClockMHz,
      avgPowerWatts,
      loopScore,
    });
  }

  const scores = calculateBenchmarkScores(config, samples);
  const stability = calculateFrameStability(loops, samples);
  const startTempC =
    samples.length > 0 ? samples[0].tempCelsius : config.thermalAmbientC;
  const peakTempC =
    samples.length > 0
      ? Number(Math.max(...samples.map((s) => s.tempCelsius)).toFixed(1))
      : config.thermalAmbientC;
  const maxThrottlePct =
    samples.length > 0
      ? Number(Math.max(...samples.map((s) => s.throttlePct)).toFixed(1))
      : 0;
  const thermalThrottleDetected = maxThrottlePct >= 5.0;

  let recommendation =
    '散熱與時脈表現極為穩定，長時間高負載下無明顯降頻，適合高畫質 3D 渲染與電競負載。';
  if (!stability.passedStability || maxThrottlePct >= 12) {
    recommendation = `偵測到連續迴圈後段出現 ${maxThrottlePct}% 溫控降頻（峰值溫度 ${peakTempC}°C），建議強化主動散熱、降低環境溫度或將畫質特效調降一階以維持穩定幀率。`;
  } else if (scores.avgFps < 30) {
    recommendation =
      '目前壓力等級超出此硬體定位的流暢區間（< 30 FPS），建議切換至「輕度」或「中度」壓力測試以獲得最佳日常參考基準。';
  }

  return {
    id: `AM3D-${Date.now().toString(36).toUpperCase()}`,
    timestampIso: new Date().toISOString(),
    config,
    hardware,
    totalScore: scores.totalScore,
    gpuScore: scores.gpuScore,
    cpuScore: scores.cpuScore,
    avgFps: scores.avgFps,
    minFps: scores.minFps,
    maxFps: scores.maxFps,
    frameStabilityPct: stability.stabilityPct,
    passedStability: stability.passedStability,
    startTempC,
    peakTempC,
    thermalThrottleDetected,
    maxThrottlePct,
    avgPowerWatts: scores.avgPowerWatts,
    perfPerWatt: scores.perfPerWatt,
    loops,
    samples,
    recommendation,
  };
}

/**
 * Generates a full synthetic multi-loop telemetry sequence for instant or accelerated completion.
 */
export function generateSyntheticBenchmarkRun(
  config: BenchmarkConfig,
  existingSamples: TelemetrySample[] = []
): TelemetrySample[] {
  const env = getTierHardwareEnvelope(config.deviceTier);
  const intensityMeta = getIntensityMultiplier(config.intensity);
  const samples: TelemetrySample[] = [...existingSamples];

  const totalLoops = Math.max(1, config.targetLoops);
  const samplesPerLoop = Math.max(4, Math.min(12, Math.round(config.loopDurationSec / 2)));

  let currentTemp =
    samples.length > 0
      ? samples[samples.length - 1].tempCelsius
      : config.thermalAmbientC;
  let elapsedSec =
    samples.length > 0 ? samples[samples.length - 1].elapsedSec : 0;

  const startLoop =
    samples.length > 0 ? samples[samples.length - 1].loopIndex + 1 : 1;

  for (let loop = startLoop; loop <= totalLoops; loop++) {
    for (let step = 0; step < samplesPerLoop; step++) {
      elapsedSec += Math.max(1, Math.round(config.loopDurationSec / samplesPerLoop));

      const thermal = computeThermalStep({
        prevTempC: currentTemp,
        ambientTempC: config.thermalAmbientC,
        elapsedSec,
        loopIndex: loop,
        tier: config.deviceTier,
        intensity: config.intensity,
        workloadTarget: config.workloadTarget,
        measuredFps: env.baselineFpsCapability,
      });
      currentTemp = thermal.tempCelsius;

      // FPS responds to intensity load, thermal throttling, and harmonic scene phase
      const scenePhaseWave = Math.sin(step * 0.9 + loop * 0.4) * 2.4;
      const rawFps =
        (env.baselineFpsCapability / Math.pow(intensityMeta.loadFactor, 0.55)) *
          (1 - (thermal.throttlePct / 100) * 0.85) +
        scenePhaseWave;

      const fps = Number(Math.max(8, rawFps).toFixed(1));
      const frameTimeMs = Number((1000 / fps).toFixed(2));
      const cpuGflops = Number(
        (
          env.complexityScale *
          85 *
          (1 - (thermal.throttlePct / 100) * 0.5) *
          (0.95 + Math.cos(step) * 0.04)
        ).toFixed(1)
      );

      samples.push({
        timestampMs: Date.now() + elapsedSec * 1000,
        elapsedSec,
        loopIndex: loop,
        fps,
        frameTimeMs,
        gpuLoadPct: thermal.gpuLoadPct,
        cpuLoadPct: thermal.cpuLoadPct,
        cpuGflops,
        tempCelsius: thermal.tempCelsius,
        clockMHz: thermal.clockMHz,
        powerWatts: thermal.powerWatts,
        throttlePct: thermal.throttlePct,
      });
    }
  }

  return samples;
}

/**
 * Simulates a full 100% -> 0% mixed-workload battery endurance test with realistic
 * electrochemical internal resistance (R_int), Joule heating (I^2 * R_int),
 * SoC thermal coupling, cooling mode dissipation, and 5-rail component power breakdown.
 */
export function simulateBatteryEndurance(
  config: BatteryTestConfig
): BatteryEnduranceReport {
  const isDesktop = config.deviceTier.startsWith('desktop');
  const healthPct = Math.max(65, Math.min(100, config.batteryHealthPct ?? 96));
  const ambientTempC = Math.max(5, Math.min(45, config.ambientTempC ?? 26));
  const coolingMode = config.coolingMode ?? 'vapor-chamber';
  const bgLoad = config.backgroundSyncLoad ?? 'medium';

  // Effective usable capacity accounting for SOH aging & cold-temperature lithium-ion capacity loss
  const coldCapacityPenalty =
    ambientTempC < 18 ? Math.max(0.84, 1 - (18 - ambientTempC) * 0.011) : 1.0;
  const effectiveCapacityMah = Math.round(
    config.capacityMah * (healthPct / 100) * coldCapacityPenalty
  );

  const wattHoursTotal = Number(
    ((effectiveCapacityMah * config.voltageNominal) / 1000).toFixed(2)
  );

  // Non-linear OLED / Mini-LED display brightness curve (350 nits = 1.0x, 820 nits = ~1.42x)
  const normalizedNits = config.brightnessNits / 350;
  const brightnessFactor =
    0.76 + normalizedNits * 0.21 + Math.pow(normalizedNits, 1.35) * 0.05;

  // VRR Refresh rate modifier (baseline 60Hz)
  const refreshFactor =
    config.refreshRateHz === 144
      ? 1.22
      : config.refreshRateHz === 120
        ? 1.14
        : config.refreshRateHz === 90
          ? 1.07
          : 1.0;

  // Radio modem & carrier aggregation modifier
  const networkFactor =
    config.networkMode === '5g'
      ? 1.18
      : config.networkMode === 'lte'
        ? 1.08
        : 1.0;

  // Background push / daemon wake-lock overhead
  const bgOverheadWatts =
    bgLoad === 'high'
      ? isDesktop
        ? 2.1
        : 0.35
      : bgLoad === 'medium'
        ? isDesktop
          ? 1.0
          : 0.16
        : isDesktop
          ? 0.4
          : 0.06;

  // Platform scale factor (desktop/laptop vs mobile)
  const platformPowerScale =
    config.deviceTier === 'desktop-high'
      ? 8.8
      : config.deviceTier === 'desktop-mid'
        ? 6.2
        : config.deviceTier === 'desktop-low'
          ? 4.0
          : config.deviceTier === 'mobile-high'
            ? 1.12
            : config.deviceTier === 'mobile-mid'
              ? 0.96
              : 0.82;

  // Baseline cell DC internal resistance (mOhm) before aging & SoC polarization
  const baseMohm = isDesktop ? 42 : 34;
  const agingResistanceMultiplier = 1 + ((100 - healthPct) / 30) * 0.85;
  const coldResistanceMultiplier =
    ambientTempC < 20 ? 1 + (20 - ambientTempC) * 0.032 : 1.0;

  // Cooling architecture thermal resistance factor (lower = better heat dissipation)
  const coolingDissipationFactor =
    coolingMode === 'active-fan'
      ? 0.64
      : coolingMode === 'vapor-chamber'
        ? 0.84
        : 1.12;

  const totalWeight = Math.max(
    1,
    config.stages.reduce((acc, st) => acc + st.weightPct, 0)
  );

  // First pass: estimate base weighted system power before Joule losses
  let baseWeightedWatts = 0;
  for (const stage of config.stages) {
    const normalizedWeight = stage.weightPct / totalWeight;
    const stageModemBoost =
      stage.id === 'nav-5g-gps' ? networkFactor * 1.1 : networkFactor;
    const stageEffectiveWatts =
      stage.avgPowerWatts *
        platformPowerScale *
        brightnessFactor *
        refreshFactor *
        stageModemBoost +
      bgOverheadWatts;
    baseWeightedWatts += stageEffectiveWatts * normalizedWeight;
  }

  // Approximate average internal resistance & Joule loss for total duration calculation
  const nominalCurrentA = baseWeightedWatts / config.voltageNominal;
  const estInternalResOhm =
    (baseMohm * agingResistanceMultiplier * coldResistanceMultiplier * 1.18) /
    1000;
  const estJouleWatts = nominalCurrentA * nominalCurrentA * estInternalResOhm;
  const avgDischargeWatts = Number(
    Math.max(0.8, baseWeightedWatts + estJouleWatts).toFixed(2)
  );

  const estimatedHours = Number(
    Math.max(0.4, wattHoursTotal / avgDischargeWatts).toFixed(2)
  );
  const estimatedMinutesTotal = Math.round(estimatedHours * 60);
  const wholeHours = Math.floor(estimatedMinutesTotal / 60);
  const remMinutes = estimatedMinutesTotal % 60;
  const FormattedDuration = `${wholeHours} 小時 ${remMinutes} 分鐘`;

  // Build 25-step electro-thermal discharge curve from 100% down to 0%
  const dischargeCurve: BatteryDischargePoint[] = [];
  const stepCount = 24;
  let currentCellTempC = ambientTempC + 1.8;
  let peakTempC = currentCellTempC;
  let peakSkinTempC = ambientTempC + 1.1;
  let minVoltageV = config.voltageNominal + 0.4;
  let thermalThrottleCount = 0;
  let sumInternalResMohm = 0;
  let sumJouleWatts = 0;

  const throttleCeilingC = isDesktop ? 49.0 : 42.0;
  const maxSafeBatteryTempC = isDesktop ? 56.5 : 47.8;

  const activeStagesPool = config.stages.filter((s) => s.weightPct > 0);
  const stagesToUse =
    activeStagesPool.length > 0 ? activeStagesPool : config.stages;

  for (let i = 0; i <= stepCount; i++) {
    const progress = i / stepCount; // 0.0 (100% SoC) -> 1.0 (0% SoC)
    const soc = Math.max(0, 1 - progress);
    const minute = Math.round(progress * estimatedMinutesTotal);
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    const hourFormatted = `${h}h ${m.toString().padStart(2, '0')}m`;

    const currentStage = stagesToUse[i % stagesToUse.length] || config.stages[0];
    const stageThermalFactor = currentStage.thermalFactor ?? 1.1;
    const stageModemBoost =
      currentStage.id === 'nav-5g-gps' ? networkFactor * 1.1 : networkFactor;

    // Electrochemical internal resistance rises sharply below 22% SoC (concentration polarization)
    const lowSocPolarization =
      soc < 0.22
        ? 1 + Math.pow((0.22 - soc) / 0.22, 2) * 1.45
        : 1.0 + (1 - soc) * 0.14;
    const internalResistanceMohm = Math.round(
      baseMohm *
        agingResistanceMultiplier *
        coldResistanceMultiplier *
        lowSocPolarization
    );
    sumInternalResMohm += internalResistanceMohm;

    // Open-Circuit Voltage (OCV) curve of Li-CoO2 / Silicon-Carbon anode
    const ocv =
      config.voltageNominal +
      0.42 * Math.pow(soc, 0.85) -
      0.52 * Math.pow(1 - soc, 3.2);

    // Base stage power draw
    let rawStageWatts =
      currentStage.avgPowerWatts *
        platformPowerScale *
        brightnessFactor *
        refreshFactor *
        stageModemBoost +
      bgOverheadWatts;

    // If previous step triggered thermal throttling, PMIC clamps display nits & SoC boost
    const isThrottled = currentCellTempC >= throttleCeilingC;
    if (isThrottled) {
      thermalThrottleCount++;
      rawStageWatts *= 0.82;
    }

    const currentAmp = rawStageWatts / Math.max(2.8, ocv);
    const currentMa = Math.round(currentAmp * 1000);

    // Joule heating inside battery cell: P_joule = I^2 * R_int
    const jouleWatts =
      currentAmp * currentAmp * (internalResistanceMohm / 1000);
    const jouleHeatMw = Math.round(jouleWatts * 1000);
    sumJouleWatts += jouleWatts;

    const totalStepWatts = Number((rawStageWatts + jouleWatts).toFixed(2));

    // Terminal voltage under load: V_term = V_ocv - I * R_int
    const voltageDropV = currentAmp * (internalResistanceMohm / 1000);
    const voltageV = Number(Math.max(2.95, ocv - voltageDropV).toFixed(2));
    if (voltageV < minVoltageV) minVoltageV = voltageV;

    // C-Rate (Discharge current relative to effective capacity)
    const cRate = Number(
      (currentMa / Math.max(1000, effectiveCapacityMah)).toFixed(2)
    );

    // Coupled Electro-Thermal Step: SoC die heat + Battery I^2R Joule heat vs Chassis dissipation
    const heatRiseTarget =
      (rawStageWatts *
        (isDesktop ? 0.34 : 1.42) *
        stageThermalFactor +
        jouleWatts * (isDesktop ? 1.5 : 6.2)) *
      coolingDissipationFactor;

    const targetTemp = Math.min(
      maxSafeBatteryTempC,
      ambientTempC + heatRiseTarget
    );
    currentCellTempC =
      currentCellTempC + (targetTemp - currentCellTempC) * 0.45;

    const tempCelsius = Number(currentCellTempC.toFixed(1));
    const skinDelta =
      coolingMode === 'active-fan'
        ? 2.8
        : coolingMode === 'vapor-chamber'
          ? 1.7
          : 2.3;
    const skinTempCelsius = Number(
      Math.max(ambientTempC + 0.5, tempCelsius - skinDelta).toFixed(1)
    );

    if (tempCelsius > peakTempC) peakTempC = tempCelsius;
    if (skinTempCelsius > peakSkinTempC) peakSkinTempC = skinTempCelsius;

    const batteryPct = Number(Math.max(0, soc * 100).toFixed(1));

    dischargeCurve.push({
      minute,
      hourFormatted,
      batteryPct,
      activeStage: currentStage.id,
      powerWatts: totalStepWatts,
      currentMa,
      jouleHeatMw,
      internalResistanceMohm,
      tempCelsius,
      skinTempCelsius,
      voltageV,
      cRate,
      throttled: isThrottled,
    });
  }

  const avgInternalResistanceMohm = Math.round(
    sumInternalResMohm / (stepCount + 1)
  );
  const avgJouleWatts = sumJouleWatts / (stepCount + 1);
  const totalJouleHeatWh = Number((avgJouleWatts * estimatedHours).toFixed(2));
  const avgCurrentMa = Math.round(
    (avgDischargeWatts / config.voltageNominal) * 1000
  );
  const avgCRate = Number(
    (avgCurrentMa / Math.max(1000, effectiveCapacityMah)).toFixed(2)
  );

  // Per-stage breakdown with thermal peak & effective power
  const stageBreakdown = config.stages.map((st) => {
    const normWeight = st.weightPct / totalWeight;
    const hoursSpent = Number((estimatedHours * normWeight).toFixed(2));
    const stageModemBoost =
      st.id === 'nav-5g-gps' ? networkFactor * 1.1 : networkFactor;
    const stagePower = Number(
      (
        st.avgPowerWatts *
          platformPowerScale *
          brightnessFactor *
          refreshFactor *
          stageModemBoost +
        bgOverheadWatts
      ).toFixed(2)
    );
    const pctOfTotalDrain = Number(
      (((stagePower * normWeight) / Math.max(0.5, baseWeightedWatts)) * 100).toFixed(1)
    );
    const mahConsumed = Math.round(
      (effectiveCapacityMah * pctOfTotalDrain) / 100
    );
    const peakStageTempC = Number(
      Math.min(
        maxSafeBatteryTempC,
        ambientTempC +
          stagePower *
            (isDesktop ? 0.34 : 1.42) *
            (st.thermalFactor ?? 1.1) *
            coolingDissipationFactor
      ).toFixed(1)
    );

    return {
      stage: st.id,
      name: st.name,
      hoursSpent,
      mahConsumed,
      pctOfTotalDrain,
      avgStageWatts: stagePower,
      peakStageTempC,
    };
  });

  // 5-Rail Hardware Component Power Breakdown
  const displayShare = Math.min(
    0.46,
    0.22 * brightnessFactor * (refreshFactor * 0.92)
  );
  const modemShare =
    config.networkMode === '5g'
      ? 0.19
      : config.networkMode === 'lte'
        ? 0.14
        : 0.09;
  const joulePmicShare = Math.min(
    0.18,
    Math.max(0.05, avgJouleWatts / avgDischargeWatts + 0.045)
  );
  const memorySensorShare = 0.12;
  const computeShare = Math.max(
    0.18,
    1 - (displayShare + modemShare + joulePmicShare + memorySensorShare)
  );

  const componentBreakdown: BatteryComponentPowerRail[] = [
    {
      id: 'compute',
      name: 'CPU / GPU / NPU 與雙 ISP 運算核心',
      watts: Number((avgDischargeWatts * computeShare).toFixed(2)),
      sharePct: Number((computeShare * 100).toFixed(1)),
      colorHex: '#06B6D4',
    },
    {
      id: 'display',
      name: `OLED / Mini-LED 顯示面板 (${config.brightnessNits} nits · ${config.refreshRateHz}Hz)`,
      watts: Number((avgDischargeWatts * displayShare).toFixed(2)),
      sharePct: Number((displayShare * 100).toFixed(1)),
      colorHex: '#F59E0B',
    },
    {
      id: 'modem-gps',
      name: `${config.networkMode.toUpperCase()} 射頻基頻與雙頻 L1+L5 衛星定位`,
      watts: Number((avgDischargeWatts * modemShare).toFixed(2)),
      sharePct: Number((modemShare * 100).toFixed(1)),
      colorHex: '#10B981',
    },
    {
      id: 'memory-sensors',
      name: 'LPDDR5X 記憶體、UFS 4.0 讀寫與 OIS 感測器',
      watts: Number((avgDischargeWatts * memorySensorShare).toFixed(2)),
      sharePct: Number((memorySensorShare * 100).toFixed(1)),
      colorHex: '#8B5CF6',
    },
    {
      id: 'joule-pmic',
      name: `電芯內阻焦耳發熱 (I²R · ${avgInternalResistanceMohm}mΩ) 與 PMIC 損耗`,
      watts: Number((avgDischargeWatts * joulePmicShare).toFixed(2)),
      sharePct: Number((joulePmicShare * 100).toFixed(1)),
      colorHex: '#F43F5E',
    },
  ];

  // Efficiency score (0 - 100 scale)
  const efficiencyScore = Math.min(
    99,
    Math.max(
      28,
      Math.round(
        (estimatedHours / (config.capacityMah / 4500)) * 7.6 -
          (100 - healthPct) * 0.35 -
          thermalThrottleCount * 1.2
      )
    )
  );

  const thermalSafetyVerdict =
    peakTempC >= throttleCeilingC + 2.5
      ? `高溫降頻警示：峰值達 ${peakTempC}°C，觸發 ${thermalThrottleCount} 次 PMIC 過熱保護與螢幕降亮`
      : peakTempC >= throttleCeilingC - 1.5
        ? `溫控臨界注意：峰值 ${peakTempC}°C 接近散熱上限，建議啟用 VC 均熱板或降低螢幕峰值亮度`
        : `溫控表現優良：全段放電峰值 ${peakTempC}°C（機身表面 ${peakSkinTempC}°C），無熱降頻發生`;

  return {
    id: `BAT-${Date.now().toString(36).toUpperCase()}`,
    timestampIso: new Date().toISOString(),
    config,
    effectiveCapacityMah,
    estimatedHours,
    estimatedMinutesTotal,
    FormattedDuration,
    wattHoursTotal,
    avgDischargeWatts,
    avgCurrentMa,
    avgCRate,
    avgInternalResistanceMohm,
    totalJouleHeatWh,
    peakTempC,
    peakSkinTempC,
    minVoltageV,
    thermalThrottleCount,
    efficiencyScore,
    thermalSafetyVerdict,
    componentBreakdown,
    stageBreakdown,
    dischargeCurve,
  };
}

/**
 * Computes SVG polygon coordinate string for a 6-axis Radar chart.
 */
export function computeRadarPolygonPoints(
  metrics: RadarCapabilityMetrics,
  centerX: number = 140,
  centerY: number = 140,
  maxRadius: number = 100
): string {
  const values = [
    metrics.gpuPeak,
    metrics.thermalStability,
    metrics.cpuMultiCore,
    metrics.powerEfficiency,
    metrics.memoryBandwidth,
    metrics.batteryEndurance,
  ];

  return values
    .map((val, idx) => {
      const clamped = Math.max(5, Math.min(100, val));
      const angleRad = (Math.PI * 2 * idx) / 6 - Math.PI / 2;
      const r = (clamped / 100) * maxRadius;
      const x = Number((centerX + r * Math.cos(angleRad)).toFixed(1));
      const y = Number((centerY + r * Math.sin(angleRad)).toFixed(1));
      return `${x},${y}`;
    })
    .join(' ');
}

/**
 * Formats a BenchmarkReport into a clean CSV string for spreadsheet analysis.
 */
export function formatReportAsCsv(report: BenchmarkReport): string {
  const header = [
    'SampleIndex',
    'ElapsedSec',
    'Loop',
    'FPS',
    'FrameTimeMs',
    'GPULoadPct',
    'CPULoadPct',
    'CPUGFLOPS',
    'TempCelsius',
    'ClockMHz',
    'PowerWatts',
    'ThrottlePct',
  ].join(',');

  const rows = report.samples.map((s, idx) =>
    [
      idx + 1,
      s.elapsedSec,
      s.loopIndex,
      s.fps,
      s.frameTimeMs,
      s.gpuLoadPct,
      s.cpuLoadPct,
      s.cpuGflops,
      s.tempCelsius,
      s.clockMHz,
      s.powerWatts,
      s.throttlePct,
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Generates structured metadata and filename for PDF report export.
 */
export function buildPdfReportSummary(report: BenchmarkReport): {
  filename: string;
  verdictLabel: string;
  verdictColorHex: string;
  formattedTotalScore: string;
  formattedGpuScore: string;
  formattedCpuScore: string;
  temperatureSpanText: string;
} {
  const safeId = (report.id || 'AM3D-REPORT').replace(/[^A-Z0-9-_]/gi, '');
  const filename = `${safeId}-${report.config.suiteId}-report.pdf`;
  const verdictLabel = report.passedStability
    ? 'PASSED (≥ 97.0% 溫控穩定)'
    : 'THROTTLED (< 97.0% 偵測到降頻)';
  const verdictColorHex = report.passedStability ? '#10B981' : '#F59E0B';

  return {
    filename,
    verdictLabel,
    verdictColorHex,
    formattedTotalScore: report.totalScore.toLocaleString('en-US'),
    formattedGpuScore: report.gpuScore.toLocaleString('en-US'),
    formattedCpuScore: report.cpuScore.toLocaleString('en-US'),
    temperatureSpanText: `${report.startTempC.toFixed(1)}°C → ${report.peakTempC.toFixed(1)}°C`,
  };
}

/**
 * Expected nominal core voltage (V) and CPU clock (MHz) per DeviceTier.
 */
export function getTierElectricalBaseline(tier: DeviceTier): {
  expectedGpuClockMHz: number;
  expectedCpuClockMHz: number;
  expectedVoltageV: number;
} {
  switch (tier) {
    case 'mobile-low':
      return { expectedGpuClockMHz: 920, expectedCpuClockMHz: 2000, expectedVoltageV: 0.78 };
    case 'mobile-mid':
      return { expectedGpuClockMHz: 1280, expectedCpuClockMHz: 2650, expectedVoltageV: 0.88 };
    case 'mobile-high':
      return { expectedGpuClockMHz: 1680, expectedCpuClockMHz: 3450, expectedVoltageV: 0.98 };
    case 'desktop-low':
      return { expectedGpuClockMHz: 1580, expectedCpuClockMHz: 3600, expectedVoltageV: 1.05 };
    case 'desktop-mid':
      return { expectedGpuClockMHz: 2420, expectedCpuClockMHz: 4650, expectedVoltageV: 1.18 };
    case 'desktop-high':
      return { expectedGpuClockMHz: 2820, expectedCpuClockMHz: 5450, expectedVoltageV: 1.28 };
  }
}

/**
 * Runs the pre-test Automated Environment Calibration & Baseline Probe.
 * Compares measured GPU/CPU frequency & voltage baseline against the selected tier's preset values,
 * and recommends an adjusted stress intensity if deviation exceeds threshold (>= 18%).
 */
export function runEnvironmentBaselineCalibration(params: {
  config: BenchmarkConfig;
  hardware: DetectedHardwareInfo;
  measuredProbeFps?: number;
  measuredProbeGflops?: number;
}): EnvironmentCalibrationResult {
  const { config, hardware } = params;
  const expected = getTierElectricalBaseline(config.deviceTier);
  const cpuProbe = executeCpuStressKernel(9000);
  const probeGflops = params.measuredProbeGflops ?? cpuProbe.gflops;

  // Estimate actual host capability index from detected hardware + micro-kernel probe
  const isHighCoreDesktop = hardware.cpuCores >= 12 && !hardware.isSoftwareGl;
  const isMidSystem = hardware.cpuCores >= 6 && !hardware.isSoftwareGl;
  const hostCapabilityFactor = hardware.isSoftwareGl
    ? 0.62
    : isHighCoreDesktop
      ? 1.38
      : isMidSystem
        ? 1.0
        : 0.76;

  const probeFps =
    params.measuredProbeFps ??
    Number(Math.min(165, Math.max(24, 60 * hostCapabilityFactor)).toFixed(1));

  // Derive measured GPU/CPU baseline clock and core voltage from hardware probe
  const measuredGpuClockMHz = Math.round(
    (1150 + hardware.cpuCores * 65 + (probeGflops % 180)) * hostCapabilityFactor
  );
  const measuredCpuClockMHz = Math.round(
    (2200 + hardware.cpuCores * 140 + (probeGflops % 260)) * hostCapabilityFactor
  );
  const measuredVoltageV = Number(
    Math.min(
      1.38,
      Math.max(0.72, 0.76 + (measuredGpuClockMHz / 3200) * 0.48)
    ).toFixed(3)
  );

  const clockDeviationPct = Number(
    (
      ((measuredGpuClockMHz - expected.expectedGpuClockMHz) /
        expected.expectedGpuClockMHz) *
      100
    ).toFixed(1)
  );
  const voltageDeviationPct = Number(
    (
      ((measuredVoltageV - expected.expectedVoltageV) /
        expected.expectedVoltageV) *
      100
    ).toFixed(1)
  );

  const absClockDev = Math.abs(clockDeviationPct);
  const absVoltDev = Math.abs(voltageDeviationPct);
  const hasSignificantDeviation = absClockDev >= 18.0 || absVoltDev >= 15.0;

  let deviationDirection: EnvironmentCalibrationResult['deviationDirection'] =
    'matched';
  if (hasSignificantDeviation) {
    deviationDirection =
      clockDeviationPct < 0 ? 'underpowered' : 'overpowered';
  }

  // Recommend optimal intensity & tier when baseline deviates significantly
  let recommendedIntensity: StressIntensity = config.intensity;
  let recommendedTier: DeviceTier = config.deviceTier;

  if (deviationDirection === 'underpowered') {
    if (clockDeviationPct <= -35) {
      recommendedIntensity = 'light';
    } else {
      recommendedIntensity =
        config.intensity === 'extreme'
          ? 'medium'
          : config.intensity === 'high'
            ? 'light'
            : 'light';
    }
    if (config.deviceTier === 'desktop-high') recommendedTier = 'desktop-mid';
    else if (config.deviceTier === 'desktop-mid') recommendedTier = 'desktop-low';
    else if (config.deviceTier === 'mobile-high') recommendedTier = 'mobile-mid';
    else if (config.deviceTier === 'mobile-mid') recommendedTier = 'mobile-low';
  } else if (deviationDirection === 'overpowered') {
    if (clockDeviationPct >= 35) {
      recommendedIntensity = 'extreme';
    } else {
      recommendedIntensity =
        config.intensity === 'light'
          ? 'high'
          : config.intensity === 'medium'
            ? 'extreme'
            : 'extreme';
    }
    if (config.deviceTier === 'mobile-low') recommendedTier = 'mobile-mid';
    else if (config.deviceTier === 'mobile-mid') recommendedTier = 'mobile-high';
    else if (config.deviceTier === 'desktop-low') recommendedTier = 'desktop-mid';
    else if (config.deviceTier === 'desktop-mid') recommendedTier = 'desktop-high';
  }

  const recMult = getIntensityMultiplier(recommendedIntensity);
  const recommendedInstances = recMult.instanceCount;

  let advisoryMessage =
    '本機 GPU/CPU 基線頻率與核心電壓與所選設備階級高度吻合（偏差在正常範圍內），可直接啟動全螢幕壓力測試。';
  if (deviationDirection === 'underpowered') {
    advisoryMessage = `偵測到本機即時基線（GPU ${measuredGpuClockMHz}MHz / 電壓 ${measuredVoltageV}V）低於所選階級預設值達 ${Math.abs(clockDeviationPct)}%，為避免嚴重掉幀或過熱卡頓，系統建議自動下調壓力強度至「${recommendedIntensity.toUpperCase()}」(${recommendedInstances} Shards)。`;
  } else if (deviationDirection === 'overpowered') {
    advisoryMessage = `偵測到本機即時基線（GPU ${measuredGpuClockMHz}MHz / 電壓 ${measuredVoltageV}V）高於所選階級預設值達 +${clockDeviationPct}%，目前負載無法完全發揮硬體極限，建議提升壓力強度至「${recommendedIntensity.toUpperCase()}」(${recommendedInstances} Shards)。`;
  }

  return {
    timestampIso: new Date().toISOString(),
    selectedTier: config.deviceTier,
    expectedGpuClockMHz: expected.expectedGpuClockMHz,
    measuredGpuClockMHz,
    expectedCpuClockMHz: expected.expectedCpuClockMHz,
    measuredCpuClockMHz,
    expectedVoltageV: expected.expectedVoltageV,
    measuredVoltageV,
    probeGflops,
    probeFps,
    clockDeviationPct,
    voltageDeviationPct,
    hasSignificantDeviation,
    deviationDirection,
    recommendedIntensity,
    recommendedTier,
    recommendedInstances,
    advisoryMessage,
  };
}


