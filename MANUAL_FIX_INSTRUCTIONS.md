/**
 * STEP-BY-STEP SECP256K1 FIX INSTRUCTIONS
 * ========================================
 * 
 * The automated file editing tools are having trouble with blockchain.service.ts.
 * Please apply these changes manually:
 */

## STEP 1: Add imports at the top of the file (after line 3)

Add these three lines after `import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';`:

```typescript
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
```

Also add this right after `import { Transaction } from '@mysten/sui/transactions';`:

```typescript
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
```

## STEP 2: Replace the keypair creation logic (around lines 327-330)

Find this code in the `executeTransaction` method:

```typescript
        // Create keypair from private key (expects base64 format)
        const keypair = Ed25519Keypair.fromSecretKey(
          Buffer.from(sponsorPrivateKey, 'base64')
        );
```

Replace it with:

```typescript
        // Create keypair from private key (supports multiple formats)
        let keypair: Ed25519Keypair | Secp256k1Keypair | Secp256r1Keypair;

        try {
          if (sponsorPrivateKey.startsWith('suiprivkey')) {
            const { schema, secretKey } = decodeSuiPrivateKey(sponsorPrivateKey);
            if (schema === 'ED25519') {
              keypair = Ed25519Keypair.fromSecretKey(secretKey);
            } else if (schema === 'Secp256k1') {
              keypair = Secp256k1Keypair.fromSecretKey(secretKey);
            } else if (schema === 'Secp256r1') {
              keypair = Secp256r1Keypair.fromSecretKey(secretKey);
            } else {
              throw new Error(`Unsupported key schema: ${schema}`);
            }
          } else {
            // Fallback for base64/hex (assume Ed25519)
            const secretKey = Buffer.from(sponsorPrivateKey, 'base64');
            keypair = Ed25519Keypair.fromSecretKey(secretKey);
          }
        } catch (keyError) {
          logger.error('Failed to parse sponsor private key', { error: keyError });
          throw new Error('Invalid sponsor private key format');
        }
```

## STEP 3: Save and restart

Save the file and restart your server: `npm run dev`

Your Secp256k1 private key should now work!
