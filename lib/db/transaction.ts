import "server-only";

import { Transaction, type TransactionOptions } from "sequelize";

import { getSequelize, type PostgresTransaction } from "@/lib/db/sequelize";

type RunInTransactionOptions = {
  isolationLevel?: Transaction.ISOLATION_LEVELS;
  type?: Transaction.TYPES;
  transaction?: PostgresTransaction;
};

export const runInTransaction = async <T>(
  fn: (tx: PostgresTransaction) => Promise<T>,
  options: RunInTransactionOptions = {},
) => {
  const sequelize = getSequelize();
  const transactionOptions: TransactionOptions = {
    isolationLevel: options.isolationLevel,
    type: options.type,
    transaction: options.transaction,
  };

  return sequelize.transaction(transactionOptions, fn);
};

export type { RunInTransactionOptions };
