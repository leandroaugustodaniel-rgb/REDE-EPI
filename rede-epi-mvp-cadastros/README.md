# People EPI

MVP de gestao de pessoas para uma empresa distribuidora de EPIs.

## Escopo do MVP

- Login com sessao HTTP.
- CRUD de colaboradores.
- CRUD de feedbacks positivos, corretivos e de desenvolvimento.
- CRUD de perfis comportamentais DISC.
- Tela de perfil do colaborador com historico, DISC e PDI.
- Dashboard inicial com indicadores.
- Organograma simples por lideranca.

## Arquitetura

- Desenvolvimento local original: Python com `http.server`, API REST e SQLite.
- Producao recomendada: Netlify Functions, API REST e Supabase/PostgreSQL.
- Frontend: SPA responsiva em HTML, CSS e JavaScript.
- Banco relacional: Supabase/PostgreSQL com tabelas para usuarios, colaboradores, departamentos, cargos, unidades, DISC, feedbacks e PDI.
- Autenticacao: cookie de sessao HttpOnly assinado no backend serverless.

## Como executar

```powershell
& 'C:\Users\leand\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' app.py
```

Acesse:

```text
http://127.0.0.1:8000
```

Login inicial:

```text
admin@epi.com
admin123
```

## Deploy com Supabase, GitHub e Netlify

### 1. Criar banco no Supabase

1. Crie um projeto no Supabase.
2. Abra o menu `SQL Editor`.
3. Execute o arquivo:

```text
supabase/schema.sql
```

Esse script cria as tabelas, ativa RLS e insere dados iniciais.

Login inicial:

```text
admin@epi.com
admin123
```

### 2. Subir o projeto para o GitHub

Crie um repositorio no GitHub e envie estes arquivos do projeto.

Arquivos importantes para producao:

```text
public/
netlify/functions/api.js
supabase/schema.sql
netlify.toml
package.json
.env.example
```

### 3. Conectar no Netlify

1. No Netlify, escolha `Add new site`.
2. Selecione `Import an existing project`.
3. Conecte o repositorio do GitHub.
4. Configure:

```text
Build command: npm install
Publish directory: public
Functions directory: netlify/functions
```

O arquivo `netlify.toml` ja deixa essas rotas configuradas.

### 4. Variaveis de ambiente no Netlify

No Netlify, abra `Site configuration > Environment variables` e cadastre:

```text
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
SESSION_SECRET=uma-chave-grande-e-segura
```

Importante: use a `service_role key` somente no Netlify. Nunca coloque essa chave no frontend.

### 5. Primeiro acesso

Depois do deploy:

```text
https://seu-site.netlify.app
```

Entre com:

```text
admin@epi.com
admin123
```

Depois disso, recomenda-se trocar a senha inicial e criar usuarios reais para RH e liderancas.
