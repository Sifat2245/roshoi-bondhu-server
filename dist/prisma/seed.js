import prisma from '../src/lib/prisma.js';
import auth from '../src/lib/auth.js';
import { hashPassword } from 'better-auth/crypto';
import { seed100Users } from './seed-100-users.js';
import { seedFriendships } from './seed-friendships.js';
async function main() {
    console.log('[Seed] Seeding Heshel database in NeonDB...');
    // 1. Seed Demo Foodie User (Chef Rahima)
    let foodie = await prisma.user.findFirst({
        where: { OR: [{ email: 'chef.rahima@heshel.com' }, { email: 'chef.rahima@hesheli.com' }] },
    });
    if (!foodie) {
        foodie = await prisma.user.create({
            data: {
                name: 'Chef Rahima Sultana',
                email: 'chef.rahima@heshel.com',
                emailVerified: true,
                image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
                bio: 'Passionate home cook exploring authentic Bengali spice blends.',
                role: 'USER',
            },
        });
        console.log('[Seed] Foodie user created: chef.rahima@heshel.com');
    }
    else {
        await prisma.user.update({
            where: { id: foodie.id },
            data: {
                email: 'chef.rahima@heshel.com',
                emailVerified: true,
                role: 'USER',
            },
        });
    }
    // Ensure foodie credential password is set to UserPassword123!
    const foodieHashedPassword = await hashPassword('UserPassword123!');
    const existingFoodieAccount = await prisma.account.findFirst({
        where: { userId: foodie.id, providerId: 'credential' },
    });
    if (existingFoodieAccount) {
        await prisma.account.update({
            where: { id: existingFoodieAccount.id },
            data: { password: foodieHashedPassword },
        });
    }
    else {
        await prisma.account.create({
            data: {
                userId: foodie.id,
                accountId: foodie.id,
                providerId: 'credential',
                password: foodieHashedPassword,
            },
        });
    }
    console.log('[Seed] Foodie account password ensured: chef.rahima@heshel.com / UserPassword123!');
    // 2. Seed Admin Account
    let admin = await prisma.user.findFirst({
        where: { OR: [{ email: 'admin@heshel.com' }, { email: 'admin@hesheli.com' }] },
    });
    if (!admin) {
        try {
            const res = await auth.api.signUpEmail({
                body: {
                    name: 'Hesheli Admin',
                    email: 'admin@heshel.com',
                    password: 'AdminPassword123!',
                    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
                },
            });
            admin = await prisma.user.findUnique({ where: { id: res.user.id } });
        }
        catch (e) {
            console.log('[Seed] Admin sign up note:', e.message);
        }
    }
    if (admin) {
        await prisma.user.update({
            where: { id: admin.id },
            data: {
                email: 'admin@heshel.com',
                emailVerified: true,
                role: 'ADMIN',
                bio: 'Platform Administrator of Heshel',
            },
        });
        console.log('[Seed] Admin user verified: admin@heshel.com');
    }
    // 3. Seed Moderator Account
    let mod = await prisma.user.findFirst({
        where: { OR: [{ email: 'moderator@heshel.com' }, { email: 'moderator@hesheli.com' }] },
    });
    if (!mod) {
        try {
            const res = await auth.api.signUpEmail({
                body: {
                    name: 'Tanvir Hasan (Mod)',
                    email: 'moderator@heshel.com',
                    password: 'ModPassword123!',
                    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
                },
            });
            mod = await prisma.user.findUnique({ where: { id: res.user.id } });
        }
        catch (e) {
            console.log('[Seed] Moderator sign up note:', e.message);
        }
    }
    if (mod) {
        await prisma.user.update({
            where: { id: mod.id },
            data: {
                email: 'moderator@heshel.com',
                emailVerified: true,
                role: 'MODERATOR',
                bio: 'Community Moderator on Heshel',
            },
        });
        console.log('[Seed] Moderator user verified: moderator@heshel.com');
    }
    // 4. Seed 100 foodies (user1@example.com to user100@example.com)
    await seed100Users();
    // 5. Seed sample friendships & mutual networks
    await seedFriendships();
    console.log('[Seed] Database users verification and seeding completed successfully!');
}
main()
    .catch((e) => {
    console.error('[Seed Error]:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
