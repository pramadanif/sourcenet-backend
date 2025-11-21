import axios from 'axios';

const API_URL = 'http://localhost:3000/api';
const BUYER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZGRyZXNzIjoiMHg5NWY1NjY3ZGI5MWJiMjY5YWQ5YTY3YjNlMGQ4NzZhYzZmMTNhMmZhNDY5YmJjNzNmNWI4ZWNkMzU1OWI4NjFiIiwiaWF0IjoxNzMyMTU2MjQxLCJleHAiOjE3MzQ3NDgyNDF9.vFZhHgOvQNNGpjxXVwwZvHnNJUJPSfqDqEhDkqVdGgk';

async function checkLatestPurchase() {
    try {
        console.log('📋 Checking latest purchase status...\n');

        const response = await axios.get(`${API_URL}/buyer/purchases`, {
            headers: {
                'Authorization': `Bearer ${BUYER_TOKEN}`,
            },
        });

        const purchases = response.data.purchases;
        if (purchases.length === 0) {
            console.log('No purchases found');
            return;
        }

        // Get latest purchase
        const latest = purchases[0];
        console.log('Latest Purchase:');
        console.log(`  ID: ${latest.purchase_request_id}`);
        console.log(`  DataPod: ${latest.datapod?.title}`);
        console.log(`  Status: ${latest.status}`);
        console.log(`  Price: ${latest.price_sui} SUI`);
        console.log(`  Created: ${latest.created_at}`);
        console.log(`  Completed: ${latest.completed_at || 'Not yet'}`);
        console.log(`  Encrypted Blob: ${latest.encrypted_blob_id || 'Not yet'}`);
        console.log();

        if (latest.status === 'completed') {
            console.log('✅ Purchase completed! Fulfillment job succeeded!');
        } else if (latest.status === 'pending') {
            console.log('⏳ Purchase still pending... Fulfillment job in progress');
        } else if (latest.status === 'failed') {
            console.log('❌ Purchase failed! Check fulfillment job logs');
        }

    } catch (error: any) {
        console.error('Error checking purchase status:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
            console.error(error.stack);
        }
        process.exit(1);
    }
}

checkLatestPurchase();
