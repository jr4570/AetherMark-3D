import React, { useState } from 'react';
import {
  BenchmarkReport,
  DeviceTier,
  ReferenceDevice,
} from '../types/benchmark';
import {
  DEVICE_TIER_META,
  REFERENCE_HARDWARE_DB,
} from '../data/hardwareDatabase';
import { HardwareRadarChart } from './TelemetryCharts';
import {
  ArrowUpDown,
  Check,
  Cpu,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';

interface HardwareCompareViewProps {
  latestReport: BenchmarkReport | null;
  customDevices: ReferenceDevice[];
  onAddCustomDevice: (device: ReferenceDevice) => void;
}

export const HardwareCompareView: React.FC<HardwareCompareViewProps> = ({
  latestReport,
  customDevices,
  onAddCustomDevice,
}) => {
  const [tierFilter, setTierFilter] = useState<'all' | 'Mobile' | 'Desktop' | DeviceTier>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCompareId, setSelectedCompareId] = useState<string>('ref-sd8elite');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // Custom Device Form States
  const [newName, setNewName] = useState('');
  const [newTier, setNewTier] = useState<DeviceTier>('mobile-high');
  const [newCpu, setNewCpu] = useState('');
  const [newGpu, setNewGpu] = useState('');
  const [newGpuScore, setNewGpuScore] = useState('14500');
  const [newCpuScore, setNewCpuScore] = useState('11800');
  const [newStability, setNewStability] = useState('97.8');
  const [newPeakTemp, setNewPeakTemp] = useState('44.5');
  const [newBatteryHours, setNewBatteryHours] = useState('13.2');
  const [formError, setFormError] = useState<string | null>(null);

  const allDevices: ReferenceDevice[] = [...customDevices, ...REFERENCE_HARDWARE_DB];

  // Convert latestReport into a ReferenceDevice representation for direct comparison
  const activeRunDevice: ReferenceDevice = latestReport
    ? {
        id: 'current-user-run',
        name: `本次實測：${latestReport.config.suiteName} (${
          DEVICE_TIER_META.find((t) => t.id === latestReport.config.deviceTier)
            ?.shortLabel || latestReport.config.deviceTier
        })`,
        category: latestReport.config.deviceTier.startsWith('mobile')
          ? 'Mobile'
          : 'Desktop',
        tier: latestReport.config.deviceTier,
        tierLabel:
          DEVICE_TIER_META.find((t) => t.id === latestReport.config.deviceTier)
            ?.shortLabel || '自訂平台',
        socOrCpu: `${latestReport.hardware.cpuCores}-Core Processor`,
        gpuName: latestReport.hardware.gpuRenderer.slice(0, 42),
        ramSpec: `${latestReport.hardware.deviceMemoryGb}GB RAM`,
        tdpWatts: latestReport.avgPowerWatts,
        totalScore: latestReport.totalScore,
        gpuScore: latestReport.gpuScore,
        cpuScore: latestReport.cpuScore,
        avgFps: latestReport.avgFps,
        stabilityPct: latestReport.frameStabilityPct,
        peakTempC: latestReport.peakTempC,
        batteryLifeHours: latestReport.config.deviceTier.startsWith('mobile')
          ? 12.5
          : 5.2,
        radar: {
          gpuPeak: Math.min(99, Math.round(latestReport.gpuScore / 420)),
          thermalStability: Math.round(latestReport.frameStabilityPct),
          cpuMultiCore: Math.min(99, Math.round(latestReport.cpuScore / 300)),
          powerEfficiency: Math.min(99, Math.round(latestReport.perfPerWatt / 3.5)),
          memoryBandwidth: latestReport.config.deviceTier.endsWith('high')
            ? 90
            : latestReport.config.deviceTier.endsWith('mid')
              ? 68
              : 44,
          batteryEndurance: latestReport.config.deviceTier.startsWith('mobile')
            ? 88
            : 55,
        },
      }
    : allDevices[0];

  const targetCompareDevice =
    allDevices.find((d) => d.id === selectedCompareId) || allDevices[1];

  const filteredDevices = allDevices.filter((dev) => {
    const matchesCategory =
      tierFilter === 'all' ||
      dev.category === tierFilter ||
      dev.tier === tierFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      dev.name.toLowerCase().includes(q) ||
      dev.socOrCpu.toLowerCase().includes(q) ||
      dev.gpuName.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const maxTableScore = Math.max(
    40000,
    ...allDevices.map((d) => d.totalScore),
    activeRunDevice.totalScore
  );

  const handleCreateCustomDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCpu.trim() || !newGpu.trim()) {
      setFormError('請填寫完整的裝置名稱、處理器 (SoC/CPU) 與顯示晶片 (GPU) 欄位。');
      return;
    }
    const gScore = Number(newGpuScore);
    const cScore = Number(newCpuScore);
    const stab = Number(newStability);
    const temp = Number(newPeakTemp);
    const bat = Number(newBatteryHours);

    if (
      !Number.isFinite(gScore) ||
      gScore < 100 ||
      !Number.isFinite(cScore) ||
      cScore < 100
    ) {
      setFormError('GPU 與 CPU 分數必須為大於 100 的有效數值。');
      return;
    }

    const total = Math.round(1 / (0.85 / gScore + 0.15 / cScore));
    const tierMeta = DEVICE_TIER_META.find((t) => t.id === newTier)!;

    const created: ReferenceDevice = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      category: tierMeta.category,
      tier: newTier,
      tierLabel: tierMeta.shortLabel,
      socOrCpu: newCpu.trim(),
      gpuName: newGpu.trim(),
      ramSpec: '16GB RAM',
      tdpWatts: tierMeta.category === 'Mobile' ? 9.5 : 140,
      totalScore: total,
      gpuScore: gScore,
      cpuScore: cScore,
      avgFps: Number((gScore / 195).toFixed(1)),
      stabilityPct: Math.min(99.9, Math.max(50, stab)),
      peakTempC: temp,
      batteryLifeHours: bat,
      radar: {
        gpuPeak: Math.min(99, Math.max(20, Math.round(gScore / 410))),
        thermalStability: Math.min(99, Math.max(50, Math.round(stab))),
        cpuMultiCore: Math.min(99, Math.max(20, Math.round(cScore / 280))),
        powerEfficiency: tierMeta.category === 'Mobile' ? 90 : 78,
        memoryBandwidth: 76,
        batteryEndurance: Math.min(99, Math.max(20, Math.round(bat * 6.2))),
      },
    };

    onAddCustomDevice(created);
    setSelectedCompareId(created.id);
    setNewName('');
    setNewCpu('');
    setNewGpu('');
    setFormError(null);
    setShowAddForm(false);
  };

  const scoreDiffPct = (
    ((activeRunDevice.totalScore - targetCompareDevice.totalScore) /
      Math.max(1, targetCompareDevice.totalScore)) *
    100
  ).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Top Side-by-Side Radar & Head-to-Head Comparison Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#0B0E17] border border-slate-800 rounded-lg p-5">
        <div className="lg:col-span-5 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-800 pb-4 lg:pb-0 lg:pr-5">
          <HardwareRadarChart
            primaryName={activeRunDevice.name}
            primaryMetrics={activeRunDevice.radar}
            compareName={targetCompareDevice.name}
            compareMetrics={targetCompareDevice.radar}
          />
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                跨階硬體性能與溫控雙向對比 (Cross-Tier Hardware Comparison)
              </h2>
              <p className="text-xs text-slate-400">
                點擊下方任一手機（低中高階）或電腦（低中高階）基準機型，即可與當前實測數據進行六維雷達與細項比對。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增自訂實測裝置</span>
            </button>
          </div>

          {/* Head-to-Head Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[#07090E] border border-cyan-500/40 rounded-md p-3.5">
              <div className="text-[11px] font-mono text-cyan-400">
                基準裝置 A (當前選擇 / 實測)
              </div>
              <div className="text-sm font-semibold text-slate-100 mt-0.5 truncate">
                {activeRunDevice.name}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 truncate">
                {activeRunDevice.socOrCpu} · {activeRunDevice.gpuName}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-800/80 font-mono text-xs tabular-nums">
                <div>
                  <span className="text-slate-400 block text-[10px]">綜合總分</span>
                  <span className="text-cyan-400 font-bold text-sm">
                    {activeRunDevice.totalScore.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">穩定度</span>
                  <span className="text-slate-100 font-semibold">
                    {activeRunDevice.stabilityPct.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">峰值溫度</span>
                  <span className="text-emerald-400 font-semibold">
                    {activeRunDevice.peakTempC.toFixed(1)}°C
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#07090E] border border-amber-500/40 rounded-md p-3.5">
              <div className="text-[11px] font-mono text-amber-400">
                對照裝置 B (點擊列表切換)
              </div>
              <div className="text-sm font-semibold text-slate-100 mt-0.5 truncate">
                {targetCompareDevice.name}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 truncate">
                {targetCompareDevice.socOrCpu} · {targetCompareDevice.gpuName}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-800/80 font-mono text-xs tabular-nums">
                <div>
                  <span className="text-slate-400 block text-[10px]">綜合總分</span>
                  <span className="text-amber-400 font-bold text-sm">
                    {targetCompareDevice.totalScore.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">穩定度</span>
                  <span className="text-slate-100 font-semibold">
                    {targetCompareDevice.stabilityPct.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">峰值溫度</span>
                  <span className="text-slate-200 font-semibold">
                    {targetCompareDevice.peakTempC.toFixed(1)}°C
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
            <span className="text-slate-300">
              綜合性能差距：
              <strong
                className={
                  Number(scoreDiffPct) >= 0
                    ? 'text-emerald-400 ml-1'
                    : 'text-amber-400 ml-1'
                }
              >
                {Number(scoreDiffPct) >= 0 ? `+${scoreDiffPct}%` : `${scoreDiffPct}%`}
              </strong>
            </span>
            <span className="text-slate-400">
              GPU 差距：{(activeRunDevice.gpuScore - targetCompareDevice.gpuScore).toLocaleString()} pts ·
              CPU 差距：{(activeRunDevice.cpuScore - targetCompareDevice.cpuScore).toLocaleString()} pts
            </span>
          </div>
        </div>
      </div>

      {/* Collapsible Add Custom Device Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateCustomDevice}
          className="bg-[#0B0E17] border border-cyan-500/40 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              登錄自訂設備跑分數據至對比庫
            </h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              取消
            </button>
          </div>

          {formError && (
            <div className="p-2.5 bg-rose-950/60 border border-rose-500/40 rounded text-xs text-rose-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor="custom-dev-name"
                className="block text-xs text-slate-300 mb-1"
              >
                設備型號名稱
              </label>
              <input
                id="custom-dev-name"
                type="text"
                placeholder="例如：ROG Phone 9 Pro"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="custom-dev-tier"
                className="block text-xs text-slate-300 mb-1"
              >
                硬體分級定位
              </label>
              <select
                id="custom-dev-tier"
                value={newTier}
                onChange={(e) => setNewTier(e.target.value as DeviceTier)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100"
              >
                {DEVICE_TIER_META.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="custom-dev-cpu"
                className="block text-xs text-slate-300 mb-1"
              >
                處理器 (SoC / CPU)
              </label>
              <input
                id="custom-dev-cpu"
                type="text"
                placeholder="例如：Snapdragon 8 Elite"
                value={newCpu}
                onChange={(e) => setNewCpu(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="custom-dev-gpu"
                className="block text-xs text-slate-300 mb-1"
              >
                繪圖晶片 (GPU)
              </label>
              <input
                id="custom-dev-gpu"
                type="text"
                placeholder="例如：Adreno 830"
                value={newGpu}
                onChange={(e) => setNewGpu(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="custom-dev-gpuscore"
                className="block text-xs text-slate-300 mb-1"
              >
                GPU 圖形分數
              </label>
              <input
                id="custom-dev-gpuscore"
                type="number"
                value={newGpuScore}
                onChange={(e) => setNewGpuScore(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="custom-dev-cpuscore"
                className="block text-xs text-slate-300 mb-1"
              >
                CPU 物理分數
              </label>
              <input
                id="custom-dev-cpuscore"
                type="number"
                value={newCpuScore}
                onChange={(e) => setNewCpuScore(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="custom-dev-stability"
                className="block text-xs text-slate-300 mb-1"
              >
                迴圈穩定度 (%)
              </label>
              <input
                id="custom-dev-stability"
                type="number"
                step="0.1"
                value={newStability}
                onChange={(e) => setNewStability(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-100"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-1.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors cursor-pointer"
              >
                儲存並加入排行榜
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-md border border-slate-800">
            {(
              [
                { id: 'all', label: '全部設備' },
                { id: 'Mobile', label: '所有手機' },
                { id: 'Desktop', label: '所有電腦' },
                { id: 'mobile-low', label: '手機低階' },
                { id: 'mobile-mid', label: '手機中階' },
                { id: 'mobile-high', label: '手機高階' },
                { id: 'desktop-low', label: '電腦低階' },
                { id: 'desktop-mid', label: '電腦中階' },
                { id: 'desktop-high', label: '電腦高階' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTierFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tierFilter === f.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="搜尋處理器、GPU 或裝置名稱"
              placeholder="搜尋 RTX 4090 / Snapdragon / M4..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* High-Density Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400">
                <th className="py-2.5 px-3">設備型號 / 平台定位</th>
                <th className="py-2.5 px-3">SoC / CPU & GPU 規格</th>
                <th className="py-2.5 px-3 w-64">3DMark 綜合基準總分</th>
                <th className="py-2.5 px-3 text-right">GPU / CPU</th>
                <th className="py-2.5 px-3 text-right">迴圈穩定度</th>
                <th className="py-2.5 px-3 text-right">峰值溫度</th>
                <th className="py-2.5 px-3 text-right">日常續航</th>
                <th className="py-2.5 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filteredDevices.map((dev) => {
                const isSelected = dev.id === selectedCompareId;
                const barWidth = Math.max(
                  8,
                  Math.min(100, (dev.totalScore / maxTableScore) * 100)
                );
                return (
                  <tr
                    key={dev.id}
                    onClick={() => setSelectedCompareId(dev.id)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/10 hover:bg-amber-500/15'
                        : 'hover:bg-slate-900/70'
                    }`}
                  >
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-100">
                        {dev.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {dev.tierLabel} · TDP {dev.tdpWatts}W · {dev.ramSpec}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      <div>{dev.socOrCpu}</div>
                      <div className="text-[11px] text-slate-400">
                        {dev.gpuName}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <div className="flex-1 h-4 bg-slate-900 rounded overflow-hidden border border-slate-800">
                          <div
                            className={`h-full ${
                              dev.category === 'Desktop'
                                ? 'bg-cyan-500/60'
                                : 'bg-amber-500/60'
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-100 w-16 text-right">
                          {dev.totalScore.toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                      {dev.gpuScore.toLocaleString()} /{' '}
                      {dev.cpuScore.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          dev.stabilityPct >= 97
                            ? 'text-emerald-400 font-semibold'
                            : 'text-amber-400 font-semibold'
                        }
                      >
                        {dev.stabilityPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                      {dev.peakTempC.toFixed(1)}°C
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-cyan-400">
                      {dev.batteryLifeHours.toFixed(1)}h
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCompareId(dev.id);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {isSelected ? '對照中' : '設為對照'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
