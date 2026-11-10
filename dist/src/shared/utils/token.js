import crypto from "crypto";
import { envVariables } from "../../config/env.js";
import { cookieUtils } from "./cookie.js";
import { jwtUtils } from "./jwt.js";
// Persistent token duration within RFC 6265bis 400-day browser cookie spec
const PERSISTENT_EXPIRES_IN = '365d';
const PERSISTENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const signBetterAuthToken = (token) => {
    const secret = envVariables.BETTER_AUTH_SECRET;
    const signature = crypto.createHmac('sha256', secret).update(token).digest('base64');
    return encodeURIComponent(`${token}.${signature}`);
};
const getAccessToken = (payload) => {
    return jwtUtils.createToken(payload, envVariables.JWT_ACCESS_SECRET, {
        expiresIn: PERSISTENT_EXPIRES_IN,
    });
};
const getRefreshToken = (payload) => {
    return jwtUtils.createToken(payload, envVariables.JWT_REFRESH_SECRET, {
        expiresIn: PERSISTENT_EXPIRES_IN,
    });
};
const generateUserToken = (user) => {
    const payload = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        image: user.image || null,
    };
    return getAccessToken(payload);
};
const setAccessTokenCookie = (res, token) => {
    const isProduction = envVariables.NODE_ENV === 'production';
    return cookieUtils.setCookie(res, "accessToken", token, {
        maxAge: PERSISTENT_MAX_AGE_MS,
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
    });
};
const setRefreshTokenCookie = (res, token) => {
    const isProduction = envVariables.NODE_ENV === 'production';
    return cookieUtils.setCookie(res, "refreshToken", token, {
        maxAge: PERSISTENT_MAX_AGE_MS,
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
    });
};
const setBetterAuthSessionCookie = (res, rawToken) => {
    const isProduction = envVariables.NODE_ENV === 'production';
    const signedToken = signBetterAuthToken(rawToken);
    return cookieUtils.setCookie(res, "heshel.session_token", signedToken, {
        maxAge: PERSISTENT_MAX_AGE_MS,
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
    });
};
const clearAuthCookies = (res, req) => {
    const isProduction = envVariables.NODE_ENV === 'production';
    const cookieNames = [
        "accessToken",
        "refreshToken",
        "betterAuthSession",
        "heshel.session_token",
        "heshel.session_data",
        "heshel.dont_remember",
        "better-auth.session_token",
        "better-auth.session_data",
        "better-auth.dont_remember",
        "session_token",
    ];
    const allCookieNames = new Set(cookieNames);
    // If req is passed, inspect incoming Cookie header and clear any auth/session cookies
    if (req && req.headers?.cookie) {
        const rawCookies = req.headers.cookie.split(';');
        for (const c of rawCookies) {
            const name = c.split('=')[0]?.trim();
            if (name && (name.includes('heshel') ||
                name.includes('auth') ||
                name.includes('token') ||
                name.includes('session'))) {
                allCookieNames.add(name);
            }
        }
    }
    for (const name of allCookieNames) {
        cookieUtils.clearCookie(res, name);
        // Explicitly set with maxAge: 0 and expires: 1970
        res.cookie(name, "", {
            path: "/",
            expires: new Date(0),
            maxAge: 0,
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
        });
    }
    // Clear-Site-Data header to purge cookies in supporting browsers
    res.setHeader("Clear-Site-Data", '"cookies"');
};
export const tokenUtils = {
    signBetterAuthToken,
    getAccessToken,
    getRefreshToken,
    generateUserToken,
    setAccessTokenCookie,
    setRefreshTokenCookie,
    setBetterAuthSessionCookie,
    clearAuthCookies,
};
export default tokenUtils;
