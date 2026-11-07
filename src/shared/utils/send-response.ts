import type { Response } from "express";
import type { PaginationMeta } from "../pagination/pagination.js";

export interface IResponse<T> {
  statusCode: number;
  success: boolean;
  message: string;
  meta?: PaginationMeta;
  data?: T;
}

export const sendResponse = <T>(res: Response, responseData: IResponse<T>) => {
  const { statusCode, success, message, meta, data } = responseData;
  res.status(statusCode).json({
    statusCode,
    success,
    message,
    meta,
    data,
  });
};

export default sendResponse;

