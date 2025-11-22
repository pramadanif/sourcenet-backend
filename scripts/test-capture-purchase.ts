import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import dotenv from 'dotenv';

// Load env vars
dotenv.config();

// Ensure API_BASE_URL ends with /api
let API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
if (!API_BASE_URL.endsWith('/api')) {
    API_BASE_URL += '/api';
}

const SUI_RPC_URL = process.env.SUI_RPC_URL || getFullnodeUrl('testnet');
const SPONSOR_PRIVATE_KEY = process.env.SUI_SPONSOR_PRIVATE_KEY || '';
const SPONSOR_ADDRESS = process.env.SUI_SPONSOR_ADDRESS || '';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-at-least-32-chars-long';

if (!SPONSOR_PRIVATE_KEY || !SPONSOR_ADDRESS) {
    console.error('❌ Missing SUI_SPONSOR_PRIVATE_KEY or SUI_SPONSOR_ADDRESS in .env');
    process.exit(1);
}

// Initialize Sui Client
const client = new SuiClient({ url: SUI_RPC_URL });
const prisma = new PrismaClient();

// Helper: Generate JWT
function generateToken(userId: string, address: string) {
    return jwt.sign(
        { userId, address },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

// Helper: Get Keypair from string
function getKeypair(keyStr: string) {
    try {
        const decoded = decodeSuiPrivateKey(keyStr);
        if (decoded.schema === 'Secp256k1') {
            return Secp256k1Keypair.fromSecretKey(decoded.secretKey);
        }
        return Ed25519Keypair.fromSecretKey(decoded.secretKey);
    } catch (e) {
        // Fallback for base64 - try to match SPONSOR_ADDRESS if possible, otherwise default to Ed25519
        const secretKey = Buffer.from(keyStr, 'base64').slice(0, 32);

        // Try Ed25519 first
        const ed25519 = Ed25519Keypair.fromSecretKey(secretKey);
        if (ed25519.toSuiAddress() === SPONSOR_ADDRESS) {
            return ed25519;
        }

        // Try Secp256k1
        const secp256k1 = Secp256k1Keypair.fromSecretKey(secretKey);
        if (secp256k1.toSuiAddress() === SPONSOR_ADDRESS) {
            console.log('Detected Secp256k1 key scheme');
            return secp256k1;
        }

        // Default to Ed25519 if no match
        return ed25519;
    }
}

const sponsorKeypair = getKeypair(SPONSOR_PRIVATE_KEY);
const EFFECTIVE_SPONSOR_ADDRESS = sponsorKeypair.toSuiAddress();
console.log(`🔐 Effective Sponsor Address (from Key): ${EFFECTIVE_SPONSOR_ADDRESS}`);

if (EFFECTIVE_SPONSOR_ADDRESS !== SPONSOR_ADDRESS) {
    console.warn(`⚠️ Mismatch between env SUI_SPONSOR_ADDRESS and derived address.`);
    console.warn(`   Env: ${SPONSOR_ADDRESS}`);
    console.warn(`   Key: ${EFFECTIVE_SPONSOR_ADDRESS}`);
    console.warn(`   Using derived address ${EFFECTIVE_SPONSOR_ADDRESS} for testing.`);
}

async function checkBalanceAndFund(address: string) {
    const balance = await client.getBalance({ owner: address });
    console.log(`💰 Balance for ${address}: ${Number(balance.totalBalance) / 1e9} SUI`);

    if (Number(balance.totalBalance) < 1000000000) { // Less than 1 SUI
        console.log('🚰 Requesting SUI from faucet...');
        let retries = 3;
        while (retries > 0) {
            try {
                await axios.post('https://faucet.testnet.sui.io/gas', {
                    FixedAmountRequest: { recipient: address }
                });
                console.log('✅ Faucet request sent. Waiting for indexing...');
                await new Promise(r => setTimeout(r, 5000));
                return;
            } catch (e: any) {
                console.warn(`⚠️ Faucet request failed: ${e.response?.data || e.message}. Retrying in 5s...`);
                retries--;
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        console.error('❌ Failed to get funds from faucet after retries.');
    }
}

async function fundAddress(recipient: string, amount: number) {
    console.log(`💸 Funding ${recipient} with ${amount / 1e9} SUI...`);

    const signerAddress = sponsorKeypair.toSuiAddress();
    console.log('Signer Address (Keypair):', signerAddress);
    console.log('Sponsor Address (Env):', SPONSOR_ADDRESS);

    if (signerAddress !== SPONSOR_ADDRESS) {
        console.error('❌ Address Mismatch! Private Key does not match SPONSOR_ADDRESS');
    }

    // Debug coins
    const coins = await client.getAllCoins({ owner: signerAddress });
    console.log('Debug Coins:', coins.data.map(c => `${c.coinObjectId}: ${c.balance} (${c.coinType})`).join(', '));

    const tx = new Transaction();
    tx.setSender(signerAddress);
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.transferObjects([coin], tx.pure.address(recipient));

    const result = await client.signAndExecuteTransaction({
        signer: sponsorKeypair,
        transaction: tx,
        options: { showEffects: true }
    });

    if (result.effects?.status.status !== 'success') {
        throw new Error('Funding failed');
    }
    console.log('✅ Funded. Digest:', result.digest);

    // Wait for indexing
    await new Promise(r => setTimeout(r, 2000));
}

async function createTestDataPod(sellerToken: string) {
    console.log('\n📦 Creating Test DataPod...');
    const timestamp = Date.now();
    const tempFile = path.join('/tmp', `test-data-${timestamp}.json`);
    fs.writeFileSync(tempFile, JSON.stringify({ test: 'data', ts: timestamp }));

    // Upload
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFile));
    formData.append('metadata', JSON.stringify({
        title: `Capture Test ${timestamp}`,
        category: 'test',
        description: 'Testing capture purchase flow',
        price_sui: 0.01,
        tags: ['test']
    }));

    const uploadRes = await axios.post(`${API_BASE_URL}/seller/upload`, formData, {
        headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${sellerToken}` }
    });

    // Publish
    const publishRes = await axios.post(`${API_BASE_URL}/seller/publish`, {
        upload_id: uploadRes.data.upload_id
    }, {
        headers: { 'Authorization': `Bearer ${sellerToken}` }
    });

    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

    console.log('✅ DataPod Created:', publishRes.data.datapod_id);
    return publishRes.data.datapod_id;
}

async function seedUser(address: string, role: string) {
    console.log(`🌱 Seeding ${role} user: ${address}`);
    await prisma.user.upsert({
        where: { walletAddress: address },
        update: {},
        create: {
            walletAddress: address,
            username: `${role}_${address.slice(0, 6)}`,
        },
    });
}

async function runTest() {
    try {
        console.log('🚀 Starting Capture Purchase Test');

        // 1. Setup Users
        const sellerKeypair = new Ed25519Keypair();
        const buyerKeypair = new Ed25519Keypair();
        const sellerAddress = sellerKeypair.toSuiAddress();
        const buyerAddress = buyerKeypair.toSuiAddress();

        console.log('Seller:', sellerAddress);
        console.log('Buyer:', buyerAddress);

        // Seed Seller
        await seedUser(sellerAddress, 'Seller');

        // Check Sponsor Balance
        await checkBalanceAndFund(EFFECTIVE_SPONSOR_ADDRESS);

        // 2. Fund Buyer from Sponsor
        // We need a separate buyer to test the payment flow correctly (Sponsor -> Sponsor is tricky to verify)
        await fundAddress(buyerAddress, 50000000); // 0.05 SUI

        // 3. Generate Tokens
        const TEST_BUYER_KEYPAIR = buyerKeypair;
        const TEST_BUYER_ADDRESS = buyerAddress;

        console.log('Using Real Buyer for testing:', TEST_BUYER_ADDRESS);

        // Seed Buyer
        await seedUser(buyerAddress, 'Buyer');

        const buyerToken = generateToken('buyer-user-id-' + Date.now(), TEST_BUYER_ADDRESS);

        // Generate Seller Token
        const sellerUser = await prisma.user.findUnique({ where: { walletAddress: sellerAddress } });
        if (!sellerUser) throw new Error('Seller seeding failed');
        const sellerToken = generateToken(sellerUser.id, sellerAddress);

        // 4. Create DataPod
        const datapodId = await createTestDataPod(sellerToken);

        // 5. Buyer Sends Payment
        console.log('\n💸 Sending Payment to Sponsor...');
        const price = 10000000; // 0.01 SUI

        const tx = new Transaction();
        tx.setSender(TEST_BUYER_ADDRESS);
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(price)]);
        tx.transferObjects([coin], tx.pure.address(EFFECTIVE_SPONSOR_ADDRESS));

        const paymentRes = await client.signAndExecuteTransaction({
            signer: TEST_BUYER_KEYPAIR,
            transaction: tx,
            options: { showEffects: true, showBalanceChanges: true }
        });

        if (paymentRes.effects?.status.status !== 'success') {
            throw new Error('Payment transaction failed');
        }

        const paymentDigest = paymentRes.digest;
        console.log('✅ Payment Sent. Digest:', paymentDigest);
        console.log('   Balance Changes:', JSON.stringify(paymentRes.balanceChanges, null, 2));

        // Wait for indexing
        await new Promise(r => setTimeout(r, 2000));

        // 6. Capture Purchase
        console.log('\n📸 Capturing Purchase...');
        const captureRes = await axios.post(`${API_BASE_URL}/buyer/purchase`, {
            datapod_id: datapodId,
            payment_tx_digest: paymentDigest
        }, {
            headers: { 'Authorization': `Bearer ${buyerToken}` }
        });

        console.log('✅ Purchase Captured!');
        console.log('   Purchase ID:', captureRes.data.purchase_request_id);
        console.log('   Private Key:', captureRes.data.private_key ? 'Present (Hidden)' : 'MISSING');

        if (!captureRes.data.private_key) throw new Error('Private key missing in response');

        console.log('\n🎉 Test Completed Successfully!');

    } catch (error: any) {
        console.error('\n❌ Test Failed:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

runTest();
