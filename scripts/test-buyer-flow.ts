import axios from 'axios';
import nacl from 'tweetnacl';

// Configuration
const API_URL = 'http://localhost:3001/api/buyer';
// Replace with a valid JWT token for a BUYER account
const TOKEN = process.env.BUYER_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlM2NiZGI1NS00ZjYyLTRjZDktYjZiMC02MTdjM2QxN2U3NjUiLCJhZGRyZXNzIjoiMHhiYWY0ZmM3YTk4MTg3YzQ3ZjJlMTI3YzBmZDAwN2NlNWY4MzUxZTRlM2Y0NWVlY2I4ZmRkZTBhNDNmMGJlYWVjIiwiaWF0IjoxNzYzNzQxNTY5LCJleHAiOjE3NjQzNDYzNjl9.jS-iJ0bzLgsKgGR1pMs3ZkUXxydpRq08XEWo9xnsDYI';
// Replace with a valid DataPod ID to purchase
const DATAPOD_ID = process.env.DATAPOD_ID || '0x3324e5583f7a8ab22c99a78c3609cd9f97e308dc6c9bb4096db7c416d520b9af';
// Replace with the buyer's Sui address (must match the token)
const BUYER_ADDRESS = process.env.BUYER_ADDRESS || '0xbaf4fc7a98187c47f2e127c0fd007ce5f8351e4e3f45eecb8fdde0a43f0beaec';

// Generate ephemeral keypair for encryption
const keyPair = nacl.box.keyPair();
const buyerPublicKey = Buffer.from(keyPair.publicKey).toString('base64');
const buyerPrivateKey = Buffer.from(keyPair.secretKey).toString('base64');

console.log('🔑 Generated Ephemeral Keys:');
console.log('Public Key:', buyerPublicKey);
console.log('Private Key:', buyerPrivateKey);

const axiosInstance = axios.create({
    baseURL: API_URL,
    headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
    },
});

async function runTest() {
    console.log('\n🚀 Starting Buyer Flow Test...');

    try {
        // 1. Create Purchase
        console.log('\n1️⃣ Creating Purchase...');
        const purchaseResponse = await axiosInstance.post('/purchase', {
            datapod_id: DATAPOD_ID,
            buyer_address: BUYER_ADDRESS,
            buyer_public_key: buyerPublicKey,
        });
        console.log('✅ Purchase Created:', purchaseResponse.data);
        const purchaseRequestId = purchaseResponse.data.purchase_request_id;
        const purchaseId = purchaseResponse.data.purchase_request_id; // Assuming ID is the same or returned

        // 2. Get Purchase Status
        console.log(`\n2️⃣ Checking Purchase Status (${purchaseRequestId})...`);
        const statusResponse = await axiosInstance.get(`/purchase/${purchaseRequestId}`);
        console.log('✅ Status:', statusResponse.data);

        // 3. Get Purchase Details
        console.log(`\n3️⃣ Getting Purchase Details...`);
        const detailsResponse = await axiosInstance.get(`/purchase/${purchaseRequestId}/details`);
        console.log('✅ Details:', detailsResponse.data);

        // 4. Get Download URL
        // Note: This might fail if the purchase is not yet 'completed' (requires blockchain confirmation)
        // In a real test, we might need to wait or mock the completion.
        console.log(`\n4️⃣ Getting Download URL...`);
        try {
            const downloadUrlResponse = await axiosInstance.get(`/download/${purchaseRequestId}`);
            console.log('✅ Download URL:', downloadUrlResponse.data);

            // 5. Download Data (Simulated)
            console.log(`\n5️⃣ Downloading Data...`);
            const downloadResponse = await axiosInstance.post(`/download/${purchaseRequestId}`, {
                buyer_private_key: buyerPrivateKey
            }, {
                responseType: 'arraybuffer' // Expect binary data
            });
            console.log('✅ Data Downloaded. Size:', downloadResponse.data.length, 'bytes');

        } catch (error: any) {
            console.log('⚠️  Download step failed (expected if purchase is not completed):', error.response?.data || error.message);
        }

        // 6. Submit Review
        // Note: This also requires 'completed' status
        console.log(`\n6️⃣ Submitting Review...`);
        try {
            const reviewResponse = await axiosInstance.post(`/purchase/${purchaseRequestId}/review`, {
                rating: 5,
                comment: 'Great dataset! Works as expected.'
            });
            console.log('✅ Review Submitted:', reviewResponse.data);
        } catch (error: any) {
            console.log('⚠️  Review step failed (expected if purchase is not completed):', error.response?.data || error.message);
        }

        // 7. Get Buyer Purchases
        console.log(`\n7️⃣ Listing Buyer Purchases...`);
        const purchasesResponse = await axiosInstance.get('/purchases');
        console.log('✅ Purchases List:', JSON.stringify(purchasesResponse.data, null, 2));

    } catch (error: any) {
        console.error('\n❌ Test Failed:', error.response?.data || error.message);
    }
}

runTest();
