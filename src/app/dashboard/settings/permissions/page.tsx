'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, ShieldAlert, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSION_KEYS,
  usePermission,
  type PermissionKey,
} from '@/lib/permissions';
import {
  listRolePresets,
  updateRolePreset,
  updateStaffPermissions,
} from '@/app/actions/permissions';
import { getStaffForPermissions, updateStaffBranches } from '@/app/actions/staff';

// Roles the preset editor exposes, in render order. Keep in sync with
// ALLOWED_ROLE_NAMES in src/app/actions/permissions.ts.
const EDITABLE_ROLES: Array<{ key: string; label: string }> = [
  { key: 'owner', label: 'Owner' },
  { key: 'manager', label: 'Manager' },
  { key: 'receptionist', label: 'Receptionist' },
  { key: 'senior_stylist', label: 'Senior Stylist' },
  { key: 'junior_stylist', label: 'Junior Stylist' },
  { key: 'helper', label: 'Helper' },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  EDITABLE_ROLES.map((r) => [r.key, r.label]),
);

interface StaffRow {
  id: string;
  name: string;
  role: string;
  photo_url: string | null;
  primary_branch_id: string | null;
  permissions_override: Record<string, boolean> | null;
  is_active: boolean;
}

type EditorMode =
  | { kind: 'staff'; staffId: string }
  | { kind: 'role'; roleName: string }
  | { kind: 'none' };

export default function PermissionsPage() {
  const canManage = usePermission('manage_permissions');
  const salon = useAppStore((s) => s.salon);
  const currentBranch = useAppStore((s) => s.currentBranch);
  const memberBranches = useAppStore((s) => s.memberBranches);

  if (!canManage) {
    return (
      <div className="space-y-6">
        <Card className="border-border">
          <CardContent className="p-6 sm:p-10 text-center space-y-4">
            <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">You don&rsquo;t have access to this page</p>
            <p className="text-xs text-muted-foreground">
              Ask your salon owner or an administrator to grant you the
              &ldquo;{PERMISSION_LABELS.manage_permissions}&rdquo; permission.
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

  return <PermissionsEditor salonId={salon?.id ?? null} currentBranch={currentBranch} memberBranches={memberBranches} />;
}

function PermissionsEditor({
  salonId,
  currentBranch,
  memberBranches,
}: {
  salonId: string | null;
  currentBranch: { id: string; name: string } | null;
  memberBranches: Array<{ id: string; name: string }>;
}) {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [presets, setPresets] = useState<Record<string, Record<string, boolean>>>({});
  const [mode, setMode] = useState<EditorMode>({ kind: 'none' });

  const refresh = useCallback(async () => {
    if (!salonId || !currentBranch) return;
    setLoading(true);
    const [staffRes, presetsRes] = await Promise.all([
      getStaffForPermissions(currentBranch.id),
      listRolePresets(salonId),
    ]);
    if (showActionError(staffRes.error)) {
      setLoading(false);
      return;
    }
    if (showActionError(presetsRes.error)) {
      setLoading(false);
      return;
    }
    setStaff((staffRes.data ?? []) as StaffRow[]);
    const presetMap: Record<string, Record<string, boolean>> = {};
    for (const p of presetsRes.data ?? []) {
      presetMap[p.role_name] = (p.permissions ?? {}) as Record<string, boolean>;
    }
    setPresets(presetMap);
    setLoading(false);
  }, [salonId, currentBranch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedStaff =
    mode.kind === 'staff' ? staff.find((s) => s.id === mode.staffId) ?? null : null;
  const selectedRole = mode.kind === 'role' ? mode.roleName : null;

  if (!salonId) {
    return <div className="text-sm text-muted-foreground">No salon context.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Back link header */}
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Settings
        </Link>
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-xs font-medium">Permissions</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* Left pane: role presets + staff list */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Role Presets
              </p>
              <p className="text-xs text-muted-foreground">
                Default permissions applied to staff assigned this role.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {EDITABLE_ROLES.map((r) => {
                  const active = selectedRole === r.key;
                  return (
                    <button
                      key={r.key}
                      onClick={() => setMode({ kind: 'role', roleName: r.key })}
                      className={`text-xs px-3 py-2 border font-medium transition-all duration-150 text-left ${
                        active
                          ? 'border-gold bg-gold/10 text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-gold/30'
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Staff ({staff.length})
              </p>
              <div className="space-y-1.5">
                {staff.map((s) => {
                  const active = mode.kind === 'staff' && mode.staffId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setMode({ kind: 'staff', staffId: s.id })}
                      className={`w-full flex items-center gap-2.5 p-2 border text-left transition-all duration-150 ${
                        active
                          ? 'border-gold bg-gold/5'
                          : 'border-border hover:border-gold/30'
                      }`}
                    >
                      <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center overflow-hidden shrink-0">
                        {s.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate capitalize">
                          {ROLE_LABELS[s.role] ?? s.role.replace(/_/g, ' ')}
                          {s.permissions_override ? ' · custom' : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
                {staff.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No active staff yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right pane: editor */}
          <div>
            {mode.kind === 'none' && (
              <Card className="border-border">
                <CardContent className="p-6 sm:p-10 text-center space-y-3">
                  <Shield className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium">Select a role or staff member</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Edit a role preset to set the default permissions everyone with
                    that role gets, or pick a staff member to override just their
                    permissions.
                  </p>
                </CardContent>
              </Card>
            )}
            {mode.kind === 'role' && (
              <RolePresetEditor
                key={mode.roleName}
                salonId={salonId}
                roleName={mode.roleName}
                presetPermissions={presets[mode.roleName] ?? {}}
                onSaved={refresh}
              />
            )}
            {mode.kind === 'staff' && selectedStaff && (
              <StaffOverrideEditor
                key={selectedStaff.id}
                staff={selectedStaff}
                presetPermissions={presets[selectedStaff.role] ?? {}}
                memberBranches={memberBranches}
                onSaved={refresh}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────
// Role preset editor (plain-checkbox mode)
// ───────────────────────────────────────

function RolePresetEditor({
  salonId,
  roleName,
  presetPermissions,
  onSaved,
}: {
  salonId: string;
  roleName: string;
  presetPermissions: Record<string, boolean>;
  onSaved: () => void | Promise<void>;
}) {
  const isOwnerRole = roleName === 'owner';
  const [perms, setPerms] = useState<Record<string, boolean>>(() => ({ ...presetPermissions }));
  const [saving, setSaving] = useState(false);

  // Dirty if the set of `true` keys differs from the preset we loaded with.
  const dirty = useMemo(() => {
    const a = Object.entries(perms).filter(([, v]) => v === true).map(([k]) => k).sort();
    const b = Object.entries(presetPermissions).filter(([, v]) => v === true).map(([k]) => k).sort();
    if (a.length !== b.length) return true;
    return a.some((k, i) => k !== b[i]);
  }, [perms, presetPermissions]);

  async function save() {
    setSaving(true);
    try {
      // The owner preset is hard-coded to `{ '*': true }` — never send a
      // stripped-down map that could lock the salon owner out of their own
      // settings page.
      const payload = isOwnerRole ? { '*': true } : perms;
      const { error } = await updateRolePreset(salonId, roleName, payload);
      if (showActionError(error)) return;
      toast.success(`${ROLE_LABELS[roleName] ?? roleName} preset saved`);
      await onSaved();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-6 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Role Preset
        </p>
        <p className="text-lg font-semibold mt-1">
          Editing default permissions for: {ROLE_LABELS[roleName] ?? roleName}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          These are the default permissions for staff assigned this role. Individual
          staff can override these below.
        </p>
      </div>

      {isOwnerRole && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded p-3 text-xs text-amber-700 dark:text-amber-400">
          <p className="font-semibold">Warning</p>
          <p className="mt-0.5">
            Removing permissions from the Owner role can lock you out.
            &ldquo;{`*`}&rdquo; (all permissions) is strongly recommended.
          </p>
        </div>
      )}

      <div className="space-y-5">
        {Object.entries(PERMISSION_GROUPS).map(([group, keys]) => (
          <div key={group} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {keys.map((k) => {
                const checked = isOwnerRole ? true : perms[k] === true;
                return (
                  <label
                    key={k}
                    className={`flex items-center gap-2.5 p-2.5 border text-sm ${
                      isOwnerRole
                        ? 'border-border opacity-60 cursor-not-allowed'
                        : 'border-border cursor-pointer hover:border-gold/30'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={isOwnerRole}
                      onCheckedChange={(v) => {
                        if (isOwnerRole) return;
                        setPerms((prev) => ({ ...prev, [k]: v === true }));
                      }}
                    />
                    <span className="text-sm">{PERMISSION_LABELS[k]}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          onClick={save}
          disabled={saving || (!dirty && !isOwnerRole)}
          className="bg-gold hover:bg-gold/90 text-black font-bold h-11"
        >
          {saving ? 'Saving...' : 'Save preset'}
        </Button>
        {!dirty && !isOwnerRole && (
          <span className="text-xs text-muted-foreground">No changes</span>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────
// Staff override editor (tri-state)
// ───────────────────────────────────────

type TriState = 'inherit' | 'grant' | 'deny';

function overrideToTri(
  override: Record<string, boolean> | null | undefined,
  key: PermissionKey,
): TriState {
  if (!override) return 'inherit';
  if (!(key in override)) return 'inherit';
  return override[key] === true ? 'grant' : 'deny';
}

function StaffOverrideEditor({
  staff,
  presetPermissions,
  memberBranches,
  onSaved,
}: {
  staff: StaffRow;
  presetPermissions: Record<string, boolean>;
  memberBranches: Array<{ id: string; name: string }>;
  onSaved: () => void | Promise<void>;
}) {
  const isOwnerRole = staff.role === 'owner';
  const [tri, setTri] = useState<Record<PermissionKey, TriState>>(() => {
    const out = {} as Record<PermissionKey, TriState>;
    for (const k of PERMISSION_KEYS) out[k] = overrideToTri(staff.permissions_override, k);
    return out;
  });
  const [saving, setSaving] = useState(false);

  // Staff's currently-assigned branches. Fetched from staff_branches (RLS
  // lets any salon member read it). Stored as a Set so the checkbox list can
  // toggle without array-index gymnastics.
  const [branchIds, setBranchIds] = useState<Set<string>>(new Set());
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const branchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBranchesLoaded(false);
      const { data, error } = await supabase
        .from('staff_branches')
        .select('branch_id')
        .eq('staff_id', staff.id);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setBranchesLoaded(true);
        return;
      }
      setBranchIds(new Set((data ?? []).map((r: { branch_id: string }) => r.branch_id)));
      setBranchesLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [staff.id]);

  // Debounced branch sync — mirrors the 500ms behaviour the task asked for.
  // We only call updateStaffBranches after the user stops clicking for 500ms,
  // otherwise a burst of checks fires a storm of server actions.
  function scheduleBranchSync(next: Set<string>) {
    if (branchDebounceRef.current) clearTimeout(branchDebounceRef.current);
    branchDebounceRef.current = setTimeout(async () => {
      const ids = Array.from(next);
      if (ids.length === 0) {
        toast.error('At least one branch is required');
        // Re-fetch so UI snaps back.
        const { data } = await supabase
          .from('staff_branches')
          .select('branch_id')
          .eq('staff_id', staff.id);
        setBranchIds(new Set((data ?? []).map((r: { branch_id: string }) => r.branch_id)));
        return;
      }
      const { error } = await updateStaffBranches(staff.id, ids);
      if (showActionError(error)) return;
      toast.success('Branch assignments saved');
    }, 500);
  }

  function toggleBranch(id: string, checked: boolean) {
    setBranchIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      scheduleBranchSync(next);
      return next;
    });
  }

  // Dirty = any key has a non-"inherit" state that differs from what's
  // currently stored on the staff row.
  const dirty = useMemo(() => {
    for (const k of PERMISSION_KEYS) {
      const stored = overrideToTri(staff.permissions_override, k);
      if (stored !== tri[k]) return true;
    }
    return false;
  }, [tri, staff.permissions_override]);

  function triToOverride(): Record<string, boolean | null> {
    // Convert tri-state map to the wire shape updateStaffPermissions expects.
    // 'inherit' → null (server drops it); grant → true; deny → false.
    const out: Record<string, boolean | null> = {};
    for (const k of PERMISSION_KEYS) {
      if (tri[k] === 'grant') out[k] = true;
      else if (tri[k] === 'deny') out[k] = false;
      else out[k] = null;
    }
    return out;
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await updateStaffPermissions(staff.id, triToOverride());
      if (showActionError(error)) return;
      toast.success(`${staff.name}'s permissions saved`);
      await onSaved();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    if (!confirm(`Reset ${staff.name}'s permissions to the ${ROLE_LABELS[staff.role] ?? staff.role} preset?`)) return;
    setSaving(true);
    try {
      const { error } = await updateStaffPermissions(staff.id, null);
      if (showActionError(error)) return;
      const next = {} as Record<PermissionKey, TriState>;
      for (const k of PERMISSION_KEYS) next[k] = 'inherit';
      setTri(next);
      toast.success('Reset to preset');
      await onSaved();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setSaving(false);
    }
  }

  const branchNamesWorkingAt = memberBranches
    .filter((b) => branchIds.has(b.id))
    .map((b) => b.name)
    .join(', ');

  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center overflow-hidden shrink-0">
          {staff.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={staff.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold truncate">{staff.name}</p>
          <p className="text-xs text-muted-foreground capitalize">
            {ROLE_LABELS[staff.role] ?? staff.role.replace(/_/g, ' ')}
          </p>
          {branchNamesWorkingAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Works at: {branchNamesWorkingAt}
            </p>
          )}
        </div>
      </div>

      {/* Owner-role banner (disables everything below) */}
      {isOwnerRole && (
        <div className="bg-gold/5 border border-gold/30 rounded p-3 text-xs">
          <p className="font-semibold text-foreground">Owners always have full access</p>
          <p className="text-muted-foreground mt-0.5">
            Owner permissions can&rsquo;t be overridden — they always have every
            permission across every branch.
          </p>
        </div>
      )}

      {/* Branch assignment */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Branches
        </p>
        {memberBranches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No branches visible to your session.</p>
        ) : !branchesLoaded ? (
          <div className="h-10 bg-muted rounded animate-pulse" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {memberBranches.map((b) => {
              const checked = branchIds.has(b.id);
              return (
                <label
                  key={b.id}
                  className="flex items-center gap-2.5 p-2.5 border border-border text-sm cursor-pointer hover:border-gold/30"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleBranch(b.id, v === true)}
                  />
                  <span>{b.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Permissions grid (tri-state) */}
      <div className="space-y-5">
        {Object.entries(PERMISSION_GROUPS).map(([group, keys]) => (
          <div key={group} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group}
            </p>
            <div className="space-y-1.5">
              {keys.map((k) => (
                <TriStateRow
                  key={k}
                  permKey={k}
                  value={tri[k]}
                  presetValue={presetPermissions[k] === true}
                  disabled={isOwnerRole}
                  onChange={(v) => setTri((prev) => ({ ...prev, [k]: v }))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button
          onClick={save}
          disabled={saving || !dirty || isOwnerRole}
          className="bg-gold hover:bg-gold/90 text-black font-bold h-11"
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="outline"
          onClick={resetAll}
          disabled={saving || isOwnerRole}
          className="h-11"
        >
          Reset all to preset
        </Button>
        {!dirty && !isOwnerRole && (
          <span className="text-xs text-muted-foreground">No changes</span>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────
// Tri-state row (Inherit / Grant / Deny)
// ───────────────────────────────────────

function TriStateRow({
  permKey,
  value,
  presetValue,
  disabled,
  onChange,
}: {
  permKey: PermissionKey;
  value: TriState;
  presetValue: boolean;
  disabled: boolean;
  onChange: (v: TriState) => void;
}) {
  const options: Array<{ v: TriState; label: string; hint?: string }> = [
    {
      v: 'inherit',
      label: 'Inherit',
      hint: presetValue ? 'granted' : 'denied',
    },
    { v: 'grant', label: 'Grant' },
    { v: 'deny', label: 'Deny' },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2.5 border border-border">
      <div className="flex-1 min-w-0">
        <p className="text-sm">{PERMISSION_LABELS[permKey]}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        {options.map((opt) => {
          const active = value === opt.v;
          return (
            <button
              key={opt.v}
              disabled={disabled}
              onClick={() => onChange(opt.v)}
              className={`text-[11px] px-2.5 py-1.5 border font-medium transition-all duration-150 ${
                active
                  ? opt.v === 'grant'
                    ? 'border-green-600 bg-green-600/10 text-green-700 dark:text-green-400'
                    : opt.v === 'deny'
                    ? 'border-red-600 bg-red-600/10 text-red-700 dark:text-red-400'
                    : 'border-gold bg-gold/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-gold/30'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {opt.label}
              {opt.v === 'inherit' && opt.hint && (
                <span className="ml-1 text-[10px] opacity-70">({opt.hint})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
