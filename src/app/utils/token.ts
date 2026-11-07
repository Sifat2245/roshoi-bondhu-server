import type { JwtPayload } from "jsonwebtoken";
import type { Response } from "express";
import { envVariables } from "../../config/env.js";
import { cookieUtils } from "./cookie.js";
import { jwtUtils } from "./jwt.js";
import ms from "ms";

const getAccessToken = (payload: JwtPayload): string => {
  return jwtUtils.createToken(payload, envVariables.JWT_ACCESS_SECRET, {
    expiresIn: envVariables.JWT_ACCESS_EXPIRES_IN,
  });
};

const getRefreshToken = (payload: JwtPayload): string => {
  return jwtUtils.createToken(payload, envVariables.JWT_REFRESH_SECRET, {
    expiresIn: envVariables.JWT_REFRESH_EXPIRES_IN,
  });
};

const setAccessTokenCookie = (res: Response, token: string) => {
  const maxAge = ms(envVariables.JWT_ACCESS_EXPIRES_IN);
  return cookieUtils.setCookie(res, "accessToken", token, {
    maxAge,
  });
};

const setRefreshTokenCookie = (res: Response, token: string) => {
  const maxAge = ms(envVariables.JWT_REFRESH_EXPIRES_IN);
  return cookieUtils.setCookie(res, "refreshToken", token, {
    maxAge,
  });
};

const setBetterAuthSessionCookie = (res: Response, token: string) => {
  const maxAge = ms(envVariables.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN);
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
