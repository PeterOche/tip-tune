import { renderHook, act } from '@testing-library/react';
import { useWallet } from '../useWallet';
import { WalletProvider } from '../../contexts/WalletContext';
import { WalletError, WalletErrorCode } from '../../types/wallet';

// Mock Freighter API
jest.mock('@stellar/freighter-api', () => ({
  setAllowed: jest.fn(),
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  getNetwork: jest.fn(),
  setNetwork: jest.fn(),
  signTransaction: jest.fn(),
}));

describe('useWallet', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider defaultNetwork="testnet">{children}</WalletProvider>
  );

  it('should throw error when used outside WalletProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      renderHook(() => useWallet());
    }).toThrow('useWallet must be used within a WalletProvider');
    
    consoleSpy.mockRestore();
  });

  it('should provide wallet context when used within WalletProvider', () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.publicKey).toBeNull();
    expect(result.current.network).toBe('testnet');
  });
});

describe('WalletError', () => {
  it('should create error with code and message', () => {
    const error = new WalletError(
      WalletErrorCode.NOT_INSTALLED,
      'Freighter not installed'
    );

    expect(error.code).toBe(WalletErrorCode.NOT_INSTALLED);
    expect(error.message).toBe('Freighter not installed');
    expect(error.name).toBe('WalletError');
  });

  it('should include original error', () => {
    const originalError = new Error('Original error');
    const error = new WalletError(
      WalletErrorCode.UNKNOWN_ERROR,
      'Wrapper error',
      originalError
    );

    expect(error.originalError).toBe(originalError);
  });
});
