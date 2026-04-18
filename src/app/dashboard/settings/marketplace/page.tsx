'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Home,
  Loader2,
  ShieldAlert,
  Store,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  showActionError,
  handleSubscriptionError,
} from '@/components/paywall-dialog';
import { useAppStore } from '@/store/app-store';
import { usePermission } from '@/lib/permissions';
import {
  getMarketplaceSettings,
  updateMarketplaceListing,
  updateHomeServiceSettings,
} from '@/app/actions/marketplace-settings';
import {
  allRequirementsMet,
  type BranchPhoto,
  type ListingRequirements,
  type MarketplaceSettingsData,
  type SalonGenderType,
} from '@/lib/marketplace/settings-shared';
import { PhotoUploader } from './components/photo-uploader';
import { MapPinPicker } from './components/map-pin-picker';
import { AboutEditor } from './components/about-editor';
import { CitySelect } from './components/city-select';
import { GenderSelect } from './components/gender-select';

/**
 * Settings → iCut Marketplace
 *
 * Per-branch opt-in. Two sections:
 *   A) At-salon listing — photos, about, map pin, city, ≥1 active service.
 *      Toggle is disabled until every requirement is met.
 *   B) Home service — toggle + radius (km, default 8).
 *
 * Gated by the `manage_salon` permission (owners/partners bypass via
 * lockout-safe roles — same pattern as the main settings page).
 *
 * Schema dependency: migration 041 adds every column this page reads. If
 * the probe returns `schemaReady=false`, we render a soft "coming soon"
 * banner and disable the save buttons so the user isn't blocked by
 * confusing DB errors.
 */

export default function MarketplaceSettingsPage() {
  const canManage = usePermission('manage_salon');
  const currentBranch = useAppStore((s) => s.currentBranch);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<MarketplaceSettingsData | null>(null);

  // Edit buffer — lets the user stage changes across photos/about/pin/city
  // and save in one call.
  const [about, setAbout] = useState('');
  const [cityId, setCityId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [photos, setPhotos] = useState<BranchPhoto[]>([]);
  const [genderType, setGenderType] = useState<SalonGenderType | null>(null);
  const [listed, setListed] = useState(false);

  // Home-service buffer.
  const [homeOn, setHomeOn] = useState(false);
  const [radiusKm, setRadiusKm] = useState<string>('8');

  const reload = useCallback(async () => {
    if (!currentBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await getMarketplaceSettings(currentBranch.id);
    if (res.error || !res.data) {
      if (res.error) toast.error(res.error);
      setLoading(false);
      return;
    }
    const b = res.data.branch;
    setData(res.data);
    setAbout(b.about ?? '');
    setCityId(b.city_id);
    setLat(b.lat);
    setLng(b.lng);
    setPhotos(b.photos ?? []);
    setGenderType(b.gender_type);
    setListed(b.listed_on_marketplace);
    setHomeOn(b.offers_home_service);
    setRadiusKm(
      b.home_service_radius_km != null ? String(b.home_service_radius_km) : '8',
    );
    setLoading(false);
  }, [currentBranch]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Live-recompute requirements from the edit buffer so the checklist +
  // toggle-disabled state react as the user fills things in.
  const liveRequirements: ListingRequirements = useMemo(() => {
    if (!data) {
      return {
        hasThreePhotos: false,
        hasAbout: false,
        hasPin: false,
        hasCity: false,
        hasActiveService: false,
        hasGenderType: false,
      };
    }
    return {
      hasThreePhotos: photos.length >= 3,
      hasAbout: about.trim().length >= 100,
      hasPin: lat != null && lng != null,
      hasCity: cityId != null,
      hasActiveService: data.requirements.hasActiveService,
      hasGenderType: genderType != null,
    };
  }, [data, photos, about, lat, lng, cityId, genderType]);

  const canList = allRequirementsMet(liveRequirements);

  // Map center hint — reserved for when `cities` surfaces lat/lng through
  // the action. Today the cities list only carries id/slug/name, so we pass
  // null and the map defaults to the pin (or PK center on first mount).
  const cityCenter: { lat: number; lng: number } | null = null;

  async function saveListing(nextListed: boolean) {
    if (!currentBranch) return;
    setSaving(true);
    try {
      const res = await updateMarketplaceListing({
        branchId: currentBranch.id,
        listed_on_marketplace: nextListed,
        about: about || null,
        city_id: cityId,
        lat,
        lng,
        gender_type: genderType,
      });
      if (showActionError(res.error)) return;
      setListed(nextListed);
      toast.success(
        nextListed ? 'Listed on iCut marketplace' : 'Saved — listing off',
      );
      // Pull fresh data so requirements.hasActiveService stays accurate if
      // the active-service count changed elsewhere.
      await reload();
    } catch (err) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function saveHomeService(nextHomeOn: boolean) {
    if (!currentBranch) return;
    const radiusNum = Number(radiusKm);
    if (nextHomeOn && (!Number.isFinite(radiusNum) || radiusNum <= 0)) {
      toast.error('Enter a radius greater than 0 km');
      return;
    }
    setSaving(true);
    try {
      const res = await updateHomeServiceSettings({
        branchId: currentBranch.id,
        offers_home_service: nextHomeOn,
        home_service_radius_km: nextHomeOn ? radiusNum : null,
      });
      if (showActionError(res.error)) return;
      setHomeOn(nextHomeOn);
      toast.success(
        nextHomeOn ? 'Home service enabled' : 'Home service disabled',
      );
    } catch (err) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // ---- Guards -------------------------------------------------------

  if (!canManage) {
    return (
      <div className="space-y-6">
        <Card className="border-border">
          <CardContent className="p-6 sm:p-10 text-center space-y-4">
            <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">
              You don&rsquo;t have access to this page
            </p>
            <p className="text-xs text-muted-foreground">
              Ask your salon owner to grant you the &ldquo;Manage
              salon&rdquo; permission.
            </p>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gold hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to settings
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !currentBranch) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-muted rounded-lg animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <Card className="border-border">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Could not load marketplace settings for this branch.
          </CardContent>
        </Card>
      </div>
    );
  }

  const schemaReady = data.schemaReady;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to settings
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold mt-2">iCut Marketplace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Let consumers discover and book{' '}
          <span className="font-medium text-foreground">{data.branch.name}</span>{' '}
          on icut.pk.
        </p>
      </div>

      {/* Schema-not-ready banner */}
      {!schemaReady && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Marketplace backend not live yet
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
                Migration 041 adds the columns this page writes to. Saving
                will fail until the migration lands. You can still preview
                the form.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────── Section A: at-salon ─────────── */}
      <Card className="border-border">
        <CardContent className="p-4 sm:p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-gold/10 flex items-center justify-center shrink-0 rounded-md">
              <Store className="w-5 h-5 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                At-salon bookings on iCut
              </p>
              <p className="text-xs text-muted-foreground">
                Customers find you on the marketplace, book a slot, and come
                to your salon. No platform fees for in-salon appointments.
              </p>
            </div>
            <Switch
              checked={listed}
              disabled={saving || !schemaReady || (!listed && !canList)}
              onCheckedChange={(checked) => saveListing(checked)}
            />
          </div>

          {/* Requirements checklist */}
          <RequirementsChecklist r={liveRequirements} />

          {/* Photos */}
          <PhotoUploader
            branchId={data.branch.id}
            photos={photos}
            onChange={setPhotos}
            disabled={saving || !schemaReady}
          />

          {/* About */}
          <AboutEditor
            value={about}
            onChange={setAbout}
            disabled={saving || !schemaReady}
          />

          {/* City */}
          <CitySelect
            value={cityId}
            cities={data.cities}
            onChange={setCityId}
            disabled={saving || !schemaReady}
          />

          {/* Salon gender type — required for marketplace listing.
              Women + mixed are selectable today even though the consumer
              marketplace hides them until the superadmin flips
              `marketplace_women_enabled`; the DB column must stay truthful
              so flipping the flag is a one-switch change. */}
          <GenderSelect
            value={genderType}
            onChange={setGenderType}
            disabled={saving || !schemaReady}
          />

          {/* Map pin */}
          <MapPinPicker
            lat={lat}
            lng={lng}
            centerHint={cityCenter}
            onChange={(nextLat, nextLng) => {
              setLat(nextLat);
              setLng(nextLng);
            }}
            disabled={saving || !schemaReady}
          />

          {/* Manual lat/lng fallback — shows so the user isn't stuck if
              Mapbox fails to load or the token isn't set yet. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Latitude</Label>
              <Input
                type="number"
                step="0.00001"
                inputMode="decimal"
                value={lat ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setLat(v === '' ? null : Number(v));
                }}
                disabled={saving || !schemaReady}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Longitude</Label>
              <Input
                type="number"
                step="0.00001"
                inputMode="decimal"
                value={lng ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setLng(v === '' ? null : Number(v));
                }}
                disabled={saving || !schemaReady}
                className="mt-1"
              />
            </div>
          </div>

          {/* Save draft (without toggling listed_on_marketplace) */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving || !schemaReady}
              onClick={() => saveListing(listed)}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving
                </>
              ) : (
                'Save changes'
              )}
            </Button>
            {!listed && canList && schemaReady && (
              <Button
                type="button"
                className="bg-gold hover:bg-gold/90 text-black font-semibold"
                disabled={saving}
                onClick={() => saveListing(true)}
              >
                Publish on iCut
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─────────── Section B: home service ─────────── */}
      <Card className="border-border">
        <CardContent className="p-4 sm:p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-gold/10 flex items-center justify-center shrink-0 rounded-md">
              <Home className="w-5 h-5 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Home service</p>
              <p className="text-xs text-muted-foreground">
                Send a stylist to the customer&rsquo;s home. Platform charges
                a 30% markup + Rs 300 service charge on each home booking,
                collected from the salon on settlement.
              </p>
            </div>
            <Switch
              checked={homeOn}
              disabled={saving || !schemaReady}
              onCheckedChange={(checked) => saveHomeService(checked)}
            />
          </div>

          {homeOn && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Coverage radius (km)</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  inputMode="decimal"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(e.target.value)}
                  disabled={saving || !schemaReady}
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Consumers whose address is inside this radius from your
                  branch pin can request a home service.
                </p>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={saving || !schemaReady}
                  onClick={() => saveHomeService(true)}
                >
                  {saving ? 'Saving…' : 'Save radius'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════
// Requirements checklist
// ═══════════════════════════════════════

function RequirementsChecklist({ r }: { r: ListingRequirements }) {
  const items: Array<{ label: string; done: boolean }> = [
    { label: '3+ photos uploaded', done: r.hasThreePhotos },
    { label: 'About is at least 100 characters', done: r.hasAbout },
    { label: 'Map pin set', done: r.hasPin },
    { label: 'City selected', done: r.hasCity },
    { label: 'Salon type selected (men / women / mixed)', done: r.hasGenderType },
    { label: '1+ active service on this branch', done: r.hasActiveService },
  ];
  return (
    <div className="bg-secondary/30 border border-border rounded-md p-3 space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Before you can publish
      </p>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-xs">
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center ${
              it.done ? 'bg-green-500/20 text-green-600' : 'bg-muted'
            }`}
          >
            {it.done && <Check className="w-3 h-3" />}
          </span>
          <span
            className={
              it.done ? 'text-muted-foreground' : 'text-foreground font-medium'
            }
          >
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}
