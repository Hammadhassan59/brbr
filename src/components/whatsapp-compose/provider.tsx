'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { TemplateKey } from './templates';

export interface WhatsAppComposeOptions {
  recipient?: {
    name: string;
    phone: string;
  };
  template?: TemplateKey;
  variables?: Record<string, string>;
}

interface WhatsAppComposeContextValue {
  isOpen: boolean;
  options: WhatsAppComposeOptions | null;
  open: (opts: WhatsAppComposeOptions) => void;
  close: () => void;
}

const WhatsAppComposeContext = createContext<WhatsAppComposeContextValue | undefined>(undefined);

export function WhatsAppComposeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<WhatsAppComposeOptions | null>(null);

  const open = useCallback((opts: WhatsAppComposeOptions) => {
    setOptions(opts);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setOptions(null);
  }, []);

  return (
    <WhatsAppComposeContext.Provider value={{ isOpen, options, open, close }}>
      {children}
    </WhatsAppComposeContext.Provider>
  );
}

export function useWhatsAppCompose(): WhatsAppComposeContextValue {
  const context = useContext(WhatsAppComposeContext);
  if (!context) {
    throw new Error('useWhatsAppCompose must be used within WhatsAppComposeProvider');
  }
  return context;
}
