import { render, screen, waitFor } from '@testing-library/react';
import WalletConnect from '../WalletConnect';
import { WalletProvider } from '../../../contexts/WalletContext';

// Mock Freighter API
jest.mock('@stellar/freighter-api', () => ({
  setAllowed: jest.fn(),
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  getNetwork: jest.fn(),
  setNetwork: jest.fn(),
  signTransaction: jest.fn(),
}));

describe('WalletConnect', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider defaultNetwork="testnet">{children}</WalletProvider>
  );

  it('should render connect button when wallet is not connected', () => {
    render(<WalletConnect />, { wrapper });

    expect(screen.getByText(/Connect Freighter Wallet/i)).toBeInTheDocument();
  });

  it('should show loading state when connecting', async () => {
    const { setAllowed } = require('@stellar/freighter-api');
    setAllowed.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<WalletConnect />, { wrapper });

    const connectButton = screen.getByText(/Connect Freighter Wallet/i);
    connectButton.click();

    await waitFor(() => {
      expect(screen.getByText(/Connecting/i)).toBeInTheDocument();
    });
  });
});
