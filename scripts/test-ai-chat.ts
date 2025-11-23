import axios from 'axios';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3001/api';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Mock user data
const mockUserAddress = '0x1234567890abcdef1234567890abcdef12345678';
const mockUser = {
    address: mockUserAddress,
    zkloginAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
};

// Generate JWT token
const token = jwt.sign(mockUser, JWT_SECRET);

async function testAiChat() {
    try {
        console.log('Testing AI Chat Integration...');
        console.log('--------------------------------');

        // Create test user in DB
        console.log('Creating test user...');
        await prisma.user.upsert({
            where: { walletAddress: mockUserAddress },
            update: {},
            create: {
                walletAddress: mockUserAddress,
                zkloginAddress: mockUser.zkloginAddress,
                googleEmail: mockUser.email,
                username: 'TestUser',
            },
        });
        console.log('Test user created.');

        // 1. Test Chat Endpoint
        console.log('\n1. Testing POST /api/ai/chat');
        const chatResponse = await axios.post(
            `${API_URL}/ai/chat`,
            {
                message: 'Hello, tell me about SourceNet.',
                model: 'gpt-4o',
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );
        console.log('Chat Response:', JSON.stringify(chatResponse.data, null, 2));

        // 2. Test Get Conversations
        console.log('\n2. Testing GET /api/ai/conversations');
        const conversationsResponse = await axios.get(`${API_URL}/ai/conversations`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        console.log('Conversations:', JSON.stringify(conversationsResponse.data, null, 2));

        console.log('\n--------------------------------');
        console.log('AI Chat Test Completed Successfully');
    } catch (error: any) {
        console.error('\nTest Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error setting up request:', error.message);
            console.error('Full Error:', error);
        }
    } finally {
        // Cleanup
        console.log('\nCleaning up...');
        try {
            const user = await prisma.user.findUnique({ where: { walletAddress: mockUserAddress } });
            if (user) {
                // Delete conversations first to avoid foreign key constraints if cascade isn't set up
                await prisma.aiConversation.deleteMany({ where: { userId: user.id } });
                await prisma.user.delete({ where: { id: user.id } });
                console.log('Test user and data deleted.');
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
        await prisma.$disconnect();
    }
}

testAiChat();
