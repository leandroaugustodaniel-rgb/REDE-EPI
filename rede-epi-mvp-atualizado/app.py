from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "people_epi.db"
SESSIONS = {}


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120000)
    return f"{salt}${digest.hex()}"


def verify_password(password, stored):
    salt, digest = stored.split("$", 1)
    candidate = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(candidate, digest)


def row_to_dict(row):
    return dict(row) if row else None


def init_db():
    DATA_DIR.mkdir(exist_ok=True)
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS departments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                city TEXT
            );

            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                phone TEXT,
                admission_date TEXT,
                status TEXT NOT NULL DEFAULT 'Ativo',
                department_id INTEGER,
                role_id INTEGER,
                unit_id INTEGER,
                leader_id INTEGER,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (department_id) REFERENCES departments(id),
                FOREIGN KEY (role_id) REFERENCES roles(id),
                FOREIGN KEY (unit_id) REFERENCES units(id),
                FOREIGN KEY (leader_id) REFERENCES employees(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS disc_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL UNIQUE,
                dominance INTEGER NOT NULL DEFAULT 0,
                influence INTEGER NOT NULL DEFAULT 0,
                stability INTEGER NOT NULL DEFAULT 0,
                compliance INTEGER NOT NULL DEFAULT 0,
                primary_profile TEXT NOT NULL,
                notes TEXT,
                assessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS feedbacks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                author_id INTEGER,
                type TEXT NOT NULL CHECK(type IN ('Positivo', 'Corretivo', 'Desenvolvimento')),
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                action_plan TEXT,
                feedback_date TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS development_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                objective TEXT NOT NULL,
                action TEXT NOT NULL,
                deadline TEXT,
                status TEXT NOT NULL DEFAULT 'Em andamento',
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            );
            """
        )

        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            conn.execute(
                "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                ("Admin EPI", "admin@epi.com", hash_password("admin123")),
            )

        seed_table(conn, "departments", ["Comercial", "Compras", "Logistica"])
        seed_table(
            conn,
            "roles",
            [
                "Gerente de Operacoes",
                "Supervisor Comercial",
                "Vendedor 1C",
                "Vendedor 2A",
                "Vendedor 2B",
                "Vendedor 2C",
                "Vendedor 3A",
                "Vendedor 3B",
                "Vendedor 3C",
                "Assistente Administrativo",
                "Supervisor de Compras",
                "Analista de Compras Junior",
                "Analista de Compras Pleno",
                "Analista de Compras Senior",
                "Coordenador do Estoque",
                "Encarregado do Estoque",
                "Analista da Logistica",
                "Auxiliar de Estoque Junior",
                "Auxiliar de Estoque Pleno",
                "Auxiliar de Estoque Senior",
                "Motorista Junior",
                "Motorista Pleno",
                "Motorista Senior",
            ],
        )
        seed_units(conn)
        seed_leaders(conn)
        seed_people(conn)


def seed_table(conn, table, names):
    for name in names:
        conn.execute(f"INSERT OR IGNORE INTO {table} (name) VALUES (?)", (name,))


def seed_units(conn):
    for name, city in [("REDE - GO", "Goiania"), ("REDE - DF", "Brasilia"), ("REDE - MT", "Cuiaba"), ("REDE - LABOR", "Laboratorio")]:
        conn.execute("INSERT OR IGNORE INTO units (name, city) VALUES (?, ?)", (name, city))


def lookup_id(conn, table, name):
    row = conn.execute(f"SELECT id FROM {table} WHERE name = ?", (name,)).fetchone()
    return row["id"] if row else None


def seed_leaders(conn):
    commercial = lookup_id(conn, "departments", "Comercial")
    compras = lookup_id(conn, "departments", "Compras")
    logistica = lookup_id(conn, "departments", "Logistica")
    rede_go = lookup_id(conn, "units", "REDE - GO")

    leaders = [
        ("Leandro Daniel", "leandro.daniel@redeepi.com", commercial, "Gerente de Operacoes"),
        ("Gabriela Andrade", "gabriela.andrade@redeepi.com", commercial, "Supervisor Comercial"),
        ("Cleber Rubeo", "cleber.rubeo@redeepi.com", commercial, "Supervisor Comercial"),
        ("Tercio Baldino", "tercio.baldino@redeepi.com", logistica, "Coordenador do Estoque"),
        ("Paulo Carvalho", "paulo.carvalho@redeepi.com", logistica, "Coordenador do Estoque"),
        ("Priscill Jordao", "priscill.jordao@redeepi.com", compras, "Supervisor de Compras"),
    ]

    for name, email, department_id, role_name in leaders:
        role_id = lookup_id(conn, "roles", role_name)
        conn.execute(
            """
            INSERT INTO employees
            (name, email, status, department_id, role_id, unit_id, notes)
            VALUES (?, ?, 'Ativo', ?, ?, ?, 'Lideranca REDE EPI')
            ON CONFLICT(email) DO UPDATE SET
              name = excluded.name,
              department_id = excluded.department_id,
              role_id = excluded.role_id,
              unit_id = excluded.unit_id
            """,
            (name, email, department_id, role_id, rede_go),
        )


def seed_people(conn):
    if conn.execute("SELECT COUNT(*) FROM employees WHERE email = ?", ("caio.mendes@empresaepi.com",)).fetchone()[0] > 0:
        return

    ids = {}
    comercial = lookup_id(conn, "departments", "Comercial")
    compras = lookup_id(conn, "departments", "Compras")
    logistica = lookup_id(conn, "departments", "Logistica")
    rede_go = lookup_id(conn, "units", "REDE - GO")
    rede_df = lookup_id(conn, "units", "REDE - DF")
    gerente_operacoes = lookup_id(conn, "roles", "Gerente de Operacoes")
    supervisor_comercial = lookup_id(conn, "roles", "Supervisor Comercial")
    vendedor = lookup_id(conn, "roles", "Vendedor 2A")
    compras_role = lookup_id(conn, "roles", "Analista de Compras Pleno")
    estoque_role = lookup_id(conn, "roles", "Auxiliar de Estoque Pleno")
    lider_comercial = conn.execute("SELECT id FROM employees WHERE email = ?", ("gabriela.andrade@redeepi.com",)).fetchone()
    lider_compras = conn.execute("SELECT id FROM employees WHERE email = ?", ("priscill.jordao@redeepi.com",)).fetchone()
    lider_estoque = conn.execute("SELECT id FROM employees WHERE email = ?", ("tercio.baldino@redeepi.com",)).fetchone()

    people = [
        ("Marina Alves", "marina.alves@empresaepi.com", "2021-03-08", comercial, gerente_operacoes, rede_go, None, "Gestao operacional"),
        ("Rafael Lima", "rafael.lima@empresaepi.com", "2020-07-12", comercial, supervisor_comercial, rede_go, None, "Lider Comercial"),
        ("Bianca Torres", "bianca.torres@empresaepi.com", "2022-01-17", compras, compras_role, rede_df, lider_compras["id"] if lider_compras else None, "Compras"),
        ("Caio Mendes", "caio.mendes@empresaepi.com", "2023-04-03", comercial, vendedor, rede_go, lider_comercial["id"] if lider_comercial else None, "Vendas B2B"),
        ("Fernanda Rocha", "fernanda.rocha@empresaepi.com", "2023-09-21", logistica, estoque_role, rede_df, lider_estoque["id"] if lider_estoque else None, "Controle de estoque"),
    ]
    for person in people:
        cur = conn.execute(
            """
            INSERT INTO employees
            (name, email, admission_date, department_id, role_id, unit_id, leader_id, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            person,
        )
        ids[person[1]] = cur.lastrowid

    conn.executemany(
        """
        INSERT INTO disc_profiles
        (employee_id, dominance, influence, stability, compliance, primary_profile, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (ids["marina.alves@empresaepi.com"], 28, 25, 21, 26, "C", "Perfil analitico, orientado a processos."),
            (ids["rafael.lima@empresaepi.com"], 34, 29, 18, 19, "D", "Boa energia para metas e negociacao."),
            (ids["bianca.torres@empresaepi.com"], 22, 20, 33, 25, "S", "Forte constancia operacional."),
            (ids["caio.mendes@empresaepi.com"], 27, 36, 19, 18, "I", "Comunicacao forte com clientes."),
            (ids["fernanda.rocha@empresaepi.com"], 18, 20, 31, 31, "S/C", "Cuidadosa com rotina e qualidade."),
        ],
    )

    conn.executemany(
        """
        INSERT INTO feedbacks
        (employee_id, author_id, type, title, description, action_plan, feedback_date)
        VALUES (?, 1, ?, ?, ?, ?, ?)
        """,
        [
            (ids["caio.mendes@empresaepi.com"], "Positivo", "Excelente recuperacao de carteira", "Reativou clientes inativos no segmento de luvas e calcados.", "Compartilhar abordagem na reuniao comercial.", "2026-05-20"),
            (ids["fernanda.rocha@empresaepi.com"], "Desenvolvimento", "Aprimorar uso do ERP", "Precisa ganhar velocidade no fechamento de divergencias.", "Treinamento com a lideranca por 30 dias.", "2026-05-27"),
            (ids["rafael.lima@empresaepi.com"], "Corretivo", "Padronizar devolutivas", "Algumas conversas ficaram sem registro formal.", "Registrar feedbacks ate 24h apos a conversa.", "2026-06-02"),
        ],
    )

    conn.executemany(
        """
        INSERT INTO development_plans (employee_id, objective, action, deadline, status)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (ids["caio.mendes@empresaepi.com"], "Evoluir para contas estrategicas", "Acompanhar 5 visitas com Rafael.", "2026-08-30", "Em andamento"),
            (ids["fernanda.rocha@empresaepi.com"], "Aumentar autonomia no ERP", "Concluir trilha de movimentacao fiscal.", "2026-07-15", "Em andamento"),
        ],
    )


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urlparse(path)
        clean = parsed.path.lstrip("/") or "index.html"
        return str(PUBLIC_DIR / clean)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.route_api("GET", parsed)
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        self.route_api("POST", urlparse(self.path))

    def do_PUT(self):
        self.route_api("PUT", urlparse(self.path))

    def do_DELETE(self):
        self.route_api("DELETE", urlparse(self.path))

    def route_api(self, method, parsed):
        try:
            if parsed.path == "/api/login" and method == "POST":
                return self.login()
            if parsed.path == "/api/logout" and method == "POST":
                return self.logout()
            user = self.current_user()
            if not user:
                return self.json_response({"error": "Nao autenticado"}, 401)

            if parsed.path == "/api/me":
                return self.json_response({"user": user})
            if parsed.path == "/api/options":
                return self.json_response(load_options())
            if parsed.path == "/api/dashboard":
                return self.json_response(load_dashboard())
            if parsed.path == "/api/orgchart":
                return self.json_response({"nodes": load_orgchart()})

            parts = parsed.path.strip("/").split("/")
            if len(parts) >= 2 and parts[0] == "api":
                resource = parts[1]
                item_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
                if resource == "employees":
                    return self.handle_employees(method, item_id)
                if resource == "feedbacks":
                    return self.handle_feedbacks(method, item_id, parsed)
                if resource == "disc-profiles":
                    return self.handle_disc(method, item_id, parsed)

            return self.json_response({"error": "Rota nao encontrada"}, 404)
        except sqlite3.IntegrityError as exc:
            return self.json_response({"error": f"Registro invalido ou duplicado: {exc}"}, 400)
        except Exception as exc:
            return self.json_response({"error": str(exc)}, 500)

    def payload(self):
        size = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(size).decode("utf-8") if size else "{}"
        return json.loads(raw or "{}")

    def json_response(self, data, status=200, headers=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def login(self):
        data = self.payload()
        with db() as conn:
            user = conn.execute("SELECT * FROM users WHERE email = ?", (data.get("email"),)).fetchone()
        if not user or not verify_password(data.get("password", ""), user["password_hash"]):
            return self.json_response({"error": "E-mail ou senha invalidos"}, 401)
        sid = secrets.token_urlsafe(32)
        SESSIONS[sid] = {"user_id": user["id"], "expires": time.time() + 60 * 60 * 8}
        header = f"sid={sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age={60 * 60 * 8}"
        return self.json_response({"user": public_user(user)}, headers={"Set-Cookie": header})

    def logout(self):
        sid = self.session_id()
        if sid:
            SESSIONS.pop(sid, None)
        return self.json_response({"ok": True}, headers={"Set-Cookie": "sid=; Path=/; Max-Age=0"})

    def session_id(self):
        jar = cookies.SimpleCookie(self.headers.get("Cookie"))
        morsel = jar.get("sid")
        return morsel.value if morsel else None

    def current_user(self):
        sid = self.session_id()
        session = SESSIONS.get(sid)
        if not session or session["expires"] < time.time():
            return None
        with db() as conn:
            user = conn.execute("SELECT * FROM users WHERE id = ?", (session["user_id"],)).fetchone()
        return public_user(user)

    def handle_employees(self, method, item_id):
        if method == "GET":
            if item_id:
                employee = load_employee(item_id)
                if not employee:
                    return self.json_response({"error": "Colaborador nao encontrado"}, 404)
                return self.json_response(employee)
            return self.json_response({"items": load_employees()})

        data = self.payload()
        if method == "POST":
            item_id = save_employee(data)
            return self.json_response(load_employee(item_id), 201)
        if method == "PUT" and item_id:
            save_employee(data, item_id)
            return self.json_response(load_employee(item_id))
        if method == "DELETE" and item_id:
            with db() as conn:
                conn.execute("DELETE FROM employees WHERE id = ?", (item_id,))
            return self.json_response({"ok": True})
        return self.json_response({"error": "Metodo invalido"}, 405)

    def handle_feedbacks(self, method, item_id, parsed):
        query = parse_qs(parsed.query)
        if method == "GET":
            employee_id = query.get("employee_id", [None])[0]
            return self.json_response({"items": load_feedbacks(employee_id)})
        data = self.payload()
        if method == "POST":
            item_id = save_feedback(data)
            return self.json_response(row_to_dict_by_id("feedbacks", item_id), 201)
        if method == "PUT" and item_id:
            save_feedback(data, item_id)
            return self.json_response(row_to_dict_by_id("feedbacks", item_id))
        if method == "DELETE" and item_id:
            with db() as conn:
                conn.execute("DELETE FROM feedbacks WHERE id = ?", (item_id,))
            return self.json_response({"ok": True})
        return self.json_response({"error": "Metodo invalido"}, 405)

    def handle_disc(self, method, item_id, parsed):
        query = parse_qs(parsed.query)
        if method == "GET":
            employee_id = query.get("employee_id", [None])[0]
            return self.json_response({"items": load_disc_profiles(employee_id)})
        data = self.payload()
        if method == "POST":
            item_id = save_disc(data)
            return self.json_response(row_to_dict_by_id("disc_profiles", item_id), 201)
        if method == "PUT" and item_id:
            save_disc(data, item_id)
            return self.json_response(row_to_dict_by_id("disc_profiles", item_id))
        if method == "DELETE" and item_id:
            with db() as conn:
                conn.execute("DELETE FROM disc_profiles WHERE id = ?", (item_id,))
            return self.json_response({"ok": True})
        return self.json_response({"error": "Metodo invalido"}, 405)


def public_user(user):
    return {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}


def load_options():
    with db() as conn:
        return {
            "departments": [dict(r) for r in conn.execute("SELECT * FROM departments ORDER BY name")],
            "roles": [dict(r) for r in conn.execute("SELECT * FROM roles ORDER BY name")],
            "units": [dict(r) for r in conn.execute("SELECT * FROM units ORDER BY name")],
            "leaders": [dict(r) for r in conn.execute("SELECT id, name FROM employees ORDER BY name")],
        }


def load_employees():
    with db() as conn:
        rows = conn.execute(
            """
            SELECT e.*, d.name department, r.name role, u.name unit, l.name leader
            FROM employees e
            LEFT JOIN departments d ON d.id = e.department_id
            LEFT JOIN roles r ON r.id = e.role_id
            LEFT JOIN units u ON u.id = e.unit_id
            LEFT JOIN employees l ON l.id = e.leader_id
            ORDER BY e.name
            """
        ).fetchall()
    return [dict(row) for row in rows]


def load_employee(employee_id):
    employee = next((item for item in load_employees() if item["id"] == employee_id), None)
    if not employee:
        return None
    with db() as conn:
        employee["feedbacks"] = load_feedbacks(employee_id)
        employee["disc"] = load_disc_profiles(employee_id)
        employee["development_plans"] = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM development_plans WHERE employee_id = ? ORDER BY deadline", (employee_id,)
            )
        ]
    return employee


def save_employee(data, item_id=None):
    fields = [
        "name",
        "email",
        "phone",
        "admission_date",
        "status",
        "department_id",
        "role_id",
        "unit_id",
        "leader_id",
        "notes",
    ]
    values = [normalize_value(data.get(field)) for field in fields]
    with db() as conn:
        if item_id:
            assignments = ", ".join([f"{field} = ?" for field in fields])
            conn.execute(f"UPDATE employees SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values + [item_id])
            return item_id
        cur = conn.execute(
            f"INSERT INTO employees ({', '.join(fields)}) VALUES ({', '.join(['?'] * len(fields))})",
            values,
        )
        return cur.lastrowid


def load_feedbacks(employee_id=None):
    sql = """
        SELECT f.*, e.name employee, u.name author
        FROM feedbacks f
        JOIN employees e ON e.id = f.employee_id
        LEFT JOIN users u ON u.id = f.author_id
    """
    params = []
    if employee_id:
        sql += " WHERE f.employee_id = ?"
        params.append(employee_id)
    sql += " ORDER BY f.feedback_date DESC, f.id DESC"
    with db() as conn:
        return [dict(r) for r in conn.execute(sql, params)]


def save_feedback(data, item_id=None):
    fields = ["employee_id", "type", "title", "description", "action_plan", "feedback_date"]
    values = [normalize_value(data.get(field)) for field in fields]
    with db() as conn:
        if item_id:
            assignments = ", ".join([f"{field} = ?" for field in fields])
            conn.execute(f"UPDATE feedbacks SET {assignments} WHERE id = ?", values + [item_id])
            return item_id
        cur = conn.execute(
            f"INSERT INTO feedbacks ({', '.join(fields)}, author_id) VALUES ({', '.join(['?'] * len(fields))}, 1)",
            values,
        )
        return cur.lastrowid


def load_disc_profiles(employee_id=None):
    sql = """
        SELECT dp.*, e.name employee
        FROM disc_profiles dp
        JOIN employees e ON e.id = dp.employee_id
    """
    params = []
    if employee_id:
        sql += " WHERE dp.employee_id = ?"
        params.append(employee_id)
    sql += " ORDER BY e.name"
    with db() as conn:
        return [dict(r) for r in conn.execute(sql, params)]


def save_disc(data, item_id=None):
    fields = ["employee_id", "dominance", "influence", "stability", "compliance", "primary_profile", "notes"]
    values = [normalize_value(data.get(field)) for field in fields]
    with db() as conn:
        if item_id:
            assignments = ", ".join([f"{field} = ?" for field in fields])
            conn.execute(f"UPDATE disc_profiles SET {assignments}, assessed_at = CURRENT_TIMESTAMP WHERE id = ?", values + [item_id])
            return item_id
        cur = conn.execute(
            f"INSERT INTO disc_profiles ({', '.join(fields)}) VALUES ({', '.join(['?'] * len(fields))})",
            values,
        )
        return cur.lastrowid


def load_dashboard():
    with db() as conn:
        totals = row_to_dict(
            conn.execute(
                """
                SELECT
                    COUNT(*) total,
                    SUM(status = 'Ativo') active,
                    SUM(status <> 'Ativo') inactive
                FROM employees
                """
            ).fetchone()
        )
        by_department = [dict(r) for r in conn.execute(
            """
            SELECT COALESCE(d.name, 'Sem departamento') label, COUNT(e.id) value
            FROM employees e
            LEFT JOIN departments d ON d.id = e.department_id
            GROUP BY label ORDER BY value DESC
            """
        )]
        feedbacks = [dict(r) for r in conn.execute(
            """
            SELECT type label, COUNT(*) value
            FROM feedbacks
            GROUP BY type
            """
        )]
        disc = [dict(r) for r in conn.execute(
            """
            SELECT primary_profile label, COUNT(*) value
            FROM disc_profiles
            GROUP BY primary_profile
            """
        )]
        recent = load_feedbacks()[:5]
    return {"totals": totals, "by_department": by_department, "feedbacks": feedbacks, "disc": disc, "recent_feedbacks": recent}


def load_orgchart():
    employees = load_employees()
    return [
        {
            "id": item["id"],
            "name": item["name"],
            "role": item.get("role"),
            "department": item.get("department"),
            "unit": item.get("unit"),
            "leader_id": item.get("leader_id"),
        }
        for item in employees
    ]


def row_to_dict_by_id(table, item_id):
    with db() as conn:
        return row_to_dict(conn.execute(f"SELECT * FROM {table} WHERE id = ?", (item_id,)).fetchone())


def normalize_value(value):
    if value == "":
        return None
    return value


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"People EPI rodando em http://127.0.0.1:{port}")
    server.serve_forever()
