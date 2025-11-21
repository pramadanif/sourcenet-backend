import axios from 'axios';
import nacl from 'tweetnacl';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

// Configuration
const API_BASE_URL = 'http://localhost:3001/api';
const SELLER_TOKEN = process.env.SELLER_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhYzRhZDlkMS05ZTRhLTQ2MjctOTA1OC0zZWRhMzUwNTBkMTEiLCJhZGRyZXNzIjoiMHg5NjY0NmNlNDAwYTU3MTlkZTE4NzE1NTE4ZDdiMWJlYjcxYzkxNDk2MzY0MjdhNDZjZWZkMmFhMWU0ZjUwZGNkIiwiaWF0IjoxNzYzNjU3NjUxLCJleHAiOjE3NjQyNjI0NTF9.yLVB224DqZPjSBf-9bANNDUrpA02ZoWlRH5kjCay1wY';
const BUYER_TOKEN = process.env.BUYER_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhYzRhZDlkMS05ZTRhLTQ2MjctOTA1OC0zZWRhMzUwNTBkMTEiLCJhZGRyZXNzIjoiMHg5NjY0NmNlNDAwYTU3MTlkZTE4NzE1NTE4ZDdiMWJlYjcxYzkxNDk2MzY0MjdhNDZjZWZkMmFhMWU0ZjUwZGNkIiwiaWF0IjoxNzYzNzUxMjcxLCJleHAiOjE3NjQzNTYwNzF9.rZ0LIKL8DG1NUOz-VJEa24zY-QXGYE6yoi29Z_3Ogqg';
const BUYER_ADDRESS = process.env.BUYER_ADDRESS || '0x96646ce400a5719de18715518d7b1beb71c9149636427a46cefd2aa1e4f50dcd';

// Generate ephemeral keypair for encryption
const keyPair = nacl.box.keyPair();
const buyerPublicKey = Buffer.from(keyPair.publicKey).toString('base64');
const buyerPrivateKey = Buffer.from(keyPair.secretKey).toString('base64');

console.log('🔑 Generated Ephemeral Keys:');
console.log('Public Key:', buyerPublicKey);
console.log('Private Key:', buyerPrivateKey);

async function createTestDataPod() {
    console.log('\n📦 Step 1: Creating Test DataPod...');

    try {
        // Create a test file with unique timestamp
        const timestamp = Date.now();
        const testData = JSON.stringify({
            name: `Test Dataset ${timestamp}`,
            description: `Sample data for testing buyer flow - ${timestamp}`,
            timestamp: timestamp,
            records: [
                { id: 1, value: 'test1', ts: timestamp },
                { id: 2, value: 'test2', ts: timestamp },
                { id: 3, value: 'test3', ts: timestamp },
            ]
        }, null, 2);

        const tempFile = path.join('/tmp', 'test-data.json');
        fs.writeFileSync(tempFile, testData);

        // Upload file
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFile));
        formData.append('metadata', JSON.stringify({
            title: 'Test Dataset for Buyer Flow',
            category: 'test',
            description: 'A test dataset to verify buyer purchase flow',
            price_sui: 0.1,
            tags: ['test', 'sample']
        }));

        const uploadResponse = await axios.post(`${API_BASE_URL}/seller/upload`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${SELLER_TOKEN}`,
            },
        });

        console.log('✅ File uploaded:', uploadResponse.data.upload_id);

        // Publish DataPod
        const publishResponse = await axios.post(`${API_BASE_URL}/seller/publish`, {
            upload_id: uploadResponse.data.upload_id
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SELLER_TOKEN}`,
            }
        });

        console.log('✅ DataPod published:', publishResponse.data.datapod_id);

        // Clean up temp file
        fs.unlinkSync(tempFile);

        return publishResponse.data.datapod_id;

    } catch (error: any) {
        console.error('❌ Failed to create test DataPod:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
        throw error;
    }
}

async function testBuyerFlow(datapodId: string) {
    console.log('\n🛒 Step 2: Testing Buyer Purchase Flow...');

    const buyerAxios = axios.create({
        baseURL: `${API_BASE_URL}/buyer`,
        headers: {
            'Authorization': `Bearer ${BUYER_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });

    try {
        // 1. Create Purchase
        console.log('\n1️⃣ Creating Purchase...');
        const purchaseResponse = await buyerAxios.post('/purchase', {
            datapod_id: datapodId,
            buyer_address: BUYER_ADDRESS,
            buyer_public_key: buyerPublicKey,
        });
        console.log('✅ Purchase Created:');
        console.log('   Purchase ID:', purchaseResponse.data.purchase_request_id);
        console.log('   TX Digest:', purchaseResponse.data.tx_digest);
        console.log('   Escrow Status:', purchaseResponse.data.escrow_status);

        const purchaseRequestId = purchaseResponse.data.purchase_request_id;

        // 2. Get Purchase Status
        console.log(`\n2️⃣ Checking Purchase Status...`);
        const statusResponse = await buyerAxios.get(`/purchase/${purchaseRequestId}`);
        console.log('✅ Status:', statusResponse.data.purchase_status);
        console.log('   DataPod:', statusResponse.data.datapod_title);
        console.log('   Price:', statusResponse.data.price_sui, 'SUI');

        // 3. Get Purchase Details
        console.log(`\n3️⃣ Getting Purchase Details...`);
        const detailsResponse = await buyerAxios.get(`/purchase/${purchaseRequestId}/details`);
        console.log('✅ Details retrieved successfully');

        // 4. List Buyer Purchases
        console.log(`\n4️⃣ Listing All Buyer Purchases...`);
        const purchasesResponse = await buyerAxios.get('/purchases');
        console.log('✅ Total Purchases:', purchasesResponse.data.data.purchases.length);

        // 5. Try to get download URL (will likely fail if not completed)
        console.log(`\n5️⃣ Attempting to Get Download URL...`);
        try {
            const downloadUrlResponse = await buyerAxios.get(`/download/${purchaseRequestId}`);
            console.log('✅ Download URL:', downloadUrlResponse.data.walrus_url);
        } catch (error: any) {
            if (error.response?.status === 400) {
                console.log('⚠️  Download not available yet (purchase not completed)');
                console.log('   This is expected - fulfillment job needs to complete first');
            } else {
                throw error;
            }
        }

        // 6. Try to submit review (will likely fail if not completed)
        console.log(`\n6️⃣ Attempting to Submit Review...`);
        try {
            const reviewResponse = await buyerAxios.post(`/purchase/${purchaseRequestId}/review`, {
                rating: 5,
                comment: 'Great dataset! Works perfectly for testing.'
            });
            console.log('✅ Review Submitted:', reviewResponse.data);
        } catch (error: any) {
            if (error.response?.status === 400) {
                console.log('⚠️  Review not allowed yet (purchase not completed)');
                console.log('   This is expected - purchase must be completed first');
            } else {
                throw error;
            }
        }

        console.log('\n✅ Buyer Flow Test Completed Successfully!');
        console.log('\n📋 Summary:');
        console.log('   - DataPod ID:', datapodId);
        console.log('   - Purchase ID:', purchaseRequestId);
        console.log('   - Status: Purchase created and recorded on blockchain');
        console.log('   - Next: Wait for fulfillment job to complete the purchase');

    } catch (error: any) {
        console.error('\n❌ Buyer Flow Test Failed:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received from server');
            console.error('Is the backend server running on http://localhost:3001?');
        } else {
            console.error('Error:', error.message);
        }
        throw error;
    }
}

async function runFullTest() {
    console.log('🚀 Starting Complete Buyer Flow Test...\n');
    console.log('This test will:');
    console.log('1. Create and publish a test DataPod (as seller)');
    console.log('2. Purchase the DataPod (as buyer)');
    console.log('3. Verify all buyer endpoints\n');

    try {
        // Step 1: Create test DataPod
        const datapodId = await createTestDataPod();

        // Step 2: Test buyer flow
        await testBuyerFlow(datapodId);

        console.log('\n🎉 All Tests Passed!');
        process.exit(0);

    } catch (error) {
        console.error('\n💥 Test Suite Failed');
        process.exit(1);
    }
}

runFullTest();
