import axios from 'axios';

const PUBLISHER_URL = 'https://publisher.walrus-testnet.walrus.space';

async function testWalrus() {
    const buffer = Buffer.from('Hello Walrus Fix Verification ' + Date.now());

    console.log(`Testing Upload to: ${PUBLISHER_URL}`);

    try {
        const endpoint = `${PUBLISHER_URL}/v1/blobs?epochs=5`;
        console.log(`PUT ${endpoint}...`);

        const response = await axios.put(endpoint, buffer, {
            headers: { 'Content-Type': 'application/octet-stream' },
            timeout: 60000
        });

        console.log('✅ Upload Success:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));

        let blobId;
        if (response.data.newlyCreated) {
            blobId = response.data.newlyCreated.blobObject.blobId;
        } else if (response.data.alreadyCertified) {
            blobId = response.data.alreadyCertified.blobId;
        }

        if (blobId) {
            console.log(`✅ Blob ID found: ${blobId}`);
        } else {
            console.log('❌ Blob ID NOT found in response');
        }

    } catch (error: any) {
        console.log('❌ Upload Failed:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testWalrus();
