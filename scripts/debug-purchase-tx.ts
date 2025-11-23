import { BlockchainService } from '../src/services/blockchain.service';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import nacl from 'tweetnacl';
import { Transaction } from '@mysten/sui/transactions';

// Configuration - Replace with values from your test failure or environment
const DATAPOD_ID = process.env.DATAPOD_ID || '0x3324e5583f7a8ab22c99a78c3609cd9f97e308dc6c9bb4096db7c416d520b9af';
const BUYER_ADDRESS = process.env.BUYER_ADDRESS || '0xbaf4fc7a98187c47f2e127c0fd007ce5f8351e4e3f45eecb8fdde0a43f0beaec';

async function debugPurchaseTx() {
    console.log('🚀 Starting Debug Purchase Transaction Script...');
    console.log(`DataPod ID: ${DATAPOD_ID}`);
    console.log(`Buyer Address: ${BUYER_ADDRESS}`);

    try {
        // 1. Fetch DataPod and Seller
        console.log('\n1️⃣ Fetching DataPod and Seller...');
        const datapod = await prisma.dataPod.findUnique({
            where: { datapodId: DATAPOD_ID },
        });

        if (!datapod) {
            throw new Error('DataPod not found');
        }
        console.log('✅ DataPod found:', datapod.title);

        const seller = await prisma.user.findUnique({
            where: { id: datapod.sellerId },
        });

        if (!seller) {
            throw new Error('Seller not found');
        }
        console.log('✅ Seller found:', seller.username);

        const sellerAddress = seller.zkloginAddress || seller.walletAddress;
        if (!sellerAddress) {
            throw new Error('Seller has no address');
        }
        console.log('Seller Address:', sellerAddress);


        // 2. Generate Ephemeral Keys
        console.log('\n2️⃣ Generating Ephemeral Keys...');
        const keyPair = nacl.box.keyPair();
        const buyerPublicKey = Buffer.from(keyPair.publicKey).toString('base64');
        console.log('Buyer Public Key:', buyerPublicKey);

        // 3. Build PTB
        console.log('\n3️⃣ Building Purchase PTB...');
        const purchaseTx = BlockchainService.buildPurchasePTB(
            {
                datapodId: DATAPOD_ID,
                buyer: BUYER_ADDRESS,
                seller: sellerAddress,
                price: Math.floor(datapod.priceSui.toNumber() * 1e9),
                buyerPublicKey: buyerPublicKey,
                dataHash: datapod.dataHash,
            },
            env.SUI_SPONSOR_ADDRESS,
        );
        console.log('✅ PTB Built successfully');

        // 4. Execute Transaction
        console.log('\n4️⃣ Executing Transaction...');
        const txDigest = await BlockchainService.executeTransaction(purchaseTx);
        console.log('✅ Transaction Executed! Digest:', txDigest);

        // 5. Wait for Confirmation
        console.log('\n5️⃣ Waiting for Confirmation...');
        await BlockchainService.waitForTransaction(txDigest);
        console.log('✅ Transaction Confirmed!');

    } catch (error: any) {
        console.error('\n❌ Transaction Failed!');
        console.error('Error Message:', error.message);
        if (error.cause) {
            console.error('Cause:', error.cause);
        }
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        // Try to inspect the error object deeper if it's a JSON-RPC error
        if (JSON.stringify(error).includes('error')) {
            console.error('Full Error Object:', JSON.stringify(error, null, 2));
        }
    } finally {
        await prisma.$disconnect();
    }
}

debugPurchaseTx();
