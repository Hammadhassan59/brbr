// Minimal ambient declaration for `mapbox-gl`.
//
// Rationale: `mapbox-gl` is listed in package.json for the marketplace
// features (map pin picker on salon settings, consumer booking address
// picker) but isn't installed in `node_modules` yet — a parallel agent
// runs `npm install` at integration time. @types/mapbox-gl is also not
// pulled in; the map picker uses a tiny handwritten surface area.
//
// Once `npm install` brings in mapbox-gl@^3 and (optionally)
// @types/mapbox-gl, this file can be deleted — the real types supersede
// these stubs.

declare module 'mapbox-gl' {
  // Intentionally loose — the real types are installed alongside mapbox-gl
  // once `npm install` runs. At that point this shim becomes a no-op:
  // ambient declarations merge but a real package's types win for the
  // specific names (Map, Marker, etc.) that it exports.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any;
   
  export = content;
}
