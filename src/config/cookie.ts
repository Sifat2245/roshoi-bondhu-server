import { envVariables } from "./env.js";

const isProduction = envVariables.NODE_ENV === "production";

export const authCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" as const : "lax" as const,
  path: "/",
  ...(envVariables.COOKIE_DOMAIN ? { domain: envVariables.COOKIE_DOMAIN } : {}),
};
