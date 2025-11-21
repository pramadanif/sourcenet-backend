import { env } from '../src/config/env';

console.log('Current Walrus Configuration:');
console.log(`WALRUS_API_URL: ${env.WALRUS_API_URL}`);
console.log(`WALRUS_BLOB_ENDPOINT: ${env.WALRUS_BLOB_ENDPOINT}`);
