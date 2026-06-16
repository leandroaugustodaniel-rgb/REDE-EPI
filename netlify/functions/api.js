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
