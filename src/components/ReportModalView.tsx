import React, { useState } from 'react';
import { BenchmarkReport } from '../types/benchmark';
import { formatReportAsCsv, getTierHardwareEnvelope } from '../engine/benchmarkMath';
import { LoopStabilityChart, LiveTelemetryWaveform } from './TelemetryCharts';
import { DEVICE_TIER_META } from '../data/hardwareDatabase';
import { exportBenchmarkReportToPdf } from '../utils/pdfExporter';
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Play,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

interface ReportModalViewProps {
  report: BenchmarkReport;
  onRunAgain: () => void;
  onGoToComparison: () => void;
}

export const ReportModalView: React.FC<ReportModalViewProps> = ({
  report,
  onRunAgain,
  onGoToComparison,
}) => {
  const [copiedJson, setCopiedJson] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportedPdfName, setExportedPdfName] = useState<string | null>(null);

  const env = getTierHardwareEnvelope(report.config.deviceTier);
  const tierInfo = DEVICE_TIER_META.find(
    (t) => t.id === report.config.deviceTier
  );

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const filename = await exportBenchmarkReportToPdf(report);
      setExportedPdfName(filename);
      setTimeout(() => setExportedPdfName(null), 3500);
    } catch (err) {
      console.error('Failed to export PDF report:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadCsv = () => {
    const csv = formatReportAsCsv(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.id}-telemetry.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.id}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = () => {
    const summaryText = [
      `=== AetherMark 3D 效能與溫控壓力測試報告 (${report.id}) ===`,
      `測試套件：${report.config.suiteName} (${report.config.intensity.toUpperCase()})`,
      `目標平台：${tierInfo?.label || report.config.deviceTier}`,
      `綜合總分：${report.totalScore.toLocaleString()} (GPU: ${report.gpuScore.toLocaleString()} / CPU: ${report.cpuScore.toLocaleString()})`,
      `幀率表現：平均 ${report.avgFps} FPS (最低 ${report.minFps} / 最高 ${report.maxFps} FPS)`,
      `迴圈穩定度：${report.frameStabilityPct}% (${report.passedStability ? 'PASSED ≥ 97.0%' : 'THROTTLED < 97.0%'})`,
      `溫控與功耗：起始 ${report.startTempC}°C → 峰值 ${report.peakTempC}°C · 平均功耗 ${report.avgPowerWatts}W · 能效比 ${report.perfPerWatt} pts/W`,
      `診斷建議：${report.recommendation}`,
    ].join('\n');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(summaryText);
    }
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="space-y-6" data-testid="benchmark-report-view">
      {/* Top Score & Stability Verdict Banner */}
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span>報告編號 {report.id}</span>
              <span>·</span>
              <span>{report.config.suiteName}</span>
              <span>·</span>
              <span>{tierInfo?.label}</span>
              <span>·</span>
              <span>{report.loops.length} 迴圈測試</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-100 mt-1">
              效能與溫控壓力測試分析報告
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              data-testid="export-pdf-button"
              className="px-3.5 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {isExportingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>正在產生 PDF...</span>
                </>
              ) : exportedPdfName ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>已匯出 PDF 報告</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span>匯出 PDF 報告</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedJson ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>已複製摘要</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>複製報告摘要</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
              <span>匯出 CSV 時序數據</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJson}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>匯出 JSON 完整報告</span>
            </button>

            <button
              type="button"
              onClick={onGoToComparison}
              className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              與其他硬體機型對比
            </button>
          </div>
        </div>

        {/* Primary 3DMark Score & Stability Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5 items-center">
          <div className="md:col-span-4 bg-[#07090E] border border-slate-800 rounded-lg p-5">
            <div className="text-xs font-mono text-slate-400">
              AETHERMARK 3D 綜合基準總分
            </div>
            <div
              className="text-4xl font-mono font-bold text-cyan-400 mt-1 tabular-nums"
              data-testid="report-total-score"
            >
              {report.totalScore.toLocaleString()}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-800 font-mono text-xs tabular-nums">
              <div>
                <span className="text-slate-400 block text-[11px]">
                  GPU 圖形渲染分數
                </span>
                <span className="text-slate-100 font-bold text-base">
                  {report.gpuScore.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  CPU 多核物理分數
                </span>
                <span className="text-slate-100 font-bold text-base">
                  {report.cpuScore.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="md:col-span-4 bg-[#07090E] border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">
                迴圈幀率穩定度 (FRAME STABILITY)
              </span>
              {report.passedStability ? (
                <span className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" />
                  PASSED (≥97%)
                </span>
              ) : (
                <span className="text-xs font-mono font-semibold text-amber-400 flex items-center gap-1">
                  <ShieldAlert className="w-4 h-4" />
                  THROTTLED (&lt;97%)
                </span>
              )}
            </div>
            <div
              className={`text-4xl font-mono font-bold mt-1 tabular-nums ${
                report.passedStability ? 'text-emerald-400' : 'text-amber-400'
              }`}
              data-testid="report-stability-pct"
            >
              {report.frameStabilityPct.toFixed(1)}%
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 font-mono text-xs tabular-nums">
              <div>
                <span className="text-slate-400 block text-[11px]">平均幀率</span>
                <span className="text-slate-100 font-semibold">
                  {report.avgFps} FPS
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">最低 / 最高</span>
                <span className="text-slate-200 font-semibold">
                  {report.minFps} / {report.maxFps}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">最大降頻</span>
                <span className="text-amber-400 font-semibold">
                  {report.maxThrottlePct}%
                </span>
              </div>
            </div>
          </div>

          <div className="md:col-span-4 bg-[#07090E] border border-slate-800 rounded-lg p-5">
            <div className="text-xs font-mono text-slate-400">
              溫控曲線與能耗效率 (THERMAL & TDP)
            </div>
            <div className="text-4xl font-mono font-bold text-slate-100 mt-1 tabular-nums">
              {report.peakTempC.toFixed(1)}
              <span className="text-lg font-normal text-slate-400 ml-1">°C 峰值</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 font-mono text-xs tabular-nums">
              <div>
                <span className="text-slate-400 block text-[11px]">起始溫度</span>
                <span className="text-slate-200 font-semibold">
                  {report.startTempC.toFixed(1)}°C
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">平均功耗</span>
                <span className="text-slate-200 font-semibold">
                  {report.avgPowerWatts} W
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">每瓦分數</span>
                <span className="text-cyan-400 font-semibold">
                  {report.perfPerWatt}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Automated Hardware Thermal & Performance Diagnosis */}
        <div className="mt-5 p-4 bg-slate-900/80 border border-slate-800 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-200 leading-relaxed">
            <span className="font-semibold text-cyan-400 mr-2">
              系統溫控診斷結論：
            </span>
            {report.recommendation}
          </div>
          <button
            type="button"
            onClick={onRunAgain}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>返回修改參數重新測試</span>
          </button>
        </div>
      </div>

      {/* Charts Row: Telemetry Waveform + Loop-by-Loop Stability */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <LiveTelemetryWaveform
            samples={report.samples}
            throttleTempC={env.throttleTempC}
          />
        </div>
        <div className="lg:col-span-5">
          <LoopStabilityChart loops={report.loops} />
        </div>
      </div>
    </div>
  );
};
