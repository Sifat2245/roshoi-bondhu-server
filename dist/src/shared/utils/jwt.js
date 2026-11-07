import jwt from "jsonwebtoken";
const createToken = (payload, secret, options) => {
    return jwt.sign(payload, secret, options);
};
const verifyToken = (token, secret) => {
    return jwt.verify(token, secret);
};
const decodeToken = (token) => {
    return jwt.decode(token);
};
export const jwtUtils = {
    createToken,
    verifyToken,
    decodeToken,
};
export default jwtUtils;
