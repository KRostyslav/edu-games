/**
 * Фейкові `IncomingMessage` / `ServerResponse` для задач про хендлери й
 * middleware. Контракт — як у `node:http`: заголовки нечутливі до регістру,
 * `setHeader` після відправлення заголовків кидає ERR_HTTP_HEADERS_SENT,
 * `end()` закриває відповідь. Express-зручностей (`res.json`, `req.query`)
 * навмисно немає: гравець має побачити, що під ними лежить.
 */

import { EventEmitter } from "./events.js";

/** Запит: заголовки завжди в нижньому регістрі — рівно як їх віддає Node. */
export function createRequest({ method = "GET", url = "/", headers = {}, body, ip = "203.0.113.7" } = {}) {
  const req = new EventEmitter();
  req.method = method.toUpperCase();
  req.url = url;
  req.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  req.body = body;
  req.socket = { remoteAddress: ip };
  req.httpVersion = "1.1";
  return req;
}

export class ServerResponse extends EventEmitter {
  statusCode = 200;
  statusMessage = "";
  #headers = new Map();
  #chunks = [];
  #headersSent = false;
  #ended = false;

  get headersSent() {
    return this.#headersSent;
  }

  get writableEnded() {
    return this.#ended;
  }

  #assertOpen(what) {
    if (this.#headersSent) {
      const error = new Error(`Cannot ${what} headers after they are sent to the client`);
      error.code = "ERR_HTTP_HEADERS_SENT";
      throw error;
    }
  }

  setHeader(name, value) {
    this.#assertOpen("set");
    this.#headers.set(String(name).toLowerCase(), { name, value });
    return this;
  }

  appendHeader(name, value) {
    this.#assertOpen("append");
    const key = String(name).toLowerCase();
    const prev = this.#headers.get(key);
    const list = prev ? [].concat(prev.value, value) : value;
    this.#headers.set(key, { name, value: list });
    return this;
  }

  getHeader(name) {
    return this.#headers.get(String(name).toLowerCase())?.value;
  }

  hasHeader(name) {
    return this.#headers.has(String(name).toLowerCase());
  }

  removeHeader(name) {
    this.#assertOpen("remove");
    this.#headers.delete(String(name).toLowerCase());
  }

  getHeaders() {
    return Object.fromEntries([...this.#headers].map(([key, entry]) => [key, entry.value]));
  }

  writeHead(statusCode, statusMessage, headers) {
    this.#assertOpen("set");
    if (typeof statusMessage === "object" && statusMessage !== null) {
      headers = statusMessage;
      statusMessage = undefined;
    }
    this.statusCode = statusCode;
    if (statusMessage) this.statusMessage = statusMessage;
    for (const [key, value] of Object.entries(headers ?? {})) this.setHeader(key, value);
    this.#headersSent = true;
    return this;
  }

  write(chunk) {
    if (this.#ended) {
      const error = new Error("write after end");
      error.code = "ERR_STREAM_WRITE_AFTER_END";
      throw error;
    }
    this.#headersSent = true;
    if (chunk != null) this.#chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }

  end(chunk) {
    if (this.#ended) return this;
    if (chunk != null) this.write(chunk);
    this.#headersSent = true;
    this.#ended = true;
    queueMicrotask(() => this.emit("finish"));
    return this;
  }

  /** Знімок для тестів: статус, заголовки (ключі в нижньому регістрі), тіло. */
  result() {
    const body = this.#chunks.join("");
    let json;
    try {
      json = body ? JSON.parse(body) : undefined;
    } catch {
      json = undefined;
    }
    return { status: this.statusCode, headers: this.getHeaders(), body, json, ended: this.#ended };
  }
}

export function createResponse() {
  return new ServerResponse();
}

/**
 * Проганяє middleware `(req, res, next)` і чекає, чим усе скінчиться:
 * викликом `next()`, `next(err)` чи завершенням відповіді. Middleware, яке не
 * зробило ні того, ні іншого, — класичний «завислий запит»; тест це ловить.
 */
export function runMiddleware(middleware, req, res, { timeoutMs = 500 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(
      () => finish({ next: false, error: null, ended: res.writableEnded, hung: !res.writableEnded }),
      timeoutMs,
    );
    res.once("finish", () => finish({ next: false, error: null, ended: true, hung: false }));
    const next = (error) => finish({ next: true, error: error ?? null, ended: res.writableEnded, hung: false });
    try {
      const out = middleware(req, res, next);
      if (out && typeof out.then === "function") out.catch((error) => reject(error));
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}
