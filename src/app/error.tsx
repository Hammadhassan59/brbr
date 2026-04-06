'use client';

import { Scissors } from 'lucide-react';

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Dark chrome header */}
      <header className="bg-[#1A1A1A] px-6 py-4 flex items-center gap-3">
        <Scissors className="text-[#F0B000] w-5 h-5" />
        <span className="font-bold text-white text-lg tracking-tight">BrBr</span>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-[#1A1A1A] mb-3">
            Something went wrong
          </h1>
          <p className="text-[#6B6B6B] text-base mb-8">
            An unexpected error occurred. Try again, or contact us if the problem continues.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={reset}
              className="touch-target px-6 py-3 text-sm font-semibold bg-[#1A1A1A] text-white inline-flex items-center justify-center"
            >
              Try Again
            </button>
            <a
              href="https://wa.me/923001234567"
              target="_blank"
              rel="noopener noreferrer"
              className="touch-target px-6 py-3 text-sm font-semibold border border-[#D4D4D4] text-[#1A1A1A] inline-flex items-center justify-center"
            >
              Contact Support
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
