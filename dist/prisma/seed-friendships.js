import prisma from '../src/lib/prisma.js';
import { getCanonicalPair } from '../src/modules/friends/friends.service.js';
export async function seedFriendships() {
    console.log('[Seed] Seeding sample friendships and friend requests among users...');
    // Fetch users user1 to user25
    const userEmails = Array.from({ length: 25 }, (_, i) => `user${i + 1}@example.com`);
    const users = await prisma.user.findMany({
        where: { email: { in: userEmails } },
        select: { id: true, email: true },
    });
    const userMap = new Map();
    users.forEach((u) => {
        userMap.set(u.email, u.id);
    });
    const getUserId = (num) => userMap.get(`user${num}@example.com`);
    // Helper to create friendship
    const makeFriends = async (u1Num, u2Num) => {
        const id1 = getUserId(u1Num);
        const id2 = getUserId(u2Num);
        if (!id1 || !id2)
            return;
        const { userLowId, userHighId } = getCanonicalPair(id1, id2);
        await prisma.friendship.upsert({
            where: { userLowId_userHighId: { userLowId, userHighId } },
            update: {},
            create: { userLowId, userHighId },
        });
    };
    // Helper to create incoming request to receiver
    const makeRequest = async (senderNum, receiverNum) => {
        const senderId = getUserId(senderNum);
        const receiverId = getUserId(receiverNum);
        if (!senderId || !receiverId)
            return;
        await prisma.friendshipRequest.upsert({
            where: { senderId_receiverId: { senderId, receiverId } },
            update: { status: 'PENDING' },
            create: { senderId, receiverId, status: 'PENDING' },
        });
    };
    // 1. Establish core friendships for user1:
    // user1 is friends with user2, user3, user4, user5
    await makeFriends(1, 2);
    await makeFriends(1, 3);
    await makeFriends(1, 4);
    await makeFriends(1, 5);
    // 2. Establish cross friendships among user2..user10:
    // user2 is friends with user6, user7, user8
    await makeFriends(2, 6);
    await makeFriends(2, 7);
    await makeFriends(2, 8);
    // user3 is friends with user6, user7, user9
    await makeFriends(3, 6);
    await makeFriends(3, 7);
    await makeFriends(3, 9);
    // user4 is friends with user6, user10
    await makeFriends(4, 6);
    await makeFriends(4, 10);
    // user5 is friends with user7, user8, user10
    await makeFriends(5, 7);
    await makeFriends(5, 8);
    await makeFriends(5, 10);
    // Additional background network between user14..user25
    await makeFriends(14, 15);
    await makeFriends(14, 16);
    await makeFriends(15, 17);
    await makeFriends(16, 18);
    await makeFriends(19, 20);
    await makeFriends(20, 21);
    // 3. Establish incoming friend requests to user1:
    // user11, user12, user13 send friend requests to user1
    await makeRequest(11, 1);
    await makeRequest(12, 1);
    await makeRequest(13, 1);
    // user12 also has mutual friends with user1 (friends with user2)
    await makeFriends(12, 2);
    console.log('[Seed] Sample friendships & requests seeded successfully!');
}
if (process.argv[1]?.endsWith('seed-friendships.ts') || process.argv[1]?.endsWith('seed-friendships.js')) {
    seedFriendships()
        .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
        .catch(async (e) => {
        console.error('[Seed Error]:', e);
        await prisma.$disconnect();
        process.exit(1);
    });
}
