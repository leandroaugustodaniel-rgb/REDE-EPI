const state = {
  user: null,
  view: "dashboard",
  options: { departments: [], roles: [], units: [], leaders: [] },
  employees: [],
  feedbacks: [],
  discProfiles: [],
  selectedEmployeeId: null,
  registryTab: "departments",
};
const app = document.querySelector("#app");
const PEOPLE_CONFIG = {
  departments: ["Compras", "Comercial", "Estoque"],
  units: ["REDE - GO", "REDE - DF", "REDE - MT", "REDE - LABOR"],
  leaders: [
    "Leandro Daniel",
    "Gabriela Andrade",
    "Cléber Rubeo",
    "Tercio Baldino",
    "Paulo Carvalho",
    "Priscill Jordão",
  ],
  leaderRoles: {
    "Leandro Daniel": "Gerente de Operações",
    "Gabriela Andrade": "Supervisora Comercial",
    "Cléber Rubeo": "Supervisor Comercial",
    "Tercio Baldino": "Coordenador do Estoque",
    "Paulo Carvalho": "Coordenador do Estoque",
    "Priscill Jordão": "Supervisora de Compras",
  },
  rolesByDepartment: {
    Comercial: [
      "Gerente de Operações",
      "Supervisor Comercial",
      "Vendedor 1C",
      "Vendedor 2A",
      "Vendedor 2B",
      "Vendedor 2C",
      "Vendedor 3A",
      "Vendedor 3B",
      "Vendedor 3C",
      "Assistente Administrativo",
    ],
    Compras: [
      "Supervisor de Compras",
      "Analista de Compras Junior",
      "Analista de Compras Pleno",
      "Analista de Compras Sênior",
    ],
    Estoque: [
      "Coordenador do Estoque",
      "Encarregado do Estoque",
      "Analista da Logística",
      "Auxiliar de Estoque Junior",
      "Auxiliar de Estoque Pleno",
      "Auxiliar de Estoque Sênior",
      "Motorista Junior",
      "Motorista Pleno",
      "Motorista Sênior",
    ],
  },
};
const api = async (path, options = {}) => {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Falha na operacao");
  return data;
};
const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : "-");
const badgeClass = (type) => {
  if (type === "Corretivo") return "badge danger";
  if (type === "Desenvolvimento") return "badge warn";
  return "badge";
};
const brandLogo = (variant = "", tone = "dark") => `
  <img
    class="brand-logo ${variant}"
    src="${tone === "light" ? "/assets/logo-rede-epi-light-cropped.png" : "/assets/logo-rede-epi-transparent.png"}"
    alt="REDE EPI"
  />
`;
async function boot() {
