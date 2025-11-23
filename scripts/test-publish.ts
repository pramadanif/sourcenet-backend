import axios from 'axios';

const API_URL = 'http://localhost:3001/api/seller/publish';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhYzRhZDlkMS05ZTRhLTQ2MjctOTA1OC0zZWRhMzUwNTBkMTEiLCJhZGRyZXNzIjoiMHg5NjY0NmNlNDAwYTU3MTlkZTE4NzE1NTE4ZDdiMWJlYjcxYzkxNDk2MzY0MjdhNDZjZWZkMmFhMWU0ZjUwZGNkIiwiaWF0IjoxNzYzNjU3NjUxLCJleHAiOjE3NjQyNjI0NTF9.yLVB224DqZPjSBf-9bANNDUrpA02ZoWlRH5kjCay1wY';
const UPLOAD_ID = 'de0eda61-734f-480f-b239-3d194370476d';

async function testPublish() {
    console.log('🚀 Testing Publish Endpoint...');
    console.log(`URL: ${API_URL}`);
    console.log(`Upload ID: ${UPLOAD_ID}`);

    try {
        const response = await axios.post(API_URL, {
            upload_id: UPLOAD_ID
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`,
                'accept': '*/*'
            }
        });

        console.log(`\nResponse Status: ${response.status}`);
        console.log('Response Body:', JSON.stringify(response.data, null, 2));

        if (response.status === 200) {
            console.log('\n✅ Publish Successful!');
        } else {
            console.log('\n❌ Publish Failed!');
        }

    } catch (error: any) {
        console.error('\n❌ Error executing request:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

testPublish();
