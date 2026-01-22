import * as StellarSdk from '@stellar/stellar-sdk';
import type { Network } from '../types/wallet';
import { getNetworkPassphrase } from './stellar';

export interface PaymentParams {
  from: string;
  to: string;
  amount: string;
  asset?: StellarSdk.Asset;
  memo?: string;
}

/**
 * Build a payment transaction
 */
export const buildPaymentTransaction = async (
  params: PaymentParams,
  network: Network = 'testnet'
): Promise<string> => {
  try {
    const server = new StellarSdk.Server(
      network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'
    );

    // Load source account
    const sourceAccount = await server.loadAccount(params.from);

    // Create transaction builder
    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: getNetworkPassphrase(network),
    });

    // Add payment operation
    const asset = params.asset || StellarSdk.Asset.native();
    transaction.addOperation(
      StellarSdk.Operation.payment({
        destination: params.to,
        asset: asset,
        amount: params.amount,
      })
    );

    // Add memo if provided
    if (params.memo) {
      transaction.addMemo(StellarSdk.Memo.text(params.memo));
    }

    // Set timeout (5 minutes)
    transaction.setTimeout(300);

    // Build transaction
    const builtTransaction = transaction.build();

    // Return XDR string
    return builtTransaction.toXDR();
  } catch (error) {
    throw new Error(
      `Failed to build transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Submit a signed transaction to the network
 */
export const submitTransaction = async (
  signedXdr: string,
  network: Network = 'testnet'
): Promise<StellarSdk.TransactionResponse> => {
  try {
    const server = new StellarSdk.Server(
      network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'
    );

    const transaction = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      getNetworkPassphrase(network)
    );

    return await server.submitTransaction(transaction);
  } catch (error) {
    if (error instanceof StellarSdk.HorizonApi.TransactionFailedError) {
      throw new Error(
        `Transaction failed: ${error.response.extras?.result_codes?.transaction || error.message}`
      );
    }
    throw new Error(
      `Failed to submit transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Create and submit a payment transaction
 */
export const sendPayment = async (
  params: PaymentParams,
  signTransaction: (xdr: string) => Promise<string>,
  network: Network = 'testnet'
): Promise<StellarSdk.TransactionResponse> => {
  // Build transaction
  const transactionXdr = await buildPaymentTransaction(params, network);

  // Sign transaction
  const signedXdr = await signTransaction(transactionXdr);

  // Submit transaction
  return await submitTransaction(signedXdr, network);
};
