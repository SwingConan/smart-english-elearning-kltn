import { PrismaPg } from '@prisma/adapter-pg';
import type {
  IsolationLevel,
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
  SqlQuery,
  SqlQueryable,
} from '@prisma/driver-adapter-utils';
import { Pool, types, type PoolConfig } from 'pg';

// Installed adapter-pg 7.10 serializes a Date without its offset and replaces
// a returned timestamptz offset with +00 rather than converting the instant.
// Correct only timestamptz bindings/parsers. Keep legacy timestamp/time/date and
// session timezone behavior intact; do not edit node_modules or historical rows.
function instant(value: string) {
  const iso = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()))
    throw new Error('Non-finite PostgreSQL instant is unsupported');
  return date.toISOString();
}
function preserveInstants(query: SqlQuery): SqlQuery {
  return {
    ...query,
    args: query.args.map((arg, i) => {
      const type = query.argTypes[i];
      if (type?.scalarType !== 'datetime' || !/^TIMESTAMPTZ(?:\(|$)/i.test(type.dbType ?? ''))
        return arg;
      const iso = (v: unknown) =>
        v === null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
      return Array.isArray(arg) ? arg.map(iso) : iso(arg);
    }),
    argTypes: query.argTypes.map((type) =>
      type.scalarType === 'datetime' && /^TIMESTAMPTZ(?:\(|$)/i.test(type.dbType ?? '')
        ? { ...type, scalarType: 'string' }
        : type,
    ),
  };
}
function wrap<T extends SqlQueryable>(inner: T): T {
  return new Proxy(inner, {
    get(target, key) {
      if (key === 'queryRaw') return (query: SqlQuery) => target.queryRaw(preserveInstants(query));
      if (key === 'executeRaw')
        return (query: SqlQuery) => target.executeRaw(preserveInstants(query));
      if (key === 'startTransaction' && 'startTransaction' in target)
        return async (level?: IsolationLevel) =>
          wrap(await (target as T & SqlDriverAdapter).startTransaction(level));
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
export type PgPoolSnapshot = { total: number; idle: number; waiting: number };
export function instantAwarePg(
  config: PoolConfig,
  schema?: string,
): SqlDriverAdapterFactory & { diagnostics: () => PgPoolSnapshot } {
  const pool = new Pool(config);
  pool.on('connect', (client) => {
    client.query = new Proxy(client.query, {
      apply(target, thisArg, args: unknown[]) {
        const q = args[0];
        if (q && typeof q === 'object' && 'types' in q) {
          const current = (
            q as { types: { getTypeParser: (oid: number, format?: 'text' | 'binary') => unknown } }
          ).types;
          if (current?.getTypeParser)
            args[0] = {
              ...q,
              types: {
                getTypeParser: (oid: number, format?: 'text' | 'binary') => {
                  if (oid === 1184 && format === 'text') return instant;
                  if (oid === 1185 && format === 'text')
                    return (value: string) => {
                      // pg's TypeId declaration omits built-in array OIDs.
                      const parsed: unknown = types.getTypeParser(
                        1185 as Parameters<typeof types.getTypeParser>[0],
                        'text',
                      )(value);
                      if (!Array.isArray(parsed))
                        throw new Error('Invalid PostgreSQL instant array');
                      return parsed.map((v: unknown) =>
                        v === null
                          ? null
                          : v instanceof Date
                            ? v.toISOString()
                            : instant(String(v)),
                      );
                    };
                  return current.getTypeParser(oid, format);
                },
              },
            };
        }
        return Reflect.apply(target, thisArg, args);
      },
    });
  });
  const inner = new PrismaPg(pool, { schema, disposeExternalPool: true });
  return {
    provider: inner.provider,
    adapterName: inner.adapterName,
    connect: async () => wrap(await inner.connect()),
    // Read-only diagnostics: never expose connection strings, SQL or parameters.
    diagnostics: () => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    }),
  };
}
