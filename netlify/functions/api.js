const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const SESSION_COOKIE = "redeepi_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SESSION_SECRET"];

exports.handler = async (event) => {
  try {
    const missing = requiredEnv.filter((key) => !process.env[key]);
    if (missing.length) {
      return json({ error: `Variaveis de ambiente ausentes: ${missing.join(", ")}` }, 500);
    }

    const method = event.httpMethod;
    const path = apiPath(event.path);

    if (method === "POST" && path === "/api/login") return login(event);
    if (method === "POST" && path === "/api/logout") return logout(event);

    const user = await currentUser(event);
    if (!user) return json({ error: "Nao autenticado" }, 401);

    if (method === "GET" && path === "/api/me") return json({ user });
    if (method === "GET" && path === "/api/options") return json(await loadOptions());
    if (method === "GET" && path === "/api/dashboard") return json(await loadDashboard());
    if (method === "GET" && path === "/api/orgchart") return json({ nodes: await loadOrgchart() });

    const parts = path.split("/").filter(Boolean);
    const resource = parts[1];
    const id = parts[2] ? Number(parts[2]) : null;

    if (resource === "employees") return employees(method, id, event);
    if (resource === "feedbacks") return feedbacks(method, id, event, user);
    if (resource === "disc-profiles") return discProfiles(method, id, event);
    if (["departments", "roles", "units"].includes(resource)) return registry(method, resource, id, event);

    return json({ error: "Rota nao encontrada" }, 404);
  } catch (error) {
    return json({ error: error.message || "Erro interno" }, 500);
  }
};

function client() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function apiPath(path) {
  let clean = path.replace(/^\/\.netlify\/functions\/api/, "");
  if (!clean) clean = "/";
  if (!clean.startsWith("/api/")) clean = `/api${clean}`;
  return clean;
}

function payload(event) {
  return event.body ? JSON.parse(event.body) : {};
}

function json(body, statusCode = 200, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signToken(payload) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(encoded).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
}

function verifyPassword(password, stored) {
  const [salt, digest] = String(stored || "").split("$");
  return Boolean(salt && digest && safeEqual(hashPassword(password, salt), digest));
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function login(event) {
  const data = payload(event);
  const { data: user, error } = await client()
    .from("users")
    .select("id,name,email,password_hash,role")
    .eq("email", data.email)
    .single();

  if (error || !user || !verifyPassword(data.password || "", user.password_hash)) {
    return json({ error: "E-mail ou senha invalidos" }, 401);
  }

  const token = signToken({
    user_id: user.id,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });

  return json(
    { user: publicUser(user) },
    200,
    { "Set-Cookie": `${SESSION_COOKIE}=${token}; ${cookieAttrs(event)}; Max-Age=${SESSION_TTL_SECONDS}` }
  );
}

function logout(event) {
  return json({ ok: true }, 200, { "Set-Cookie": `${SESSION_COOKIE}=; ${cookieAttrs(event)}; Max-Age=0` });
}

function cookieAttrs(event) {
  const proto = event.headers["x-forwarded-proto"] || event.headers["X-Forwarded-Proto"];
  const secure = proto === "https" ? " Secure;" : "";
  return `HttpOnly;${secure} SameSite=Lax; Path=/`;
}

async function currentUser(event) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || "");
  const session = verifyToken(cookies[SESSION_COOKIE]);
  if (!session) return null;
  const { data: user } = await client()
    .from("users")
    .select("id,name,email,role")
    .eq("id", session.user_id)
    .single();
  return user ? publicUser(user) : null;
}

async function loadOptions() {
  const supabase = client();
  const [departments, roles, units, leaders] = await Promise.all([
    all(supabase.from("departments").select("*").order("name")),
    all(supabase.from("roles").select("*").order("name")),
    all(supabase.from("units").select("*").order("name")),
    all(supabase.from("employees").select("id,name").order("name")),
  ]);
  return { departments, roles, units, leaders };
}

async function loadEmployees() {
  const supabase = client();
  const [employees, departments, roles, units] = await Promise.all([
    all(supabase.from("employees").select("*").order("name")),
    all(supabase.from("departments").select("id,name")),
    all(supabase.from("roles").select("id,name")),
    all(supabase.from("units").select("id,name")),
  ]);
  const byDepartment = indexById(departments);
  const byRole = indexById(roles);
  const byUnit = indexById(units);
  const byEmployee = indexById(employees);

  return employees.map((employee) => ({
    ...employee,
    department: byDepartment[employee.department_id]?.name || null,
    role: byRole[employee.role_id]?.name || null,
    unit: byUnit[employee.unit_id]?.name || null,
    leader: byEmployee[employee.leader_id]?.name || null,
  }));
}

async function loadEmployee(id) {
  const employee = (await loadEmployees()).find((item) => Number(item.id) === Number(id));
  if (!employee) return null;
  const [feedbackList, disc, plans] = await Promise.all([
    loadFeedbacks(id),
    loadDiscProfiles(id),
    all(client().from("development_plans").select("*").eq("employee_id", id).order("deadline")),
  ]);
  return { ...employee, feedbacks: feedbackList, disc, development_plans: plans };
}

async function employees(method, id, event) {
  if (method === "GET") {
    if (id) {
      const employee = await loadEmployee(id);
      return employee ? json(employee) : json({ error: "Colaborador nao encontrado" }, 404);
    }
    return json({ items: await loadEmployees() });
  }

  if (method === "POST" || method === "PUT") {
    const data = normalizeEmployee(payload(event));
    const query = method === "POST"
      ? client().from("employees").insert(data).select("*").single()
      : client().from("employees").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    const saved = await one(query);
    return json(await loadEmployee(saved.id), method === "POST" ? 201 : 200);
  }

  if (method === "DELETE" && id) {
    await one(client().from("employees").delete().eq("id", id));
    return json({ ok: true });
  }

  return json({ error: "Metodo invalido" }, 405);
}

async function loadFeedbacks(employeeId) {
  let query = client().from("feedbacks").select("*").order("feedback_date", { ascending: false }).order("id", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  const [feedbackRows, employeesRows, usersRows] = await Promise.all([
    all(query),
    all(client().from("employees").select("id,name")),
    all(client().from("users").select("id,name")),
  ]);
  const byEmployee = indexById(employeesRows);
  const byUser = indexById(usersRows);
  return feedbackRows.map((item) => ({
    ...item,
    employee: byEmployee[item.employee_id]?.name || null,
    author: byUser[item.author_id]?.name || null,
  }));
}

async function feedbacks(method, id, event, user) {
  if (method === "GET") {
    const employeeId = new URLSearchParams(event.rawQuery || "").get("employee_id");
    return json({ items: await loadFeedbacks(employeeId) });
  }
  if (method === "POST" || method === "PUT") {
    const data = normalizeFeedback(payload(event));
    const query = method === "POST"
      ? client().from("feedbacks").insert({ ...data, author_id: user.id }).select("*").single()
      : client().from("feedbacks").update(data).eq("id", id).select("*").single();
    return json(await one(query), method === "POST" ? 201 : 200);
  }
  if (method === "DELETE" && id) {
    await one(client().from("feedbacks").delete().eq("id", id));
    return json({ ok: true });
  }
  return json({ error: "Metodo invalido" }, 405);
}

async function loadDiscProfiles(employeeId) {
  let query = client().from("disc_profiles").select("*").order("id");
  if (employeeId) query = query.eq("employee_id", employeeId);
  const [profiles, employeesRows] = await Promise.all([
    all(query),
    all(client().from("employees").select("id,name")),
  ]);
  const byEmployee = indexById(employeesRows);
  return profiles.map((item) => ({ ...item, employee: byEmployee[item.employee_id]?.name || null }));
}

async function discProfiles(method, id, event) {
  if (method === "GET") {
    const employeeId = new URLSearchParams(event.rawQuery || "").get("employee_id");
    return json({ items: await loadDiscProfiles(employeeId) });
  }
  if (method === "POST" || method === "PUT") {
    const data = normalizeDisc(payload(event));
    const query = method === "POST"
      ? client().from("disc_profiles").insert(data).select("*").single()
      : client().from("disc_profiles").update({ ...data, assessed_at: new Date().toISOString() }).eq("id", id).select("*").single();
    return json(await one(query), method === "POST" ? 201 : 200);
  }
  if (method === "DELETE" && id) {
    await one(client().from("disc_profiles").delete().eq("id", id));
    return json({ ok: true });
  }
  return json({ error: "Metodo invalido" }, 405);
}

async function registry(method, resource, id, event) {
  const config = {
    departments: { table: "departments", fields: ["name"], employeeField: "department_id" },
    roles: { table: "roles", fields: ["name"], employeeField: "role_id" },
    units: { table: "units", fields: ["name", "city"], employeeField: "unit_id" },
  }[resource];

  if (method === "GET") {
    return json({ items: await all(client().from(config.table).select("*").order("name")) });
  }

  if (method === "POST" || method === "PUT") {
    const body = payload(event);
    const data = Object.fromEntries(config.fields.map((field) => [field, emptyToNull(body[field])]));
    const query = method === "POST"
      ? client().from(config.table).insert(data).select("*").single()
      : client().from(config.table).update(data).eq("id", id).select("*").single();
    return json(await one(query), method === "POST" ? 201 : 200);
  }

  if (method === "DELETE" && id) {
    const { count, error } = await client()
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq(config.employeeField, id);
    if (error) throw error;
    if (count > 0) return json({ error: "Cadastro em uso por colaboradores." }, 400);
    await one(client().from(config.table).delete().eq("id", id));
    return json({ ok: true });
  }

  return json({ error: "Metodo invalido" }, 405);
}

async function loadDashboard() {
  const [employees, feedbackList, disc] = await Promise.all([
    loadEmployees(),
    loadFeedbacks(),
    loadDiscProfiles(),
  ]);

  return {
    totals: {
      total: employees.length,
      active: employees.filter((item) => item.status === "Ativo").length,
      inactive: employees.filter((item) => item.status !== "Ativo").length,
    },
    by_department: countBy(employees, "department", "Sem departamento"),
    feedbacks: countBy(feedbackList, "type"),
    disc: countBy(disc, "primary_profile"),
    recent_feedbacks: feedbackList.slice(0, 5),
  };
}

async function loadOrgchart() {
  return (await loadEmployees()).map((item) => ({
    id: item.id,
    name: item.name,
    role: item.role,
    department: item.department,
    unit: item.unit,
    leader_id: item.leader_id,
  }));
}

async function all(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function one(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || null;
}

function indexById(items) {
  return Object.fromEntries((items || []).map((item) => [item.id, item]));
}

function countBy(items, key, fallback = "Sem dados") {
  const counts = new Map();
  for (const item of items) {
    const label = item[key] || fallback;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function emptyToNull(value) {
  return value === "" || value === undefined ? null : value;
}

function numeric(value) {
  const normalized = emptyToNull(value);
  return normalized === null ? null : Number(normalized);
}

function normalizeEmployee(data) {
  return {
    name: data.name,
    email: data.email,
    phone: emptyToNull(data.phone),
    admission_date: emptyToNull(data.admission_date),
    status: data.status || "Ativo",
    department_id: numeric(data.department_id),
    role_id: numeric(data.role_id),
    unit_id: numeric(data.unit_id),
    leader_id: numeric(data.leader_id),
    notes: emptyToNull(data.notes),
  };
}

function normalizeFeedback(data) {
  return {
    employee_id: Number(data.employee_id),
    type: data.type,
    title: data.title,
    description: data.description,
    action_plan: emptyToNull(data.action_plan),
    feedback_date: data.feedback_date,
  };
}

function normalizeDisc(data) {
  return {
    employee_id: Number(data.employee_id),
    dominance: Number(data.dominance || 0),
    influence: Number(data.influence || 0),
    stability: Number(data.stability || 0),
    compliance: Number(data.compliance || 0),
    primary_profile: data.primary_profile,
    notes: emptyToNull(data.notes),
  };
}
