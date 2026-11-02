import { BenchmarkReport } from '../types/benchmark';
import {
  buildPdfReportSummary,
  getTierHardwareEnvelope,
} from '../engine/benchmarkMath';
import { DEVICE_TIER_META } from '../data/hardwareDatabase';

/**
 * Renders a self-contained, hex-color-safe professional laboratory report template
 * and exports it as a multi-chart A4 PDF using html2pdf.js.
 * Using explicit hex/RGB styles avoids html2canvas crashes on Tailwind v4 oklch() colors.
 */
export async function exportBenchmarkReportToPdf(
  report: BenchmarkReport
): Promise<string> {
  const summary = buildPdfReportSummary(report);
  const env = getTierHardwareEnvelope(report.config.deviceTier);
  const tierInfo = DEVICE_TIER_META.find(
    (t) => t.id === report.config.deviceTier
  );

  // Build SVG telemetry waveform string with explicit hex attributes
  const displaySamples = report.samples.slice(-48);
  const svgW = 700;
  const svgH = 160;
  const padL = 42;
  const padR = 42;
  const padT = 16;
  const padB = 24;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const maxFps = Math.max(120, ...displaySamples.map((s) => s.fps * 1.15));
  const maxTemp = Math.max(95, ...displaySamples.map((s) => s.tempCelsius * 1.1));
  const minTemp = 20;

  const getX = (i: number) =>
    displaySamples.length <= 1
      ? padL + plotW / 2
      : padL + (i / (displaySamples.length - 1)) * plotW;
  const getFpsY = (fps: number) =>
    padT + plotH - Math.min(1, Math.max(0, fps / maxFps)) * plotH;
  const getTempY = (temp: number) =>
    padT +
    plotH -
    Math.min(1, Math.max(0, (temp - minTemp) / (maxTemp - minTemp))) * plotH;

  const fpsPoints = displaySamples
    .map((s, i) => `${getX(i).toFixed(1)},${getFpsY(s.fps).toFixed(1)}`)
    .join(' ');
  const tempPoints = displaySamples
    .map((s, i) => `${getX(i).toFixed(1)},${getTempY(s.tempCelsius).toFixed(1)}`)
    .join(' ');
  const throttleY = getTempY(env.throttleTempC);

  const gridLinesHtml = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = (padT + ratio * plotH).toFixed(1);
      const fpsLbl = Math.round(maxFps * (1 - ratio));
      const tempLbl = Math.round(maxTemp - ratio * (maxTemp - minTemp));
      return `
        <line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="#1E293B" stroke-width="1" />
        <text x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end" fill="#06B6D4" font-size="9" font-family="monospace">${fpsLbl} FPS</text>
        <text x="${svgW - padR + 6}" y="${Number(y) + 3}" text-anchor="start" fill="#F59E0B" font-size="9" font-family="monospace">${tempLbl}°C</text>
      `;
    })
    .join('');

  const maxLoopScore = Math.max(100, ...report.loops.map((l) => l.loopScore));
  const loopRowsHtml = report.loops
    .slice(0, 15)
    .map((loop) => {
      const pct = Math.max(10, (loop.loopScore / maxLoopScore) * 100).toFixed(1);
      const ratio = ((loop.loopScore / maxLoopScore) * 100).toFixed(1);
      const barColor =
        Number(ratio) >= 97
          ? '#0891B2'
          : Number(ratio) >= 90
            ? '#D97706'
            : '#E11D48';
      return `
        <tr>
          <td style="padding: 5px 8px; border-bottom: 1px solid #1E293B; font-family: monospace; color: #CBD5E1;">Loop #${loop.loopNumber.toString().padStart(2, '0')}</td>
          <td style="padding: 5px 8px; border-bottom: 1px solid #1E293B; width: 45%;">
            <div style="background: #0F172A; border: 1px solid #1E293B; border-radius: 3px; height: 16px; position: relative; overflow: hidden;">
              <div style="background: ${barColor}; width: ${pct}%; height: 100%;"></div>
            </div>
          </td>
          <td style="padding: 5px 8px; border-bottom: 1px solid #1E293B; font-family: monospace; color: #F1F5F9; text-align: right;">${loop.loopScore.toLocaleString()} pts (${ratio}%)</td>
          <td style="padding: 5px 8px; border-bottom: 1px solid #1E293B; font-family: monospace; color: #94A3B8; text-align: right;">${loop.avgFps.toFixed(1)} FPS · ${loop.peakTempC.toFixed(1)}°C · ${loop.avgClockMHz}MHz</td>
        </tr>
      `;
    })
    .join('');

  // Create isolated offscreen container with pure Hex/RGB CSS for html2pdf.js
  // A4 portrait printable width (210mm - 16mm margin = 194mm ≈ 720px at 96 DPI)
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '0';
  wrapper.style.top = '0';
  wrapper.style.width = '720px';
  wrapper.style.backgroundColor = '#07090E';
  wrapper.style.zIndex = '-9999';
  wrapper.style.pointerEvents = 'none';

  wrapper.innerHTML = `
    <div style="width: 720px; padding: 24px 28px; background-color: #07090E; color: #F1F5F9; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; box-sizing: border-box;">
      <!-- Report Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #06B6D4; padding-bottom: 14px; margin-bottom: 16px;">
        <div>
          <div style="font-size: 10px; font-family: monospace; color: #06B6D4; letter-spacing: 0.05em;">AETHERMARK 3D · CROSS-PLATFORM HARDWARE STRESS REPORT</div>
          <h1 style="font-size: 20px; font-weight: 700; margin: 4px 0 0 0; color: #FFFFFF;">效能與溫控壓力測試分析報告</h1>
          <div style="font-size: 11px; color: #94A3B8; margin-top: 4px;">
            報告編號：${report.id} · 測試時間：${new Date(report.timestampIso).toLocaleString('zh-TW')}
          </div>
        </div>
        <div style="text-align: right; font-family: monospace; font-size: 11px; color: #CBD5E1; flex-shrink: 0;">
          <div style="font-weight: 700; color: #F8FAFC;">${report.config.suiteName}</div>
          <div>${tierInfo?.label || report.config.deviceTier}</div>
          <div>強度：${report.config.intensity.toUpperCase()} (${report.loops.length} Loops)</div>
        </div>
      </div>

      <!-- Primary Score KPI Cards -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;">
        <div style="background-color: #0B0E17; border: 1px solid #1E293B; border-radius: 6px; padding: 12px;">
          <div style="font-size: 10px; font-family: monospace; color: #94A3B8;">AETHERMARK 3D 綜合基準總分</div>
          <div style="font-size: 26px; font-family: monospace; font-weight: 700; color: #06B6D4; margin-top: 4px;">${summary.formattedTotalScore}</div>
          <div style="font-size: 10px; font-family: monospace; color: #CBD5E1; margin-top: 8px; padding-top: 8px; border-top: 1px solid #1E293B;">
            GPU: <strong>${summary.formattedGpuScore}</strong> · CPU: <strong>${summary.formattedCpuScore}</strong>
          </div>
        </div>

        <div style="background-color: #0B0E17; border: 1px solid #1E293B; border-radius: 6px; padding: 12px;">
          <div style="font-size: 10px; font-family: monospace; color: #94A3B8;">迴圈幀率穩定度 (FRAME STABILITY)</div>
          <div style="font-size: 26px; font-family: monospace; font-weight: 700; color: ${summary.verdictColorHex}; margin-top: 4px;">${report.frameStabilityPct.toFixed(1)}%</div>
          <div style="font-size: 10px; font-family: monospace; color: #CBD5E1; margin-top: 8px; padding-top: 8px; border-top: 1px solid #1E293B;">
            ${summary.verdictLabel} · 平均 ${report.avgFps} FPS
          </div>
        </div>

        <div style="background-color: #0B0E17; border: 1px solid #1E293B; border-radius: 6px; padding: 12px;">
          <div style="font-size: 10px; font-family: monospace; color: #94A3B8;">溫控曲線與能耗效率 (THERMAL & TDP)</div>
          <div style="font-size: 26px; font-family: monospace; font-weight: 700; color: #F8FAFC; margin-top: 4px;">${report.peakTempC.toFixed(1)}°C</div>
          <div style="font-size: 10px; font-family: monospace; color: #CBD5E1; margin-top: 8px; padding-top: 8px; border-top: 1px solid #1E293B;">
            ${summary.temperatureSpanText} · ${report.avgPowerWatts}W (${report.perfPerWatt} pts/W)
          </div>
        </div>
      </div>

      <!-- Detected Hardware & Diagnosis Box -->
      <div style="background-color: #0B0E17; border: 1px solid #1E293B; border-radius: 6px; padding: 12px; margin-bottom: 14px; font-size: 10.5px;">
        <div style="display: flex; justify-content: space-between; gap: 12px; color: #94A3B8; font-family: monospace; margin-bottom: 6px;">
          <span>GPU 渲染器：${report.hardware.gpuRenderer.slice(0, 50)}</span>
          <span>CPU：${report.hardware.cpuCores} Threads · ${report.hardware.deviceMemoryGb}GB RAM · ${report.hardware.screenResolution}</span>
        </div>
        <div style="color: #E2E8F0; padding-top: 6px; border-top: 1px solid #1E293B;">
          <strong style="color: #06B6D4;">系統溫控診斷結論：</strong>${report.recommendation}
        </div>
      </div>

      <!-- Multi-Channel Telemetry Waveform Chart -->
      <div style="background-color: #0B0E17; border: 1px solid #1E293B; border-radius: 6px; padding: 12px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11.5px; font-weight: 600; color: #F1F5F9;">多通道即時遙測曲線 (FPS / 核心溫度 / 溫控降頻臨界線)</span>
          <span style="font-size: 9.5px; font-family: monospace; color: #94A3B8;">實線 Cyan: FPS · 虛線 Amber: 核心溫度 (°C) · 紅線: 臨界點 ${env.throttleTempC}°C</span>
        </div>
        <svg viewBox="0 0 ${svgW} ${svgH}" width="638" height="148" xmlns="http://www.w3.org/2000/svg" style="display: block; width: 100%; height: auto;">
          ${gridLinesHtml}
          <line x1="${padL}" y1="${throttleY.toFixed(1)}" x2="${svgW - padR}" y2="${throttleY.toFixed(1)}" stroke="#F43F5E" stroke-width="1" stroke-dasharray="4 4" />
          <polyline fill="none" stroke="#06B6D4" stroke-width="2.2" points="${fpsPoints}" />
          <polyline fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="5 3" points="${tempPoints}" />
        </svg>
      </div>

      <!-- Loop-by-Loop Stability Table -->
      <div style="background-color: #0B0E17; border: 1px solid #1E293B; border-radius: 6px; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11.5px; font-weight: 600; color: #F1F5F9;">迴圈穩定度與降頻趨勢明細 (Loop-by-Loop Stability Breakdown)</span>
          <span style="font-size: 9.5px; font-family: monospace; color: #94A3B8;">最大降頻：${report.maxThrottlePct}% · 最低/最高：${report.minFps} / ${report.maxFps} FPS</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
          <thead>
            <tr style="border-bottom: 1px solid #334155; color: #94A3B8; font-family: monospace; text-align: left;">
              <th style="padding: 5px 6px;">迴圈編號</th>
              <th style="padding: 5px 6px;">穩定度保持比例</th>
              <th style="padding: 5px 6px; text-align: right;">迴圈分數 (保持率)</th>
              <th style="padding: 5px 6px; text-align: right;">平均幀率 · 峰值溫度 · 時脈</th>
            </tr>
          </thead>
          <tbody>
            ${loopRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);

  try {
    const html2pdfModule = await import('html2pdf.js');
    const html2pdf = (html2pdfModule as any).default || html2pdfModule;

    const targetNode = wrapper.firstElementChild as HTMLElement;
    const opt = {
      margin: [8, 8, 8, 8],
      filename: summary.filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        width: 720,
        windowWidth: 720,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        backgroundColor: '#07090E',
        logging: false,
        onclone: (clonedDoc: Document) => {
          // Remove Tailwind v4 oklch/oklab stylesheets from cloned document so html2canvas CSS parser never throws
          const styleNodes = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
          styleNodes.forEach((node) => node.parentNode?.removeChild(node));
        },
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      },
    };

    await html2pdf().set(opt).from(targetNode).save();
    return summary.filename;
  } finally {
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }
}
