'use client';

import { Component, type ReactNode } from 'react';
import { useAppStore } from '@/store/app-store';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || '';

      // Subscription errors → show paywall dialog instead of error screen
      if (msg === 'SUBSCRIPTION_REQUIRED' || msg.includes('SUBSCRIPTION_REQUIRED')) {
        useAppStore.getState().setShowPaywall(true);
        // Reset error state so the page renders normally behind the dialog
        setTimeout(() => this.setState({ hasError: false, error: null }), 0);
        return this.props.children;
      }

      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center min-h-[200px] p-8">
          <div className="text-center max-w-md">
            <p className="font-heading font-bold text-lg mb-2">Something went wrong</p>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || 'An unexpected error occurred. Please refresh the page.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-gold text-black px-5 py-2.5 text-sm font-semibold border border-gold hover:bg-gold/90"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
