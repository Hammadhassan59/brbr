/**
 * `/account/addresses/new` — create a new saved address.
 *
 * Server page, hands off to the client `<AddressForm />` in create mode.
 * Auth is handled upstream by `<AccountLayout />`.
 */
import type { Metadata } from 'next';

import { AddressForm } from '../components/address-form';

export const metadata: Metadata = {
  title: 'Add address',
  robots: { index: false, follow: false },
};

export default function NewAddressPage() {
  return <AddressForm mode="create" />;
}
