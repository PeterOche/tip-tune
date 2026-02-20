import React, { useState, useCallback } from 'react';
import { useSpring, animated, useTrail } from 'react-spring';
import { useReducedMotion, getSpringConfig } from '../../utils/animationUtils';

export interface AmountSelectorProps {
    presets?: number[];
    currency?: 'XLM' | 'USDC';
    xlmUsdRate?: number;
    value: number;
    onChange: (amount: number) => void;
    onCurrencyToggle?: (currency: 'XLM' | 'USDC') => void;
    showCustomInput?: boolean;
}

const DEFAULT_PRESETS = [1, 5, 10, 25, 50];

const AmountSelector: React.FC<AmountSelectorProps> = ({
    presets = DEFAULT_PRESETS,
    currency = 'XLM',
    xlmUsdRate = 0.11,
    value,
    onChange,
    onCurrencyToggle,
    showCustomInput = true,
}) => {
    const reducedMotion = useReducedMotion();
    const [activePreset, setActivePreset] = useState<number | null>(value);
    const [customValue, setCustomValue] = useState('');
    const [inputFocused, setInputFocused] = useState(false);
    const [currencyFlipKey, setCurrencyFlipKey] = useState(0);
    const [pressedId, setPressedId] = useState<number | null>(null);

    // Staggered preset trail
    const trail = useTrail(presets.length, {
        from: { opacity: 0, y: 10, scale: 0.9 },
        to: { opacity: 1, y: 0, scale: 1 },
        config: getSpringConfig('gentle'),
        immediate: reducedMotion,
    });

    // Input focus spring
    const inputSpring = useSpring({
        scale: inputFocused ? 1.02 : 1,
        boxShadow: inputFocused
            ? '0 0 0 2px rgba(77,163,255,0.5)'
            : '0 0 0 1px rgba(77,163,255,0.15)',
        config: getSpringConfig('stiff'),
        immediate: reducedMotion,
    });

    const handlePresetClick = useCallback((preset: number, idx: number) => {
        setActivePreset(preset);
        setCustomValue('');
        onChange(preset);

        // Bounce press
        if (!reducedMotion) {
            setPressedId(idx);
            setTimeout(() => setPressedId(null), 300);
        }
    }, [onChange, reducedMotion]);

    const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setCustomValue(raw);
        setActivePreset(null);
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed > 0) onChange(parsed);
    }, [onChange]);

    const handleCurrencyToggle = useCallback(() => {
        setCurrencyFlipKey(k => k + 1);
        const next = currency === 'XLM' ? 'USDC' : 'XLM';
        onCurrencyToggle?.(next);
    }, [currency, onCurrencyToggle]);

    const usdEquivalent = currency === 'XLM'
        ? (value * xlmUsdRate).toFixed(2)
        : value.toFixed(2);

    return (
        <div className="flex flex-col gap-4" role="group" aria-label="Select tip amount">
            {/* Currency toggle */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Amount</span>
                <button
                    type="button"
                    id="currency-toggle"
                    onClick={handleCurrencyToggle}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-navy/50 border border-blue-primary/30 hover:border-blue-primary/60 transition-colors text-xs font-semibold text-blue-primary"
                    aria-label={`Switch to ${currency === 'XLM' ? 'USDC' : 'XLM'}`}
                >
                    <span
                        key={currencyFlipKey}
                        className={reducedMotion ? '' : 'animate-flip-in'}
                        style={{ display: 'inline-block' }}
                    >
                        {currency}
                    </span>
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                        <path d="M11.5 3.72V6a.5.5 0 0 0 1 0V2.5a.5.5 0 0 0-.5-.5H8.5a.5.5 0 0 0 0 1h2.28L5 8.78V6.5a.5.5 0 0 0-1 0v3.99c0 .28.22.5.5.5H8.5a.5.5 0 0 0 0-1H6.22l5.78-5.77z" />
                    </svg>
                </button>
            </div>

            {/* Preset buttons */}
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Preset amounts">
                {trail.map((style, idx) => {
                    const preset = presets[idx];
                    const isActive = activePreset === preset;
                    const isPressed = pressedId === idx;

                    return (
                        <animated.button
                            key={preset}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            id={`preset-amount-${preset}`}
                            onClick={() => handlePresetClick(preset, idx)}
                            style={{
                                ...style,
                                scale: isPressed && !reducedMotion
                                    ? 0.88
                                    : isActive && !reducedMotion
                                        ? 1.08
                                        : 1,
                                transition: 'box-shadow 0.15s',
                            }}
                            className={`min-w-[52px] px-3 py-2 rounded-xl text-sm font-semibold transition-colors duration-150
                ${isActive
                                    ? 'bg-accent-gold text-gray-900 shadow-lg shadow-accent-gold/30'
                                    : 'bg-navy/40 border border-blue-primary/20 text-gray-300 hover:border-blue-primary/50 hover:text-white'}
              `}
                        >
                            {preset}
                        </animated.button>
                    );
                })}
            </div>

            {/* Custom input */}
            {showCustomInput && (
                <animated.div style={reducedMotion ? {} : inputSpring} className="rounded-xl overflow-hidden">
                    <div className="relative flex items-center bg-navy/40 border border-blue-primary/20 rounded-xl">
                        <span className="pl-4 text-gray-400 text-sm select-none">Custom</span>
                        <input
                            id="custom-tip-amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={customValue}
                            onChange={handleCustomChange}
                            onFocus={() => setInputFocused(true)}
                            onBlur={() => setInputFocused(false)}
                            placeholder="0.00"
                            aria-label="Custom tip amount"
                            className="flex-1 bg-transparent text-right pr-3 py-3 text-white text-sm font-medium outline-none placeholder-gray-600
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="pr-4 text-gray-400 text-xs font-medium">{currency}</span>
                    </div>
                </animated.div>
            )}

            {/* USD equivalent */}
            <p className="text-xs text-gray-500 text-right">
                ≈ <span className="text-gray-300 font-medium">${usdEquivalent} USD</span>
            </p>
        </div>
    );
};

export default AmountSelector;
