const prisma = require('../src/app/lib/prisma');
const auth = require('../src/app/lib/auth');

async function main() {
    console.log('[Seed] Seeding Hesheli initial database in NeonDB...');

    // Clear existing data cleanly if needed (optional)
    // await prisma.like.deleteMany();
    // await prisma.comment.deleteMany();
    // await prisma.post.deleteMany();
    // await prisma.groupMember.deleteMany();
    // await prisma.group.deleteMany();

    // 1. Seed Admin Account
    let admin = await prisma.user.findUnique({ where: { email: 'admin@hesheli.com' } });
    if (!admin) {
        try {
            const res = await auth.api.signUpEmail({
                body: {
                    name: 'Hesheli Admin',
                    email: 'admin@hesheli.com',
                    password: 'AdminPassword123!',
                    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
                },
            });
            admin = res.user;
            // Upgrade role to ADMIN
            await prisma.user.update({
                where: { id: admin.id },
                data: { role: 'ADMIN', bio: 'Platform Administrator of Hesheli' },
            });
            console.log('[Seed] Admin created: admin@hesheli.com (Password: AdminPassword123!)');
        } catch (e) {
            console.log('[Seed] Admin sign up note:', e.message);
        }
    }

    // 2. Seed Moderator Account
    let mod = await prisma.user.findUnique({ where: { email: 'moderator@hesheli.com' } });
    if (!mod) {
        try {
            const res = await auth.api.signUpEmail({
                body: {
                    name: 'Tanvir Hasan (Mod)',
                    email: 'moderator@hesheli.com',
                    password: 'ModPassword123!',
                    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
                },
            });
            mod = res.user;
            await prisma.user.update({
                where: { id: mod.id },
                data: { role: 'MODERATOR', bio: 'Community Moderator on Hesheli' },
            });
            console.log('[Seed] Moderator created: moderator@hesheli.com (Password: ModPassword123!)');
        } catch (e) {
            console.log('[Seed] Moderator sign up note:', e.message);
        }
    }

    // 3. Seed Demo Foodie User
    let foodie = await prisma.user.findUnique({ where: { email: 'chef.rahima@hesheli.com' } });
    if (!foodie) {
        try {
            const res = await auth.api.signUpEmail({
                body: {
                    name: 'Chef Rahima Sultana',
                    email: 'chef.rahima@hesheli.com',
                    password: 'UserPassword123!',
                    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
                },
            });
            foodie = res.user;
            await prisma.user.update({
                where: { id: foodie.id },
                data: { bio: 'Passionate home cook exploring authentic Bengali spice blends.' },
            });
            console.log('[Seed] Foodie created: chef.rahima@hesheli.com');
        } catch (e) {
            console.log('[Seed] Foodie sign up note:', e.message);
        }
    }

    // Ensure we have users to attach recipes & groups to
    const creatorUser = foodie || admin;
    if (!creatorUser) {
        console.log('[Seed] No user available to link recipes.');
        return;
    }

    // 4. Seed Groups
    let groupDesi = await prisma.group.findUnique({ where: { slug: 'desi-spices-curries' } });
    if (!groupDesi) {
        groupDesi = await prisma.group.create({
            data: {
                name: 'Desi Spices & Curries (দেশি মশলা ও তরকারি)',
                slug: 'desi-spices-curries',
                description: 'The ultimate space for authentic Bengali, Indian, and South Asian homemade curries.',
                privacy: 'PUBLIC',
                coverImage: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=1000',
                avatar: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=200',
                createdById: creatorUser.id,
                members: {
                    create: {
                        userId: creatorUser.id,
                        role: 'ADMIN',
                        isApproved: true,
                    },
                },
            },
        });
        console.log('[Seed] Created Group: Desi Spices & Curries');
    }

    let groupBaking = await prisma.group.findUnique({ where: { slug: 'baking-desserts-club' } });
    if (!groupBaking) {
        groupBaking = await prisma.group.create({
            data: {
                name: 'Baking & Sweet Tooth Club',
                slug: 'baking-desserts-club',
                description: 'Cakes, pastries, pies, and sweet delicacies from around the globe.',
                privacy: 'PUBLIC',
                coverImage: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1000',
                avatar: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200',
                createdById: creatorUser.id,
                members: {
                    create: {
                        userId: creatorUser.id,
                        role: 'ADMIN',
                        isApproved: true,
                    },
                },
            },
        });
        console.log('[Seed] Created Group: Baking & Sweet Tooth Club');
    }

    let groupSecret = await prisma.group.findUnique({ where: { slug: 'secret-grandma-recipes' } });
    if (!groupSecret) {
        groupSecret = await prisma.group.create({
            data: {
                name: 'Secret Grandma Recipes (দাদীর গোপন রেসিপি)',
                slug: 'secret-grandma-recipes',
                description: 'Private family recipes passed down across generations. Join requests require admin review.',
                privacy: 'PRIVATE',
                requiresPostApproval: true,
                coverImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1000',
                createdById: creatorUser.id,
                members: {
                    create: {
                        userId: creatorUser.id,
                        role: 'ADMIN',
                        isApproved: true,
                    },
                },
            },
        });
        console.log('[Seed] Created Private Group: Secret Grandma Recipes');
    }

    // 5. Seed Recipes
    const existingRecipe = await prisma.post.findFirst({ where: { postType: 'RECIPE' } });
    if (!existingRecipe) {
        await prisma.post.create({
            data: {
                authorId: creatorUser.id,
                groupId: groupDesi.id,
                postType: 'RECIPE',
                status: 'PUBLISHED',
                title: 'Traditional Kacchi Biryani (ঐতিহ্যবাহী কাচ্চি বিরিয়ানি)',
                caption: 'Authentic Old Dhaka style Kacchi Biryani made with tender marinated mutton and basmati rice.',
                image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800',
                preparationTime: 90,
                servings: 6,
                cuisine: 'Bangladeshi',
                categories: ['Dinner', 'Rice', 'Meat'],
                ingredients: [
                    '1 kg Mutton (cut into large pieces)',
                    '750g Basmati Rice (washed & soaked for 30 mins)',
                    '1 cup Yogurt (whisked)',
                    '2 tbsp Ginger garlic paste',
                    '2 tsp Shahi Garam Masala',
                    '1/2 cup Fried Onions (Beresta)',
                    '4-5 Potatoes (fried golden)',
                    '3 tbsp Ghee and saffron milk',
                ],
                instructions: [
                    {
                        title: 'Marinate the Mutton',
                        details: 'In a heavy pot, mix mutton with yogurt, ginger-garlic paste, garam masala, salt, and half the beresta. Let sit for at least 3 hours.',
                    },
                    {
                        title: 'Half Boil the Rice',
                        details: 'Boil water with whole spices and salt. Add soaked basmati rice and cook until 70% done, then drain.',
                    },
                    {
                        title: 'Layer and Dum Cook',
                        details: 'Layer the parboiled rice over the marinated mutton. Place fried potatoes, saffron milk, ghee, and remaining beresta on top. Seal with dough and cook on low heat for 1.5 hours.',
                    },
                ],
            },
        });

        await prisma.post.create({
            data: {
                authorId: creatorUser.id,
                postType: 'CASUAL',
                status: 'PUBLISHED',
                caption: 'Fresh batch of golden Jalebi straight from the frying pan! Weekend evening snacks sorted. What are you cooking this evening? 🍯🥨',
                image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800',
            },
        });

        console.log('[Seed] Sample recipe and casual post created!');
    }

    console.log('[Seed] Hesheli database seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('[Seed Error]:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

