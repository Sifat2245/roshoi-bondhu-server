import { APIError } from "better-auth/api";

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const getPositiveInteger = (
  value: unknown,
  field: string,
  fallback: number,
  maximum: number,
): number => {
  if (value === undefined) return fallback;
  const number =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof number !== "number" ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > maximum
  ) {
    throw new APIError("BAD_REQUEST", {
      message: `${field} must be an integer between 1 and ${maximum}.`,
    });
  }
  return number;
};

const getPaginationOptions = (query: Record<string, unknown> = {}) => {
  const page = getPositiveInteger(
    query.page,
    "Page",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const limit = getPositiveInteger(query.limit, "Limit", 10, 100);
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip) || skip > 2147483647) {
    throw new APIError("BAD_REQUEST", {
      message: "The requested page is too large.",
    });
  }
  return { page, limit, skip };
};

const getPaginationMeta = (
  page: number,
  limit: number,
  total: number,
): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

export const paginationUtils = { getPaginationOptions, getPaginationMeta };
