declare module "pg" {
  export type QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
    rows: Row[];
    rowCount: number | null;
  };

  export interface PoolClient {
    query<Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<Row>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: Record<string, unknown>);
    query<Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<Row>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}
