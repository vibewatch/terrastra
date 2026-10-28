/** GPU housekeeping shared by the WebGL views (globe, flat map, Solar System, sky theatre). */
import type * as THREE from 'three';

/**
 * Compiles every material under `scene` with KHR_parallel_shader_compile, so the first frame that draws it does not
 * stall the main thread on shader links. Resolves when all programs are ready, or after `maxMs` (a slow driver then
 * finishes the job on the next render, as before).
 */
export function warmShaders(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, maxMs = 5000): Promise<void> {
  let timer = 0;
  const late = new Promise<void>(ok => { timer = window.setTimeout(ok, maxMs); });
  let compiled: Promise<unknown>;
  try { compiled = renderer.compileAsync(scene, camera); } catch { compiled = Promise.resolve(); }
  return Promise.race([compiled.then(() => undefined, () => undefined), late]).finally(() => clearTimeout(timer));
}

/**
 * Shrinks a hidden view's drawing buffer to a pixel once it has stayed hidden for `delayMs`. A full-screen buffer
 * (colour, depth and MSAA samples) costs tens to hundreds of MB of GPU memory even while its canvas is hidden.
 * Compiled shaders and textures stay, so the view comes back with its next resize. The delay keeps the reallocation
 * out of scene transitions and quick back-and-forth switches. `onReleased` tells the view to resize on its next show.
 */
export function releaseWhenHidden(renderer: THREE.WebGLRenderer, hidden: () => boolean, onReleased: () => void = () => {}, delayMs = 2000): void {
  window.setTimeout(() => {
    if (!hidden()) return;
    renderer.setSize(1, 1, false);
    onReleased();
  }, delayMs);
}
