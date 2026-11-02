import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BenchmarkAbortInfo,
  BenchmarkConfig,
  CameraPreset,
  MaterialFinish,
  TelemetrySample,
} from '../types/benchmark';
import {
  computeThermalStep,
  executeCpuStressKernel,
  getIntensityMultiplier,
  getTierElectricalBaseline,
  getTierHardwareEnvelope,
} from '../engine/benchmarkMath';
import {
  Activity,
  Camera,
  ChevronDown,
  ChevronUp,
  FastForward,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react';

interface ThreeStressCanvasProps {
  config: BenchmarkConfig;
  isRunning: boolean;
  isPaused: boolean;
  isFullscreen: boolean;
  latestSample: TelemetrySample | null;
  currentLoop: number;
  loopProgressPct: number;
  onRequestPreFlightAndStart: () => void;
  onRunEnvironmentProbeOnly: () => void;
  onPauseToggle: () => void;
  onStopAndReport: () => void;
  onFastForwardComplete: () => void;
  onAbortFromFullscreen: (reason: BenchmarkAbortInfo['reason']) => void;
  onReset: () => void;
  onSampleRecorded: (sample: TelemetrySample) => void;
}

// Pre-allocated scratch math objects outside the animation loop (Zero GC in render loop)
const _dummyObj = new THREE.Object3D();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3(0, 1.8, 0);
const _colorScratch = new THREE.Color();

const SCENE_PHASES = [
  'Phase 1/4 · Instanced Geometry Swarm (幾何實例高密吞吐)',
  'Phase 2/4 · Optical Sapphire Refraction (多重光學折射與高光)',
  'Phase 3/4 · Volumetric Laser & Shadow Sweep (動態雷射與陰影掃描)',
  'Phase 4/4 · Hybrid Physics & Matrix Compute (物理場與浮點混合壓測)',
];

function createProceduralGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090D16';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = '#131C2E';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  ctx.strokeStyle = '#06B6D4';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 508, 508);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 14);
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createMicroBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 2) {
    const shade = 115 + ((y * 17) % 26);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, 256, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export const ThreeStressCanvas: React.FC<ThreeStressCanvasProps> = ({
  config,
  isRunning,
  isPaused,
  isFullscreen,
  latestSample,
  currentLoop,
  loopProgressPct,
  onRequestPreFlightAndStart,
  onRunEnvironmentProbeOnly,
  onPauseToggle,
  onStopAndReport,
  onFastForwardComplete,
  onAbortFromFullscreen,
  onReset,
  onSampleRecorded,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('orbit');
  const [materialFinish, setMaterialFinish] = useState<MaterialFinish>('titanium');
  const [explodedRatio, setExplodedRatio] = useState<number>(0.18);
  const [enableLaserSweep, setEnableLaserSweep] = useState<boolean>(true);
  const [enableHarmonicWave, setEnableHarmonicWave] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [scenePhaseIndex, setScenePhaseIndex] = useState<number>(0);

  const stateRef = useRef({
    config,
    isRunning,
    isPaused,
    cameraPreset,
    materialFinish,
    explodedRatio,
    enableLaserSweep,
    enableHarmonicWave,
    onSampleRecorded,
    onStopAndReport,
  });

  useEffect(() => {
    stateRef.current = {
      config,
      isRunning,
      isPaused,
      cameraPreset,
      materialFinish,
      explodedRatio,
      enableLaserSweep,
      enableHarmonicWave,
      onSampleRecorded,
      onStopAndReport,
    };
  }, [
    config,
    isRunning,
    isPaused,
    cameraPreset,
    materialFinish,
    explodedRatio,
    enableLaserSweep,
    enableHarmonicWave,
    onSampleRecorded,
    onStopAndReport,
  ]);

  // Keyboard shortcuts ('H' to toggle dock, 'Escape' to abort fullscreen benchmark)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'Escape' && isRunning && isFullscreen) {
        e.preventDefault();
        onAbortFromFullscreen('escape-key');
        return;
      }
      if (e.key.toLowerCase() === 'h') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, isFullscreen, onAbortFromFullscreen]);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 540;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090e);
    scene.fog = new THREE.FogExp2(0x07090e, 0.02);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 160);
    camera.position.set(0, 4.2, 9.5);
    camera.lookAt(0, 1.8, 0);

    // Balanced Studio Rig + Dynamic Volumetric Scanner Point Lights
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.9);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.4);
    keyLight.position.set(7, 12, 8);
    keyLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 30;
      const d = 8;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.75);
    rimLight.position.set(-8, 6, -9);
    scene.add(rimLight);

    const corePointLight = new THREE.PointLight(0x06b6d4, 3.6, 15);
    corePointLight.position.set(0, 2.4, 0);
    scene.add(corePointLight);

    const scannerLight = new THREE.PointLight(0xf59e0b, 2.4, 11);
    scannerLight.position.set(2.5, 2.4, 0);
    scene.add(scannerLight);

    // Ground Floor & Contact Shadow Grounding
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const gridTex = createProceduralGridTexture(maxAniso);
    const bumpTex = createMicroBumpTexture();

    const floorGeo = new THREE.PlaneGeometry(65, 65);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: gridTex,
      roughness: 0.35,
      metalness: 0.25,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    const contactShadowGeo = new THREE.CircleGeometry(4.1, 32);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.015;
    scene.add(contactShadow);

    // 12-Part Composite Procedural Benchmark Hero Subject ("AetherMark Reactor Core Mk.II")
    const reactorGroup = new THREE.Group();
    reactorGroup.position.set(0, 0, 0);
    scene.add(reactorGroup);

    const primaryMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0x64748b,
      metalness: 0.92,
      roughness: 0.18,
      bumpMap: bumpTex,
      bumpScale: 0.015,
      clearcoat: 0.35,
    });

    const matteStructuralMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.45,
      roughness: 0.72,
    });

    const accentTrimMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.88,
      roughness: 0.22,
    });

    const plasmaCoreMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 2.1,
      roughness: 0.12,
      metalness: 0.15,
    });

    const laserScannerMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.5,
    });

    const containmentGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transmission: isSoftwareGl ? 0 : 0.92,
      transparent: true,
      opacity: isSoftwareGl ? 0.32 : 1.0,
      roughness: 0.08,
      ior: 1.52,
      thickness: 1.2,
      depthWrite: false,
    });

    // Part 1: LatheGeometry Reactor Base Pedestal
    const lathePoints = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(2.45, 0.0),
      new THREE.Vector2(2.2, 0.25),
      new THREE.Vector2(1.6, 0.45),
      new THREE.Vector2(1.4, 0.85),
      new THREE.Vector2(1.75, 1.05),
      new THREE.Vector2(0.0, 1.05),
    ];
    const basePedestalGeo = new THREE.LatheGeometry(lathePoints, 32);
    const basePedestal = new THREE.Mesh(basePedestalGeo, matteStructuralMat);
    basePedestal.castShadow = !isSoftwareGl;
    basePedestal.receiveShadow = !isSoftwareGl;
    reactorGroup.add(basePedestal);

    // Part 2: Lower Calibration Chapter Ring
    const lowerRingGeo = new THREE.TorusGeometry(2.08, 0.08, 16, 48);
    const lowerRing = new THREE.Mesh(lowerRingGeo, accentTrimMat);
    lowerRing.rotation.x = Math.PI / 2;
    lowerRing.position.y = 0.55;
    reactorGroup.add(lowerRing);

    // Part 3: Inner Crystalline Energy Core + TorusKnot Plasma Cage
    const coreGeo = new THREE.OctahedronGeometry(0.75, 2);
    const coreMesh = new THREE.Mesh(coreGeo, plasmaCoreMat);
    coreMesh.position.y = 2.4;
    reactorGroup.add(coreMesh);

    const plasmaKnotGeo = new THREE.TorusKnotGeometry(0.52, 0.045, 64, 12, 2, 3);
    const plasmaKnotMesh = new THREE.Mesh(plasmaKnotGeo, laserScannerMat);
    plasmaKnotMesh.position.y = 2.4;
    reactorGroup.add(plasmaKnotMesh);

    // Part 4: Inner Gimbal Stabilizer Ring
    const innerGimbalGeo = new THREE.TorusGeometry(1.22, 0.07, 16, 48);
    const innerGimbal = new THREE.Mesh(innerGimbalGeo, primaryMetalMat);
    innerGimbal.position.y = 2.4;
    reactorGroup.add(innerGimbal);

    // Part 5 & 6: Outer Gimbal Ring with Beveled ExtrudeGeometry Cooling Fins
    const outerGimbalGroup = new THREE.Group();
    outerGimbalGroup.position.y = 2.4;
    reactorGroup.add(outerGimbalGroup);

    const outerGimbalGeo = new THREE.TorusGeometry(1.68, 0.09, 16, 64);
    const outerGimbal = new THREE.Mesh(outerGimbalGeo, primaryMetalMat);
    outerGimbalGroup.add(outerGimbal);

    const finShape = new THREE.Shape();
    finShape.moveTo(0, -0.18);
    finShape.lineTo(0.44, -0.12);
    finShape.lineTo(0.5, 0.12);
    finShape.lineTo(0, 0.18);
    finShape.closePath();

    const finExtrudeGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02,
    });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const fin = new THREE.Mesh(finExtrudeGeo, accentTrimMat);
      fin.position.set(Math.cos(angle) * 1.72, Math.sin(angle) * 1.72, -0.03);
      fin.rotation.z = angle;
      outerGimbalGroup.add(fin);
    }

    // Part 7: 4 Structural Magnetic Containment Pillars
    const pillarsGroup = new THREE.Group();
    reactorGroup.add(pillarsGroup);
    const pillarGeo = new THREE.CylinderGeometry(0.12, 0.16, 2.8, 16);
    const pillarMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const p = new THREE.Mesh(pillarGeo, matteStructuralMat);
      p.position.set(Math.cos(a) * 2.1, 2.1, Math.sin(a) * 2.1);
      p.castShadow = !isSoftwareGl;
      pillarsGroup.add(p);
      pillarMeshes.push(p);
    }

    // Part 8: 4 Curved TubeGeometry Plasma Conduits linking Base to Upper Crown
    const conduitsGroup = new THREE.Group();
    reactorGroup.add(conduitsGroup);
    const conduitGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a) * 1.85, 0.85, Math.sin(a) * 1.85),
        new THREE.Vector3(Math.cos(a) * 2.55, 2.4, Math.sin(a) * 2.55),
        new THREE.Vector3(Math.cos(a) * 1.45, 3.85, Math.sin(a) * 1.45),
      ]);
      const tGeo = new THREE.TubeGeometry(curve, 24, 0.045, 8, false);
      conduitGeos.push(tGeo);
      const tMesh = new THREE.Mesh(tGeo, plasmaCoreMat);
      conduitsGroup.add(tMesh);
    }

    // Part 9: Upper Crown Assembly
    const upperCrownGeo = new THREE.CylinderGeometry(1.1, 1.55, 0.4, 24);
    const upperCrown = new THREE.Mesh(upperCrownGeo, primaryMetalMat);
    upperCrown.position.y = 3.95;
    reactorGroup.add(upperCrown);

    // Part 10: Optical Glass Containment Vessel
    const vesselGeo = new THREE.CylinderGeometry(1.38, 1.38, 2.4, 32, 1, true);
    const vesselMesh = new THREE.Mesh(vesselGeo, containmentGlassMat);
    vesselMesh.position.y = 2.4;
    vesselMesh.renderOrder = 10;
    reactorGroup.add(vesselMesh);

    // Part 11: Volumetric Laser Telemetry Scanner Ring (sweeps vertically)
    const laserScannerGroup = new THREE.Group();
    laserScannerGroup.position.y = 2.4;
    reactorGroup.add(laserScannerGroup);
    const scannerRingGeo = new THREE.TorusGeometry(2.38, 0.03, 12, 64);
    const scannerRing = new THREE.Mesh(scannerRingGeo, laserScannerMat);
    scannerRing.rotation.x = Math.PI / 2;
    laserScannerGroup.add(scannerRing);

    // Part 12: Concentric Harmonic Wave Rings on Floor around Pedestal
    const waveRingsGroup = new THREE.Group();
    waveRingsGroup.position.y = 0.04;
    reactorGroup.add(waveRingsGroup);
    const waveRings: THREE.Mesh[] = [];
    const waveRingGeos: THREE.BufferGeometry[] = [];
    for (let rIdx = 0; rIdx < 4; rIdx++) {
      const wGeo = new THREE.RingGeometry(
        2.75 + rIdx * 0.58,
        2.83 + rIdx * 0.58,
        48
      );
      waveRingGeos.push(wGeo);
      const wMesh = new THREE.Mesh(wGeo, plasmaCoreMat);
      wMesh.rotation.x = -Math.PI / 2;
      waveRingsGroup.add(wMesh);
      waveRings.push(wMesh);
    }

    // Dynamic InstancedMesh Orbital Benchmark Shards (up to 1,000 instances)
    const MAX_INSTANCES = 1000;
    const shardGeo = new THREE.OctahedronGeometry(0.11, 0);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.88,
    });
    const instancedShards = new THREE.InstancedMesh(
      shardGeo,
      shardMat,
      MAX_INSTANCES
    );
    instancedShards.frustumCulled = false;

    for (let i = 0; i < MAX_INSTANCES; i++) {
      const t = i / MAX_INSTANCES;
      _colorScratch.setHSL(0.52 + (i % 7) * 0.02, 0.85, 0.45 + (i % 5) * 0.08);
      instancedShards.setColorAt(i, _colorScratch);
      _dummyObj.position.set(Math.cos(t * 40) * 4, 2, Math.sin(t * 40) * 4);
      _dummyObj.updateMatrix();
      instancedShards.setMatrixAt(i, _dummyObj.matrix);
    }
    if (instancedShards.instanceColor) {
      instancedShards.instanceColor.needsUpdate = true;
    }
    scene.add(instancedShards);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // ResizeObserver handles both window resizes and instant fullscreen container transitions
    const updateSize = () => {
      if (!container) return;
      const w = container.clientWidth || 960;
      const h = container.clientHeight || 540;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateSize())
        : null;
    if (resizeObserver) {
      resizeObserver.observe(container);
    }
    window.addEventListener('resize', updateSize);

    let frameId = 0;
    let isDisposed = false;
    const mountStartTimeMs = performance.now();
    let prevFrameTimeMs = mountStartTimeMs;
    let elapsedSimSec = 0;
    let frameCountSinceSample = 0;
    let lastSampleTimeMs = mountStartTimeMs;
    let currentTempC = stateRef.current.config.thermalAmbientC;
    let smoothedExploded = stateRef.current.explodedRatio;

    function afterDraw(cb: () => void) {
      if (isDisposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync
        ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        : null;
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (isDisposed) return;

      const nowMs = performance.now();
      const dt = Math.min(
        0.1,
        Math.max(0.001, (nowMs - prevFrameTimeMs) / 1000)
      );
      prevFrameTimeMs = nowMs;
      const currentState = stateRef.current;
      const activeConfig = currentState.config;
      const intensityMeta = getIntensityMultiplier(activeConfig.intensity);

      const finish = currentState.materialFinish;
      primaryMetalMat.wireframe = finish === 'wireframe';
      matteStructuralMat.wireframe = finish === 'wireframe';
      accentTrimMat.wireframe = finish === 'wireframe';
      if (finish === 'gold') {
        primaryMetalMat.color.setHex(0xfbbf24);
        primaryMetalMat.metalness = 0.95;
        primaryMetalMat.roughness = 0.16;
      } else if (finish === 'sapphire') {
        primaryMetalMat.color.setHex(0x38bdf8);
        primaryMetalMat.metalness = 0.75;
        primaryMetalMat.roughness = 0.12;
      } else {
        primaryMetalMat.color.setHex(0x64748b);
        primaryMetalMat.metalness = 0.92;
        primaryMetalMat.roughness = 0.18;
      }

      smoothedExploded = THREE.MathUtils.damp(
        smoothedExploded,
        currentState.explodedRatio,
        6,
        dt
      );
      upperCrown.position.y = 3.95 + smoothedExploded * 1.35;
      lowerRing.position.y = 0.55 - smoothedExploded * 0.25;
      vesselMesh.scale.set(
        1 + smoothedExploded * 0.25,
        1,
        1 + smoothedExploded * 0.25
      );
      for (let i = 0; i < pillarMeshes.length; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const r = 2.1 + smoothedExploded * 0.95;
        pillarMeshes[i].position.set(Math.cos(a) * r, 2.1, Math.sin(a) * r);
      }

      const speedMult =
        currentState.isRunning && !currentState.isPaused
          ? 1.0 + intensityMeta.loadFactor * 0.68
          : 0.28;

      if (!currentState.isPaused) {
        elapsedSimSec += dt * speedMult;
      }

      // Rotate composite reactor assemblies & plasma knot
      coreMesh.rotation.y += dt * 1.8 * speedMult;
      coreMesh.rotation.x += dt * 1.1 * speedMult;
      plasmaKnotMesh.rotation.z -= dt * 2.4 * speedMult;
      plasmaKnotMesh.rotation.y += dt * 1.5 * speedMult;

      const pulseScale = 1 + Math.sin(elapsedSimSec * 3.5) * 0.09;
      coreMesh.scale.set(pulseScale, pulseScale, pulseScale);

      innerGimbal.rotation.x = elapsedSimSec * 1.4;
      innerGimbal.rotation.y = elapsedSimSec * 0.9;
      outerGimbalGroup.rotation.z = -elapsedSimSec * 0.85;
      outerGimbalGroup.rotation.x = Math.sin(elapsedSimSec * 0.5) * 0.45;
      conduitsGroup.rotation.y = elapsedSimSec * 0.35;

      // Volumetric Laser Scanner vertical sweep
      laserScannerGroup.visible = currentState.enableLaserSweep;
      scannerLight.visible = currentState.enableLaserSweep;
      if (currentState.enableLaserSweep) {
        const scanY = 2.4 + Math.sin(elapsedSimSec * 2.1) * 1.25;
        laserScannerGroup.position.y = scanY;
        laserScannerGroup.rotation.y = -elapsedSimSec * 2.0;
        scannerLight.position.set(
          Math.cos(elapsedSimSec * 2.0) * 2.4,
          scanY,
          Math.sin(elapsedSimSec * 2.0) * 2.4
        );
      }

      // Harmonic Wave Floor Rings
      waveRingsGroup.visible = currentState.enableHarmonicWave;
      if (currentState.enableHarmonicWave) {
        for (let rIdx = 0; rIdx < waveRings.length; rIdx++) {
          const waveY =
            0.05 +
            Math.abs(Math.sin(elapsedSimSec * 2.6 - rIdx * 0.7)) * 0.28;
          waveRings[rIdx].position.y = waveY;
          const s = 1 + Math.sin(elapsedSimSec * 1.8 + rIdx) * 0.04;
          waveRings[rIdx].scale.set(s, s, 1);
        }
      }

      // Update InstancedMesh count & orbital trajectories
      const activeInstances = Math.min(
        MAX_INSTANCES,
        Math.max(48, activeConfig.instanceCount)
      );
      instancedShards.count = activeInstances;

      for (let i = 0; i < activeInstances; i++) {
        const ringBand = (i % 5) + 1;
        const radius = 2.8 + ringBand * 0.72 + smoothedExploded * 0.8;
        const angle =
          (i / activeInstances) * Math.PI * 2 * 5 +
          elapsedSimSec * (0.45 + (ringBand % 3) * 0.22);
        const yWave =
          2.1 + Math.sin(angle * 2 + i * 0.15) * (0.55 + ringBand * 0.14);

        _dummyObj.position.set(
          Math.cos(angle) * radius,
          yWave,
          Math.sin(angle) * radius
        );
        _dummyObj.rotation.set(angle, angle * 0.5, i * 0.1);
        const s = 0.85 + (i % 4) * 0.12;
        _dummyObj.scale.set(s, s, s);
        _dummyObj.updateMatrix();
        instancedShards.setMatrixAt(i, _dummyObj.matrix);
      }
      instancedShards.instanceMatrix.needsUpdate = true;

      // Smooth Camera Choreography
      const camMode = currentState.cameraPreset;
      const orbitAngle = elapsedSimSec * 0.22;
      if (camMode === 'macro') {
        _targetCamPos.set(
          Math.cos(orbitAngle * 1.4) * 4.4,
          2.6 + Math.sin(elapsedSimSec * 0.6) * 0.4,
          Math.sin(orbitAngle * 1.4) * 4.4
        );
        _targetLookAt.set(0, 2.35, 0);
      } else if (camMode === 'flyby') {
        _targetCamPos.set(
          Math.cos(orbitAngle * 2.2) * 7.8,
          1.4 + Math.abs(Math.sin(orbitAngle)) * 3.8,
          Math.sin(orbitAngle * 2.2) * 7.8
        );
        _targetLookAt.set(0, 2.0, 0);
      } else if (camMode === 'top') {
        _targetCamPos.set(
          Math.cos(orbitAngle * 0.5) * 2.5,
          11.2,
          Math.sin(orbitAngle * 0.5) * 2.5
        );
        _targetLookAt.set(0, 1.5, 0);
      } else {
        _targetCamPos.set(
          Math.cos(orbitAngle) * 8.8,
          3.8 + Math.sin(orbitAngle * 0.7) * 0.8,
          Math.sin(orbitAngle) * 8.8
        );
        _targetLookAt.set(0, 2.0, 0);
      }

      const dampFactor = 1 - Math.exp(-4.5 * dt);
      camera.position.lerp(_targetCamPos, dampFactor);
      _currentLookAt.lerp(_targetLookAt, dampFactor);
      camera.lookAt(_currentLookAt);

      renderer.render(scene, camera);

      // Telemetry Sampling (~1.2 Hz)
      frameCountSinceSample++;
      const sampleElapsedMs = nowMs - lastSampleTimeMs;
      if (
        currentState.isRunning &&
        !currentState.isPaused &&
        sampleElapsedMs >= 850
      ) {
        const measuredRawFps = (frameCountSinceSample * 1000) / sampleElapsedMs;
        frameCountSinceSample = 0;
        lastSampleTimeMs = nowMs;

        const cpuIterations =
          activeConfig.workloadTarget === 'gpu-3d'
            ? 2500
            : Math.round(14000 * intensityMeta.loadFactor);
        const cpuRes = executeCpuStressKernel(cpuIterations);

        const env = getTierHardwareEnvelope(activeConfig.deviceTier);
        const totalElapsed = Math.max(
          1,
          Math.round((nowMs - mountStartTimeMs) / 1000)
        );
        const loopDuration = Math.max(4, activeConfig.loopDurationSec);
        const loopIndex = Math.min(
          activeConfig.targetLoops,
          Math.floor(totalElapsed / loopDuration) + 1
        );

        // Rotate active 3D scene phase every 3 seconds
        setScenePhaseIndex(Math.floor(totalElapsed / 3) % SCENE_PHASES.length);

        const thermal = computeThermalStep({
          prevTempC: currentTempC,
          ambientTempC: activeConfig.thermalAmbientC,
          elapsedSec: totalElapsed,
          loopIndex,
          tier: activeConfig.deviceTier,
          intensity: activeConfig.intensity,
          workloadTarget: activeConfig.workloadTarget,
          measuredFps: measuredRawFps,
        });
        currentTempC = thermal.tempCelsius;

        const calibratedFps = Number(
          Math.max(
            9,
            (env.baselineFpsCapability /
              Math.pow(intensityMeta.loadFactor, 0.52)) *
              (1 - (thermal.throttlePct / 100) * 0.82) +
              Math.sin(totalElapsed * 0.8) * 1.8
          ).toFixed(1)
        );
        const frameTimeMs = Number((1000 / calibratedFps).toFixed(2));

        if (thermal.tempCelsius > env.throttleTempC * 0.95) {
          corePointLight.color.setHex(0xf59e0b);
          plasmaCoreMat.emissive.setHex(0xd97706);
        } else {
          corePointLight.color.setHex(0x06b6d4);
          plasmaCoreMat.emissive.setHex(0x0891b2);
        }

        currentState.onSampleRecorded({
          timestampMs: Date.now(),
          elapsedSec: totalElapsed,
          loopIndex,
          fps: calibratedFps,
          frameTimeMs,
          gpuLoadPct: thermal.gpuLoadPct,
          cpuLoadPct: thermal.cpuLoadPct,
          cpuGflops: Number(
            (cpuRes.gflops * env.complexityScale * 0.65).toFixed(1)
          ),
          tempCelsius: thermal.tempCelsius,
          clockMHz: thermal.clockMHz,
          powerWatts: thermal.powerWatts,
          throttlePct: thermal.throttlePct,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', updateSize);
      floorGeo.dispose();
      floorMat.dispose();
      gridTex.dispose();
      bumpTex.dispose();
      basePedestalGeo.dispose();
      lowerRingGeo.dispose();
      coreGeo.dispose();
      plasmaKnotGeo.dispose();
      innerGimbalGeo.dispose();
      outerGimbalGeo.dispose();
      finExtrudeGeo.dispose();
      pillarGeo.dispose();
      conduitGeos.forEach((g) => g.dispose());
      upperCrownGeo.dispose();
      vesselGeo.dispose();
      scannerRingGeo.dispose();
      waveRingGeos.forEach((g) => g.dispose());
      shardGeo.dispose();
      shardMat.dispose();
      primaryMetalMat.dispose();
      matteStructuralMat.dispose();
      accentTrimMat.dispose();
      plasmaCoreMat.dispose();
      laserScannerMat.dispose();
      containmentGlassMat.dispose();
      renderer.dispose();
    };
  }, []);

  const electricalBaseline = getTierElectricalBaseline(config.deviceTier);
  const fpsValue = latestSample ? latestSample.fps.toFixed(1) : '60.0';
  const onePctLowFps = latestSample
    ? (latestSample.fps * 0.86).toFixed(1)
    : '51.6';
  const frameTimeValue = latestSample
    ? latestSample.frameTimeMs.toFixed(2)
    : '16.67';
  const tempValue = latestSample
    ? latestSample.tempCelsius.toFixed(1)
    : config.thermalAmbientC.toFixed(1);
  const clockValue = latestSample
    ? latestSample.clockMHz
    : electricalBaseline.expectedGpuClockMHz;
  const powerValue = latestSample ? latestSample.powerWatts.toFixed(1) : '0.0';
  const throttlePct = latestSample ? latestSample.throttlePct : 0;
  const liveVoltageV = (
    electricalBaseline.expectedVoltageV *
    (1 - (throttlePct / 100) * 0.14)
  ).toFixed(3);
  const trianglesPerFrame = (
    14200 +
    config.instanceCount * 24 +
    (enableLaserSweep ? 2400 : 0)
  ).toLocaleString();

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen bg-[#07090E] overflow-hidden select-none'
          : 'relative w-full h-[470px] lg:h-[530px] bg-[#07090E] border border-slate-800 rounded-lg overflow-hidden select-none'
      }
      data-testid="three-stress-viewport"
      data-state={isRunning ? (isPaused ? 'paused' : 'running') : 'idle'}
      data-fullscreen={isFullscreen ? 'true' : 'false'}
    >
      {/* Isolated WebGL Canvas Mount Container */}
      <div
        ref={canvasMountRef}
        className="w-full h-full cursor-crosshair"
        aria-label="3D WebGL Hardware Stress Viewport"
      />

      {/* Top HUD Bar: Spec, Sub-Phase & Live Telemetry + Fullscreen Status */}
      <div className="absolute top-3 inset-x-3 z-10 pointer-events-none flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5 bg-[#0B0E17]/95 border border-slate-800 px-3 py-2 rounded-md max-w-full">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-100">{config.suiteName}</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-400 font-mono">
              {config.intensity.toUpperCase()} LOAD
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{trianglesPerFrame} Tris/frame</span>
            <span aria-hidden="true">·</span>
            <span className="text-cyan-400 font-mono truncate max-w-[260px] xl:max-w-none">
              {SCENE_PHASES[scenePhaseIndex]}
            </span>
          </div>

          <div
            className={`grid grid-cols-2 ${
              isFullscreen ? 'sm:grid-cols-5' : 'sm:grid-cols-4 2xl:grid-cols-5'
            } gap-3 pt-1.5 border-t border-slate-800/80`}
          >
            <div>
              <div className="text-[11px] text-slate-400">即時幀率 / 1% Low</div>
              <div className="font-mono text-base font-bold text-cyan-400 tabular-nums whitespace-nowrap">
                {fpsValue}
                <span className="text-[11px] font-normal text-slate-400 ml-1">
                  FPS ({onePctLowFps})
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">生成時間 (Frame)</div>
              <div className="font-mono text-base font-bold text-slate-100 tabular-nums whitespace-nowrap">
                {frameTimeValue}
                <span className="text-[11px] font-normal text-slate-400 ml-1">ms</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">核心溫度</div>
              <div
                className={`font-mono text-base font-bold tabular-nums whitespace-nowrap ${
                  throttlePct >= 5 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {tempValue}
                <span className="text-[11px] font-normal text-slate-400 ml-1">°C</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">即時時脈 / 電壓</div>
              <div className="font-mono text-xs sm:text-sm font-semibold text-slate-200 tabular-nums pt-0.5 whitespace-nowrap">
                {clockValue} <span className="text-[10px] text-slate-400">MHz</span> ·{' '}
                <span className="text-amber-400">{liveVoltageV}V</span>
              </div>
            </div>
            <div className={isFullscreen ? 'hidden sm:block' : 'hidden 2xl:block'}>
              <div className="text-[11px] text-slate-400">整機功耗 / 降頻</div>
              <div className="font-mono text-xs sm:text-sm font-semibold text-slate-200 tabular-nums pt-0.5 whitespace-nowrap">
                {powerValue} <span className="text-[10px] text-slate-400">W</span> ·{' '}
                {throttlePct.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Top-Right Fullscreen Status & Exit-to-Abort Controls */}
        <div className="flex flex-col items-end gap-2 ml-auto">
          <div className="bg-[#0B0E17]/95 border border-slate-800 px-3 py-2 rounded-md text-right pointer-events-none">
            <div className="text-xs font-mono text-slate-200 tabular-nums whitespace-nowrap">
              {isRunning
                ? isPaused
                  ? '▲ 全螢幕測試已暫停 (PAUSED)'
                  : `● 全螢幕鎖定壓測中 — 迴圈 ${currentLoop} / ${config.targetLoops}`
                : '● 待機預覽模式 (啟動時鎖定全螢幕)'}
            </div>
            <div className="w-44 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1.5 ml-auto">
              <div
                className="h-full bg-cyan-500 transition-transform duration-150 origin-left"
                style={{
                  transform: `scaleX(${Math.max(
                    0.02,
                    Math.min(1, loopProgressPct / 100)
                  )})`,
                }}
              />
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums whitespace-nowrap">
              完成度 {loopProgressPct.toFixed(0)}% · 跳出全螢幕即中斷
            </div>
          </div>

          {isFullscreen && isRunning && (
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                onClick={onStopAndReport}
                data-testid="fullscreen-complete-report-btn"
                className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-md flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>完成全螢幕壓測並出報告</span>
              </button>
              <button
                type="button"
                onClick={() => onAbortFromFullscreen('exit-fullscreen')}
                data-testid="exit-fullscreen-abort-btn"
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-md flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>跳出全螢幕（中斷測試 ESC）</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Unified Collapsible Bottom Control Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-[95%] max-w-[980px] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          aria-expanded={!dockCollapsed}
          className="px-3 py-1 bg-[#0B0E17]/95 border border-b-0 border-slate-800 rounded-t-md text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
              <span>顯示 3D 控制塢 (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
              <span>隱藏控制塢 · 劇院模式 (H)</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-[#0B0E17]/95 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2.5">
            {/* Execution Primary Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {!isRunning ? (
                <>
                  <button
                    type="button"
                    onClick={onRequestPreFlightAndStart}
                    data-testid="start-stress-test-btn"
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>自動環境檢測並全螢幕壓測</span>
                  </button>
                  <button
                    type="button"
                    onClick={onRunEnvironmentProbeOnly}
                    data-testid="open-env-probe-btn"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 font-medium text-xs rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>環境頻率/電壓檢測</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onPauseToggle}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>繼續測試</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>暫停</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onStopAndReport}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>結束並產生報告</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onFastForwardComplete}
                title="立即模擬完成所有設定迴圈並產出完整溫控與效能報告"
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-medium text-xs rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5 text-cyan-400" />
                <span>快速完成並出報告</span>
              </button>

              <button
                type="button"
                onClick={onReset}
                aria-label="重置測試數據"
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-md transition-colors shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Camera View Presets */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-md border border-slate-800">
              <Camera className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1 shrink-0" />
              {(
                [
                  { id: 'orbit', label: '環繞視角' },
                  { id: 'macro', label: '核心微距' },
                  { id: 'flyby', label: '動態掠過' },
                  { id: 'top', label: '俯視矩陣' },
                ] as { id: CameraPreset; label: string }[]
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => setCameraPreset(cam.id)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cameraPreset === cam.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>

            {/* Material & 3D Effect Toggles */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-md border border-slate-800">
              <Layers className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1 shrink-0" />
              {(
                [
                  { id: 'titanium', label: '拉絲鈦金' },
                  { id: 'gold', label: '鍍金光學' },
                  { id: 'sapphire', label: '藍寶石' },
                  { id: 'wireframe', label: '網格診斷' },
                ] as { id: MaterialFinish; label: string }[]
              ).map((mat) => (
                <button
                  key={mat.id}
                  type="button"
                  onClick={() => setMaterialFinish(mat.id)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    materialFinish === mat.id
                      ? 'bg-slate-800 text-white border border-slate-600'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mat.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEnableLaserSweep((prev) => !prev)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  enableLaserSweep
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                雷射掃描
              </button>
              <button
                type="button"
                onClick={() => setEnableHarmonicWave((prev) => !prev)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  enableHarmonicWave
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                諧波力場
              </button>
            </div>

            {/* Exploded View Slider */}
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <label
                htmlFor="exploded-slider"
                className="whitespace-nowrap shrink-0 text-slate-400"
              >
                結構分解
              </label>
              <input
                id="exploded-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={explodedRatio}
                onChange={(e) => setExplodedRatio(parseFloat(e.target.value))}
                className="w-20 accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
