'use client';

import React, { useState } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { truncateAddress } from '../../utils/stellar';
import { WalletError } from '../../types/wallet';

const WalletConnect: React.FC = () => {
  const {
    isConnected,
    isConnecting,
    publicKey,
    network,
    balance,
    error,
    connect,
    disconnect,
    switchNetwork,
    refreshBalance,
  } = useWallet();

  const [localError, setLocalError] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      setLocalError(null);
      await connect();
    } catch (err) {
      if (err instanceof WalletError) {
        setLocalError(err.message);
      } else {
        setLocalError('Failed to connect wallet. Please try again.');
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      setLocalError(null);
      await disconnect();
    } catch (err) {
      setLocalError('Failed to disconnect wallet.');
    }
  };

  const handleNetworkSwitch = async (newNetwork: 'testnet' | 'mainnet') => {
    try {
      setLocalError(null);
      await switchNetwork(newNetwork);
    } catch (err) {
      if (err instanceof WalletError) {
        setLocalError(err.message);
      } else {
        setLocalError('Failed to switch network.');
      }
    }
  };

  const handleRefreshBalance = async () => {
    try {
      setLocalError(null);
      await refreshBalance();
    } catch (err) {
      setLocalError('Failed to refresh balance.');
    }
  };

  const displayError = error || localError;

  if (isConnected && publicKey) {
    return (
      <div className="max-w-md mx-auto p-6 bg-navy/80 rounded-xl border border-blue-primary/30">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-mint rounded-full animate-pulse"></span>
              <span className="text-mint font-medium">Connected</span>
            </div>
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white text-sm transition-colors"
              aria-label="Disconnect wallet"
            >
              Disconnect
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-black/20 rounded-lg">
              <span className="text-ice-blue text-sm font-medium min-w-[80px]">Address:</span>
              <span className="text-white font-mono text-sm" title={publicKey}>
                {truncateAddress(publicKey)}
              </span>
            </div>

            {balance && (
              <div className="flex items-center gap-3 p-3 bg-black/20 rounded-lg">
                <span className="text-ice-blue text-sm font-medium min-w-[80px]">Balance:</span>
                <span className="text-white font-mono text-sm">
                  {balance.balance} {balance.asset}
                </span>
                <button
                  onClick={handleRefreshBalance}
                  className="ml-auto px-2 py-1 text-blue-primary hover:text-ice-blue transition-colors text-lg"
                  aria-label="Refresh balance"
                  title="Refresh balance"
                >
                  ↻
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-black/20 rounded-lg">
              <span className="text-ice-blue text-sm font-medium min-w-[80px]">Network:</span>
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => handleNetworkSwitch('testnet')}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    network === 'testnet'
                      ? 'bg-blue-primary text-navy'
                      : 'bg-blue-primary/10 text-blue-primary border border-blue-primary/30 hover:bg-blue-primary/20'
                  }`}
                  disabled={network === 'testnet'}
                >
                  Testnet
                </button>
                <button
                  onClick={() => handleNetworkSwitch('mainnet')}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    network === 'mainnet'
                      ? 'bg-blue-primary text-navy'
                      : 'bg-blue-primary/10 text-blue-primary border border-blue-primary/30 hover:bg-blue-primary/20'
                  }`}
                  disabled={network === 'mainnet'}
                >
                  Mainnet
                </button>
              </div>
            </div>
          </div>

          {displayError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
              {displayError}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-navy/80 rounded-xl border border-blue-primary/30 text-center">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="w-full px-6 py-4 bg-gradient-to-r from-blue-primary to-ice-blue text-navy font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-blue-primary/40 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        aria-label="Connect Freighter wallet"
      >
        {isConnecting ? (
          <>
            <span className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin"></span>
            Connecting...
          </>
        ) : (
          <>
            <span>🔗</span>
            Connect Freighter Wallet
          </>
        )}
      </button>

      {displayError && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
          {displayError}
        </div>
      )}

      {!isConnecting && displayError?.includes('NOT_INSTALLED') && (
        <div className="mt-4 p-4 bg-blue-primary/10 rounded-lg">
          <p className="text-ice-blue text-sm mb-2">Don't have Freighter?</p>
          <a
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-primary hover:text-ice-blue font-medium text-sm transition-colors"
          >
            Install Freighter Wallet →
          </a>
        </div>
      )}
    </div>
  );
};

export default WalletConnect;
