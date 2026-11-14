import auth from '../lib/auth.js';
import prisma from '../lib/prisma.js';
import jwtUtils from '../shared/utils/jwt.js';
import { env } from '../config/env.js';
function parseCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader)
        return list;
    cookieHeader.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        const name = parts.shift()?.trim();
        if (name) {
            list[name] = decodeURIComponent(parts.join('='));
        }
    });
    return list;
}
export const createContext = async (initialContext) => {
    let currentUser = null;
    let session = null;
    try {
        const headers = initialContext.request.headers;
        const authHeader = headers.get('authorization');
        let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        const cookieHeader = headers.get('cookie');
        const cookies = parseCookies(cookieHeader);
        // 1. Fallback to accessToken cookie if Bearer header is missing
        if (!token && cookies['accessToken']) {
            token = cookies['accessToken'];
        }
        // 2. Try JWT token verification
        if (token) {
            try {
                const decoded = jwtUtils.verifyToken(token, env.JWT_ACCESS_SECRET);
                if (decoded && decoded.id) {
                    const user = await prisma.user.findUnique({
                        where: { id: decoded.id },
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            image: true,
                            role: true,
                            isBanned: true,
                            bio: true,
                            coverImage: true,
                            phone: true,
                            emailVerified: true,
                        },
                    });
                    if (user && !user.isBanned) {
                        currentUser = user;
                    }
                }
            }
            catch {
                // Not a valid JWT, check if it's a Better Auth session token
            }
        }
        // 3. Check session database for heshel.session_token
        if (!currentUser) {
            const sessionToken = cookies['heshel.session_token'] || token;
            if (sessionToken) {
                try {
                    const dbSession = await prisma.session.findUnique({
                        where: { token: sessionToken },
                        include: { user: true },
                    });
                    if (dbSession && new Date(dbSession.expiresAt) > new Date()) {
                        if (dbSession.user && !dbSession.user.isBanned) {
                            currentUser = dbSession.user;
                            session = dbSession;
                        }
                    }
                }
                catch {
                    // Session lookup failed, continue to auth.api
                }
            }
        }
        // 4. Fallback to Better Auth API getSession
        if (!currentUser) {
            try {
                const authSession = await auth.api.getSession({
                    headers: headers,
                });
                if (authSession?.user?.id) {
                    const user = await prisma.user.findUnique({
                        where: { id: authSession.user.id },
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            image: true,
                            role: true,
                            status: true,
                            isBanned: true,
                            bio: true,
                            coverImage: true,
                            phone: true,
                            emailVerified: true,
                        },
                    });
                    if (user && user.status !== 'DELETED' && !user.isBanned) {
                        currentUser = user;
                        session = authSession.session;
                    }
                }
            }
            catch {
                // Session check failed safely
            }
        }
    }
    catch (err) {
        // Unauthenticated queries continue safely with null user
    }
    return {
        ...initialContext,
        prisma,
        currentUser,
        session,
    };
};
export default createContext;
