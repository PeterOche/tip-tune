"use client";

import React, {
    createContext,
    useState,
    useEffect,
    useCallback,
    ReactNode,
} from "react";
import {
    setAllowed,
    isConnected,
    getAddress,
    getNetwork,
    signTransaction,
} from "@stellar/freighter-api";
import type {
    Network,
    EnhancedWalletState,
    EnhancedWalletContextType,
} from "../types/wallet";
import { WalletError, WalletErrorCode } from "../types/wallet";
import {
    getServer,
    getNetworkPassphrase,
    formatStellarAmount,
} from "../utils/stellar";
import { WalletStateManager } from "../utils/walletState";

interface WalletProviderProps {
    children: ReactNode;
    defaultNetwork?: Network;
}

const WalletContext = createContext<EnhancedWalletContextType | null>(null);

const createDisconnectedState = (
    network: Network,
): EnhancedWalletState => ({
    connectionState: "disconnected",
    isConnected: false,
    isConnecting: false,
    publicKey: null,
    network,
    balance: null,
    error: null,
    lastError: undefined,
    connectionStatus: {
        state: "disconnected",
        error: "Connect your wallet to get started",
        canRetry: false,
    },
});

export const WalletProvider: React.FC<WalletProviderProps> = ({
    children,
    defaultNetwork = "testnet",
}) => {
    const [state, setState] = useState<EnhancedWalletState>(
        createDisconnectedState(defaultNetwork),
    );

    const setLastError = useCallback((error?: WalletError) => {
        setState((prev) => ({
            ...prev,
            lastError: error
                ? {
                      code: error.code,
                      message: error.message,
                      timestamp: Date.now(),
                  }
                : undefined,
        }));
    }, []);

    const clearError = useCallback(() => {
        setState((prev) => ({
            ...prev,
            error: null,
            lastError: undefined,
        }));
    }, []);

    const getConnectionStatus = useCallback(() => {
        return WalletStateManager.getConnectionStatus(
            state.isConnected,
            state.isConnecting,
            state.error,
            state.lastError,
        );
    }, [state.isConnected, state.isConnecting, state.error, state.lastError]);

    const checkFreighterInstalled = useCallback(async (): Promise<boolean> => {
        try {
            if (
                typeof window !== "undefined" &&
                "freighterApi" in window &&
                (window as Window & { freighterApi?: unknown }).freighterApi
            ) {
                return true;
            }

            await isConnected();
            return true;
        } catch {
            return false;
        }
    }, []);

    const fetchBalance = useCallback(
        async (publicKey: string, network: Network) => {
            if (!publicKey || publicKey.trim() === "") {
                console.debug("Cannot fetch balance: no valid publicKey");
                return;
            }

            try {
                const server = getServer(network);
                const account = await server.loadAccount(publicKey);
                const xlmBalance = account.balances.find(
                    (balance) => balance.asset_type === "native",
                );

                setState((prev) => ({
                    ...prev,
                    balance: xlmBalance
                        ? {
                              asset: "XLM",
                              balance: formatStellarAmount(xlmBalance.balance),
                          }
                        : null,
                    error: null,
                }));
            } catch (error) {
                console.error("Error fetching balance:", error);
                setState((prev) => ({
                    ...prev,
                    balance: null,
                    error: "Failed to fetch balance",
                }));
            }
        },
        [],
    );

    useEffect(() => {
        const initializeWallet = async () => {
            try {
                const installed = await checkFreighterInstalled();
                if (!installed) {
                    return;
                }

                const connected = await isConnected();
                if (!connected) {
                    return;
                }

                const { address } = await getAddress();
                const publicKey = address;

                if (!publicKey || publicKey.trim() === "") {
                    console.debug("Connected but no valid address returned");
                    return;
                }

                let network: Network = defaultNetwork;

                try {
                    const { network: freighterNetwork } = await getNetwork();
                    if (freighterNetwork === "PUBLIC") {
                        network = "mainnet";
                    } else if (freighterNetwork === "TESTNET") {
                        network = "testnet";
                    }
                } catch {
                    network = defaultNetwork;
                }

                setState((prev) => ({
                    ...prev,
                    isConnected: true,
                    isConnecting: false,
                    publicKey,
                    network,
                    error: null,
                    lastError: undefined,
                }));

                await fetchBalance(publicKey, network);
            } catch (error) {
                console.debug("Wallet not connected on initialization:", error);
            }
        };

        void initializeWallet();
    }, [defaultNetwork, checkFreighterInstalled, fetchBalance]);

    const connect = useCallback(async () => {
        try {
            setState((prev) => ({
                ...prev,
                isConnecting: true,
                error: null,
                lastError: undefined,
            }));

            const installed = await checkFreighterInstalled();
            if (!installed) {
                const error = new WalletError(
                    WalletErrorCode.NOT_INSTALLED,
                    "Freighter wallet is not installed. Please install it from https://freighter.app",
                );
                setLastError(error);
                throw error;
            }

            const allowed = await setAllowed();
            if (!allowed) {
                const error = new WalletError(
                    WalletErrorCode.USER_REJECTED,
                    "Connection request was rejected",
                );
                setLastError(error);
                throw error;
            }

            const { address } = await getAddress();
            const publicKey = address;
            if (!publicKey) {
                const error = new WalletError(
                    WalletErrorCode.UNKNOWN_ERROR,
                    "Failed to get public key from wallet",
                );
                setLastError(error);
                throw error;
            }

            let network: Network = defaultNetwork;
            try {
                const { network: freighterNetwork } = await getNetwork();
                if (freighterNetwork === "PUBLIC") {
                    network = "mainnet";
                } else if (freighterNetwork === "TESTNET") {
                    network = "testnet";
                }
            } catch {
                network = defaultNetwork;
            }

            setState((prev) => ({
                ...prev,
                isConnected: true,
                isConnecting: false,
                publicKey,
                network,
                error: null,
                lastError: undefined,
            }));

            await fetchBalance(publicKey, network);
        } catch (error) {
            let walletError: WalletError;

            if (error instanceof WalletError) {
                walletError = error;
            } else if (
                error &&
                typeof error === "object" &&
                "message" in error
            ) {
                const message = String(error.message);
                if (message.includes("locked") || message.includes("Locked")) {
                    walletError = new WalletError(
                        WalletErrorCode.LOCKED,
                        "Wallet is locked. Please unlock Freighter and try again.",
                    );
                } else if (
                    message.includes("reject") ||
                    message.includes("Reject")
                ) {
                    walletError = new WalletError(
                        WalletErrorCode.USER_REJECTED,
                        "Request was rejected by user",
                    );
                } else {
                    walletError = new WalletError(
                        WalletErrorCode.UNKNOWN_ERROR,
                        message || "Failed to connect wallet",
                        error,
                    );
                }
            } else {
                walletError = new WalletError(
                    WalletErrorCode.UNKNOWN_ERROR,
                    "An unknown error occurred while connecting wallet",
                    error,
                );
            }

            setLastError(walletError);

            setState((prev) => ({
                ...prev,
                isConnected: false,
                isConnecting: false,
                publicKey: null,
                error: walletError.message,
            }));

            throw walletError;
        }
    }, [defaultNetwork, checkFreighterInstalled, fetchBalance, setLastError]);

    const retryConnection = useCallback(async () => {
        const status = WalletStateManager.getConnectionStatus(
            state.isConnected,
            state.isConnecting,
            state.error,
            state.lastError,
        );

        if (status.canRetry) {
            await connect();
        }
    }, [
        state.isConnected,
        state.isConnecting,
        state.error,
        state.lastError,
        connect,
    ]);

    const disconnect = useCallback(async () => {
        setState(createDisconnectedState(defaultNetwork));
    }, [defaultNetwork]);

    const switchNetwork = useCallback(
        async (network: Network) => {
            try {
                setState((prev) => ({ ...prev, error: null }));

                const publicKey = state.publicKey;
                if (publicKey) {
                    setState((prev) => ({
                        ...prev,
                        network,
                    }));

                    await fetchBalance(publicKey, network);
                }
            } catch (error) {
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : "Failed to switch network";
                setState((prev) => ({
                    ...prev,
                    error: errorMessage,
                }));
                throw new WalletError(
                    WalletErrorCode.NETWORK_ERROR,
                    errorMessage,
                    error,
                );
            }
        },
        [state.publicKey, fetchBalance],
    );

    const refreshBalance = useCallback(async () => {
        if (state.publicKey && state.isConnected) {
            await fetchBalance(state.publicKey, state.network);
        }
    }, [state.publicKey, state.isConnected, state.network, fetchBalance]);

    const signTransactionHandler = useCallback(
        async (transactionXdr: string): Promise<string> => {
            try {
                if (!state.isConnected || !state.publicKey) {
                    throw new WalletError(
                        WalletErrorCode.NOT_INSTALLED,
                        "Wallet is not connected",
                    );
                }

                setState((prev) => ({ ...prev, error: null }));

                const response = await signTransaction(transactionXdr, {
                    networkPassphrase: getNetworkPassphrase(state.network),
                    address: state.publicKey,
                });

                return response.signedTxXdr;
            } catch (error) {
                let walletError: WalletError;

                if (error && typeof error === "object" && "message" in error) {
                    const message = String(error.message);
                    if (
                        message.includes("reject") ||
                        message.includes("Reject")
                    ) {
                        walletError = new WalletError(
                            WalletErrorCode.USER_REJECTED,
                            "Transaction signing was rejected by user",
                        );
                    } else if (
                        message.includes("locked") ||
                        message.includes("Locked")
                    ) {
                        walletError = new WalletError(
                            WalletErrorCode.LOCKED,
                            "Wallet is locked. Please unlock Freighter and try again.",
                        );
                    } else {
                        walletError = new WalletError(
                            WalletErrorCode.UNKNOWN_ERROR,
                            message || "Failed to sign transaction",
                            error,
                        );
                    }
                } else {
                    walletError = new WalletError(
                        WalletErrorCode.UNKNOWN_ERROR,
                        "An unknown error occurred while signing transaction",
                        error,
                    );
                }

                setLastError(walletError);

                setState((prev) => ({
                    ...prev,
                    error: walletError.message,
                }));

                throw walletError;
            }
        },
        [state.isConnected, state.publicKey, state.network, setLastError],
    );

    const connectionStatus = getConnectionStatus();

    const value: EnhancedWalletContextType = {
        ...state,
        connectionState: connectionStatus.state,
        connectionStatus: {
            ...connectionStatus,
            retryAction: connectionStatus.canRetry
                ? retryConnection
                : undefined,
        },
        connect,
        disconnect,
        switchNetwork,
        refreshBalance,
        signTransaction: signTransactionHandler,
        retryConnection,
        clearError,
        getConnectionStatus,
    };

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    );
};

export { WalletContext };
