
import { env } from '../src/config/env';
import { BlockchainService } from '../src/services/blockchain.service';

async function checkPackage() {
    try {
        const packageId = env.SOURCENET_PACKAGE_ID;
        console.log(`Checking Package ID: ${packageId}`);

        // Check Devnet
        console.log('--- Checking DEVNET ---');
        const devnetClient = new (require('@mysten/sui/client').SuiClient)({ url: 'https://fullnode.devnet.sui.io:443' });
        const devnetObj = await devnetClient.getObject({ id: packageId, options: { showContent: true } });
        if (devnetObj.error) console.log('NOT FOUND on Devnet');
        else console.log('FOUND on Devnet');

        // Check Testnet
        console.log('--- Checking TESTNET ---');
        const testnetClient = new (require('@mysten/sui/client').SuiClient)({ url: 'https://fullnode.testnet.sui.io:443' });
        const testnetObj = await testnetClient.getObject({ id: packageId, options: { showContent: true } });
        if (testnetObj.error) console.log('NOT FOUND on Testnet');
        else console.log('FOUND on Testnet');

    } catch (error) {
        console.error('Error checking package:', error);
    }
}

checkPackage();
