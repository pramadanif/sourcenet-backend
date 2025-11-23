
import { env } from '../src/config/env';
import { BlockchainService } from '../src/services/blockchain.service';

async function checkNetwork() {
    try {
        console.log('Checking SUI Network Configuration...');
        console.log(`SUI_NETWORK: ${env.SUI_NETWORK}`);
        console.log(`SUI_RPC_URL: ${env.SUI_RPC_URL}`);
        console.log(`SOURCENET_PACKAGE_ID: ${env.SOURCENET_PACKAGE_ID}`);

        const client = BlockchainService.getClient();
        const chainIdentifier = await client.getChainIdentifier();
        console.log(`Connected Chain Identifier: ${chainIdentifier}`);

        const latestCheckpoint = await client.getLatestCheckpointSequenceNumber();
        console.log(`Latest Checkpoint: ${latestCheckpoint}`);

        console.log('Network check complete.');
    } catch (error) {
        console.error('Network check failed:', error);
    }
}

checkNetwork();
