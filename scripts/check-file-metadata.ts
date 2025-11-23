import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkFileMetadata() {
    try {
        console.log('Checking file metadata in upload staging...\n');

        const uploads = await prisma.uploadStaging.findMany({
            where: { status: 'published' },
            include: {
                datapod: {
                    select: {
                        title: true,
                        datapodId: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });

        console.log(`Found ${uploads.length} published uploads:\n`);

        for (const upload of uploads) {
            const metadata = upload.metadata as any;
            console.log(`Upload ID: ${upload.id}`);
            console.log(`DataPod: ${upload.datapod?.title || 'N/A'} (${upload.datapod?.datapodId || 'N/A'})`);
            console.log(`Metadata:`);
            console.log(`  - mimeType: ${metadata?.mimeType || 'MISSING'}`);
            console.log(`  - originalName: ${metadata?.originalName || 'MISSING'}`);
            console.log(`  - fileSize: ${metadata?.fileSize || 'MISSING'}`);
            console.log(`  - encryptionKey: ${metadata?.encryptionKey ? 'EXISTS' : 'MISSING'}`);
            console.log('---\n');
        }

        console.log('\nSummary:');
        const withMetadata = uploads.filter(u => (u.metadata as any)?.mimeType);
        const withoutMetadata = uploads.filter(u => !(u.metadata as any)?.mimeType);
        console.log(`✅ With file metadata: ${withMetadata.length}`);
        console.log(`❌ Without file metadata: ${withoutMetadata.length}`);

        if (withoutMetadata.length > 0) {
            console.log('\n⚠️  Old uploads are missing file metadata.');
            console.log('These will show as "application/octet-stream" when downloaded.');
            console.log('Solution: Re-upload the files OR manually update the metadata in the database.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkFileMetadata();
