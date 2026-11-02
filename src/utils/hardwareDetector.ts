import { DetectedHardwareInfo } from '../types/benchmark';

/**
 * Probes WebGL2 / WebGL debug renderer info, navigator hardwareConcurrency, deviceMemory, and Battery API.
 */
export function detectSystemHardware(): DetectedHardwareInfo {
  let gpuRenderer = 'WebGL 2.0 Hardware Accelerated GPU';
  let gpuVendor = 'Standard Graphics Vendor';
  let isSoftwareGl = true;

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl2') ||
        (canvas.getContext('webgl') as WebGLRenderingContext | null);
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          gpuRenderer = String(
            gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || gpuRenderer
          );
          gpuVendor = String(
            gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || gpuVendor
          );
        } else {
          gpuRenderer = String(gl.getParameter(gl.RENDERER) || gpuRenderer);
          gpuVendor = String(gl.getParameter(gl.VENDOR) || gpuVendor);
        }
        isSoftwareGl =
          /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
            gpuRenderer
          );
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {
      isSoftwareGl = true;
    }
  }

  const nav = typeof navigator !== 'undefined' ? (navigator as any) : {};
  const cpuCores = Number(nav.hardwareConcurrency) || 8;
  const deviceMemoryGb = Number(nav.deviceMemory) || 16;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  const platformSummary = isMobile
    ? 'Mobile / ARM64 Architecture'
    : 'Desktop / x86_64 or ARM64 Workstation';

  const width = typeof window !== 'undefined' ? window.screen.width : 1920;
  const height = typeof window !== 'undefined' ? window.screen.height : 1080;
  const pixelRatio =
    typeof window !== 'undefined' ? Number(window.devicePixelRatio.toFixed(2)) : 1;

  return {
    gpuRenderer,
    gpuVendor,
    cpuCores,
    deviceMemoryGb,
    userAgentSummary: platformSummary,
    isSoftwareGl,
    screenResolution: `${width}×${height}`,
    pixelRatio,
    batterySupported: typeof nav.getBattery === 'function',
    initialBatteryPct: null,
  };
}
