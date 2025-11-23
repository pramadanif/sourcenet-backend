import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createUser() {
    try {
        await prisma.user.upsert({
            where: { zkloginAddress: '0x96646ce400a5719de18715518d7b1beb71c9149636427a46cefd2aa1e4f50dcd' },
            update: {},
            create: {
                zkloginAddress: '0x96646ce400a5719de18715518d7b1beb71c9149636427a46cefd2aa1e4f50dcd',
                username: 'test_seller',
            },
        });
        console.log('✅ Test seller user created/updated');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createUser();
