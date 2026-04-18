/**
 * `/account/addresses/[id]/edit` — edit an existing saved address.
 *
 * Server page. Calls `getConsumerAddress` which already enforces the
 * `consumer_id = session.userId` ownership check — a stray id for another
 * account's address returns `not found` and we route to 404.
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getConsumerAddress } from '@/app/actions/consumer-addresses';

import { AddressForm } from '../../components/address-form';

export const metadata: Metadata = {
  title: 'Edit address',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditAddressPage({ params }: PageProps) {
  const { id } = await params;
  const res = await getConsumerAddress(id);
  if (!res.ok) notFound();

  return <AddressForm mode="edit" address={res.data} />;
}
