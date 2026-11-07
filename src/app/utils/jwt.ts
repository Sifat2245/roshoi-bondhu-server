import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

const createToken = (
  payload: JwtPayload,
  secret: string,
  options: SignOptions,
): string => {
  return jwt.sign(payload, secret, options);
};

const verifyToken = (token: string, secret: string): JwtPayload | string => {
  return jwt.verify(token, secret);
};

// Decoding reads the payload without verifying the signature or expiration.
const decodeToken = (token: string): JwtPayload | string | null => {
  return jwt.decode(token);
};

export const jwtUtils = {
  createToken,
  verifyToken,
  decodeToken,
};
