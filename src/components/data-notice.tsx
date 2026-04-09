'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';

export function DataNotice() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('brbr-data-notice')) return;

    const id = toast(
      (t) => (
        <div className="flex items-center gap-3 text-xs">
          <span>BrBr uses cookies to keep you logged in.</span>
          <Link href="/privacy" className="text-gold font-semibold hover:underline shrink-0" onClick={() => toast.dismiss(t.id)}>
            Privacy Policy
          </Link>
          <button onClick={() => { localStorage.setItem('brbr-data-notice', '1'); toast.dismiss(t.id); }} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A] shrink-0 ml-1">
            ✕
          </button>
        </div>
      ),
      {
        duration: Infinity,
        position: 'bottom-center',
        style: {
          background: '#1A1A1A',
          color: '#EFEFEF',
          borderRadius: '0',
          border: '1px solid #222',
          fontSize: '13px',
        },
      }
    );

    return () => toast.dismiss(id);
  }, []);

  return null;
}
