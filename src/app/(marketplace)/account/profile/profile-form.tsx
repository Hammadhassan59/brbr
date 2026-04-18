'use client';

/**
 * Consumer profile form — three sections on a single page:
 *
 *   1. Personal info (name + phone) — inline edit per field. Each field has
 *      a pencil-to-edit → save/cancel affordance so a single typo in one
 *      field doesn't force the user to re-submit the other.
 *   2. Email — shows current email + `[Change email]` button. The change
 *      form asks for the new email + current password re-verify, submits a
 *      magic link to the new address (same pattern as `changeAccountEmail`
 *      on the owner side). Success message tells the user to check their
 *      new inbox.
 *   3. Password — `[Change password]` button reveals the current/new/confirm
 *      form. Min 10 chars enforced client-side (server re-validates).
 *
 * Each subform is self-contained: local state + loading flag + error/success
 * copy. Keeping them split makes the page easier to test and easier to reason
 * about since the three actions have different concurrency concerns.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  changeConsumerEmail,
  changeConsumerPassword,
  updateConsumerName,
  updateConsumerPhone,
} from '@/app/actions/consumer-profile';

interface ProfileFormProps {
  initialName: string;
  initialPhone: string;
  initialEmail: string;
}

export function ProfileForm({
  initialName,
  initialPhone,
  initialEmail,
}: ProfileFormProps) {
  const router = useRouter();

  // ── Personal info: name ──────────────────────────────────────────────────
  const [name, setName] = useState(initialName);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    setNameSaving(true);
    try {
      const res = await updateConsumerName({ name: trimmed });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Name updated');
      setName(res.data.name);
      setNameEditing(false);
      router.refresh();
    } finally {
      setNameSaving(false);
    }
  }

  function cancelName() {
    setName(initialName);
    setNameEditing(false);
  }

  // ── Personal info: phone ─────────────────────────────────────────────────
  const [phone, setPhone] = useState(initialPhone);
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);

  async function savePhone() {
    setPhoneSaving(true);
    try {
      const res = await updateConsumerPhone({ phone });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Phone updated');
      setPhone(res.data.phone);
      setPhoneEditing(false);
      router.refresh();
    } finally {
      setPhoneSaving(false);
    }
  }

  function cancelPhone() {
    setPhone(initialPhone);
    setPhoneEditing(false);
  }

  // ── Email ────────────────────────────────────────────────────────────────
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailPendingMsg, setEmailPendingMsg] = useState<string | null>(null);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailSaving(true);
    try {
      const res = await changeConsumerEmail({
        newEmail,
        currentPassword: emailPassword,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setEmailPendingMsg(res.data.message);
      setEmailPassword('');
      toast.success('Check your new inbox');
    } finally {
      setEmailSaving(false);
    }
  }

  function resetEmailForm() {
    setEmailOpen(false);
    setNewEmail('');
    setEmailPassword('');
    setEmailPendingMsg(null);
  }

  // ── Password ─────────────────────────────────────────────────────────────
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwNew !== pwConfirm) {
      toast.error('New password and confirmation must match');
      return;
    }
    if (pwNew.length < 10) {
      toast.error('New password must be at least 10 characters');
      return;
    }
    setPwSaving(true);
    try {
      const res = await changeConsumerPassword({
        currentPassword: pwCurrent,
        newPassword: pwNew,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Password updated');
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
      setPwOpen(false);
    } finally {
      setPwSaving(false);
    }
  }

  function resetPwForm() {
    setPwOpen(false);
    setPwCurrent('');
    setPwNew('');
    setPwConfirm('');
  }

  return (
    <div className="space-y-5">
      {/* ── Personal info ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
          Personal info
        </p>

        {/* Name */}
        <div className="mt-3 flex flex-col gap-2 border-b border-[#F5F5F5] pb-3">
          <Label htmlFor="profile-name" className="text-[12px] font-semibold text-[#666]">
            Full name
          </Label>
          {nameEditing ? (
            <div className="flex flex-col gap-2">
              <Input
                id="profile-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={nameSaving}
                minLength={2}
                maxLength={80}
                className="bg-white"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={saveName}
                  disabled={nameSaving}
                  className="bg-gold text-black hover:bg-gold/90 h-10"
                >
                  {nameSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelName}
                  disabled={nameSaving}
                  className="h-10"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-[#1A1A1A]">{name || '—'}</span>
              <button
                type="button"
                onClick={() => setNameEditing(true)}
                className="text-[12px] font-semibold text-gold hover:underline"
              >
                Edit
              </button>
            </div>
          )}
        </div>

        {/* Phone */}
        <div className="mt-3 flex flex-col gap-2">
          <Label htmlFor="profile-phone" className="text-[12px] font-semibold text-[#666]">
            Phone
          </Label>
          {phoneEditing ? (
            <div className="flex flex-col gap-2">
              <Input
                id="profile-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={phoneSaving}
                pattern="^(?:03\d{9}|\+923\d{9})$"
                placeholder="03XXXXXXXXX or +923XXXXXXXXX"
                className="bg-white"
              />
              <p className="text-[11px] text-[#888]">
                Shown to salons when they confirm your booking so they can call or WhatsApp you.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={savePhone}
                  disabled={phoneSaving}
                  className="bg-gold text-black hover:bg-gold/90 h-10"
                >
                  {phoneSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelPhone}
                  disabled={phoneSaving}
                  className="h-10"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-[#1A1A1A]">{phone || '—'}</span>
              <button
                type="button"
                onClick={() => setPhoneEditing(true)}
                className="text-[12px] font-semibold text-gold hover:underline"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Email ───────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
          Email
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[14px] text-[#1A1A1A]">{initialEmail}</span>
          {!emailOpen && (
            <button
              type="button"
              onClick={() => {
                setEmailOpen(true);
                setEmailPendingMsg(null);
              }}
              className="text-[12px] font-semibold text-gold hover:underline"
            >
              Change email
            </button>
          )}
        </div>

        {emailPendingMsg && (
          <div
            role="status"
            className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-[13px] text-blue-900"
          >
            {emailPendingMsg}
            <p className="mt-1 text-[12px] text-blue-800">
              Your email stays the same until you click the confirmation link.
            </p>
          </div>
        )}

        {emailOpen && (
          <form onSubmit={submitEmail} className="mt-3 space-y-3">
            <div>
              <Label htmlFor="email-new" className="text-[12px] font-semibold text-[#666]">
                New email
              </Label>
              <Input
                id="email-new"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={emailSaving}
                required
                className="mt-1.5 bg-white"
              />
            </div>
            <div>
              <Label htmlFor="email-password" className="text-[12px] font-semibold text-[#666]">
                Current password
              </Label>
              <Input
                id="email-password"
                type="password"
                autoComplete="current-password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                disabled={emailSaving}
                required
                className="mt-1.5 bg-white"
              />
              <p className="mt-1 text-[11px] text-[#888]">
                Re-entering your password prevents someone with a stolen session from hijacking your account.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={emailSaving}
                className="bg-gold text-black hover:bg-gold/90 h-10"
              >
                {emailSaving ? 'Sending…' : 'Send confirmation link'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetEmailForm}
                disabled={emailSaving}
                className="h-10"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* ── Password ────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
          Password
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[14px] text-[#1A1A1A]">••••••••••</span>
          {!pwOpen && (
            <button
              type="button"
              onClick={() => setPwOpen(true)}
              className="text-[12px] font-semibold text-gold hover:underline"
            >
              Change password
            </button>
          )}
        </div>

        {pwOpen && (
          <form onSubmit={submitPassword} className="mt-3 space-y-3">
            <div>
              <Label htmlFor="pw-current" className="text-[12px] font-semibold text-[#666]">
                Current password
              </Label>
              <Input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                disabled={pwSaving}
                required
                className="mt-1.5 bg-white"
              />
            </div>
            <div>
              <Label htmlFor="pw-new" className="text-[12px] font-semibold text-[#666]">
                New password
              </Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                disabled={pwSaving}
                minLength={10}
                required
                className="mt-1.5 bg-white"
                placeholder="Min 10 characters"
              />
            </div>
            <div>
              <Label htmlFor="pw-confirm" className="text-[12px] font-semibold text-[#666]">
                Confirm new password
              </Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                disabled={pwSaving}
                minLength={10}
                required
                className="mt-1.5 bg-white"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={pwSaving}
                className="bg-gold text-black hover:bg-gold/90 h-10"
              >
                {pwSaving ? 'Updating…' : 'Update password'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetPwForm}
                disabled={pwSaving}
                className="h-10"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
