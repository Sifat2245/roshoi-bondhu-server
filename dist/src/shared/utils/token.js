import { envVariables } from "../../config/env.js";
import { cookieUtils } from "./cookie.js";
import { jwtUtils } from "./jwt.js";
import ms from "ms";
const getAccessToken = (payload) => {
    return jwtUtils.createToken(payload, envVariables.JWT_ACCESS_SECRET, {
        expiresIn: envVariables.JWT_ACCESS_EXPIRES_IN,
    });
};
const getRefreshToken = (payload) => {
    return jwtUtils.createToken(payload, envVariables.JWT_REFRESH_SECRET, {
        expiresIn: envVariables.JWT_REFRESH_EXPIRES_IN,
    });
};
const setAccessTokenCookie = (res, token) => {
    const maxAge = ms(envVariables.JWT_ACCESS_EXPIRES_IN) || 15 * 60 * 1000;
    return cookieUtils.setCookie(res, "accessToken", token, {
        maxAge,
    });
};
const setRefreshTokenCookie = (res, token) => {
    const maxAge = ms(envVariables.JWT_REFRESH_EXPIRES_IN) || 7 * 24 * 60 * 60 * 1000;
    return cookieUtils.setCookie(res, "refreshToken", token, {
        maxAge,
    });
};
const setBetterAuthSessionCookie = (res, token) => {
    const maxAge = ms(envVariables.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN) || 7 * 24 * 60 * 60 * 1000;
    return cookieUtils.setCookie(res, "betterAuthSession", token, {
        maxAge,
    });
};
export const tokenUtils = {
    getAccessToken,
    getRefreshToken,
    setAccessTokenCookie,
    setRefreshTokenCookie,
    setBetterAuthSessionCookie,
};
export default tokenUtils;
