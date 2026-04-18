import { render, waitFor, within } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TipReceiptPage from '../TipReceiptPage';
import { tipService } from '../../services/tipService';
import type { TipReceipt } from '../../types';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('../../services/tipService', () => ({
  tipService: {
    getReceipt: vi.fn(),
  },
}));

vi.mock('../../hooks/useWallet', () => ({
  useWallet: () => ({
    publicKey: 'GTEST1234',
    balance: { balance: '100.00' },
    isConnected: true,
  }),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <div data-testid="mock-qr" />,
}));

/* ------------------------------------------------------------------ */
/*  Minimal Payload Fixture                                            */
/* ------------------------------------------------------------------ */

// A receipt with only the absolutely mandatory fields (though many are marked non-optional in TS, 
// we'll cast it to TipReceipt to simulate a partial backend response).
const minimalReceipt = {
  id: 'minimal-id',
  amount: 10,
  assetCode: 'XLM',
  status: 'pending',
  type: 'artist',
  createdAt: '2026-03-25T12:00:00Z',
} as unknown as TipReceipt;

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function renderPage(tipId = 'minimal-id') {
  return render(
    <MemoryRouter initialEntries={[`/tips/${tipId}/receipt`]}>
      <Routes>
        <Route path="/tips/:tipId/receipt" element={<TipReceiptPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('TipReceiptPage Robustness', () => {
  beforeEach(() => {
    vi.mocked(tipService.getReceipt).mockResolvedValue(minimalReceipt);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing even with a minimal payload', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('tip-receipt-page')).toBeInTheDocument();
    });

    // Check for some fallback labels
    expect(screen.getByText('minimal-id')).toBeInTheDocument();
    expect(screen.getByText('10.0000000')).toBeInTheDocument();
    const details = screen.getByTestId('transaction-details');
    expect(details).toBeInTheDocument();
    expect(within(details).getAllByText('XLM').length).toBeGreaterThan(0);
  });

  it('shows fallbacks for missing blockchain data', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('blockchain-proof')).toBeInTheDocument();
    });

    expect(screen.getByTestId('blockchain-proof')).toBeInTheDocument();
    // We expect multiple "N/A" for missing hash, sender, receiver
    const naElements = screen.getAllByText('N/A');
    expect(naElements.length).toBeGreaterThan(0);
  });

  it('handles missing artist and track gracefully', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('tip-receipt-page')).toBeInTheDocument();
    });

    // Tip Again button should NOT be present if artist is missing
    expect(screen.queryByTestId('tip-again-button')).not.toBeInTheDocument();
  });
});
