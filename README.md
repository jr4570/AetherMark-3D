# AetherMark 3D — 跨平台硬體壓力測試與電池續航基準套件
**(Cross-Platform 3DMark-Style GPU/CPU Stress Benchmark, Thermal Stability Analyzer & Battery Endurance Suite)**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-06B6D4.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-2563EB.svg)](https://www.typescriptlang.org/)
[![Three.js WebGL2](https://img.shields.io/badge/Three.js-WebGL2%20PBR-F59E0B.svg)](https://threejs.org/)

**AetherMark 3D** 是一款開源、模組化、支援跨平台（手機低/中/高階、電腦低/中/高階）的綜合硬體壓力測試與電池續航模擬應用程式。靈感源自 **3DMark (Time Spy / Wild Life / Solar Bay)** 與 **PCMark 電池續航測試**，提供即時 3D WebGL PBR 圖形壓力渲染、多執行緒浮點 CPU 運算壓測、單次與多迴圈（1–50 Loops）長期熱穩定度驗證，以及模擬日常使用（看 4K 影片、120Hz 滑社交軟體、瀏覽網頁、3D 遊戲待機）的電池續航放電分析。

---

## 核心功能特色 (Key Features)

1. **全階層跨平台硬體支援（手機低/中/高階 & 電腦低/中/高階）**
   - 內建四大基準套件：**Nomad Lite 3D**（行動入門/內顯）、**Wild Life Pro**（高階手機/平板）、**Solar Bay Raycore**（中階電競/光學反射）、**Time Spy Apex Extreme**（高階旗艦獨顯與工作站）。
   - 可自由調整 **壓力強度（輕度 Light / 中度 Medium / 重度 High / 極限 Extreme）**、**幾何實例數量（48 至 1,000 組動態 InstancedMesh 碎片）** 與 **渲染解析度縮放（0.75x 至 1.5x）**。

2. **短、長期壓力測試與多迴圈熱穩定度分析 (Single & Multi-Loop Stress Testing)**
   - 支援 **單次基準跑分 (Single Pass)**、**短期連續壓力 (5 Loops)**、**3DMark 標準長期穩定度壓測 (20 Loops)** 與 **自訂迴圈次數與時長**。
   - 自動計算 **迴圈幀率穩定度 (Frame Rate Stability %)**：採用 3DMark 標準公式 $\frac{\text{Worst Loop Score}}{\text{Best Loop Score}} \times 100\%$，並以 `97.0%` 作為通過溫控不降頻認證之門檻。

3. **日常使用電池續航模擬器 (Battery Endurance & Daily Usage Simulator)**
   - 模擬四大日常混合負載階段：**看影片（4K 60fps HDR 串流硬解）**、**滑社交軟體（120Hz 高刷動態牆）**、**日常網頁瀏覽與 DOM 重繪**、**3D 遊戲待機**。
   - 支援自訂電池額定容量（3,000 mAh – 25,000 mAh）、螢幕峰值亮度（150 – 1,000 nits）、螢幕更新率（60Hz / 90Hz / 120Hz / 144Hz）與網路模式（Wi-Fi 6 / 5G / 4G LTE），輸出完整 `100% → 0%` 放電曲線與各階段耗電佔比。

4. **詳細效能與溫控數據報告 & 跨設備六維雷達對比**
   - 即時繪製多通道遙測波形（FPS、生成時間 ms、核心溫度 °C、時脈 MHz、功耗 W）。
   - 內建手機與電腦低中高階代表機型資料庫（RTX 4090、Apple M4 Max、RTX 4060、Radeon 740M、Snapdragon 8 Elite、Apple A18 Pro、Dimensity 8300、Snapdragon 6 Gen 1），支援 **六維度雷達圖** 對比、自訂跑分登錄，以及一鍵匯出 **CSV 時序報表** 與 **JSON 完整檢測報告**。

---

## 軟硬體相容性規範 (Software & Hardware Compatibility)

### 1. 硬體分級與建議測試配置

| 硬體平台分級 | 代表處理器 (SoC / CPU) | 代表繪圖晶片 (GPU) | 最低系統記憶體 | 建議預設套件與壓力等級 |
| :--- | :--- | :--- | :--- | :--- |
| **手機（低階入門）** | Snapdragon 6 Gen 1 / Helio G99 / Exynos 1330 | Adreno 710 / Mali-G57 MC2 | 4 GB RAM | `Nomad Lite 3D` · Light (96 Shards, 0.85x) |
| **手機（中階主流）** | Dimensity 8300 Ultra / Snapdragon 7+ Gen 3 | Mali-G615 MC6 / Adreno 732 | 8 GB RAM | `Wild Life Pro` · Medium (240 Shards, 1.0x) |
| **手機（高階旗艦）** | Snapdragon 8 Elite / Apple A18 Pro / Dimensity 9400 | Adreno 830 / Apple 6-Core GPU / Immortalis-G925 | 12 GB RAM | `Wild Life Pro` · High / 20 Loops 長期穩定度 |
| **電腦（低階 / 內顯）** | Intel Core i3/i5 U-Series / Ryzen 5 8500G / Apple M1 | Intel Iris Xe / Radeon 740M / M1 GPU | 8 GB RAM | `Nomad Lite 3D` · Medium (240 Shards, 1.0x) |
| **電腦（中階電競）** | AMD Ryzen 5 7600X / Core i5-14600K / Apple M3 Pro | GeForce RTX 4060 / Radeon RX 7600 XT | 16 GB RAM | `Solar Bay Raycore` · High (600 Shards, 1.25x) |
| **電腦（高階旗艦）** | AMD Ryzen 9 9950X / Core i9-14900K / Apple M4 Max | GeForce RTX 4090 / RX 7900 XTX / M4 Max 40C | 32 GB+ RAM | `Time Spy Apex Extreme` · Extreme (960 Shards, 20 Loops) |

### 2. 作業系統與瀏覽器執行環境相容性

- **桌面端作業系統**：Windows 10 / 11 (x64 / ARM64)、macOS 13 Ventura 或更新版本 (Apple Silicon / Intel)、Ubuntu 22.04+ / Fedora / Arch Linux。
- **行動端作業系統**：Android 11.0+、iOS 15.4+、iPadOS 15.4+。
- **瀏覽器與圖形 API 支援**：
  - 需支援 **WebGL 2.0** (`EXT_color_buffer_float`, `WEBGL_debug_renderer_info`) 與 **HTML5 Canvas 2D**。
  - 推薦使用 Chrome 115+、Edge 115+、Safari 16.4+、Firefox 118+。
  - **無 GPU / 虛擬桌面自動降級機制 (`isSoftwareGl`)**：當系統偵測到 `SwiftShader`、`llvmpipe` 或遠端虛擬桌面環境時，會自動啟用 `gl.fenceSync` 幀同步節流與像素比保護，確保在雲端容器或 CI 自動化測試環境中依然能穩定運作。

---

## 安裝與跨平台部署流程說明 (Installation & Deployment)

### 環境需求 (Prerequisites)
- **Node.js**: `v20.0.0` 或更新版本 (建議 LTS)
- **套件管理器**: `npm` (v10+) / `pnpm` / `bun`

### 1. 取得原始碼與安裝依賴
```bash
git clone https://github.com/open-hardware-lab/aethermark-3d.git
cd aethermark-3d
npm install
```

### 2. 執行自動化單元測試 (Fast-Feedback Unit Tests)
本專案將核心計分公式、熱力學降頻模型與電池續航演算法完全解耦於 `src/engine/benchmarkMath.ts`，並使用 Node.js 內建測試框架驗證：
```bash
npx --yes tsx --test src/engine/benchmarkMath.test.ts
```

### 3. 啟動本地開發伺服器
```bash
npm run dev
```
啟動後請於瀏覽器開啟 `http://localhost:3000`。支援透過網址參數 `?autostart=1` 直接進入即時壓測或快速檢測模式。

### 4. 建置生產環境版本與跨平台封裝
```bash
# 檢查 TypeScript 型別與語法
npm run lint

# 打包生產級靜態資源至 /dist
npm run build

# 本地預覽生產版本
npm run preview
```
- **部署至 GitHub Pages / Vercel / Netlify / Cloud Run**：將 `/dist` 目錄發布至靜態託管服務，或使用容器映像檔執行。
- **封裝為 Android / iOS 原生應用**：可透過 `@capacitor/core` 指向 `dist` 目錄（`npx cap add android && npx cap sync`）直接打包為行動端安裝包。
- **封裝為 Windows / macOS / Linux 桌面應用**：可透過 Electron 或 Tauri 包裝 `dist` 產出物。

---

## 模組化程式碼架構說明 (Modular Project Architecture)

本專案採用高內聚、低耦合的分層設計，方便開源社群擴充新的 3D 壓測場景、CPU 演算法或硬體資料庫：

```text
aethermark-3d/
├── index.html                        # 響應式入口與字型載入 (Chakra Petch / Plus Jakarta Sans / IBM Plex Mono)
├── metadata.json                     # 應用程式元數據設定
├── package.json                      # 專案依賴與腳本配置
├── README.md                         # 軟硬體相容性、架構與安裝說明文件
└── src/
    ├── types/
    │   └── benchmark.ts              # 所有壓測配置、遙測取樣點、迴圈報告與電池模擬之 TypeScript 介面
    ├── engine/
    │   ├── benchmarkMath.ts          # 純函數核心引擎：3DMark 調和計分、熱力學降頻模型、CPU 浮點壓測核、電池放電求解器
    │   └── benchmarkMath.test.ts     # Node.js 內建單元測試套件 (node:test + node:assert/strict)
    ├── data/
    │   └── hardwareDatabase.ts       # 預設四大壓測套件與跨平台手機/電腦（低中高階）基準裝置資料庫
    ├── utils/
    │   └── hardwareDetector.ts       # WebGL2 渲染器探針、軟硬體環境自動偵測與環境保護機制
    ├── components/
    │   ├── ThreeStressCanvas.tsx     # Three.js 9 件式複合反應爐 3D 場景、InstancedMesh 陣列與可摺疊底部控制塢
    │   ├── TelemetryCharts.tsx       # 科學級 SVG 多通道即時遙測波形、迴圈穩定度橫條圖與六維度雷達圖
    │   ├── BatterySimulatorView.tsx  # 日常使用（4K 影片/120Hz 社群/網頁/遊戲）電池續航與放電模擬視圖
    │   ├── ReportModalView.tsx       # 效能與溫控綜合診斷報告視圖（支援 CSV / JSON 匯出與摘要複製）
    │   ├── HardwareCompareView.tsx   # 跨階層硬體性能排行榜、雙向雷達對比與自訂設備登錄表單
    │   └── CompatibilityDocsView.tsx # 內嵌式軟硬體相容性矩陣與開源部署指南視圖
    ├── App.tsx                       # 主控台狀態協調、導覽切換與即時壓測排程器
    └── main.tsx                      # React 19 根節點掛載入口
```

### 如何擴充自訂測試套件或硬體機型？
1. **新增基準測試預設套件**：於 `src/data/hardwareDatabase.ts` 的 `BENCHMARK_SUITES` 陣列中加入新的 `SuitePreset` 設定（指定目標 `deviceTier`、`instanceCount`、`loopDurationSec` 等），UI 左側快速預設選單即會自動渲染。
2. **新增對照硬體裝置**：於 `src/data/hardwareDatabase.ts` 的 `REFERENCE_HARDWARE_DB` 加入包含 `gpuScore`、`cpuScore` 與 `radar` 六維指標的物件，或直接於應用程式內的「硬體性能對比庫」點擊「新增自訂實測裝置」即時寫入。

---

## 授權條款 (License)
本專案採用 **Apache License 2.0** 開源授權條款，歡迎自由 Fork、提交 Pull Request 或整合至硬體評測工作流中。
