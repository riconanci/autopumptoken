import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { 
  rpcEndpoint, 
  confirmationCommitment, 
  maxRetries,
  burnAddress as BURN_ADDRESS 
} from '../env';
import { log } from './logger';
import { WalletKeypair, SendTransactionOptions, TransactionError } from '../types';

// Create Solana connection with retry logic
export const connection = new Connection(rpcEndpoint, {
  commitment: confirmationCommitment,
  confirmTransactionInitialTimeout: 60000,
});

// Convert base58 private key to Keypair
export function keypairFromSecret(secretKey: string): Keypair {
  try {
    const decoded = bs58.decode(secretKey);
    return Keypair.fromSecretKey(decoded);
  } catch (error) {
    throw new Error(`Failed to decode wallet secret: ${error}`);
  }
}

// Get wallet from secret key
export function getWalletKeypair(secretKey: string): WalletKeypair {
  const keypair = keypairFromSecret(secretKey);
  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
  };
}

// Convert lamports to SOL
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

// Convert SOL to lamports
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

// Get SOL balance for a wallet
export async function getBalance(publicKey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(publicKey);
  return lamportsToSol(balance);
}

// Get token balance for a wallet
export async function getTokenBalance(
  walletPubkey: PublicKey,
  mintPubkey: PublicKey
): Promise<string> {
  try {
    const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
    const account = await getAccount(connection, ata);
    return account.amount.toString();
  } catch (error) {
    log.debug('Token account not found or error', { 
      wallet: walletPubkey.toBase58(), 
      mint: mintPubkey.toBase58(),
      error: error instanceof Error ? error.message : error 
    });
    return '0';
  }
}

// Send transaction with retry logic
export async function sendTransaction(
  transaction: Transaction,
  signers: Keypair[],
  options: SendTransactionOptions = {}
): Promise<string> {
  const {
    maxRetries: retries = maxRetries,
    skipPreflight = false,
    preflightCommitment = confirmationCommitment,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log.debug(`Transaction attempt ${attempt}/${retries}`);

      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        signers,
        {
          skipPreflight,
          preflightCommitment,
          commitment: confirmationCommitment,
        }
      );

      log.transaction('Transaction confirmed', signature);
      return signature;
    } catch (error) {
      lastError = error as Error;
      log.warn(`Transaction attempt ${attempt} failed`, { error: lastError.message });

      if (attempt < retries) {
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new TransactionError(
    `Transaction failed after ${retries} attempts: ${lastError?.message}`,
    undefined,
    { lastError }
  );
}

// Transfer SOL between wallets
export async function transferSol(
  from: Keypair,
  to: PublicKey,
  amountSol: number
): Promise<string> {
  const lamports = solToLamports(amountSol);

  log.debug('Preparing SOL transfer', {
    from: from.publicKey.toBase58(),
    to: to.toBase58(),
    amount: amountSol,
  });

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = from.publicKey;

  return sendTransaction(transaction, [from]);
}

// Transfer tokens between wallets
export async function transferTokens(
  from: Keypair,
  to: PublicKey,
  mint: PublicKey,
  amount: bigint
): Promise<string> {
  log.debug('Preparing token transfer', {
    from: from.publicKey.toBase58(),
    to: to.toBase58(),
    mint: mint.toBase58(),
    amount: amount.toString(),
  });

  const fromAta = await getAssociatedTokenAddress(mint, from.publicKey);
  const toAta = await getAssociatedTokenAddress(mint, to);

  const transaction = new Transaction().add(
    createTransferInstruction(
      fromAta,
      toAta,
      from.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = from.publicKey;

  return sendTransaction(transaction, [from]);
}

/**
 * Burn tokens by sending to incinerator
 * 
 * CRITICAL FIX: The incinerator address needs an Associated Token Account (ATA)
 * for each token type. This function:
 * 1. Checks if the incinerator's ATA exists
 * 2. Creates it if needed (one-time ~0.002 SOL cost)
 * 3. Transfers tokens to permanently lock them
 */
export async function burnTokens(
  from: Keypair,
  mint: PublicKey,
  amount: bigint
): Promise<string> {
  const incineratorPubkey = new PublicKey(BURN_ADDRESS);
  
  log.burn('Initiating token burn', {
    from: from.publicKey.toBase58(),
    amount: amount.toString(),
    incinerator: incineratorPubkey.toBase58(),
    mint: mint.toBase58(),
  });

  try {
    // Get source ATA (our wallet's token account)
    const fromAta = await getAssociatedTokenAddress(mint, from.publicKey);
    
    // Get destination ATA (incinerator's token account)
    // allowOwnerOffCurve = true because incinerator is not a normal wallet
    const toAta = await getAssociatedTokenAddress(
      mint,
      incineratorPubkey,
      true // allowOwnerOffCurve
    );

    log.burn('Token accounts derived', {
      fromAta: fromAta.toBase58(),
      toAta: toAta.toBase58(),
    });

    // Check if incinerator's ATA exists
    let needsAta = false;
    try {
      const accountInfo = await connection.getAccountInfo(toAta);
      if (!accountInfo) {
        needsAta = true;
        log.burn('Incinerator ATA does not exist, will create it');
      } else {
        log.burn('Incinerator ATA already exists');
      }
    } catch (error) {
      needsAta = true;
      log.burn('Error checking incinerator ATA, will create it', { error });
    }

    // Build transaction
    const transaction = new Transaction();

    // Add instruction to create ATA if needed (one-time cost)
    if (needsAta) {
      const createAtaIx = createAssociatedTokenAccountInstruction(
        from.publicKey,        // payer (pays for the account creation)
        toAta,                 // ata (the account to create)
        incineratorPubkey,     // owner (incinerator owns the account)
        mint,                  // mint (token type)
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      transaction.add(createAtaIx);
      log.burn('Added create ATA instruction (one-time ~0.002 SOL cost)');
    }

    // Add instruction to transfer tokens to incinerator
    const transferIx = createTransferInstruction(
      fromAta,               // source
      toAta,                 // destination
      from.publicKey,        // owner
      amount,                // amount
      [],                    // multisigners
      TOKEN_PROGRAM_ID
    );
    transaction.add(transferIx);

    // Set transaction properties
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = from.publicKey;

    // Sign and send
    transaction.sign(from);
    
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    log.burn('Burn transaction sent', { signature });

    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');

    log.burn('Burn transaction confirmed - tokens permanently locked!', {
      signature,
      amount: amount.toString(),
      explorerUrl: getExplorerUrl(signature),
    });

    return signature;
  } catch (error) {
    log.error('Token burn failed', error, {
      mint: mint.toBase58(),
      amount: amount.toString(),
      incinerator: incineratorPubkey.toBase58(),
    });
    throw error;
  }
}

// Add priority fee to transaction
export function addPriorityFee(
  transaction: Transaction,
  priorityFee: number
): Transaction {
  const instruction = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee,
  });
  
  transaction.add(instruction);
  return transaction;
}

// Get transaction confirmation status
export async function getTransactionStatus(signature: string): Promise<'confirmed' | 'failed' | 'pending'> {
  try {
    const status = await connection.getSignatureStatus(signature);
    
    if (status.value === null) {
      return 'pending';
    }
    
    if (status.value.err) {
      return 'failed';
    }
    
    return 'confirmed';
  } catch (error) {
    log.error('Error checking transaction status', error, { signature });
    return 'pending';
  }
}

// Wait for transaction confirmation
export async function confirmTransaction(
  signature: string,
  timeoutMs: number = 60000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const status = await getTransactionStatus(signature);
    
    if (status === 'confirmed') {
      return true;
    }
    
    if (status === 'failed') {
      return false;
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Transaction confirmation timeout after ${timeoutMs}ms`);
}

// Get Solana explorer URL
export function getExplorerUrl(signature: string, cluster: 'mainnet' | 'devnet' = 'mainnet'): string {
  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/tx/${signature}${clusterParam}`;
}

// Check if connection is healthy
export async function checkConnection(): Promise<boolean> {
  try {
    const version = await connection.getVersion();
    log.debug('Solana RPC connection healthy', { version });
    return true;
  } catch (error) {
    log.error('Solana RPC connection failed', error);
    return false;
  }
}