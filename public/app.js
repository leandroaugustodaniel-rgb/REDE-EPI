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
  try {
    const me = await api("/api/me");
    state.user = me.user;
    await loadCore();
    renderShell();
  } catch {
    renderLogin();
  }
}

async function loadCore() {
  const [options, employees, feedbacks, disc] = await Promise.all([
    api("/api/options"),
    api("/api/employees"),
    api("/api/feedbacks"),
    api("/api/disc-profiles"),
  ]);
  state.options = options;
  state.employees = employees.items;
  state.feedbacks = feedbacks.items;
  state.discProfiles = disc.items;
  if (!state.selectedEmployeeId && state.employees[0]) state.selectedEmployeeId = state.employees[0].id;
}

function renderLogin() {
  app.innerHTML = `
    <section class="login-shell">
      <div class="login-visual">
        <div class="side-head">
          ${brandLogo("login-logo")}
        </div>
        <div>
          <h1>Gestao padronizada, equipe mais segura.</h1>
        </div>
        <span aria-hidden="true"></span>
      </div>
      <div class="login-panel">
        <form class="login-card" id="loginForm">
          ${brandLogo("card-logo", "light")}
          <h2>Entrar</h2>
          <p class="hint">Acesse o painel de gestao de pessoas.</p>
          <label>E-mail<input name="email" autocomplete="email" required /></label>
          <label>Senha<input name="password" type="password" autocomplete="current-password" required /></label>
          <button class="btn" type="submit">Entrar</button>
        </form>
      </div>
    </section>
  `;
  document.querySelector("#loginForm").addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const result = await api("/api/login", { method: "POST", body: JSON.stringify(data) });
    state.user = result.user;
    await loadCore();
    renderShell();
  } catch (error) {
    toast(error.message);
  }
}

function renderShell() {
  app.innerHTML = `
    <section class="app-shell">
      <aside class="sidebar">
        <div class="side-head">
          ${brandLogo("side-logo")}
          <div><strong>REDE EPI</strong><small>Distribuidora de EPIs</small></div>
        </div>
        <nav class="nav">
          ${navButton("dashboard", "Dashboard")}
          ${navButton("employees", "Colaboradores")}
          ${navButton("registries", "Cadastros")}
          ${navButton("feedbacks", "Feedbacks")}
          ${navButton("disc", "DISC")}
          ${navButton("profile", "Perfil")}
          ${navButton("orgchart", "Organograma")}
        </nav>
        <div class="user-box">
          <strong>${escapeHtml(state.user.name)}</strong>
          <small>${escapeHtml(state.user.email)}</small>
          <button class="btn secondary" style="margin-top:12px;width:100%" onclick="logout()">Sair</button>
        </div>
      </aside>
      <section class="workspace" id="workspace"></section>
    </section>
  `;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      renderShell();
    });
  });
  renderView();
}

function navButton(view, label) {
  return `<button class="${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>`;
}

async function renderView() {
  const views = {
    dashboard: renderDashboard,
    employees: renderEmployees,
    registries: renderRegistries,
    feedbacks: renderFeedbacks,
    disc: renderDisc,
    profile: renderProfile,
    orgchart: renderOrgchart,
  };
  await views[state.view]();
}

async function renderDashboard() {
  const dashboard = await api("/api/dashboard");
  const total = Math.max(dashboard.totals.total || 1, 1);
  workspace().innerHTML = `
    ${pageHead("Dashboard", "Indicadores iniciais de pessoas, feedbacks e perfil comportamental.")}
    <section class="grid stats">
      ${stat("Colaboradores", dashboard.totals.total || 0)}
      ${stat("Feedbacks", state.feedbacks.length)}
      ${stat("Perfis DISC", state.discProfiles.length)}
      ${stat("Departamentos", PEOPLE_CONFIG.departments.length)}
    </section>
    <section class="grid content-grid">
      <div class="panel">
        <h2>Colaboradores por departamento</h2>
        ${bars(dashboard.by_department, total)}
      </div>
      <div class="panel">
        <h2>Feedbacks recentes</h2>
        ${feedbackList(dashboard.recent_feedbacks)}
      </div>
      <div class="panel">
        <h2>Tipos de feedback</h2>
        ${bars(dashboard.feedbacks, Math.max(state.feedbacks.length, 1))}
      </div>
      <div class="panel">
        <h2>Distribuicao DISC</h2>
        ${bars(dashboard.disc, Math.max(state.discProfiles.length, 1))}
      </div>
    </section>
  `;
}

function renderEmployees() {
  workspace().innerHTML = `
    ${pageHead("Colaboradores", "Cadastro e manutencao da base de pessoas.", `<button class="btn" onclick="openEmployeeModal()">Novo colaborador</button>`)}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nome</th><th>Departamento</th><th>Cargo</th><th>Unidade</th><th>Lider</th><th></th></tr></thead>
        <tbody>
          ${state.employees.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.name)}</strong><div class="meta">${escapeHtml(item.email)}</div></td>
              <td>${escapeHtml(item.department || "-")}</td>
              <td>${escapeHtml(item.role || "-")}</td>
              <td>${escapeHtml(item.unit || "-")}</td>
              <td>${escapeHtml(item.leader || "-")}</td>
              <td class="toolbar">
                <button class="icon-btn" title="Ver perfil" onclick="selectProfile(${item.id})">◉</button>
                <button class="icon-btn" title="Editar" onclick="openEmployeeModal(${item.id})">✎</button>
                <button class="icon-btn" title="Excluir" onclick="deleteEmployee(${item.id})">×</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRegistries() {
  const tabs = [
    ["departments", "Departamentos"],
    ["roles", "Cargos"],
    ["units", "Unidades"],
    ["leaders", "Lideres"],
  ];
  const labels = {
    departments: "Departamento",
    roles: "Cargo",
    units: "Unidade",
    leaders: "Lider",
  };
  const items = state.registryTab === "leaders" ? leaderOptions() : state.options[state.registryTab] || [];
  const title = labels[state.registryTab];

  workspace().innerHTML = `
    ${pageHead("Cadastros", "Inclua, edite e exclua departamentos, cargos, unidades e lideres.", `<button class="btn" onclick="${state.registryTab === "leaders" ? "openEmployeeModal()" : `openRegistryModal('${state.registryTab}')`}">Novo cadastro</button>`)}
    <div class="toolbar" style="margin-bottom:14px">
      ${tabs.map(([key, label]) => `<button class="btn ${state.registryTab === key ? "" : "secondary"}" onclick="selectRegistryTab('${key}')">${label}</button>`).join("")}
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>${title}</th>${state.registryTab === "units" ? "<th>Cidade</th>" : ""}<th></th></tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.name)}</strong></td>
              ${state.registryTab === "units" ? `<td>${escapeHtml(item.city || "-")}</td>` : ""}
              <td class="toolbar">
                ${state.registryTab === "leaders"
                  ? `<button class="icon-btn" title="Editar" onclick="openEmployeeModal(${item.id})">✎</button><button class="icon-btn" title="Excluir" onclick="deleteEmployee(${item.id})">×</button>`
                  : `<button class="icon-btn" title="Editar" onclick="openRegistryModal('${state.registryTab}', ${item.id})">✎</button><button class="icon-btn" title="Excluir" onclick="deleteRegistry('${state.registryTab}', ${item.id})">×</button>`}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFeedbacks() {
  workspace().innerHTML = `
    ${pageHead("Feedbacks", "Registros positivos, corretivos e de desenvolvimento.", `<button class="btn" onclick="openFeedbackModal()">Novo feedback</button>`)}
    <section class="cards">
      ${state.feedbacks.map((item) => `
        <article class="item-card">
          <span class="${badgeClass(item.type)}">${escapeHtml(item.type)}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="meta">${escapeHtml(item.employee)} • ${formatDate(item.feedback_date)}</p>
          <p>${escapeHtml(item.description)}</p>
          ${item.action_plan ? `<p><strong>Plano:</strong> ${escapeHtml(item.action_plan)}</p>` : ""}
          <div class="toolbar">
            <button class="btn secondary" onclick="openFeedbackModal(${item.id})">Editar</button>
            <button class="btn danger" onclick="deleteFeedback(${item.id})">Excluir</button>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderDisc() {
  workspace().innerHTML = `
    ${pageHead("Perfis DISC", "Mapeamento comportamental dos colaboradores.", `<button class="btn" onclick="openDiscModal()">Novo perfil</button>`)}
    <section class="cards">
      ${state.discProfiles.map((item) => `
        <article class="item-card">
          <span class="badge">Perfil ${escapeHtml(item.primary_profile)}</span>
          <h3>${escapeHtml(item.employee)}</h3>
          <div class="disc-grid">
            ${discBox("D", item.dominance)}
            ${discBox("I", item.influence)}
            ${discBox("S", item.stability)}
            ${discBox("C", item.compliance)}
          </div>
          <p>${escapeHtml(item.notes || "")}</p>
          <div class="toolbar">
            <button class="btn secondary" onclick="openDiscModal(${item.id})">Editar</button>
            <button class="btn danger" onclick="deleteDisc(${item.id})">Excluir</button>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

async function renderProfile() {
  const employee = await api(`/api/employees/${state.selectedEmployeeId || state.employees[0]?.id}`);
  workspace().innerHTML = `
    ${pageHead("Perfil do colaborador", "Historico completo de feedback, DISC e desenvolvimento.", employeeSelector())}
    <section class="panel">
      <div class="profile-head">
        <div>
          <h2>${escapeHtml(employee.name)}</h2>
          <p class="meta">${escapeHtml(employee.role || "-")} • ${escapeHtml(employee.department || "-")} • ${escapeHtml(employee.unit || "-")}</p>
          <p>${escapeHtml(employee.notes || "")}</p>
        </div>
      </div>
      <div class="grid content-grid">
        <div>
          <h2>Historico de feedback</h2>
          ${feedbackList(employee.feedbacks)}
        </div>
        <div>
          <h2>DISC</h2>
          ${employee.disc[0] ? `
            <span class="badge">Perfil ${escapeHtml(employee.disc[0].primary_profile)}</span>
            <div class="disc-grid" style="margin-top:10px">
              ${discBox("D", employee.disc[0].dominance)}
              ${discBox("I", employee.disc[0].influence)}
              ${discBox("S", employee.disc[0].stability)}
              ${discBox("C", employee.disc[0].compliance)}
            </div>
            <p>${escapeHtml(employee.disc[0].notes || "")}</p>
          ` : `<p class="muted">Sem perfil DISC cadastrado.</p>`}
          <h2>Plano de desenvolvimento</h2>
          ${employee.development_plans.length ? employee.development_plans.map((plan) => `
            <div class="item-card">
              <strong>${escapeHtml(plan.objective)}</strong>
              <p>${escapeHtml(plan.action)}</p>
              <p class="meta">${formatDate(plan.deadline)} • ${escapeHtml(plan.status)}</p>
            </div>
          `).join("") : `<p class="muted">Sem PDI cadastrado.</p>`}
        </div>
      </div>
    </section>
  `;
  document.querySelector("#profileSelect")?.addEventListener("change", (event) => {
    state.selectedEmployeeId = Number(event.target.value);
    renderProfile();
  });
}

async function renderOrgchart() {
  const result = await api("/api/orgchart");
  const roots = buildTree(result.nodes);
  workspace().innerHTML = `
    ${pageHead("Organograma", "Visao simples por lider, departamento e unidade.")}
    <section class="org-tree">
      ${roots.map((node) => renderOrgNode(node)).join("")}
    </section>
  `;
}

function buildTree(nodes) {
  const map = new Map(nodes.map((node) => [node.id, { ...node, children: [] }]));
  const roots = [];
  map.forEach((node) => {
    if (node.leader_id && map.has(node.leader_id)) map.get(node.leader_id).children.push(node);
    else roots.push(node);
  });
  return roots;
}

function renderOrgNode(node, depth = 0) {
  return `
    <div class="org-node" style="--indent:${12 + depth * 24}px">
      <strong>${escapeHtml(node.name)}</strong>
      <div class="meta">${escapeHtml(node.role || "-")} • ${escapeHtml(node.department || "-")} • ${escapeHtml(node.unit || "-")}</div>
    </div>
    ${node.children.map((child) => renderOrgNode(child, depth + 1)).join("")}
  `;
}

function pageHead(title, subtitle, actions = "") {
  return `
    <header class="topbar">
      <div class="page-title">
        ${brandLogo("page-logo", "light")}
        <div><h1>${title}</h1><p>${subtitle}</p></div>
      </div>
      <div class="toolbar">${actions}</div>
    </header>
  `;
}

function stat(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function bars(items, total) {
  if (!items.length) return `<p class="muted">Sem dados para exibir.</p>`;
  return `<div class="bars">${items.map((item) => `
    <div class="bar-row">
      <span>${escapeHtml(item.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (item.value / total) * 100)}%"></div></div>
      <strong>${item.value}</strong>
    </div>
  `).join("")}</div>`;
}

function feedbackList(items) {
  if (!items.length) return `<p class="muted">Sem feedbacks registrados.</p>`;
  return items.map((item) => `
    <div class="item-card" style="margin-bottom:10px">
      <span class="${badgeClass(item.type)}">${escapeHtml(item.type)}</span>
      <strong style="display:block;margin-top:8px">${escapeHtml(item.title)}</strong>
      <p class="meta">${escapeHtml(item.employee || "")} ${item.feedback_date ? "• " + formatDate(item.feedback_date) : ""}</p>
      <p>${escapeHtml(item.description)}</p>
    </div>
  `).join("");
}

function discBox(label, value) {
  return `<div class="disc-box"><span>${label}</span><strong>${value}</strong></div>`;
}

function employeeSelector() {
  return `
    <select id="profileSelect">
      ${state.employees.map((item) => `<option value="${item.id}" ${item.id === state.selectedEmployeeId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
    </select>
  `;
}

function optionList(items, selected) {
  return `<option value="">Selecione</option>${items.map((item) => `<option value="${item.id}" ${Number(selected) === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}`;
}

function leaderOptionList(items, selected) {
  return `<option value="">Selecione</option>${items.map((item) => {
    const role = PEOPLE_CONFIG.leaderRoles[item.name];
    const label = role ? `${item.name} - ${role}` : item.name;
    return `<option value="${item.id}" ${Number(selected) === item.id ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("")}`;
}

function filteredOptions(items, allowedNames) {
  return allowedNames
    .map((name) => items.find((item) => normalizeText(item.name) === normalizeText(name)))
    .filter(Boolean);
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function rolesForDepartment(departmentId, selectedRoleId) {
  const department = state.options.departments.find((item) => Number(item.id) === Number(departmentId));
  const allowed = department ? PEOPLE_CONFIG.rolesByDepartment[department.name] || [] : [];
  const roles = filteredOptions(state.options.roles, allowed);
  if (selectedRoleId && !roles.some((item) => Number(item.id) === Number(selectedRoleId))) {
    const current = state.options.roles.find((item) => Number(item.id) === Number(selectedRoleId));
    if (current) roles.unshift(current);
  }
  return roles;
}

function leaderOptions(currentEmployeeId) {
  return filteredOptions(state.options.leaders, PEOPLE_CONFIG.leaders).filter((leader) => leader.id !== currentEmployeeId);
}

function openEmployeeModal(id) {
  const item = state.employees.find((employee) => employee.id === id) || {};
  const departments = filteredOptions(state.options.departments, PEOPLE_CONFIG.departments);
  const units = filteredOptions(state.options.units, PEOPLE_CONFIG.units);
  const roles = rolesForDepartment(item.department_id, item.role_id);
  const leaders = leaderOptions(id);
  modal(`
    <form id="employeeForm" class="modal-card">
      <h3>${id ? "Editar colaborador" : "Novo colaborador"}</h3>
      <div class="form-grid">
        <label>Nome<input name="name" value="${escapeHtml(item.name || "")}" required /></label>
        <label>E-mail<input name="email" type="email" value="${escapeHtml(item.email || "")}" required /></label>
        <label>Telefone<input name="phone" value="${escapeHtml(item.phone || "")}" /></label>
        <label>Admissao<input name="admission_date" type="date" value="${escapeHtml(item.admission_date || "")}" /></label>
        <label>Departamento<select name="department_id" id="departmentSelect" required>${optionList(departments, item.department_id)}</select></label>
        <label>Cargo<select name="role_id" id="roleSelect" required>${optionList(roles, item.role_id)}</select></label>
        <label>Unidade<select name="unit_id" required>${optionList(units, item.unit_id)}</select></label>
        <label>Lider<select name="leader_id">${leaderOptionList(leaders, item.leader_id)}</select></label>
        <label class="span-2">Observacoes<textarea name="notes">${escapeHtml(item.notes || "")}</textarea></label>
      </div>
      ${modalActions()}
    </form>
  `);
  const departmentSelect = document.querySelector("#departmentSelect");
  const roleSelect = document.querySelector("#roleSelect");
  departmentSelect.addEventListener("change", () => {
    roleSelect.innerHTML = optionList(rolesForDepartment(departmentSelect.value), "");
  });
  document.querySelector("#employeeForm").addEventListener("submit", (event) => saveForm(event, `/api/employees${id ? `/${id}` : ""}`, id ? "PUT" : "POST"));
}

function selectRegistryTab(tab) {
  state.registryTab = tab;
  renderRegistries();
}

function openRegistryModal(resource, id) {
  const collection = state.options[resource] || [];
  const item = collection.find((entry) => entry.id === id) || {};
  const title = {
    departments: "departamento",
    roles: "cargo",
    units: "unidade",
  }[resource];

  modal(`
    <form id="registryForm" class="modal-card">
      <h3>${id ? "Editar" : "Novo"} ${title}</h3>
      <div class="form-grid">
        <label class="${resource === "units" ? "" : "span-2"}">Nome<input name="name" value="${escapeHtml(item.name || "")}" required /></label>
        ${resource === "units" ? `<label>Cidade<input name="city" value="${escapeHtml(item.city || "")}" /></label>` : ""}
      </div>
      ${modalActions()}
    </form>
  `);
  document.querySelector("#registryForm").addEventListener("submit", (event) => saveRegistry(event, resource, id));
}

async function saveRegistry(event, resource, id) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api(`/api/${resource}${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    closeModal();
    await loadCore();
    renderShell();
    toast("Cadastro salvo.");
  } catch (error) {
    toast(error.message);
  }
}

function openFeedbackModal(id) {
  const item = state.feedbacks.find((feedback) => feedback.id === id) || {};
  modal(`
    <form id="feedbackForm" class="modal-card">
      <h3>${id ? "Editar feedback" : "Novo feedback"}</h3>
      <div class="form-grid">
        <label>Colaborador<select name="employee_id" required>${optionList(state.employees, item.employee_id)}</select></label>
        <label>Tipo<select name="type"><option ${item.type === "Positivo" ? "selected" : ""}>Positivo</option><option ${item.type === "Corretivo" ? "selected" : ""}>Corretivo</option><option ${item.type === "Desenvolvimento" ? "selected" : ""}>Desenvolvimento</option></select></label>
        <label>Titulo<input name="title" value="${escapeHtml(item.title || "")}" required /></label>
        <label>Data<input name="feedback_date" type="date" value="${escapeHtml(item.feedback_date || new Date().toISOString().slice(0, 10))}" required /></label>
        <label class="span-2">Descricao<textarea name="description" required>${escapeHtml(item.description || "")}</textarea></label>
        <label class="span-2">Plano de acao<textarea name="action_plan">${escapeHtml(item.action_plan || "")}</textarea></label>
      </div>
      ${modalActions()}
    </form>
  `);
  document.querySelector("#feedbackForm").addEventListener("submit", (event) => saveForm(event, `/api/feedbacks${id ? `/${id}` : ""}`, id ? "PUT" : "POST"));
}

function openDiscModal(id) {
  const item = state.discProfiles.find((disc) => disc.id === id) || {};
  modal(`
    <form id="discForm" class="modal-card">
      <h3>${id ? "Editar perfil DISC" : "Novo perfil DISC"}</h3>
      <div class="form-grid">
        <label>Colaborador<select name="employee_id" required>${optionList(state.employees, item.employee_id)}</select></label>
        <label>Perfil predominante<input name="primary_profile" value="${escapeHtml(item.primary_profile || "")}" placeholder="D, I, S, C ou combinacao" required /></label>
        <label>D<input name="dominance" type="number" min="0" max="100" value="${item.dominance ?? 0}" /></label>
        <label>I<input name="influence" type="number" min="0" max="100" value="${item.influence ?? 0}" /></label>
        <label>S<input name="stability" type="number" min="0" max="100" value="${item.stability ?? 0}" /></label>
        <label>C<input name="compliance" type="number" min="0" max="100" value="${item.compliance ?? 0}" /></label>
        <label class="span-2">Notas<textarea name="notes">${escapeHtml(item.notes || "")}</textarea></label>
      </div>
      ${modalActions()}
    </form>
  `);
  document.querySelector("#discForm").addEventListener("submit", (event) => saveForm(event, `/api/disc-profiles${id ? `/${id}` : ""}`, id ? "PUT" : "POST"));
}

function modal(content) {
  document.body.insertAdjacentHTML("beforeend", `<div class="modal" id="modal">${content}</div>`);
  document.querySelector("#modal").addEventListener("click", (event) => {
    if (event.target.id === "modal") closeModal();
  });
}

function modalActions() {
  return `<div class="toolbar" style="justify-content:flex-end;margin-top:16px"><button class="btn secondary" type="button" onclick="closeModal()">Cancelar</button><button class="btn" type="submit">Salvar</button></div>`;
}

function closeModal() {
  document.querySelector("#modal")?.remove();
}

async function saveForm(event, path, method) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api(path, { method, body: JSON.stringify(data) });
    closeModal();
    await loadCore();
    renderShell();
    toast("Registro salvo.");
  } catch (error) {
    toast(error.message);
  }
}

async function deleteEmployee(id) {
  if (!confirm("Excluir colaborador?")) return;
  await api(`/api/employees/${id}`, { method: "DELETE" });
  await loadCore();
  renderShell();
}

async function deleteRegistry(resource, id) {
  if (!confirm("Excluir cadastro?")) return;
  try {
    await api(`/api/${resource}/${id}`, { method: "DELETE" });
    await loadCore();
    renderShell();
    toast("Cadastro excluido.");
  } catch (error) {
    toast(error.message);
  }
}

async function deleteFeedback(id) {
  if (!confirm("Excluir feedback?")) return;
  await api(`/api/feedbacks/${id}`, { method: "DELETE" });
  await loadCore();
  renderShell();
}

async function deleteDisc(id) {
  if (!confirm("Excluir perfil DISC?")) return;
  await api(`/api/disc-profiles/${id}`, { method: "DELETE" });
  await loadCore();
  renderShell();
}

function selectProfile(id) {
  state.selectedEmployeeId = id;
  state.view = "profile";
  renderShell();
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  renderLogin();
}

function workspace() {
  return document.querySelector("#workspace");
}

function toast(message) {
  document.querySelector(".toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="toast">${escapeHtml(message)}</div>`);
  setTimeout(() => document.querySelector(".toast")?.remove(), 2800);
}

boot();
