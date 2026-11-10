import { authCookieOptions } from "../../config/cookie.js";
const defaultCookieOptions = authCookieOptions;
const setCookie = (res, key, value, options = {}) => {
    return res.cookie(key, value, { ...defaultCookieOptions, ...options });
};
const getCookie = (req, key) => {
    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader)
        return undefined;
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
};
const clearCookie = (res, key, options = {}) => {
    const mergedOptions = {
        ...defaultCookieOptions,
        path: "/",
        expires: new Date(0),
        maxAge: 0,
        ...options,
    };
    res.cookie(key, "", mergedOptions);
    return res;
};
export const cookieUtils = {
    setCookie,
    getCookie,
    clearCookie,
};
export default cookieUtils;
