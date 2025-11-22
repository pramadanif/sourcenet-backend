import Redis from 'ioredis';

async function testRedis() {
    const redis = new Redis();
    redis.on('error', (err) => {
        console.log('Redis Client Error', err.message);
        process.exit(1);
    });

    try {
        await redis.ping();
        console.log('Connected to Redis');
        await redis.quit();
    } catch (e) {
        console.log('Failed to connect to Redis');
        process.exit(1);
    }
}

testRedis();
