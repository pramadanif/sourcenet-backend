import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';;
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { env } from '../src/config/env';

async function testBlockchain() {
    console.log('Testing Blockchain Connection...');
    console.log(`Network: ${env.SUI_NETWORK}`);
    console.log(`RPC: ${env.SUI_RPC_URL}`);

    try {
        const client = new SuiClient({ url: env.SUI_RPC_URL || getFullnodeUrl(env.SUI_NETWORK as any) });

        // Test 1: Check Sponsor Balance
        try {
            let keypair: Secp256k1Keypair;
            const privateKey = env.SUI_SPONSOR_PRIVATE_KEY;

            if (privateKey.startsWith('suiprivkey')) {
                const { schema, secretKey } = decodeSuiPrivateKey(privateKey);
                keypair = Secp256k1Keypair.fromSecretKey(secretKey);
            } else {
                // Try Base64 first
                try {
                    const secretKey = Buffer.from(privateKey, 'base64');
                    if (secretKey.length !== 32) throw new Error('Invalid length');
                    keypair = Secp256k1Keypair.fromSecretKey(secretKey);
                } catch {
                    // Try Hex
                    const secretKey = Buffer.from(privateKey, 'hex');
                    keypair = Secp256k1Keypair.fromSecretKey(secretKey);
                }
            }

            const address = keypair.toSuiAddress();
            console.log(`Sponsor Address: ${address}`);

            const balance = await client.getBalance({ owner: address });
            console.log(`Sponsor Balance: ${balance.totalBalance} MIST`);

            if (BigInt(balance.totalBalance) < BigInt(100000000)) { // 0.1 SUI
                console.warn('⚠️ Sponsor balance is low!');
            }
        } catch (error: any) {
            console.error('❌ Failed to load sponsor key or check balance:', error.message);
        }

        // Test 2: Check Package
        try {
            console.log(`Checking Package: ${env.SOURCENET_PACKAGE_ID}`);
            const pkg = await client.getObject({
                id: env.SOURCENET_PACKAGE_ID,
                options: { showContent: true }
            });

            if (pkg.data) {
                console.log('✅ Package found');
            } else {
                console.error('❌ Package not found (might be deleted or wrong network)');
            }
        } catch (error: any) {
            console.error('❌ Failed to check package:', error.message);
        }

    } catch (error: any) {
        console.error('❌ Failed to initialize client:', error.message);
    }
}

testBlockchain();
