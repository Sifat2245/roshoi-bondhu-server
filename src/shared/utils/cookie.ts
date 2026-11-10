import type { CookieOptions, Request, Response } from "express";
import { authCookieOptions } from "../../config/cookie.js";

const defaultCookieOptions: CookieOptions = authCookieOptions;

const setCookie = (
  res: Response,
  key: string,
  value: string,
  options: CookieOptions = {},
): Response => {
  return res.cookie(key, value, { ...defaultCookieOptions, ...options });
};

const getCookie = (req: Request, key: string): string | undefined => {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
};

const clearCookie = (
  res: Response,
  key: string,
  options: CookieOptions = {},
): Response => {
  const mergedOptions: CookieOptions = {
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
