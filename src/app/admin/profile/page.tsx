import { ProfileCard } from '@/components/profile-card';

export default function AdminProfilePage() {
  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-semibold">My Profile</h2>
      <ProfileCard />
    </div>
  );
}
