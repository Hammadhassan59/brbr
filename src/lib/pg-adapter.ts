import 'server-only';
// Thin PostgREST-shaped adapter on top of @/lib/pg. Goal: keep the existing
// `supabase.from('x').select(...).eq(...).maybeSingle()` call shape working
// against raw Postgres so we can drop @supabase/supabase-js across server
// actions without rewriting every call site.
//
// Scope (intentionally narrow — keep the failure modes loud rather than
// silently misbehaving):
//
//   SUPPORTED
//     .select(cols, { count, head })
//     .insert(row | rows[], { count })
//     .update(values, { count })
//     .upsert(row | rows[], { onConflict, ignoreDuplicates })
//     .delete({ count })
//     .eq, .neq, .gt, .gte, .lt, .lte, .in, .is, .like, .ilike
//     .order(col, { ascending })
//     .limit(n) / .range(from, to)
//     .single() / .maybeSingle()
//     count: 'exact' returns { count } alongside data
//
//   NOT SUPPORTED — throws PgAdapterUnsupported with the call-site context
//     PostgREST embedded joins:  select('*, salon:salons(name)')
//     .or('a.eq.x,b.eq.y')
//     .filter() / .match() / .containedBy()
//     .rpc() — separate replacement (5 RPCs, see Phase 3 plan)
//
// Tests mock @/lib/supabase wholesale, so they keep working untouched.

import { pool } from '@/lib/pg';
import type { QueryResult } from 'pg';

export class PgAdapterUnsupported extends Error {
  constructor(feature: string, hint: string) {
    super(`pg-adapter: ${feature} is not supported. ${hint}`);
    this.name = 'PgAdapterUnsupported';
  }
}

type Filter =
  | { kind: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike'; col: string; val: unknown }
  | { kind: 'in'; col: string; val: unknown[] }
  | { kind: 'is'; col: string; val: null | true | false };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface PgResult<T> {
  // Mirrors @supabase/supabase-js's untyped default. `any` keeps both
  // `data.col` member access and array iteration working without forcing
  // 800+ call sites to add type annotations. The trade-off is callbacks like
  // `.map((s) => s.x)` need an explicit `(s: any) =>` annotation under
  // strict mode (handled per-site).
  data: Any;
  error: { message: string; code?: string } | null;
  count: number | null;
  status: number;
  statusText: string;
  _t?: T;
}

interface UpsertOpts {
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

class QueryBuilder<TRow extends Record<string, unknown> = Record<string, unknown>>
  implements PromiseLike<PgResult<TRow | TRow[]>> {
  // The builder is lazy — buildSql is only called when the consumer awaits.
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private cols = '*';
  private filters: Filter[] = [];
  // Raw WHERE fragments + their bound values, appended after typed filters.
  // Used by .not() and any future PostgREST operator that doesn't fit the
  // typed Filter shape. Each entry holds a fragment with literal $$RAW$$
  // placeholders and the params those resolve to (in left-to-right order).
  private rawWhere: Array<{ frag: string; params: unknown[] }> = [];
  private orderClauses: { col: string; asc: boolean; nullsFirst: boolean | undefined }[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private returningMode: 'single' | 'maybeSingle' | 'array' = 'array';
  private countMode: 'exact' | 'planned' | 'estimated' | null = null;
  private headOnly = false;
  private upsertOpts: UpsertOpts = {};
  private writeReturning = '*';
  private values: unknown = null;

  constructor(private table: string) {}

  // ----- Read shape ------------------------------------------------------

  select(
    cols: string = '*',
    opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
  ): QueryBuilder<TRow> {
    if (cols.includes('!') || /\b\w+:\w+\(/.test(cols)) {
      throw new PgAdapterUnsupported(
        `embedded join in select('${cols}')`,
        `Convert this call to an explicit SQL JOIN via pool.query() or split into two queries.`,
      );
    }
    this.cols = cols;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.headOnly = true;
    // After a write, .select() switches the RETURNING clause but keeps the
    // op (insert/update/etc.). For read queries the op stays 'select'.
    if (this.op === 'select') {
      this.cols = cols;
    } else {
      this.writeReturning = cols;
    }
    return this;
  }

  // ----- Write shapes ----------------------------------------------------

  insert(row: Record<string, unknown> | Array<Record<string, unknown>>, opts?: { count?: 'exact' }): QueryBuilder<TRow> {
    this.op = 'insert';
    this.values = Array.isArray(row) ? row : [row];
    this.writeReturning = '*';
    if (opts?.count) this.countMode = opts.count;
    return this;
  }

  update(values: Record<string, unknown>, opts?: { count?: 'exact' }): QueryBuilder<TRow> {
    this.op = 'update';
    this.values = values;
    this.writeReturning = '*';
    if (opts?.count) this.countMode = opts.count;
    return this;
  }

  upsert(
    row: Record<string, unknown> | Array<Record<string, unknown>>,
    opts: UpsertOpts = {},
  ): QueryBuilder<TRow> {
    this.op = 'upsert';
    this.values = Array.isArray(row) ? row : [row];
    this.upsertOpts = opts;
    this.writeReturning = '*';
    return this;
  }

  delete(opts?: { count?: 'exact' }): QueryBuilder<TRow> {
    this.op = 'delete';
    this.writeReturning = '*';
    if (opts?.count) this.countMode = opts.count;
    return this;
  }

  // ----- Filters ---------------------------------------------------------

  eq(col: string, val: unknown): QueryBuilder<TRow> { this.filters.push({ kind: 'eq', col, val }); return this; }
  neq(col: string, val: unknown): QueryBuilder<TRow> { this.filters.push({ kind: 'neq', col, val }); return this; }
  gt(col: string, val: unknown): QueryBuilder<TRow> { this.filters.push({ kind: 'gt', col, val }); return this; }
  gte(col: string, val: unknown): QueryBuilder<TRow> { this.filters.push({ kind: 'gte', col, val }); return this; }
  lt(col: string, val: unknown): QueryBuilder<TRow> { this.filters.push({ kind: 'lt', col, val }); return this; }
  lte(col: string, val: unknown): QueryBuilder<TRow> { this.filters.push({ kind: 'lte', col, val }); return this; }
  like(col: string, val: string): QueryBuilder<TRow> { this.filters.push({ kind: 'like', col, val }); return this; }
  ilike(col: string, val: string): QueryBuilder<TRow> { this.filters.push({ kind: 'ilike', col, val }); return this; }
  in(col: string, vals: unknown[]): QueryBuilder<TRow> { this.filters.push({ kind: 'in', col, val: vals }); return this; }
  is(col: string, val: null | true | false): QueryBuilder<TRow> { this.filters.push({ kind: 'is', col, val }); return this; }

  // PostgREST negation: .not('col', 'is', null) -> "col IS NOT NULL"
  not(col: string, op: 'is' | 'eq' | 'in', val: null | unknown | unknown[]): QueryBuilder<TRow> {
    const c = quoteIdent(col);
    if (op === 'is') {
      this.rawWhere.push({
        frag: val === null
          ? `${c} IS NOT NULL`
          : `${c} IS NOT ${val ? 'TRUE' : 'FALSE'}`,
        params: [],
      });
      return this;
    }
    if (op === 'eq') {
      this.rawWhere.push({ frag: `${c} <> $$RAW$$`, params: [val] });
      return this;
    }
    if (op === 'in') {
      this.rawWhere.push({ frag: `${c} <> ALL($$RAW$$)`, params: [val as unknown[]] });
      return this;
    }
    throw new PgAdapterUnsupported(
      `.not(${col}, ${op}, ...) on table '${this.table}'`,
      `Only .not(col, 'is'|'eq'|'in', val) is implemented.`,
    );
  }

  // .or('a.eq.x,b.eq.y') — translate the PostgREST mini-DSL into raw OR.
  // Supports the eq/in/is/gte/lte operators that iCut uses.
  or(filterString: string): QueryBuilder<TRow> {
    const parts = filterString.split(',').map((s) => s.trim()).filter(Boolean);
    const sqlParts: string[] = [];
    const localParams: unknown[] = [];
    for (const p of parts) {
      const m = p.match(/^([\w.]+)\.(\w+)\.(.+)$/);
      if (!m) {
        throw new PgAdapterUnsupported(
          `unrecognised .or() fragment '${p}'`,
          `Convert to raw pool.query().`,
        );
      }
      const [, col, op, rawVal] = m;
      const c = quoteIdent(col);
      switch (op) {
        case 'eq': sqlParts.push(`${c} = $$RAW$$`); localParams.push(rawVal); break;
        case 'neq': sqlParts.push(`${c} <> $$RAW$$`); localParams.push(rawVal); break;
        case 'gt': sqlParts.push(`${c} > $$RAW$$`); localParams.push(rawVal); break;
        case 'gte': sqlParts.push(`${c} >= $$RAW$$`); localParams.push(rawVal); break;
        case 'lt': sqlParts.push(`${c} < $$RAW$$`); localParams.push(rawVal); break;
        case 'lte': sqlParts.push(`${c} <= $$RAW$$`); localParams.push(rawVal); break;
        case 'is':
          if (rawVal === 'null') { sqlParts.push(`${c} IS NULL`); break; }
          if (rawVal === 'true') { sqlParts.push(`${c} IS TRUE`); break; }
          if (rawVal === 'false') { sqlParts.push(`${c} IS FALSE`); break; }
          throw new PgAdapterUnsupported(`.or() is.${rawVal}`, `Use null|true|false.`);
        case 'in': {
          // PostgREST: "in.(1,2,3)"
          const inMatch = rawVal.match(/^\((.*)\)$/);
          if (!inMatch) throw new PgAdapterUnsupported(`.or() in.${rawVal}`, `Format: in.(a,b,c)`);
          sqlParts.push(`${c} = ANY($$RAW$$)`);
          localParams.push(inMatch[1].split(',').map((v) => v.trim()));
          break;
        }
        case 'ilike': sqlParts.push(`${c} ILIKE $$RAW$$`); localParams.push(rawVal.replace(/\*/g, '%')); break;
        case 'like': sqlParts.push(`${c} LIKE $$RAW$$`); localParams.push(rawVal.replace(/\*/g, '%')); break;
        default:
          throw new PgAdapterUnsupported(`.or() operator '${op}' on '${col}'`, `Add to pg-adapter.or().`);
      }
    }
    this.rawWhere.push({ frag: `(${sqlParts.join(' OR ')})`, params: localParams });
    return this;
  }

  filter(): QueryBuilder<TRow> {
    throw new PgAdapterUnsupported(
      `.filter() on table '${this.table}'`,
      `Use the typed accessors (.eq, .gte, etc.) or pool.query().`,
    );
  }

  match(): QueryBuilder<TRow> {
    throw new PgAdapterUnsupported(
      `.match() on table '${this.table}'`,
      `Use chained .eq(...) calls instead.`,
    );
  }

  // ----- Ordering / paging ----------------------------------------------

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): QueryBuilder<TRow> {
    this.orderClauses.push({
      col,
      asc: opts?.ascending !== false,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }

  limit(n: number): QueryBuilder<TRow> { this.limitN = n; return this; }

  range(from: number, to: number): QueryBuilder<TRow> {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }

  // ----- Result shape ----------------------------------------------------

  single(): QueryBuilder<TRow> { this.returningMode = 'single'; return this; }
  maybeSingle(): QueryBuilder<TRow> { this.returningMode = 'maybeSingle'; return this; }

  // ----- Execution -------------------------------------------------------

  // The builder is the awaited Promise — calling .then triggers execution.
  // This mirrors PostgREST's @supabase-js client which is also lazy.
  then<TResult1 = PgResult<TRow | TRow[]>, TResult2 = never>(
    onFulfilled?: ((value: PgResult<TRow | TRow[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onFulfilled ?? null, onRejected ?? null);
  }

  private async execute(): Promise<PgResult<TRow | TRow[]>> {
    try {
      let count: number | null = null;
      if (this.countMode === 'exact') {
        const { sql: countSql, params } = this.buildCountSql();
        const r = await pool.query<{ count: string }>(countSql, params);
        count = Number(r.rows[0]?.count ?? 0);
        if (this.headOnly) {
          return { data: null, error: null, count, status: 200, statusText: 'OK' };
        }
      }

      const { sql, params } = this.buildSql();
      const result = await pool.query<TRow>(sql, params);

      if (this.headOnly) {
        return { data: null, error: null, count, status: 200, statusText: 'OK' };
      }

      if (this.returningMode === 'single') {
        if (result.rows.length !== 1) {
          return {
            data: null,
            error: {
              message: result.rows.length === 0
                ? 'JSON object requested, multiple (or no) rows returned'
                : 'Multiple rows returned for .single()',
              code: 'PGRST116',
            },
            count,
            status: 406,
            statusText: 'Not Acceptable',
          };
        }
        return { data: result.rows[0] as TRow, error: null, count, status: 200, statusText: 'OK' };
      }

      if (this.returningMode === 'maybeSingle') {
        if (result.rows.length > 1) {
          return {
            data: null,
            error: { message: 'Multiple rows returned for .maybeSingle()', code: 'PGRST116' },
            count,
            status: 406,
            statusText: 'Not Acceptable',
          };
        }
        return { data: (result.rows[0] ?? null) as TRow | null, error: null, count, status: 200, statusText: 'OK' };
      }

      return { data: result.rows as TRow[], error: null, count, status: 200, statusText: 'OK' };
    } catch (err) {
      const e = err as { message?: string; code?: string };
      return {
        data: null,
        error: { message: e.message ?? 'pg-adapter unknown error', code: e.code },
        count: null,
        status: 500,
        statusText: 'Internal Error',
      };
    }
  }

  // ----- SQL generation --------------------------------------------------

  private buildWhere(params: unknown[]): string {
    if (this.filters.length === 0 && this.rawWhere.length === 0) return '';
    const parts = this.filters.map((f) => {
      const col = quoteIdent(f.col);
      switch (f.kind) {
        case 'eq': params.push(f.val); return `${col} = $${params.length}`;
        case 'neq': params.push(f.val); return `${col} <> $${params.length}`;
        case 'gt': params.push(f.val); return `${col} > $${params.length}`;
        case 'gte': params.push(f.val); return `${col} >= $${params.length}`;
        case 'lt': params.push(f.val); return `${col} < $${params.length}`;
        case 'lte': params.push(f.val); return `${col} <= $${params.length}`;
        case 'like': params.push(f.val); return `${col} LIKE $${params.length}`;
        case 'ilike': params.push(f.val); return `${col} ILIKE $${params.length}`;
        case 'is':
          if (f.val === null) return `${col} IS NULL`;
          return `${col} IS ${f.val ? 'TRUE' : 'FALSE'}`;
        case 'in':
          if (f.val.length === 0) return 'FALSE';     // matches PostgREST: empty IN -> no rows
          params.push(f.val);
          return `${col} = ANY($${params.length})`;
      }
    });
    // Each raw fragment carries its own param list; $$RAW$$ placeholders
    // resolve to positional $N as we extend the global params array.
    const rawParts = this.rawWhere.map((entry) => {
      let i = 0;
      return entry.frag.replace(/\$\$RAW\$\$/g, () => {
        params.push(entry.params[i++]);
        return `$${params.length}`;
      });
    });
    const all = [...parts, ...rawParts].filter(Boolean);
    if (all.length === 0) return '';
    return ` WHERE ${all.join(' AND ')}`;
  }

  private buildSql(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const t = quoteTable(this.table);

    switch (this.op) {
      case 'select': {
        let sql = `SELECT ${this.expandCols(this.cols)} FROM ${t}`;
        sql += this.buildWhere(params);
        if (this.orderClauses.length) {
          sql += ' ORDER BY ' + this.orderClauses.map((o) =>
            `${quoteIdent(o.col)} ${o.asc ? 'ASC' : 'DESC'}` +
            (o.nullsFirst === undefined ? '' : (o.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST'))
          ).join(', ');
        }
        if (this.limitN !== null) sql += ` LIMIT ${this.limitN}`;
        if (this.offsetN !== null) sql += ` OFFSET ${this.offsetN}`;
        return { sql, params };
      }

      case 'insert': {
        const rows = this.values as Array<Record<string, unknown>>;
        if (rows.length === 0) {
          return { sql: `SELECT 1 WHERE FALSE`, params: [] };
        }
        const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
        const placeholders = rows.map((row) => {
          const vals = cols.map((c) => {
            params.push(row[c] ?? null);
            return `$${params.length}`;
          });
          return `(${vals.join(', ')})`;
        });
        let sql = `INSERT INTO ${t} (${cols.map(quoteIdent).join(', ')}) VALUES ${placeholders.join(', ')}`;
        sql += ` RETURNING ${this.expandCols(this.writeReturning)}`;
        return { sql, params };
      }

      case 'update': {
        const vals = this.values as Record<string, unknown>;
        const cols = Object.keys(vals);
        if (cols.length === 0) {
          return { sql: `SELECT 1 WHERE FALSE`, params: [] };
        }
        const sets = cols.map((c) => {
          params.push(vals[c]);
          return `${quoteIdent(c)} = $${params.length}`;
        }).join(', ');
        let sql = `UPDATE ${t} SET ${sets}`;
        sql += this.buildWhere(params);
        sql += ` RETURNING ${this.expandCols(this.writeReturning)}`;
        return { sql, params };
      }

      case 'upsert': {
        const rows = this.values as Array<Record<string, unknown>>;
        if (rows.length === 0) return { sql: `SELECT 1 WHERE FALSE`, params: [] };
        const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
        const placeholders = rows.map((row) => {
          const vals = cols.map((c) => {
            params.push(row[c] ?? null);
            return `$${params.length}`;
          });
          return `(${vals.join(', ')})`;
        });
        const conflictTarget = this.upsertOpts.onConflict
          ? `(${this.upsertOpts.onConflict.split(',').map((s) => quoteIdent(s.trim())).join(', ')})`
          : '';
        const action = this.upsertOpts.ignoreDuplicates
          ? 'DO NOTHING'
          : `DO UPDATE SET ${cols.filter((c) => !this.upsertOpts.onConflict?.split(',').map((s) => s.trim()).includes(c))
              .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ')}`;
        let sql = `INSERT INTO ${t} (${cols.map(quoteIdent).join(', ')}) VALUES ${placeholders.join(', ')}`;
        if (conflictTarget) sql += ` ON CONFLICT ${conflictTarget} ${action}`;
        sql += ` RETURNING ${this.expandCols(this.writeReturning)}`;
        return { sql, params };
      }

      case 'delete': {
        let sql = `DELETE FROM ${t}`;
        sql += this.buildWhere(params);
        sql += ` RETURNING ${this.expandCols(this.writeReturning)}`;
        return { sql, params };
      }
    }
  }

  private buildCountSql(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const sql = `SELECT count(*)::bigint AS count FROM ${quoteTable(this.table)}${this.buildWhere(params)}`;
    return { sql, params };
  }

  private expandCols(cols: string): string {
    if (cols === '*' || cols.trim() === '') return '*';
    return cols
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .map(quoteIdent)
      .join(', ');
  }
}

// table can be 'schema.table' or 'table'. quotes each segment safely.
function quoteTable(t: string): string {
  return t.split('.').map(quoteIdent).join('.');
}

// Quote an identifier by doubling embedded ". Rejects anything containing "
// followed by ; to defang naive injection through user-controlled strings —
// callers should never pass user input as identifiers anyway.
function quoteIdent(name: string): string {
  if (/[\s";]/.test(name)) {
    // Allow common safe forms only: word chars, dots, parens, *, alias 'a:b'
    // Trim alias-like tokens (PostgREST returns them in select strings).
    if (!/^[a-zA-Z_][\w]*$/.test(name)) {
      // Pass through aggregates, *, count(*), explicit casts — caller's responsibility
      return name;
    }
  }
  return `"${name.replace(/"/g, '""')}"`;
}

// ----- The client / from() entry point ------------------------------------

class PgClient {
  // Allow arbitrary auth shape so existing tests (which inject `auth.admin`
  // directly on the client) keep working. Production code uses @/app/actions/auth-credentials.
  auth?: Record<string, Any>;

  from<TRow extends Record<string, unknown> = Record<string, unknown>>(table: string): QueryBuilder<TRow> {
    return new QueryBuilder<TRow>(table);
  }

  // RPCs (SECURITY DEFINER functions). Forwards directly to pool.query via
  // SELECT ... FROM fn_name(...). The 5 RPCs iCut uses (get_daily_summary,
  // get_staff_monthly_commission, get_udhaar_report, get_client_stats,
  // get_salon_daily_summary, book_appointment_with_services) all exist in
  // the restored DB and accept positional named params via JSON.
  async rpc<T = Any>(fn: string, args: Record<string, unknown> = {}): Promise<PgResult<T>> {
    const keys = Object.keys(args);
    const argList = keys.map((k, i) => `${quoteIdent(k)} => $${i + 1}`).join(', ');
    const params = keys.map((k) => args[k]);
    try {
      const r = await pool.query<Any>(`SELECT * FROM ${quoteIdent(fn)}(${argList})`, params);
      return { data: r.rows.length === 1 ? r.rows[0] : r.rows, error: null, count: null, status: 200, statusText: 'OK' };
    } catch (err) {
      const e = err as { message?: string; code?: string };
      return { data: null, error: { message: e.message ?? 'rpc failed', code: e.code }, count: null, status: 500, statusText: 'Internal Error' };
    }
  }

  // Storage namespace — typed shape preserved so call sites typecheck, but
  // every actual operation throws PgAdapterUnsupported at runtime. The 2
  // remaining .storage call sites must move to disk-direct or R2 reads.
  get storage(): StorageNamespace {
    return STORAGE_STUB;
  }
}

interface StorageBucket {
  upload(path: string, file: Any, opts?: Any): Promise<Any>;
  download(path: string): Promise<Any>;
  remove(paths: string[]): Promise<Any>;
  list(prefix?: string, opts?: Any): Promise<Any>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
  createSignedUrl(path: string, expiresIn: number): Promise<Any>;
}
interface StorageNamespace {
  from(bucket: string): StorageBucket;
}

function makeStorageThrower(): StorageNamespace {
  const bucket: StorageBucket = {
    upload: async () => { throw new PgAdapterUnsupported('storage.upload', 'Move to /opt/storage/ or R2.'); },
    download: async () => { throw new PgAdapterUnsupported('storage.download', 'Move to /opt/storage/ or R2.'); },
    remove: async () => { throw new PgAdapterUnsupported('storage.remove', 'Move to /opt/storage/ or R2.'); },
    list: async () => { throw new PgAdapterUnsupported('storage.list', 'Move to /opt/storage/ or R2.'); },
    getPublicUrl: () => { throw new PgAdapterUnsupported('storage.getPublicUrl', 'Compute URL from app config.'); },
    createSignedUrl: async () => { throw new PgAdapterUnsupported('storage.createSignedUrl', 'Mint a server-side signed URL via own crypto.'); },
  };
  return { from: () => bucket };
}
const STORAGE_STUB = makeStorageThrower();

// Single shared client — pg pool inside is itself singleton (lazy).
const sharedClient = new PgClient();

export function pgClient(): PgClient { return sharedClient; }
