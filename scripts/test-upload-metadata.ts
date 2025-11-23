import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const API_BASE_URL = 'http://localhost:3001/api';
const JWT_SECRET = env.JWT_SECRET;

async function testUploadWithMetadata() {
    try {
        console.log('🧪 Testing file upload with metadata...\n');

        // Create a test file
        const testContent = JSON.stringify({ test: 'data', timestamp: Date.now() });
        const testFilePath = '/tmp/test-upload.json';
        fs.writeFileSync(testFilePath, testContent);

        // Generate token for seller
        const sellerAddress = '0xtest-seller-' + Date.now();
        const token = jwt.sign({ userId: 'test-seller', address: sellerAddress }, JWT_SECRET);

        // Prepare form data
        const form = new FormData();
        form.append('file', fs.createReadStream(testFilePath), {
            filename: 'my-test-file.json',
            contentType: 'application/json',
        });
        form.append('metadata', JSON.stringify({
            title: 'Test Upload with Metadata',
            category: 'test',
            description: 'Testing file metadata storage',
            price_sui: 0.1,
        }));

        // Upload file
        console.log('📤 Uploading file...');
        const uploadRes = await axios.post(`${API_BASE_URL}/seller/upload`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`,
            },
        });

        console.log('✅ Upload successful!');
        console.log('Upload ID:', uploadRes.data.upload_id);

        // Check database for metadata
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const uploadStaging = await prisma.uploadStaging.findUnique({
            where: { id: uploadRes.data.upload_id },
        });

        if (!uploadStaging) {
            console.error('❌ Upload staging not found in database!');
            return;
        }

        const metadata = uploadStaging.metadata as any;
        console.log('\n📋 Metadata stored in database:');
        console.log('  - mimeType:', metadata?.mimeType || 'MISSING ❌');
        console.log('  - originalName:', metadata?.originalName || 'MISSING ❌');
        console.log('  - fileSize:', metadata?.fileSize || 'MISSING ❌');
        console.log('  - encryptionKey:', metadata?.encryptionKey ? 'EXISTS ✅' : 'MISSING ❌');

        // Verify
        if (metadata?.mimeType === 'application/json' &&
            metadata?.originalName === 'my-test-file.json' &&
            metadata?.fileSize > 0) {
            console.log('\n✅ SUCCESS: File metadata is correctly stored!');
        } else {
            console.log('\n❌ FAILED: File metadata is missing or incorrect!');
        }

        // Cleanup
        await prisma.uploadStaging.delete({ where: { id: uploadRes.data.upload_id } });
        fs.unlinkSync(testFilePath);
        await prisma.$disconnect();

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testUploadWithMetadata();
