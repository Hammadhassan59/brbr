'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Mapbox GL is heavy (~220 KB gz). Load it lazily — either the first time
// this component mounts or on an explicit "Open map" click. Typed loosely
// so we don't bake in `@types/mapbox-gl` until the user runs `npm i`.
// (The `mapbox-gl` package itself is flagged to be added to package.json.)

interface MapboxGLModule {
  default: unknown;
  Map: new (opts: Record<string, unknown>) => MapboxMap;
  Marker: new (opts?: Record<string, unknown>) => MapboxMarker;
  accessToken: string;
}

interface MapboxMap {
  on: (ev: string, cb: (...args: unknown[]) => void) => void;
  setCenter: (c: [number, number]) => void;
  flyTo: (opts: { center: [number, number]; zoom?: number }) => void;
  remove: () => void;
}

interface MapboxMarker {
  setLngLat: (c: [number, number]) => MapboxMarker;
  addTo: (map: MapboxMap) => MapboxMarker;
  getLngLat: () => { lat: number; lng: number };
  on: (ev: string, cb: () => void) => void;
  remove: () => void;
}

// Pakistan center as fallback. Used only on first mount when no lat/lng is
// set yet — the map pans to the city's center anyway once the user picks a
// city in the parent component.
const PAKISTAN_CENTER: [number, number] = [70.5, 30.5];

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  disabled?: boolean;
  /**
   * Optional center override (e.g. city center from `cities.lat/lng`) used
   * when no pin is set yet. If provided, the map pans here on mount and
   * when the parent's city selection changes.
   */
  centerHint?: { lat: number; lng: number } | null;
}

export function MapPinPicker({
  lat,
  lng,
  onChange,
  disabled = false,
  centerHint,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<MapboxMarker | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Defer mount until user asks — saves 220 KB on the rest of the settings
  // page. Once mounted, the map stays alive for the lifetime of the page.
  useEffect(() => {
    if (!mounted) return;
    if (!containerRef.current) return;
    if (!token) {
      setErr(
        'NEXT_PUBLIC_MAPBOX_TOKEN is not set — map picker unavailable. Drop the pin manually via the lat/lng inputs below.',
      );
      return;
    }

    let cancelled = false;
    setLoading(true);

    // Dynamic import keeps mapbox-gl out of the main bundle. The
    // accompanying stylesheet is pulled in via a DOM-injected <link> below
    // so SSR doesn't try to load CSS. Types are declared in
    // `src/types/mapbox-gl.d.ts` so tsc resolves without @types/mapbox-gl.
    (async () => {
      try {
        const mod = (await import('mapbox-gl')) as MapboxGLModule;
        if (cancelled) return;
        const mapboxgl = (mod.default as MapboxGLModule) || mod;
        mapboxgl.accessToken = token;

        // Inject the stylesheet once. Mapbox GL's own styles are required
        // for markers + controls to render correctly.
        const styleId = 'mapbox-gl-stylesheet';
        if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
          const link = document.createElement('link');
          link.id = styleId;
          link.rel = 'stylesheet';
          link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css';
          document.head.appendChild(link);
        }

        const initialCenter: [number, number] =
          lat != null && lng != null
            ? [lng, lat]
            : centerHint
              ? [centerHint.lng, centerHint.lat]
              : PAKISTAN_CENTER;

        const map = new mapboxgl.Map({
          container: containerRef.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: initialCenter,
          zoom: lat != null ? 14 : centerHint ? 11 : 5,
        });
        mapRef.current = map;

        const marker = new mapboxgl.Marker({
          draggable: !disabled,
          color: '#D4AF37',
        })
          .setLngLat(initialCenter)
          .addTo(map);
        markerRef.current = marker;

        marker.on('dragend', () => {
          const { lat: markerLat, lng: markerLng } = marker.getLngLat();
          onChange(markerLat, markerLng);
        });

        // Click to move the pin — more forgiving than dragging on mobile.
        map.on('click', (e: unknown) => {
          if (disabled) return;
          const lngLat = (e as { lngLat: { lat: number; lng: number } }).lngLat;
          if (!lngLat) return;
          marker.setLngLat([lngLat.lng, lngLat.lat]);
          onChange(lngLat.lat, lngLat.lng);
        });

        setLoading(false);

        // Auto-pin to user's current location if they haven't set one yet.
        // Browser prompts for permission; on allow we fly there and drop
        // the pin. On deny/error we stay on the default view (Pakistan or
        // city-hint). Silent — no user-facing error because it's optional.
        if (
          lat == null &&
          lng == null &&
          !disabled &&
          typeof navigator !== 'undefined' &&
          navigator.geolocation
        ) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled) return;
              const userLat = pos.coords.latitude;
              const userLng = pos.coords.longitude;
              marker.setLngLat([userLng, userLat]);
              map.flyTo({ center: [userLng, userLat], zoom: 15, duration: 1000 });
              onChange(userLat, userLng);
            },
            () => {
              // Permission denied or timeout — leave the default view.
            },
            { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
          );
        }
      } catch (e) {
        if (cancelled) return;
        setErr(
          `Failed to load map: ${e instanceof Error ? e.message : 'unknown error'}`,
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
    // Intentionally skip lat/lng/centerHint/onChange here — initial center
    // is only used the first time, and subsequent changes are handled by
    // the sync effect below. Re-running this effect on every lat/lng
    // keystroke would rebuild the map each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, token, disabled]);

  // Keep marker + camera in sync with outside-in lat/lng or centerHint
  // changes (e.g. user picks a different city). Prevents a drift when
  // parent resets coordinates.
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (lat != null && lng != null) {
      markerRef.current.setLngLat([lng, lat]);
      mapRef.current.flyTo({ center: [lng, lat], zoom: 14 });
    } else if (centerHint) {
      mapRef.current.flyTo({
        center: [centerHint.lng, centerHint.lat],
        zoom: 11,
      });
    }
  }, [lat, lng, centerHint]);

  const hasPin = lat != null && lng != null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Map pin</p>
          <p className="text-xs text-muted-foreground">
            {hasPin
              ? `${lat!.toFixed(5)}, ${lng!.toFixed(5)}`
              : 'Not set — tap the map and drag the pin to your branch'}
          </p>
        </div>
        {!mounted && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMounted(true)}
            disabled={disabled}
          >
            <MapPin className="w-4 h-4 mr-1.5" />
            {hasPin ? 'Adjust on map' : 'Open map'}
          </Button>
        )}
      </div>

      {mounted && (
        <div className="relative">
          <div
            ref={containerRef}
            className="w-full h-[320px] border border-border rounded-lg overflow-hidden bg-secondary/30"
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="w-6 h-6 animate-spin text-gold" />
            </div>
          )}
          {err && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
              <p className="text-xs text-destructive">{err}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
