const auth = require('../lib/auth');
const prisma = require('../lib/prisma');

/**
 * Require valid authenticated user session
 */
const requireAuth = async (req, res, next) => {
    try {
        const session = await auth.api.getSession({
            headers: req.headers,
        });

        if (!session || !session.user) {
            return res.status(401).json({ error: 'Authentication required. Please log in.' });
        }

        // Fetch fresh user record to ensure roles and ban status are up-to-date
        const freshUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                isBanned: true,
                bio: true,
                coverImage: true,
            },
        });

        if (!freshUser) {
            return res.status(401).json({ error: 'User no longer exists.' });
        }

        if (freshUser.isBanned) {
            return res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
        }

        req.user = freshUser;
        req.session = session.session;
        next();
    } catch (error) {
        console.error('[requireAuth Error]:', error);
        return res.status(500).json({ error: 'Failed to authenticate session.' });
    }
};

/**
 * Optional authentication: attaches req.user if session exists, but doesn't block guests
 */
const optionalAuth = async (req, res, next) => {
    try {
        const session = await auth.api.getSession({
            headers: req.headers,
        });

        if (session && session.user) {
            const user = await prisma.user.findUnique({
                where: { id: session.user.id },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    role: true,
                    isBanned: true,
                },
            });

            if (user && !user.isBanned) {
                req.user = user;
                req.session = session.session;
            }
        }
        next();
    } catch {
        // Continue even if session parsing fails
        next();
    }
};

/**
 * Require specific Platform Role(s) e.g. ['ADMIN'] or ['ADMIN', 'MODERATOR']
 */
const requireRole = (allowedRoles = ['ADMIN']) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Access denied. Requires one of: ${allowedRoles.join(', ')}.`,
            });
        }

        next();
    };
};

module.exports = {
    requireAuth,
    optionalAuth,
    requireRole,
};
