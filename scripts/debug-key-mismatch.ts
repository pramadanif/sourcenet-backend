import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';

const TEST_KEY = 'suiprivkey1qytkckkxjg4n8mstmdkwg90x6vw2gp5kv6njsys9xgwpva49nyaqctexq74';
const EXPECTED_ADDRESS = '0xfd772cf73b7234594c34edf10650fcd71040e90566ce63b53c7434ac79c4461a';

async function debugKey() {
    console.log('🔍 Debugging Private Key Derivation');
    console.log(`Input Key: ${TEST_KEY}`);
    console.log(`Expected Address: ${EXPECTED_ADDRESS}`);

    try {
        const { schema, secretKey } = decodeSuiPrivateKey(TEST_KEY);
        console.log(`\n🔑 Decoded Schema: ${schema}`);
        console.log(`🔑 Secret Key Length: ${secretKey.length} bytes`);

        let keypair;
        let address;

        if (schema === 'ED25519') {
            keypair = Ed25519Keypair.fromSecretKey(secretKey);
        } else if (schema === 'Secp256k1') {
            keypair = Secp256k1Keypair.fromSecretKey(secretKey);
        } else if (schema === 'Secp256r1') {
            keypair = Secp256r1Keypair.fromSecretKey(secretKey);
        } else {
            console.error(`❌ Unsupported schema: ${schema}`);
            return;
        }

        address = keypair.toSuiAddress();
        console.log(`\n📝 Derived Address: ${address}`);

        if (address === EXPECTED_ADDRESS) {
            console.log('✅ MATCH! The key corresponds to the expected address.');
        } else {
            console.error('❌ MISMATCH! The key does NOT correspond to the expected address.');
            console.error(`   Got:      ${address}`);
            console.error(`   Expected: ${EXPECTED_ADDRESS}`);
        }

    } catch (error: any) {
        console.error('❌ Error decoding key:', error.message);
    }
}

debugKey();
