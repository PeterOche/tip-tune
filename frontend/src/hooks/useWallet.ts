'use client';

import { useContext } from 'react';
import { WalletContext } from '../contexts/WalletContext';
import type { WalletContextType } from '../types/wallet';

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }

  return context;
};
