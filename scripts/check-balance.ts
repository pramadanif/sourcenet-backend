
import { env } from '../src/config/env';
import { BlockchainService } from '../src/services/blockchain.service';

async function checkBalance() {
    try {
        console.log(`Checking Sponsor Balance on ${env.SUI_NETWORK}`);
        console.log(`Sponsor Address: ${env.SUI_SPONSOR_ADDRESS}`);

        const client = BlockchainService.getClient();
        const balance = await client.getBalance({ owner: env.SUI_SPONSOR_ADDRESS });

        const balanceSui = Number(balance.totalBalance) / 1e9;
        console.log(`Balance: ${balanceSui} SUI`);

        if (balanceSui < 0.1) {
            console.warn('WARNING: Low balance! Sponsor might fail to execute transactions.');
        } else {
            console.log('Balance is sufficient.');
        }

    } catch (error) {
        console.error('Error checking balance:', error);
    }
}

checkBalance();
