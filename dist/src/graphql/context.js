import auth from '../lib/auth.js';
import prisma from '../lib/prisma.js';
export const createContext = async (initialContext) => {
    let currentUser = null;
    let session = null;
    try {
        const headers = initialContext.request.headers;
        const authSession = await auth.api.getSession({
            headers,
        });
        if (authSession?.user) {
            currentUser = authSession.user;
            session = authSession.session;
        }
    }
    catch (err) {
        // Unauthenticated queries (such as public health check) continue safely with null user
    }
    return {
        ...initialContext,
        prisma,
        currentUser,
        session,
    };
};
export default createContext;
