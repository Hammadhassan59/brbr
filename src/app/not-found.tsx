import Link from 'next/link';
import { Scissors } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Dark chrome header */}
      <header className="bg-[#1A1A1A] px-6 py-4 flex items-center gap-3">
        <Scissors className="text-[#F0B000] w-5 h-5" />
        <span className="font-bold text-white text-lg tracking-tight">iCut</span>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="font-heading text-7xl md:text-8xl font-bold text-[#F0B000] leading-none mb-4">
            404
          </p>
          <p className="text-[#1A1A1A] text-lg mb-8">
            This page doesn&apos;t exist.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard"
              className="touch-target px-6 py-3 text-sm font-semibold bg-[#1A1A1A] text-white inline-flex items-center justify-center"
            >
              Go to Dashboard
            </Link>
            <Link
              href="/"
              className="touch-target px-6 py-3 text-sm font-semibold border border-[#D4D4D4] text-[#1A1A1A] inline-flex items-center justify-center"
            >
              Go Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
