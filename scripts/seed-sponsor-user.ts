import { PrismaClient } from '@prisma/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

function getKeypair(keyStr: string) {
    try {
        const decoded = decodeSuiPrivateKey(keyStr);
        return Ed25519Keypair.fromSecretKey(decoded.secretKey);
    } catch (e) {
        return Ed25519Keypair.fromSecretKey(Buffer.from(keyStr, 'base64').slice(0, 32));
    }
}

async function main() {
    const privateKey = process.env.SUI_SPONSOR_PRIVATE_KEY;
    if (!privateKey) {
        console.error('Missing SUI_SPONSOR_PRIVATE_KEY');
        process.exit(1);
    }

    const keypair = getKeypair(privateKey);
    const sponsorAddress = keypair.toSuiAddress();

    console.log(`Seeding user for derived address: ${sponsorAddress}`);

    const user = await prisma.user.upsert({
        where: { walletAddress: sponsorAddress },
        update: {},
        create: {
            walletAddress: sponsorAddress,
            username: 'SponsorTestUser_Derived',
        },
    });

    console.log('User seeded:', user.id);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
