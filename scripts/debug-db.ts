import prisma from '../src/config/database';

const ID = '0x3324e5583f7a8ab22c99a78c3609cd9f97e308dc6c9bb4096db7c416d520b9af';

async function debug() {
    console.log(`Searching for ID: ${ID}`);

    // Check User
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { walletAddress: ID },
                { zkloginAddress: ID }
            ]
        }
    });
    if (user) console.log('✅ Found USER:', user);
    else console.log('❌ Not a User');

    // Check DataPod
    const datapod = await prisma.dataPod.findUnique({
        where: { datapodId: ID }
    });
    if (datapod) console.log('✅ Found DATAPOD:', datapod);
    else console.log('❌ Not a DataPod');
}

debug()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
