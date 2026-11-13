import auth from './src/lib/auth.js';
import prisma from './src/lib/prisma.js';

async function testLogin() {
  try {
    const res = await auth.api.signInEmail({
      body: {
        email: 'user1@example.com',
        password: '12345678',
      },
    });
    console.log('Login SUCCESS for user1@example.com:', {
      userId: res.user?.id,
      email: res.user?.email,
      name: res.user?.name,
      token: res.token ? 'SESSION_TOKEN_ISSUED' : 'NONE',
    });
  } catch (err: any) {
    console.error('Login FAILED:', err?.message || err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testLogin();

