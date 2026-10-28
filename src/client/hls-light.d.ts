// hls.js ships no typings for its light build (no subtitles/alt-audio/DRM); its API is the full build's.
declare module 'hls.js/light' {
  export * from 'hls.js';
  export { default } from 'hls.js';
}
