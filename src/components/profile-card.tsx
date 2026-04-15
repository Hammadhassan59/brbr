'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Mail, KeyRound, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getAccountProfile,
  updateAccountProfile,
  changeAccountEmail,
  changeAccountPassword,
} from '@/app/actions/account';

type Profile = Awaited<ReturnType<typeof getAccountProfile>>['data'];

export function ProfileCard() {
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  // Name/phone form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Email form
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    getAccountProfile().then((res) => {
      if (res.data) {
        setProfile(res.data);
        setName(res.data.name || '');
        setPhone(res.data.phone || '');
      } else if (res.error) {
        toast.error(res.error);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="h-32 bg-muted rounded-lg animate-pulse" />;
  if (!profile) return <div className="text-sm text-muted-foreground">Profile unavailable</div>;

  const showProfileForm = profile.nameEditable || profile.phoneEditable;

  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const payload: { name?: string; phone?: string } = {};
    if (profile.nameEditable) {
      if (!name.trim()) { toast.error('Name is required'); return; }
      payload.name = name.trim();
    }
    if (profile.phoneEditable) {
      if (!phone.trim()) { toast.error('Phone is required'); return; }
      payload.phone = phone.trim();
    }
    setProfileSaving(true);
    try {
      const { error } = await updateAccountProfile(payload);
      if (error) { toast.error(error); return; }
      toast.success('Profile updated');
    } finally {
      setProfileSaving(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) { toast.error('Enter a new email'); return; }
    if (!emailPassword) { toast.error('Enter your current password'); return; }
    setEmailSaving(true);
    try {
      const { data, error } = await changeAccountEmail({ currentPassword: emailPassword, newEmail: newEmail.trim() });
      if (error) { toast.error(error); return; }
      if (data && profile) {
        setProfile({ ...profile, email: data.email });
        setNewEmail('');
        setEmailPassword('');
        toast.success('Email updated — use the new email next time you log in');
      }
    } finally {
      setEmailSaving(false);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) { toast.error('Enter your current password'); return; }
    if (newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setPwSaving(true);
    try {
      const { error } = await changeAccountPassword({ currentPassword, newPassword });
      if (error) { toast.error(error); return; }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated');
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {showProfileForm && (
        <div className="bg-card border border-border rounded-lg p-6 space-y-5">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gold" />
            <p className="text-sm font-semibold">Profile</p>
          </div>
          <form onSubmit={submitProfile} className="space-y-3">
            {profile.nameEditable && (
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
            )}
            {profile.phoneEditable && (
              <div>
                <Label className="text-xs">Phone</Label>
                <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
              </div>
            )}
            <Button type="submit" disabled={profileSaving} className="bg-gold hover:bg-gold/90 text-black font-bold h-11">
              {profileSaving ? 'Saving…' : 'Save Profile'}
            </Button>
          </form>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-gold" />
          <p className="text-sm font-semibold">Email Address</p>
        </div>
        <div>
          <Label className="text-xs">Current Email</Label>
          <div className="mt-1 text-sm font-medium">{profile.email || '—'}</div>
        </div>
        <form onSubmit={submitEmail} className="space-y-3">
          <div>
            <Label className="text-xs">New Email</Label>
            <Input type="email" inputMode="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Current Password</Label>
            <Input type="password" autoComplete="current-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} className="mt-1" />
          </div>
          <Button type="submit" disabled={emailSaving} className="bg-gold hover:bg-gold/90 text-black font-bold h-11">
            {emailSaving ? 'Updating…' : 'Update Email'}
          </Button>
        </form>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-gold" />
          <p className="text-sm font-semibold">Password</p>
        </div>
        <form onSubmit={submitPassword} className="space-y-3">
          <div>
            <Label className="text-xs">Current Password</Label>
            <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">New Password</Label>
            <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Confirm New Password</Label>
            <Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" />
          </div>
          <Button type="submit" disabled={pwSaving} className="bg-gold hover:bg-gold/90 text-black font-bold h-11">
            {pwSaving ? 'Updating…' : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
