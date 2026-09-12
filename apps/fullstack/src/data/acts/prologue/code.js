/** Задачі пісочниці прологу. */

const USER = { id: 42, name: "Оля", email: "olia@shop.ua", passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA" };

function fakeDb() {
  const calls = [];
  return {
    calls,
    async findUser(id) {
      calls.push(id);
      return id === 42 ? { ...USER } : null;
    },
  };
}

async function call(mod, http, { method = "GET", url }) {
  const req = http.createRequest({ method, url });
  const res = http.createResponse();
  const db = fakeDb();
  await mod.handleGetUser(req, res, db);
  return { ...res.result(), calls: db.calls };
}

export const CODE = {
  "pro-first-endpoint": {
    title: "GET /users/:id",
    brief:
      "Напишіть `handleGetUser(req, res, db)` у стилі node:http.\n\n" +
      "• GET /users/42 → 200, JSON `{ id, name, email }`, заголовок Content-Type: application/json\n" +
      "• id не число (/users/abc) → 400 і `{ error: \"…\" }`, у базу не ходимо\n" +
      "• користувача немає → 404 і `{ error: \"…\" }`\n" +
      "• інший метод → 405 із заголовком Allow\n" +
      "• passwordHash ніколи не потрапляє у відповідь\n" +
      "• query-рядок (/users/42?utm=mail) не ламає розбір\n\n" +
      "`await db.findUser(id)` повертає об'єкт користувача (з passwordHash!) або null.",
    exports: ["handleGetUser"],
    starter: [
      "async function handleGetUser(req, res, db) {",
      "  // req.method, req.url — як у node:http",
      "  // res.statusCode = …; res.setHeader(name, value); res.end(body)",
      "  res.statusCode = 501;",
      '  res.end("Not implemented");',
      "}",
      "",
    ].join("\n"),
    reference: [
      "async function handleGetUser(req, res, db) {",
      "  const send = (status, body, headers = {}) => {",
      "    res.statusCode = status;",
      '    res.setHeader("Content-Type", "application/json; charset=utf-8");',
      "    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);",
      '    res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));',
      "  };",
      "",
      '  if (req.method !== "GET" && req.method !== "HEAD") {',
      '    return send(405, { error: "Method Not Allowed" }, { Allow: "GET, HEAD" });',
      "  }",
      '  const { pathname } = new URL(req.url, "http://localhost");',
      "  const match = pathname.match(/^\\/users\\/(\\d+)$/);",
      '  if (!match) return send(400, { error: "id має бути числом" });',
      "",
      "  const user = await db.findUser(Number(match[1]));",
      '  if (!user) return send(404, { error: "Користувача не знайдено" });',
      "",
      "  const { id, name, email } = user;",
      "  send(200, { id, name, email });",
      "}",
      "",
    ].join("\n"),
    naive: [
      "async function handleGetUser(req, res, db) {",
      '  const id = Number(req.url.split("/")[2]);',
      "  const user = await db.findUser(id);",
      '  res.setHeader("Content-Type", "application/json");',
      "  res.end(JSON.stringify(user));",
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "GET /users/42 → 200 і JSON з потрібними полями",
        run: async ({ mod, http, assert }) => {
          const r = await call(mod, http, { url: "/users/42" });
          assert.equal(r.status, 200, "статус");
          assert.ok(String(r.headers["content-type"] ?? "").includes("application/json"), "Content-Type має бути application/json");
          assert.deepEqual(r.json, { id: 42, name: "Оля", email: "olia@shop.ua" }, "тіло відповіді");
        },
      },
      {
        name: "passwordHash ніколи не потрапляє у відповідь",
        run: async ({ mod, http, assert }) => {
          const r = await call(mod, http, { url: "/users/42" });
          assert.ok(!r.body.includes("passwordHash") && !r.body.includes("$argon2id"), "у тілі є хеш пароля — це витік даних");
        },
      },
      {
        name: "GET /users/7 → 404 з JSON-помилкою",
        run: async ({ mod, http, assert }) => {
          const r = await call(mod, http, { url: "/users/7" });
          assert.equal(r.status, 404, "статус");
          assert.equal(typeof r.json?.error, "string", "тіло має бути { error: \"…\" }");
        },
      },
      {
        name: "GET /users/abc → 400, а база навіть не смикається",
        run: async ({ mod, http, assert }) => {
          const r = await call(mod, http, { url: "/users/abc" });
          assert.equal(r.status, 400, "статус");
          assert.equal(typeof r.json?.error, "string", "тіло має бути { error: \"…\" }");
          assert.equal(r.calls.length, 0, "некоректний id не повинен доходити до бази");
        },
      },
      {
        name: "POST /users/42 → 405 з заголовком Allow",
        run: async ({ mod, http, assert }) => {
          const r = await call(mod, http, { method: "POST", url: "/users/42" });
          assert.equal(r.status, 405, "статус");
          assert.ok(/GET/.test(String(r.headers.allow ?? "")), "заголовок Allow має перелічити дозволені методи");
        },
      },
      {
        name: "GET /users/42?utm=mail → 200: query-рядок не ламає розбір",
        run: async ({ mod, http, assert }) => {
          const r = await call(mod, http, { url: "/users/42?utm=mail" });
          assert.equal(r.status, 200, "статус");
          assert.equal(r.json?.id, 42);
        },
      },
    ],
    bonusTests: [
      {
        name: "HEAD /users/42 → 200 і ті самі заголовки, але порожнє тіло",
        run: async ({ mod, http, assert }) => {
          const r = await call(mod, http, { method: "HEAD", url: "/users/42" });
          assert.equal(r.status, 200, "статус");
          assert.ok(String(r.headers["content-type"] ?? "").includes("application/json"), "Content-Type");
          assert.equal(r.body, "", "HEAD не має тіла");
        },
      },
    ],
  },
};
