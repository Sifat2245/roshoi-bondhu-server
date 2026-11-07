import jwt from "jsonwebtoken";
const createToken = (payload, secret, options) => {
    return jwt.sign(payload, secret, options);
};
const verifyToken = (token, secret) => {
    return jwt.verify(token, secret);
};
// Decoding reads the payload without verifying the signature or expiration.
const decodeToken = (token) => {
    return jwt.decode(token);
};
export const jwtUtils = {
    createToken,
    verifyToken,
    decodeToken,
};
