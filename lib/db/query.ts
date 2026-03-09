import "server-only";

import { QueryTypes, type QueryTypes as QueryTypesType, type Transaction } from "sequelize";

import { getSequelize } from "@/lib/db/sequelize";

type SqlParams = Record<string, unknown> | unknown[];

type BaseQueryOptions = {
  transaction?: Transaction;
  replacements?: SqlParams;
};

const normalizeRow = <T>(value: unknown) => value as T;

const runTypedQuery = async (
  sql: string,
  queryType: QueryTypesType,
  options: BaseQueryOptions = {},
) =>
  getSequelize().query(sql, {
    type: queryType,
    replacements: options.replacements,
    transaction: options.transaction,
  });

export const queryMany = async <T>(sql: string, options: BaseQueryOptions = {}) => {
  const rows = (await runTypedQuery(sql, QueryTypes.SELECT, options)) as unknown[];
  return rows.map((row) => normalizeRow<T>(row));
};

export const queryOne = async <T>(sql: string, options: BaseQueryOptions = {}) => {
  const rows = await queryMany<T>(sql, options);
  return rows[0] ?? null;
};

export const execute = async (sql: string, options: BaseQueryOptions = {}) => {
  const [, metadata] = await getSequelize().query(sql, {
    replacements: options.replacements,
    transaction: options.transaction,
  });

  return metadata;
};

export const queryValue = async <T>(sql: string, options: BaseQueryOptions = {}) => {
  const row = await queryOne<Record<string, unknown>>(sql, options);
  if (!row) {
    return null;
  }

  const firstKey = Object.keys(row)[0];
  return (firstKey ? row[firstKey] : null) as T | null;
};

export type { SqlParams, BaseQueryOptions };
