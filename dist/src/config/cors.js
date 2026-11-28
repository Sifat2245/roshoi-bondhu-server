import cors from 'cors';
import { env } from './env.js';
const parseOrigins = (raw) => (raw || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
export const allowedOrigins = Array.from(new Set([
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://heshel-server-fg2v.vercel.app',
    'https://heshel-server.vercel.app',
    ...parseOrigins(env.CLIENT_URL),
    ...parseOrigins(env.CORS_ORIGINS),
]));
export function isOriginAllowed(origin, extraOrigins = []) {
    if (!origin)
        return true;
    if (env.NODE_ENV !== 'production')
        return true;
    const normalized = origin.trim().replace(/\/+$/, '');
    const list = extraOrigins.length > 0
        ? Array.from(new Set([...allowedOrigins, ...extraOrigins]))
        : allowedOrigins;
    return list.some((pattern) => {
        if (pattern === normalized)
            return true;
        // Support subdomain wildcard entries such as https://*.vercel.app
        if (pattern.includes('*.')) {
            const escaped = pattern
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                .replace('\\*', '[^.]+');
            return new RegExp(`^${escaped}$`).test(normalized);
        }
        return false;
    });
}
export const corsMiddleware = cors({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
export default corsMiddleware;
