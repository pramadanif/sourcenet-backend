
import axios from 'axios';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:3001/api';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-at-least-32-chars-long';

// Use the ID from the failed test run
const PURCHASE_ID = '0x2827c72adc585075d3ec9d988207066d9b37b8c0e36355994b80a8beb9015cde';
// We need a buyer address. In the test, it was a random keypair.
// We can't easily reproduce the EXACT token unless we know the buyer address used in that run.
// BUT, the 404 "Endpoint not found" usually happens BEFORE auth check if the route doesn't exist.
// If the route exists but auth fails, it returns 401.
// If the route exists and auth passes but purchase not found, it returns 404 "Purchase not found".
// "Endpoint not found" means the ROUTE ITSELF is missing.

async function test() {
    try {
        console.log(`Testing GET ${API_BASE_URL}/buyer/purchase/${PURCHASE_ID}/download-url`);

        // Generate a dummy token just to pass auth middleware if it reaches it
        const token = jwt.sign({ userId: 'test', address: '0x123' }, JWT_SECRET);

        const res = await axios.get(`${API_BASE_URL}/buyer/purchase/${PURCHASE_ID}/download-url`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('✅ Success:', res.status, res.data);
    } catch (error: any) {
        console.error('❌ Failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

test();
