import prisma from '../src/lib/prisma.js';
import { hashPassword } from 'better-auth/crypto';

export const USER_NAMES = [
  'Ayesha Siddiqua',
  'Tanvir Ahmed',
  'Sabrina Akhter',
  'Mahfuzur Rahman',
  'Nusrat Jahan',
  'Kamrul Hasan',
  'Farhana Islam',
  'Shakil Chowdhury',
  'Nadia Sultana',
  'Rashedul Karim',
  'Sumaiya Kabir',
  'Mehedi Hasan',
  'Tasnim Ferdous',
  'Anisur Zaman',
  'Sadia Afrin',
  'Tariqul Islam',
  'Sharmin Akter',
  'Imran Hossain',
  'Bilkis Begum',
  'Asif Mahmud',
  'Farzana Haque',
  'Rafiqul Alam',
  'Jannatul Naim',
  'Zahid Hasan',
  'Samira Khan',
  'Mominul Haque',
  'Rumana Yasmin',
  'Arifur Rahman',
  'Dilruba Nasrin',
  'Saiful Islam',
  'Nazia Parveen',
  'Towhidul Alam',
  'Rubaiya Sharmin',
  'Shahriar Kabir',
  'Munira Khanam',
  'Ashraful Islam',
  'Shanjida Akter',
  'Kazi Maruf',
  'Israt Jahan',
  'Habibur Rahman',
  'Fatima Tuz Zohra',
  'Rejaul Karim',
  'Nusrat Sharmin',
  'Alamin Sheikh',
  'Tanjina Alam',
  'Mahmudul Hasan',
  'Zannat Ara',
  'Mustafizur Rahman',
  'Afsana Mimi',
  'Shahadat Hossain',
  'Laila Arjumand',
  'Enamul Haque',
  'Farzana Boby',
  'Moniruzzaman',
  'Shirin Akter',
  'Golam Mostafa',
  'Shahnaz Parvin',
  'Khairul Bashar',
  'Shamima Nasrin',
  'Ziaur Rahman',
  'Nahid Sultana',
  'Babul Akhtar',
  'Rokeya Begum',
  'Anwar Hossain',
  'Salma Khatun',
  'Atiqur Rahman',
  'Hasina Momtaz',
  'Mokhlesur Rahman',
  'Parvin Sultana',
  'Sirajul Islam',
  'Shahana Akter',
  'Delwar Hossain',
  'Rina Begum',
  'Feroz Ahmed',
  'Selina Banu',
  'Mosharraf Hossain',
  'Tahmina Begum',
  'Jahangir Alam',
  'Afroza Sultana',
  'Harunur Rashid',
  'Sultana Razia',
  'Matiur Rahman',
  'Nasima Akter',
  'Lutfor Rahman',
  'Kohinoor Akhter',
  'Mozammel Hoque',
  'Momotaz Begum',
  'Abdul Halim',
  'Rashida Khatun',
  'Nurul Huda',
  'Halima Sadia',
  'Shamsul Alam',
  'Morium Begum',
  'Rezaul Haque',
  'Khaleda Parvin',
  'Nur Mohammad',
  'Zubaida Khanam',
  'Mizanur Rahman',
  'Rabeya Basri',
  'Azizul Hakim',
];

const CITIES = [
  'Dhaka, Bangladesh',
  'Chittagong, Bangladesh',
  'Sylhet, Bangladesh',
  'Rajshahi, Bangladesh',
  'Khulna, Bangladesh',
  'Barisal, Bangladesh',
  'Rangpur, Bangladesh',
  'Mymensingh, Bangladesh',
  'Comilla, Bangladesh',
  'Narayanganj, Bangladesh',
  'Gazipur, Bangladesh',
  'Cox\'s Bazar, Bangladesh',
  'Bogra, Bangladesh',
];

const ROLES = [
  'Home Chef & Recipe Creator',
  'Pastry & Dessert Specialist',
  'Traditional Biryani Enthusiast',
  'Culinary Blogger & Storyteller',
  'Artisan Baker',
  'Bengali Spice Connoisseur',
  'Street Food Explorer',
  'Healthy & Organic Foodie',
  'Master of Bangladeshi Curries',
  'Seafood & Fish Delicacy Chef',
  'Dessert & Sweet Artisan',
  'Gourmet Food Enthusiast',
];

const UNIVERSITIES = [
  'University of Dhaka',
  'Bangladesh University of Engineering and Technology (BUET)',
  'North South University',
  'BRAC University',
  'University of Chittagong',
  'Jahangirnagar University',
  'University of Rajshahi',
  'Shahjalal University of Science and Technology',
  'Khulna University',
  'Institute of Culinary Arts, Dhaka',
];

const AVATARS = [
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200',
  'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=200',
  'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200',
];

export async function seed100Users() {
  console.log('[Seed] Starting generation of 100 seeded users (user1@example.com to user100@example.com)...');

  // Compute common password hash once for efficiency
  const commonPassword = '12345678';
  const hashedPassword = await hashPassword(commonPassword);
  console.log('[Seed] Password hash generated for password "12345678"');

  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 1; i <= 100; i++) {
    const email = `user${i}@example.com`;
    const name = USER_NAMES[i - 1] || `Foodie User ${i}`;
    const username = `user${i}`;
    const city = CITIES[(i - 1) % CITIES.length];
    const role = ROLES[(i - 1) % ROLES.length];
    const education = UNIVERSITIES[(i - 1) % UNIVERSITIES.length];
    const avatar = AVATARS[(i - 1) % AVATARS.length];
    const bio = `Passionate ${role.toLowerCase()} based in ${city}. Sharing homemade recipes and cooking secrets on Heshel!`;

    // Upsert User
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    let userId: string;

    if (!existingUser) {
      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          emailVerified: true,
          role: 'USER',
          status: 'ACTIVE',
          image: avatar,
          bio,
          twoFactorEnabled: false,
          emailOtpEnabled: false,
          totpEnabled: false,
        },
      });
      userId = newUser.id;
      createdCount++;
    } else {
      userId = existingUser.id;
      await prisma.user.update({
        where: { id: userId },
        data: {
          name,
          emailVerified: true,
          status: 'ACTIVE',
          image: existingUser.image || avatar,
          bio: existingUser.bio || bio,
          twoFactorEnabled: false,
          emailOtpEnabled: false,
          totpEnabled: false,
        },
      });
      updatedCount++;
    }

    // Upsert credential account for password login
    const existingAccount = await prisma.account.findFirst({
      where: { userId, providerId: 'credential' },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          password: hashedPassword,
        },
      });
    } else {
      await prisma.account.create({
        data: {
          userId,
          accountId: userId,
          providerId: 'credential',
          password: hashedPassword,
        },
      });
    }

    // Upsert UserProfile
    await prisma.userProfile.upsert({
      where: { userId },
      update: {
        username,
        bio,
        city,
        work: role,
        education,
        contactVisibility: 'PUBLIC',
        birthdayVisibility: 'FRIENDS',
      },
      create: {
        userId,
        username,
        bio,
        city,
        work: role,
        education,
        contactVisibility: 'PUBLIC',
        birthdayVisibility: 'FRIENDS',
      },
    });

    // Upsert UserPreference
    await prisma.userPreference.upsert({
      where: { userId },
      update: {
        theme: 'SYSTEM',
        locale: 'en',
      },
      create: {
        userId,
        theme: 'SYSTEM',
        locale: 'en',
      },
    });

    if (i % 20 === 0 || i === 100) {
      console.log(`[Seed] Progress: ${i}/100 users processed...`);
    }
  }

  console.log(`[Seed] Done! Created: ${createdCount}, Updated: ${updatedCount} (Total 100 users ready).`);
}

// If run directly
if (process.argv[1]?.endsWith('seed-100-users.ts') || process.argv[1]?.endsWith('seed-100-users.js')) {
  seed100Users()
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

