/**
 * TipModal Component Tests
 * Tests for main modal functionality, gestures, and flow
 */

import { act, render, waitFor } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TipModal from './TipModal';
import { LiveRegionProvider } from '../a11y/LiveRegion';

describe('TipModal', () => {
    const mockOnClose = vi.fn();
    const mockOnTipSuccess = vi.fn().mockResolvedValue(undefined);

    const defaultProps = {
        isOpen: true,
        onClose: mockOnClose,
        artistId: 'artist-123',
        artistName: 'Test Artist',
        artistImage: 'https://example.com/artist.jpg',
        onTipSuccess: mockOnTipSuccess,
        walletBalance: { xlm: 1000, usdc: 100 },
        xlmUsdRate: 0.11,
    };

    beforeEach(() => {
        mockOnClose.mockClear();
        mockOnTipSuccess.mockClear();
    });

    const renderWithProviders = (ui: React.ReactElement) => {
        return render(
            <LiveRegionProvider>
                {ui}
            </LiveRegionProvider>
        );
    };

    describe('Rendering', () => {
        it('renders when isOpen is true', () => {
            renderWithProviders(<TipModal {...defaultProps} />);
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByText(`Tip ${defaultProps.artistName}`)).toBeInTheDocument();
        });

        it('does not render when isOpen is false', () => {
            const { container } = renderWithProviders(<TipModal {...defaultProps} isOpen={false} />);
            expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
        });

        it('displays artist image and name', () => {
            renderWithProviders(<TipModal {...defaultProps} />);
            const artistImage = screen.getByAltText(defaultProps.artistName) as HTMLImageElement;
            expect(artistImage).toHaveAttribute('src', defaultProps.artistImage);
        });
    });

    describe('Amount Selection Step', () => {
        it('shows amount selection by default', () => {
            renderWithProviders(<TipModal {...defaultProps} />);
            expect(screen.getByText('Select Amount')).toBeInTheDocument();
        });

        it('displays preset amounts', () => {
            renderWithProviders(<TipModal {...defaultProps} />);
            expect(screen.getByRole('radio', { name: /^1$/ })).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: /^5$/ })).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: /^10$/ })).toBeInTheDocument();
        });

        it('proceeds to message step when Continue clicked', async () => {
            const user = userEvent.setup();
            renderWithProviders(<TipModal {...defaultProps} />);

            const continueBtn = screen.getByRole('button', { name: /Continue/i });
            await user.click(continueBtn);

            await waitFor(() => {
                expect(screen.getByText('Message (Optional)')).toBeInTheDocument();
            });
        });
    });

    describe('Message Step', () => {
        it('shows message input in message step', async () => {
            const user = userEvent.setup();
            renderWithProviders(<TipModal {...defaultProps} />);

            const continueBtn = screen.getByRole('button', { name: /Continue/i });
            await user.click(continueBtn);

            await waitFor(() => {
                expect(screen.getByPlaceholderText(/Send a message to the artist/i)).toBeInTheDocument();
            });
        });

        it('can navigate back to amount step', async () => {
            const user = userEvent.setup();
            renderWithProviders(<TipModal {...defaultProps} />);

            const continueBtn = screen.getByRole('button', { name: /Continue/i });
            await user.click(continueBtn);

            await waitFor(() => {
                const backBtn = screen.getByRole('button', { name: /Back/i });
                expect(backBtn).toBeInTheDocument();
            });

            const backBtn = screen.getByRole('button', { name: /Back/i });
            await user.click(backBtn);

            await waitFor(() => {
                expect(screen.getByText('Select Amount')).toBeInTheDocument();
            });
        });
    });

    describe('Confirmation Step', () => {
        it('shows confirmation review', async () => {
            const user = userEvent.setup();
            renderWithProviders(<TipModal {...defaultProps} />);

            // Amount step
            const continueBtn1 = screen.getAllByRole('button', { name: /Continue/i })[0];
            await user.click(continueBtn1);

            // Message step
            await waitFor(() => {
                const continueBtn2 = screen.getByRole('button', { name: /Review/i });
                expect(continueBtn2).toBeInTheDocument();
            });

            const continueBtn2 = screen.getByRole('button', { name: /Review/i });
            await user.click(continueBtn2);

            // Confirmation step
            await waitFor(() => {
                expect(screen.getByText('Review Your Tip')).toBeInTheDocument();
            });
        });
    });

    describe('Close Button', () => {
        it('calls onClose when close button clicked', async () => {
            const user = userEvent.setup();
            renderWithProviders(<TipModal {...defaultProps} />);

            const closeBtn = screen.getByRole('button', { name: /Close tip modal/i });
            await user.click(closeBtn);

            await waitFor(() => {
                expect(mockOnClose).toHaveBeenCalled();
            });
        });

        it('calls onClose when escape key pressed', async () => {
            renderWithProviders(<TipModal {...defaultProps} />);

            fireEvent.keyDown(document, { key: 'Escape' });

            await waitFor(() => expect(mockOnClose).toHaveBeenCalled(), { timeout: 1000 });
        });
    });

    describe('Accessibility', () => {
        it('has proper ARIA attributes', () => {
            renderWithProviders(<TipModal {...defaultProps} />);
            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveAttribute('aria-modal', 'true');
            expect(dialog).toHaveAttribute('aria-labelledby', 'tip-modal-title');
            expect(dialog).toHaveAttribute('aria-describedby', 'tip-modal-description');
        });

        it('sets body overflow to hidden when open', async () => {
            renderWithProviders(<TipModal {...defaultProps} />);
            await waitFor(() => {
                expect(document.body.style.overflow).toBe('hidden');
            });
        });

        it('focuses the close button or first focusable element on mount', async () => {
            vi.useFakeTimers();
            renderWithProviders(<TipModal {...defaultProps} />);
            
            // Advance timers to trigger the focus setTimeout
            vi.advanceTimersByTime(150);
            
            const closeBtn = screen.getByRole('button', { name: /Close tip modal/i });
            expect(document.activeElement).toBe(closeBtn);
            
            vi.useRealTimers();
        });
    });

    describe('Processing Flow', () => {
        it('shows processing animation during tip submission', async () => {
            vi.useFakeTimers();

            try {
                let resolveTip!: () => void;
                const onTipSuccess = vi.fn().mockImplementation(
                    () =>
                        new Promise<void>((resolve) => {
                            resolveTip = resolve;
                        }),
                );

                const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
                renderWithProviders(
                    <TipModal {...defaultProps} onTipSuccess={onTipSuccess} />,
                );

                // Navigate to confirmation
                const continueBtn1 = screen.getAllByRole('button', { name: /Continue/i })[0];
                await user.click(continueBtn1);
                await waitFor(() => screen.getByRole('button', { name: /Review/i }));
                const reviewBtn = screen.getByRole('button', { name: /Review/i });
                await user.click(reviewBtn);

                // Confirm tip
                await waitFor(() => screen.getByRole('button', { name: /Send Tip/i }));
                const sendBtn = screen.getByRole('button', { name: /Send Tip/i });
                await user.click(sendBtn);

                expect(screen.getByLabelText(/Tip status: processing/i)).toBeInTheDocument();
                expect(screen.getByText(/Sending to Stellar/i)).toBeInTheDocument();

                resolveTip();
                await act(async () => {
                    await Promise.resolve();
                });

                await waitFor(() => {
                    expect(screen.getByLabelText(/Tip status: confirming/i)).toBeInTheDocument();
                });

                await act(async () => {
                    await vi.advanceTimersByTimeAsync(2000);
                });

                expect(screen.getByText(/Tip sent/i)).toBeInTheDocument();
            } finally {
                vi.useRealTimers();
            }
        });
    });
});
