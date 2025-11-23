import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkLatestPurchases() {
    try {
        console.log('📋 Checking latest purchases from database...\n');

        const purchases = await prisma.purchaseRequest.findMany({
            take: 3,
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                datapod: {
                    select: {
                        title: true,
                        blobId: true,
                    },
                },
            },
        });

        if (purchases.length === 0) {
            console.log('No purchases found');
            return;
        }

        for (const purchase of purchases) {
            console.log(`Purchase ID: ${purchase.purchaseRequestId}`);
            console.log(`  DataPod: ${purchase.datapod?.title}`);
            console.log(`  Status: ${purchase.status}`);
            console.log(`  Price: ${purchase.priceSui} SUI`);
            console.log(`  Created: ${purchase.createdAt}`);
            console.log(`  Completed: ${purchase.completedAt || 'Not yet'}`);
            console.log(`  Encrypted Blob: ${purchase.encryptedBlobId || 'Not yet'}`);
            console.log(`  DataPod Blob ID: ${purchase.datapod?.blobId || 'N/A'}`);
            console.log();
        }

        const completed = purchases.filter(p => p.status === 'completed').length;
        const pending = purchases.filter(p => p.status === 'pending').length;
        const failed = purchases.filter(p => p.status === 'failed').length;

        console.log(`Summary: ${completed} completed, ${pending} pending, ${failed} failed`);

        if (completed > 0) {
            console.log('\n✅ At least one purchase completed! Fulfillment job is working!');
        } else if (pending > 0) {
            console.log('\n⏳ All purchases still pending... Fulfillment job may be stuck');
        }

    } catch (error: any) {
        console.error('Error:', error.message);
        console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

checkLatestPurchases();
