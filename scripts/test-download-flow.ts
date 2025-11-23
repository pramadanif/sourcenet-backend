
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

// Force Port 3000 for consistency
// Force Port 3001 for consistency with running dev server
process.env.PORT = '3001';
process.env.API_BASE_URL = 'http://localhost:3001/api';

// import '../src/main'; // Use running server instead
import { EncryptionService } from '../src/services/encryption.service';

// Load env vars
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
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
        const secretKey = Buffer.from(keyStr, 'base64').slice(0, 32);
        const ed25519 = Ed25519Keypair.fromSecretKey(secretKey);
        if (ed25519.toSuiAddress() === SPONSOR_ADDRESS) {
            return ed25519;
        }
        const secp256k1 = Secp256k1Keypair.fromSecretKey(secretKey);
        if (secp256k1.toSuiAddress() === SPONSOR_ADDRESS) {
            return secp256k1;
        }
        return ed25519;
    }
}

const sponsorKeypair = getKeypair(SPONSOR_PRIVATE_KEY);
const EFFECTIVE_SPONSOR_ADDRESS = sponsorKeypair.toSuiAddress();

async function checkBalanceAndFund(address: string) {
    const balance = await client.getBalance({ owner: address });
    console.log(`💰 Balance for ${address}: ${Number(balance.totalBalance) / 1e9} SUI`);

    if (Number(balance.totalBalance) < 1000000000) { // Less than 1 SUI
        console.log('🚰 Requesting SUI from faucet...');
        try {
            await axios.post('https://faucet.testnet.sui.io/gas', {
                FixedAmountRequest: { recipient: address }
            });
            console.log('✅ Faucet request sent. Waiting for indexing...');
            await new Promise(r => setTimeout(r, 5000));
        } catch (e: any) {
            console.warn(`⚠️ Faucet request failed: ${e.message}`);
        }
    }
}

async function fundAddress(recipient: string, amount: number) {
    console.log(`💸 Funding ${recipient} with ${amount / 1e9} SUI...`);
    const tx = new Transaction();
    tx.setSender(EFFECTIVE_SPONSOR_ADDRESS);
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
    await new Promise(r => setTimeout(r, 2000));
}

async function createTestDataPod(sellerToken: string) {
    console.log('\n📦 Creating Test DataPod...');
    const timestamp = Date.now();
    const tempFile = path.join('/tmp', `test-data-${timestamp}.json`);
    const fileContent = JSON.stringify({ test: 'data', ts: timestamp, secret: 'This is secret content!' });
    fs.writeFileSync(tempFile, fileContent);

    // Upload
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFile));
    formData.append('metadata', JSON.stringify({
        title: `Download Test ${timestamp}`,
        category: 'test',
        description: 'Testing download flow',
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
    return { datapodId: publishRes.data.datapod_id, originalContent: fileContent };
}

async function seedUser(address: string, role: string) {
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
        console.log('🚀 Starting Download Flow Test');

        // Wait for server to start
        console.log('⏳ Waiting for server to start...');
        await new Promise(r => setTimeout(r, 5000));

        // 1. Setup Users
        const sellerKeypair = new Ed25519Keypair();
        const buyerKeypair = new Ed25519Keypair();
        const sellerAddress = sellerKeypair.toSuiAddress();
        const buyerAddress = buyerKeypair.toSuiAddress();

        await seedUser(sellerAddress, 'Seller');
        await checkBalanceAndFund(EFFECTIVE_SPONSOR_ADDRESS);
        await fundAddress(buyerAddress, 50000000); // 0.05 SUI

        // --- DIAGNOSTIC CHECKS ---
        console.log('\n🔍 Running Diagnostic Checks...');
        try {
            const health = await axios.get(`${API_BASE_URL.replace('/api', '')}/health`);
            console.log('✅ Health Check:', health.status, health.data);
        } catch (e: any) {
            console.error('❌ Health Check Failed:', e.message);
        }

        try {
            // Expect 401
            await axios.get(`${API_BASE_URL}/buyer/purchases`);
            console.error('❌ /buyer/purchases should require auth but got 200 OK');
        } catch (e: any) {
            if (e.response && e.response.status === 401) {
                console.log('✅ /buyer/purchases exists (got 401 as expected)');
            } else if (e.response && e.response.status === 404) {
                console.error('❌ /buyer/purchases NOT FOUND (404)');
                console.error('Response:', JSON.stringify(e.response.data, null, 2));
            } else {
                console.error('❌ /buyer/purchases error:', e.message);
            }
        }
        // -------------------------

        await seedUser(buyerAddress, 'Buyer');
        const buyerToken = generateToken('buyer-id-' + Date.now(), buyerAddress);

        const sellerUser = await prisma.user.findUnique({ where: { walletAddress: sellerAddress } });
        const sellerToken = generateToken(sellerUser!.id, sellerAddress);

        // 2. Create DataPod
        const { datapodId, originalContent } = await createTestDataPod(sellerToken);

        // 3. Buyer Sends Payment
        console.log('\n💸 Sending Payment...');
        const price = 10000000; // 0.01 SUI
        const tx = new Transaction();
        tx.setSender(buyerAddress);
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(price)]);
        tx.transferObjects([coin], tx.pure.address(EFFECTIVE_SPONSOR_ADDRESS));

        const paymentRes = await client.signAndExecuteTransaction({
            signer: buyerKeypair,
            transaction: tx,
            options: { showEffects: true, showBalanceChanges: true }
        });

        if (paymentRes.effects?.status.status !== 'success') throw new Error('Payment failed');
        const paymentDigest = paymentRes.digest;
        console.log('✅ Payment Sent:', paymentDigest);
        await new Promise(r => setTimeout(r, 2000));

        // 4. Capture Purchase
        console.log('\n📸 Capturing Purchase...');
        const captureRes = await axios.post(`${API_BASE_URL}/buyer/purchase`, {
            datapod_id: datapodId,
            payment_tx_digest: paymentDigest
        }, {
            headers: { 'Authorization': `Bearer ${buyerToken}` }
        });

        const purchaseRequestId = captureRes.data.purchase_request_id;
        const buyerPrivateKey = captureRes.data.private_key;
        console.log('✅ Purchase Captured. ID:', purchaseRequestId);
        console.log('   Buyer Private Key (Ephemeral):', buyerPrivateKey ? 'RECEIVED' : 'MISSING');

        if (!buyerPrivateKey) throw new Error('Buyer private key missing');

        // 5. Wait for Fulfillment
        console.log('\n⏳ Waiting for Fulfillment...');
        let fulfilled = false;
        let attempts = 0;
        while (!fulfilled && attempts < 30) { // Wait up to 60s
            try {
                console.log(`\nPolling attempt ${attempts + 1}...`);
                const statusRes = await axios.get(`${API_BASE_URL}/buyer/purchases`, {
                    headers: { 'Authorization': `Bearer ${buyerToken}` }
                });

                // console.log('Purchases found:', statusRes.data.data.purchases.length);
                const purchase = statusRes.data.data.purchases.find((p: any) => p.purchaseRequestId === purchaseRequestId);

                if (purchase) {
                    console.log('Purchase Status:', purchase.status);
                    if (purchase.status === 'completed') {
                        console.log('✅ Purchase Fulfilled!');
                        fulfilled = true;
                    }
                } else {
                    console.log('Purchase not found in list yet.');
                }
            } catch (pollError: any) {
                console.error('Polling failed:', pollError.message);
                if (pollError.response) {
                    console.error('Poll Status:', pollError.response.status);
                    console.error('Poll URL:', pollError.config?.url);
                }
                throw pollError; // Re-throw to exit
            }

            if (!fulfilled) {
                process.stdout.write('.');
                await new Promise(r => setTimeout(r, 2000));
                attempts++;
            }
        }

        if (!fulfilled) throw new Error('Fulfillment timed out');

        // 6. Get Download URL
        console.log('\n🔗 Getting Download URL...');
        const urlRes = await axios.get(`${API_BASE_URL}/buyer/purchase/${purchaseRequestId}/download-url`, {
            headers: { 'Authorization': `Bearer ${buyerToken}` }
        });

        const { direct_url, proxy_url, decryption_key } = urlRes.data.data;
        console.log('✅ URLs Received');
        console.log('   Direct:', direct_url);
        console.log('   Proxy:', proxy_url);
        console.log('   Decryption Key Metadata:', decryption_key ? 'RECEIVED' : 'MISSING');

        if (!decryption_key) throw new Error('Decryption key metadata missing');

        // 7. Download Data
        console.log('\n⬇️ Downloading Data (via Proxy)...');
        const downloadRes = await axios.get(proxy_url, {
            headers: { 'Authorization': `Bearer ${buyerToken}` },
            responseType: 'arraybuffer'
        });

        console.log('✅ Data Downloaded. Size:', downloadRes.data.length);

        // 8. Decrypt Data
        console.log('\n🔓 Decrypting Data...');
        const metadata = JSON.parse(decryption_key);

        const decryptedBuffer = await EncryptionService.decryptData(
            metadata.encryptedEphemeralKey,
            Buffer.from(downloadRes.data).toString('base64'), // Convert binary to base64 for service
            metadata.nonce,
            metadata.tag,
            buyerPrivateKey
        );

        const decryptedContent = decryptedBuffer.toString('utf-8');
        console.log('✅ Decrypted Content:', decryptedContent);

        if (decryptedContent === originalContent) {
            console.log('\n🎉 SUCCESS: Decrypted content matches original!');
        } else {
            console.error('\n❌ FAILURE: Content mismatch');
            console.error('Expected:', originalContent);
            console.error('Got:', decryptedContent);
            throw new Error('Content mismatch');
        }

    } catch (error: any) {
        console.error('\n❌ Test Failed:', error.message);
        if (error.config) {
            console.error('Request URL:', error.config.url);
            console.error('Request Method:', error.config.method);
        }
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
        // Force exit to stop worker
        process.exit(0);
    }
}

runTest();
