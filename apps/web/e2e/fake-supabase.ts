/**
 * A small in-memory stand-in for the Supabase HTTP API (auth, PostgREST tables, RPCs, storage),
 * served through Playwright route interception. It lets the real web app run in a real browser
 * without a database. The *real* database rules (RLS, points, light days) are covered by
 * supabase/tests/rls_test.sql; this fake mirrors only enough of them for the UI flows, and
 * reuses the shared scoring and light-day constants so the two cannot silently drift.
 */
import type { BrowserContext, Request, Route } from "@playwright/test";
import { LIGHT_DAY_MAX_TASKS, scoreDay, type ItemStatus } from "@sparrow/shared";

export const SUPABASE_URL = "http://localhost:54321";
const USER_ID = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;
let counter = 0;
const uid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

class RpcError extends Error {}

export class FakeSupabase {
  today = "2026-11-09";
  email = "";
  password = "";
  signedIn = false;
  points = 20;
  db: Record<string, Row[]> = {
    profiles: [],
    tasks: [],
    task_steps: [],
    daily_plans: [],
    plan_items: [],
    proofs: [],
    verifications: [],
    blocklists: [],
    devices: [],
    feedback: [],
  };
  uploads: { path: string; bytes: number }[] = [];
  deleteCalls: unknown[] = [];
  /** Set to make the delete-account function answer 500, like a storage outage. */
  failDelete = false;
  requests: string[] = [];

  /** A user who already exists (so tests can sign in through the real login form). */
  seedUser(opts: { email?: string; password?: string; onboarded?: boolean; gentle?: boolean; tasks?: string[] } = {}) {
    this.email = opts.email ?? "sam@example.com";
    this.password = opts.password ?? "correct-horse";
    this.db.profiles = [
      { id: USER_ID, display_name: "Sam", timezone: "UTC", gentle_mode: opts.gentle ?? true, onboarded: opts.onboarded ?? true, light_day: null },
    ];
    for (const title of opts.tasks ?? []) this.addTask(title);
  }

  addTask(title: string) {
    const t = {
      id: uid(),
      user_id: USER_ID,
      title,
      notes: null,
      proof_required: false,
      archived: false,
      created_at: new Date(Date.now() + ++counter).toISOString(),
    };
    this.db.tasks.push(t);
    return t;
  }

  /** Earlier days already reviewed, each with one missed task (a "heavy" day). */
  seedHeavyDays(dates: string[]) {
    const task = this.addTask(`Earlier task ${dates.join(",")}`);
    for (const date of dates) {
      const plan = {
        id: uid(),
        user_id: USER_ID,
        date,
        committed_at: `${date}T08:00:00Z`,
        stake_type: "none",
        stake_amount: 0,
        mood_morning: 3,
        mood_evening: null,
        reviewed_at: `${date}T20:00:00Z`,
        points_earned: 0,
      };
      this.db.daily_plans.push(plan);
      this.db.plan_items.push({ id: uid(), daily_plan_id: plan.id, user_id: USER_ID, task_id: task.id, status: "missed", completed_at: null });
    }
  }

  profile() {
    return this.db.profiles[0];
  }
  planFor(date: string) {
    return this.db.daily_plans.find((p) => p.date === date);
  }

  async install(context: BrowserContext) {
    await context.route(
      (url) => url.origin === SUPABASE_URL,
      (route) => this.handle(route),
    );
  }

  // ------------------------------------------------------------------ HTTP plumbing
  private cors(req: Request): Record<string, string> {
    return {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": req.headers()["access-control-request-headers"] ?? "*",
      "access-control-expose-headers": "*",
    };
  }
  private send(route: Route, status: number, body?: unknown, extra: Record<string, string> = {}) {
    const headers = { ...this.cors(route.request()), ...extra };
    return route.fulfill(
      body === undefined ? { status, headers } : { status, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) },
    );
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    this.requests.push(`${req.method()} ${url.pathname}`);
    if (req.method() === "OPTIONS") return this.send(route, 204);
    try {
      if (url.pathname.startsWith("/auth/v1/")) return await this.auth(route, url);
      if (url.pathname.startsWith("/rest/v1/rpc/")) return await this.rpc(route, url.pathname.split("/").pop()!);
      if (url.pathname.startsWith("/rest/v1/")) return await this.table(route, url);
      if (url.pathname.startsWith("/storage/v1/object/")) return await this.storage(route, url);
      if (url.pathname === "/functions/v1/delete-account") return this.deleteAccount(route);
      return this.send(route, 404, { message: "not found" });
    } catch (e) {
      if (e instanceof RpcError) return this.send(route, 400, { code: "P0001", message: e.message, details: null, hint: null });
      throw e;
    }
  }

  // ------------------------------------------------------------------ Edge Function: delete-account
  private deleteAccount(route: Route) {
    if (!this.signedIn) return this.send(route, 401, { error: "Please sign in again, then try once more." });
    const body = (route.request().postDataJSON() ?? {}) as Row;
    this.deleteCalls.push(body);
    if (body.confirm !== true) return this.send(route, 400, { error: "needs confirmation" });
    if (this.failDelete) return this.send(route, 500, { error: "storage down" });
    for (const k of Object.keys(this.db)) this.db[k] = [];
    this.uploads = [];
    this.signedIn = false;
    return this.send(route, 200, { deleted: true });
  }

  // ------------------------------------------------------------------ auth
  private session() {
    const now = Math.floor(Date.now() / 1000);
    const user = {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: this.email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, role: "authenticated", aud: "authenticated", exp: now + 3600, email: this.email })}.sig`;
    return { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "refresh", user };
  }
  private async auth(route: Route, url: URL) {
    const body = (route.request().postDataJSON() ?? {}) as Row;
    const path = url.pathname.replace("/auth/v1", "");
    if (path === "/signup") {
      this.email = String(body.email);
      this.password = String(body.password);
      this.signedIn = true;
      this.db.profiles = [{ id: USER_ID, display_name: null, timezone: "UTC", gentle_mode: true, onboarded: false, light_day: null }];
      return this.send(route, 200, this.session());
    }
    if (path === "/token") {
      if (body.email !== this.email || body.password !== this.password)
        return this.send(route, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      this.signedIn = true;
      return this.send(route, 200, this.session());
    }
    if (path === "/user") return this.signedIn ? this.send(route, 200, this.session().user) : this.send(route, 401, { msg: "no session" });
    if (path === "/logout") {
      this.signedIn = false;
      return this.send(route, 204);
    }
    return this.send(route, 404, { msg: `unhandled auth ${path}` });
  }

  // ------------------------------------------------------------------ PostgREST tables
  private matching(table: string, url: URL): Row[] {
    const skip = new Set(["select", "order", "limit", "on_conflict", "columns", "offset"]);
    let rows = [...(this.db[table] ?? [])];
    for (const [k, v] of url.searchParams) {
      if (skip.has(k)) continue;
      if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
      else if (v.startsWith("in.")) {
        const list = v.slice(4, -1).split(",");
        rows = rows.filter((r) => list.includes(String(r[k])));
      }
    }
    const order = url.searchParams.get("order");
    if (order) {
      const [col, dir] = order.split(".");
      rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === "desc" ? -1 : 1));
    }
    return rows;
  }
  private defaults(table: string, row: Row): Row {
    const base: Row = { id: uid(), created_at: new Date(Date.now() + ++counter).toISOString() };
    if (table === "tasks") Object.assign(base, { user_id: USER_ID, archived: false, proof_required: false, notes: null });
    if (table === "task_steps") Object.assign(base, { est_minutes: 5, done_on: null });
    if (table === "proofs") Object.assign(base, { user_id: USER_ID, flagged_similar: false });
    if (table === "feedback") Object.assign(base, { user_id: USER_ID });
    return { ...base, ...row };
  }
  private async table(route: Route, url: URL) {
    const req = route.request();
    const table = url.pathname.replace("/rest/v1/", "");
    if (!(table in this.db)) return this.send(route, 404, { message: `unknown table ${table}` });
    if (!this.signedIn) return this.send(route, 401, { message: "JWT expired" });
    const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
    const wantsRep = (req.headers()["prefer"] ?? "").includes("return=representation");
    const reply = (rows: Row[], status = 200) => {
      if (wantsObject) {
        if (rows.length !== 1)
          return this.send(route, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null });
        return this.send(route, status, rows[0]);
      }
      return this.send(route, status, rows);
    };

    switch (req.method()) {
      case "GET":
        return reply(this.matching(table, url));
      case "POST": {
        const body = req.postDataJSON() as Row | Row[];
        const incoming = Array.isArray(body) ? body : [body];
        const out: Row[] = [];
        for (const raw of incoming) {
          const key = table === "blocklists" ? "user_id" : "id";
          const existing = raw[key] !== undefined ? this.db[table].find((r) => r[key] === raw[key]) : undefined;
          if (existing && (req.headers()["prefer"] ?? "").includes("merge-duplicates")) {
            Object.assign(existing, raw);
            out.push(existing);
          } else {
            const row = this.defaults(table, raw);
            this.db[table].push(row);
            out.push(row);
          }
        }
        return wantsRep || wantsObject ? reply(out, 201) : this.send(route, 201);
      }
      case "PATCH": {
        const rows = this.matching(table, url);
        const patch = req.postDataJSON() as Row;
        rows.forEach((r) => Object.assign(r, patch));
        return wantsRep ? reply(rows) : this.send(route, 204);
      }
      case "DELETE": {
        const gone = new Set(this.matching(table, url));
        this.db[table] = this.db[table].filter((r) => !gone.has(r));
        return this.send(route, 204);
      }
    }
    return this.send(route, 405, { message: "method" });
  }

  // ------------------------------------------------------------------ RPCs
  private completion(planId: unknown): number {
    const items = this.db.plan_items.filter((i) => i.daily_plan_id === planId);
    return scoreDay(items.map((i) => i.status as ItemStatus)).completion;
  }
  private async rpc(route: Route, name: string) {
    if (!this.signedIn) return this.send(route, 401, { message: "JWT expired" });
    const args = (route.request().postDataJSON() ?? {}) as Row;
    const ok = (v: unknown) => this.send(route, 200, v ?? null);

    switch (name) {
      case "get_today": {
        let plan = this.planFor(this.today);
        if (!plan) {
          plan = {
            id: uid(),
            user_id: USER_ID,
            date: this.today,
            committed_at: null,
            stake_type: "none",
            stake_amount: 0,
            mood_morning: null,
            mood_evening: null,
            reviewed_at: null,
            points_earned: null,
          };
          this.db.daily_plans.push(plan);
        }
        return ok(plan);
      }
      case "unreviewed_days":
        return ok(this.db.daily_plans.filter((p) => p.committed_at && !p.reviewed_at && String(p.date) < this.today));
      case "points_balance":
        return ok(this.points);
      case "recent_completion": {
        const days = this.db.daily_plans
          .filter((p) => p.reviewed_at)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .slice(0, Number(args.p_days ?? 3));
        return ok(days.map((p) => ({ date: p.date, completion: this.completion(p.id) })));
      }
      case "partner_overview":
        return ok({ state: "none" });
      case "partner_badge":
        return ok(0);
      case "check_my_heartbeats":
        return ok(0);
      case "get_focus_state":
        return ok({ server_now: new Date().toISOString(), active: false, session_id: null, ends_at: null, domains: [], locked: false });
      case "commit_day": {
        const plan = this.planFor(this.today)!;
        const ids = (args.p_task_ids as string[]) ?? [];
        const profile = this.profile();
        const light = profile.light_day === this.today;
        if (plan.committed_at) throw new RpcError("today is already planned");
        if (light && ids.length > LIGHT_DAY_MAX_TASKS) throw new RpcError("you asked for a lighter day: pick one or two tasks");
        if (ids.length < 1 || ids.length > 5) throw new RpcError("pick between one and five tasks");
        let stake = Number(args.p_stake ?? 0);
        if (profile.gentle_mode || light) stake = 0;
        for (const id of ids)
          this.db.plan_items.push({ id: uid(), daily_plan_id: plan.id, user_id: USER_ID, task_id: id, status: "pending", completed_at: null });
        Object.assign(plan, {
          committed_at: new Date().toISOString(),
          mood_morning: args.p_mood ?? null,
          stake_amount: stake,
          stake_type: stake > 0 ? "points" : "none",
        });
        this.points -= stake;
        return ok(plan);
      }
      case "set_item_status": {
        const item = this.db.plan_items.find((i) => i.id === args.p_item_id);
        if (!item) throw new RpcError("item not found or day already reviewed");
        item.status = args.p_status;
        return ok(item);
      }
      case "review_day": {
        const plan = this.db.daily_plans.find((p) => p.id === args.p_plan_id)!;
        const statuses = (args.p_statuses ?? {}) as Record<string, ItemStatus>;
        const items = this.db.plan_items.filter((i) => i.daily_plan_id === plan.id);
        for (const i of items) if (statuses[String(i.id)]) i.status = statuses[String(i.id)];
        const score = scoreDay(
          items.map((i) => i.status as ItemStatus),
          Number(plan.stake_amount),
        );
        const countable = items.filter((i) => i.status !== "rescheduled");
        this.points += score.total;
        Object.assign(plan, { reviewed_at: new Date().toISOString(), points_earned: score.total, mood_evening: args.p_mood ?? null });
        return ok({
          total: score.total,
          done: countable.filter((i) => i.status === "done").length,
          countable: countable.length,
          full_day_bonus: score.fullDayBonus,
        });
      }
    }
    return this.send(route, 404, { message: `unhandled rpc ${name}` });
  }

  // ------------------------------------------------------------------ storage
  private async storage(route: Route, url: URL) {
    const req = route.request();
    if (req.method() === "POST" || req.method() === "PUT") {
      this.uploads.push({ path: url.pathname.replace("/storage/v1/object/", ""), bytes: req.postDataBuffer()?.length ?? 0 });
      return this.send(route, 200, { Key: url.pathname.replace("/storage/v1/object/", ""), Id: uid() });
    }
    return this.send(route, 404, { message: "not found" });
  }
}
