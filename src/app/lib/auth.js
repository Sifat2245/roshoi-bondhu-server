const { betterAuth } = require('better-auth');
const { prismaAdapter } = require('better-auth/adapters/prisma');
const prisma = require('./prisma');

const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: 'postgresql',
    }),
    secret: process.env.BETTER_AUTH_SECRET || 'hesheli-secret-key-fallback',
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5000',
    trustedOrigins: [
        process.env.CLIENT_URL || 'http://localhost:5173',
        'http://localhost:5173',
        'http://localhost:3000',
    ],
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
    },
    user: {
        additionalFields: {
            role: {
                type: 'string',
                defaultValue: 'USER',
                input: false, // Prevent users from self-assigning ADMIN/MODERATOR on sign-up
            },
            bio: {
                type: 'string',
                required: false,
            },
            coverImage: {
                type: 'string',
                required: false,
            },
            isBanned: {
                type: 'boolean',
                defaultValue: false,
                input: false,
            },
        },
    },
});

module.exports = auth;
