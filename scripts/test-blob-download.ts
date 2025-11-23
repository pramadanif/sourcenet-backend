import { WalrusService } from '../src/services/walrus.service';
import { logger } from '../src/utils/logger';

async function testBlobDownload() {
    try {
        // Test with latest blob ID from database
        const blobId = '9iWfh2O96Yo1qcPaLc9waC6xMVx5esvG86ymB3oA4do';

        console.log(`🔍 Testing blob download for: ${blobId}\n`);

        const blob = await WalrusService.downloadBlob(blobId);

        console.log(`✅ Blob downloaded successfully!`);
        console.log(`   Size: ${blob.length} bytes`);
        console.log(`   First 100 bytes: ${blob.slice(0, 100).toString('hex')}`);

    } catch (error: any) {
        console.error('❌ Blob download failed:');
        console.error(error.message);
        console.error(error.stack);
    }
}

testBlobDownload();
