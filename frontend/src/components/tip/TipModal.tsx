/**
 * Mobile-first Tip Modal with gesture support
 * Bottom sheet design with swipe-to-dismiss, haptic feedback, and smooth animations
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { animated, useSpring, useTrail } from 'react-spring';
import { X, Gift } from 'lucide-react';
import { useVirtualKeyboard, useHaptic } from '../../hooks';
import { useReducedMotion, getSpringConfig } from '../../utils/animationUtils';
import { getSafeAreaInsets, setupSafeAreaInsets } from '../../utils/gestures';
import AmountSelector from './AmountSelector';
import TipMessage from './TipMessage';
import TipConfirmation from './TipConfirmation';
import ProcessingAnimation, { ProcessingPhase } from './ProcessingAnimation';
import { useLiveRegion } from '../a11y/LiveRegion';

export interface TipModalProps {
    isOpen: boolean;
    onClose: () => void;
    artistId: string;
    artistName: string;
    artistImage?: string;
    onTipSuccess?: (amount: number, currency: string, message?: string) => Promise<void>;
    /** Optional: when provided shows a "Gift this tip" link that opens the gift flow */
    onGiftTip?: () => void;
    walletBalance?: {
        xlm: number;
        usdc: number;
    };
    xlmUsdRate?: number;
}

export type TipModalStep = 'amount' | 'message' | 'confirmation' | 'loading' | 'success';

const TipModal: React.FC<TipModalProps> = ({
    isOpen,
    onClose,
    artistName,
    artistImage,
    onTipSuccess,
    onGiftTip,
    walletBalance = { xlm: 1000, usdc: 100 },
    xlmUsdRate = 0.11,
}: TipModalProps) => {
    const reducedMotion = useReducedMotion();
    const haptic = useHaptic();
    const safeAreaRef = useRef<HTMLDivElement>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const keyboardHeight = useVirtualKeyboard();

    // State
    const [step, setStep] = useState<TipModalStep>('amount');
    const [tipAmount, setTipAmount] = useState(5);
    const [currency, setCurrency] = useState<'XLM' | 'USDC'>('XLM');
    const [message, setMessage] = useState('');
    const [isDismissing, setIsDismissing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>('idle');
    const { announce } = useLiveRegion();

    const handleClose = useCallback(() => {
        setIsDismissing(true);
        setTimeout(() => {
            setStep('amount');
            setTipAmount(5);
            setCurrency('XLM');
            setMessage('');
            setError(null);
            setIsDismissing(false);
            onClose();
        }, 300);
    }, [onClose]);

    // Initialize safe area insets on mount
    useEffect(() => {
        setupSafeAreaInsets();
    }, []);

    // Close modal with escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [handleClose, isOpen]);

    // Focus trap implementation
    useEffect(() => {
        if (!isOpen) return;

        const handleFocusTrap = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            const focusableElements = sheetRef.current?.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            
            if (!focusableElements || focusableElements.length === 0) return;

            const firstElement = focusableElements[0] as HTMLElement;
            const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        };

        document.addEventListener('keydown', handleFocusTrap);
        // Set initial focus to the amount selector or close button
        setTimeout(() => {
            const firstButton = sheetRef.current?.querySelector('button');
            if (firstButton) (firstButton as HTMLElement).focus();
        }, 100);

        return () => {
            document.removeEventListener('keydown', handleFocusTrap);
        };
    }, [isOpen]);

    const handleAmountChange = useCallback((amount: number) => {
        setTipAmount(amount);
        haptic.trigger('selection');
    }, [haptic]);

    const handleCurrencyToggle = useCallback((newCurrency: 'XLM' | 'USDC') => {
        setCurrency(newCurrency);
        haptic.trigger('light');
    }, [haptic]);

    const handleMessageChange = useCallback((text: string) => {
        setMessage(text);
    }, []);

    const handleProceedToMessage = useCallback(() => {
        haptic.trigger('medium');
        setStep('message');
    }, [haptic]);

    const handleProceedToConfirmation = useCallback(() => {
        haptic.trigger('medium');
        setStep('confirmation');
    }, [haptic]);

    const handleConfirmTip = useCallback(async () => {
        setStep('loading');
        setProcessingPhase('processing');
        haptic.trigger('medium');

        try {
            // Simulate the stages of a blockchain transaction for better visual feedback
            // In a real app, these would be linked to actual bridge/wallet events
            await onTipSuccess?.(tipAmount, currency, message);
            
            setProcessingPhase('confirming');
            // Simulate confirmation delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            haptic.trigger('success');
            setProcessingPhase('success');
            setStep('success');

            setTimeout(() => {
                handleClose();
            }, 2000);
        } catch (err) {
            haptic.trigger('error');
            const errorMessage = err instanceof Error ? err.message : 'Failed to send tip';
            setError(errorMessage);
            announce(errorMessage, 'assertive');
            setStep('confirmation');
            setProcessingPhase('idle');
        }
    }, [tipAmount, currency, message, onTipSuccess, haptic, handleClose, announce]);

    // Content animation based on step
    const fadeSpring = useSpring({
        opacity: isOpen && !isDismissing ? 1 : 0,
        config: getSpringConfig('gentle'),
        immediate: reducedMotion,
    });

    const slideSpring = useSpring({
        transform: isOpen && !isDismissing ? 'translateY(0%)' : 'translateY(100%)',
        opacity: isOpen && !isDismissing ? 1 : 0,
        config: getSpringConfig('gentle'),
        immediate: reducedMotion,
    });

    const safeAreaInsets = getSafeAreaInsets();
    const bottomPadding = Math.max(safeAreaInsets.bottom, 16) + keyboardHeight;

    if (!isOpen && !isDismissing) return null;

    return (
        <animated.div
            ref={safeAreaRef}
            style={{
                ...fadeSpring,
                position: 'fixed',
                inset: 0,
                zIndex: 50,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
            }}
            onClick={handleClose}
        >
            {/* Bottom Sheet */}
            <animated.div
                ref={sheetRef}
                style={{
                    ...slideSpring,
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    maxHeight: '90vh',
                    borderRadius: '24px 24px 0 0',
                    backgroundColor: '#0B1C2D',
                    borderTop: '1px solid rgba(77, 163, 255, 0.15)',
                    maxWidth: '100vw',
                    paddingBottom: `${bottomPadding}px`,
                }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tip-modal-title"
                aria-describedby="tip-modal-description"
            >
                {/* Drag Handle */}
                <div className="flex flex-col items-center gap-3 px-4 py-3">
                    <div className="w-12 h-1 rounded-full bg-gray-600" aria-hidden="true" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-4 pb-4">
                    <div className="flex items-center gap-3">
                        {artistImage && (
                            <img
                                src={artistImage}
                                alt={artistName}
                                className="w-10 h-10 rounded-full object-cover"
                            />
                        )}
                        <div>
                            <h1 id="tip-modal-title" className="text-lg font-semibold text-white">
                                Tip {artistName}
                            </h1>
                            <p id="tip-modal-description" className="sr-only">
                                Modal to send a tip in XLM or USDC to {artistName}. Supports messages and gifts.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-navy/50 rounded-lg transition-colors"
                        aria-label="Close tip modal"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 pb-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                    {step === 'amount' && (
                        <StepAmount
                            amount={tipAmount}
                            currency={currency}
                            onAmountChange={handleAmountChange}
                            onCurrencyToggle={handleCurrencyToggle}
                            onNext={handleProceedToMessage}
                            onGiftTip={onGiftTip}
                            walletBalance={walletBalance}
                            xlmUsdRate={xlmUsdRate}
                            reducedMotion={reducedMotion}
                        />
                    )}

                    {step === 'message' && (
                        <StepMessage
                            message={message}
                            onMessageChange={handleMessageChange}
                            onNext={handleProceedToConfirmation}
                            onBack={() => setStep('amount')}
                            reducedMotion={reducedMotion}
                        />
                    )}

                    {step === 'confirmation' && (
                        <StepConfirmation
                            amount={tipAmount}
                            currency={currency}
                            message={message}
                            artistName={artistName}
                            walletBalance={walletBalance}
                            xlmUsdRate={xlmUsdRate}
                            onConfirm={handleConfirmTip}
                            onBack={() => setStep('message')}
                            error={error}
                            reducedMotion={reducedMotion}
                        />
                    )}

                    {step === 'loading' && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <ProcessingAnimation 
                                phase={processingPhase} 
                                onComplete={() => setStep('success')}
                            />
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <ProcessingAnimation 
                                phase="success" 
                                onComplete={handleClose}
                            />
                            <p className="text-gray-400 text-sm mt-4 italic animate-pulse">
                                Transaction confirmed on Stellar
                            </p>
                        </div>
                    )}
                </div>
            </animated.div>
        </animated.div>
    );
};

// Step Components

interface StepProps {
    reducedMotion: boolean;
}

const StepAmount: React.FC<
    {
        amount: number;
        currency: 'XLM' | 'USDC';
        onAmountChange: (amount: number) => void;
        onCurrencyToggle: (currency: 'XLM' | 'USDC') => void;
        onNext: () => void;
        onGiftTip?: () => void;
        walletBalance: { xlm: number; usdc: number };
        xlmUsdRate: number;
    } & StepProps
> = ({
    amount,
    currency,
    onAmountChange,
    onCurrencyToggle,
    onNext,
    onGiftTip,
    walletBalance,
    xlmUsdRate,
    reducedMotion,
}: {
    amount: number;
    currency: 'XLM' | 'USDC';
    onAmountChange: (amount: number) => void;
    onCurrencyToggle: (currency: 'XLM' | 'USDC') => void;
    onNext: () => void;
    onGiftTip?: () => void;
    walletBalance: { xlm: number; usdc: number };
    xlmUsdRate: number;
} & StepProps) => {
    const trail = useTrail(2, {
        from: { opacity: 0, y: 10 },
        to: { opacity: 1, y: 0 },
        config: getSpringConfig('gentle'),
        immediate: reducedMotion,
    });

    return (
        <animated.div style={{ ...trail[0] }} className="space-y-6">
            <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-4">Select Amount</p>
                <AmountSelector
                    value={amount}
                    currency={currency}
                    onAmountChange={onAmountChange}
                    onCurrencyToggle={onCurrencyToggle}
                    xlmUsdRate={xlmUsdRate}
                    walletBalance={walletBalance}
                />
            </div>

            <animated.div style={{ ...trail[1] }} className="space-y-2">
                <button
                    onClick={onNext}
                    className="w-full py-3 rounded-lg font-semibold text-white
                    bg-gradient-to-r from-accent-gold to-yellow-500
                    hover:from-yellow-400 hover:to-amber-500
                    transition-all duration-200 transform hover:scale-105 active:scale-95"
                >
                    Continue
                </button>

                {/* Gift a tip entry point */}
                {onGiftTip && (
                    <button
                        type="button"
                        onClick={onGiftTip}
                        className="w-full py-2.5 rounded-lg font-medium text-sm text-purple-400
                        border border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/5
                        transition-all duration-200 flex items-center justify-center gap-2"
                        data-testid="open-gift-modal-btn"
                    >
                        <Gift className="h-4 w-4" />
                        Gift this tip on behalf of a friend
                    </button>
                )}
            </animated.div>
        </animated.div>
    );
};

const StepMessage: React.FC<
    {
        message: string;
        onMessageChange: (message: string) => void;
        onNext: () => void;
        onBack: () => void;
    } & StepProps
> = ({ 
    message, 
    onMessageChange, 
    onNext, 
    onBack, 
    reducedMotion 
}: {
    message: string;
    onMessageChange: (message: string) => void;
    onNext: () => void;
    onBack: () => void;
} & StepProps) => {
    const trail = useTrail(2, {
        from: { opacity: 0, y: 10 },
        to: { opacity: 1, y: 0 },
        config: getSpringConfig('gentle'),
        immediate: reducedMotion,
    });

    return (
        <animated.div style={{ ...trail[0] }} className="space-y-6">
            <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-4">Message (Optional)</p>
                <TipMessage value={message} onChange={onMessageChange} />
            </div>

            <animated.div style={{ ...trail[1] }} className="flex gap-3">
                <button
                    onClick={onBack}
                    className="flex-1 py-3 rounded-lg font-semibold text-blue-primary border-2 border-blue-primary/30 
                    hover:border-blue-primary/60 hover:bg-blue-primary/5
                    transition-all duration-200"
                >
                    Back
                </button>
                <button
                    onClick={onNext}
                    className="flex-1 py-3 rounded-lg font-semibold text-white
                    bg-gradient-to-r from-accent-gold to-yellow-500
                    hover:from-yellow-400 hover:to-amber-500
                    transition-all duration-200 transform hover:scale-105 active:scale-95"
                >
                    Review
                </button>
            </animated.div>
        </animated.div>
    );
};

const StepConfirmation: React.FC<
    {
        amount: number;
        currency: 'XLM' | 'USDC';
        message: string;
        artistName: string;
        walletBalance: { xlm: number; usdc: number };
        xlmUsdRate: number;
        onConfirm: () => void;
        onBack: () => void;
        error: string | null;
    } & StepProps
> = ({
    amount,
    currency,
    message,
    artistName,
    walletBalance,
    xlmUsdRate,
    onConfirm,
    onBack,
    error,
    reducedMotion,
}: {
    amount: number;
    currency: 'XLM' | 'USDC';
    message: string;
    artistName: string;
    walletBalance: { xlm: number; usdc: number };
    xlmUsdRate: number;
    onConfirm: () => void;
    onBack: () => void;
    error: string | null;
} & StepProps) => {
    const trail = useTrail(2, {
        from: { opacity: 0, y: 10 },
        to: { opacity: 1, y: 0 },
        config: getSpringConfig('gentle'),
        immediate: reducedMotion,
    });

    return (
        <animated.div style={{ ...trail[0] }} className="space-y-6">
            <TipConfirmation
                amount={amount}
                currency={currency}
                message={message}
                artistName={artistName}
                walletBalance={walletBalance}
                xlmUsdRate={xlmUsdRate}
            />

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {error}
                </div>
            )}

            <animated.div style={{ ...trail[1] }} className="flex gap-3">
                <button
                    onClick={onBack}
                    className="flex-1 py-3 rounded-lg font-semibold text-blue-primary border-2 border-blue-primary/30 
                    hover:border-blue-primary/60 hover:bg-blue-primary/5
                    transition-all duration-200"
                >
                    Back
                </button>
                <button
                    onClick={onConfirm}
                    className="flex-1 py-3 rounded-lg font-semibold text-white
                    bg-gradient-to-r from-accent-gold to-yellow-500
                    hover:from-yellow-400 hover:to-amber-500
                    transition-all duration-200 transform hover:scale-105 active:scale-95"
                >
                    Send Tip
                </button>
            </animated.div>
        </animated.div>
    );
};

export default TipModal;
