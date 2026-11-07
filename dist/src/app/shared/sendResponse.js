export const sendResponse = (res, responseData) => {
    const { statusCode, success, message, meta, data } = responseData;
    res.status(statusCode).json({
        statusCode,
        success,
        message,
        meta,
        data,
    });
};
