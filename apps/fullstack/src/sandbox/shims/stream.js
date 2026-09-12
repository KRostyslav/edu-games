/**
 * Writable із семантикою `node:stream` — рівно та частина, на якій тримається
 * backpressure: `write()` повертає false, коли буфер досяг `highWaterMark`,
 * а `'drain'` приходить, коли він повністю спорожнів.
 *
 * Як і в Node, `write()` лише кладе дані в буфер — він не відмовляє і не
 * гальмує. Хто ігнорує `false`, той просто роздуває буфер у пам'яті: саме так
 * падають сервіси, що віддають великий файл повільному клієнту. Звірено зі
 * справжнім Node у test/shims.test.js.
 */

import { EventEmitter } from "./events.js";

const byteLength = (chunk) =>
  typeof chunk === "string" ? new TextEncoder().encode(chunk).length : chunk?.byteLength ?? chunk?.length ?? 1;

export class Writable extends EventEmitter {
  #hwm;
  #objectMode;
  #sink;
  #final;
  #buffer = [];
  #length = 0;
  #writing = false;
  #needDrain = false;
  #ending = false;
  #finished = false;
  #destroyed = false;

  constructor({ highWaterMark, objectMode = false, write, final } = {}) {
    super();
    this.#objectMode = objectMode;
    // Node 22 підняв дефолт для байтових потоків до 64 KiB; objectMode — як і раніше 16 об'єктів.
    this.#hwm = highWaterMark ?? (objectMode ? 16 : 65536);
    this.#sink = write ?? ((chunk, encoding, callback) => callback());
    this.#final = final ?? null;
  }

  get writableLength() {
    return this.#length;
  }

  get writableHighWaterMark() {
    return this.#hwm;
  }

  get writableNeedDrain() {
    return this.#needDrain;
  }

  get writableEnded() {
    return this.#ending;
  }

  get writableFinished() {
    return this.#finished;
  }

  get destroyed() {
    return this.#destroyed;
  }

  write(chunk, encoding, callback) {
    if (typeof encoding === "function") {
      callback = encoding;
      encoding = undefined;
    }
    if (this.#ending) {
      const error = new Error("write after end");
      error.code = "ERR_STREAM_WRITE_AFTER_END";
      queueMicrotask(() => {
        callback?.(error);
        this.emit("error", error);
      });
      return false;
    }
    const size = this.#objectMode ? 1 : byteLength(chunk);
    this.#length += size;
    const job = { chunk, encoding: encoding ?? "utf8", size, callback };
    if (this.#writing) this.#buffer.push(job);
    else this.#start(job);
    // Як у Node: відповідь рахується вже після спроби записати, тож синхронний
    // приймач, що встиг усе проковтнути, не змушує чекати 'drain'.
    const ok = this.#length < this.#hwm;
    if (!ok) this.#needDrain = true;
    return ok && !this.#destroyed;
  }

  #start(job) {
    this.#writing = true;
    let sync = true;
    const done = (error) => {
      if (this.#destroyed) return;
      this.#writing = false;
      this.#length -= job.size;
      if (error) {
        this.#destroyed = true;
        job.callback?.(error);
        this.emit("error", error);
        return;
      }
      const next = this.#buffer.shift();
      if (next) this.#start(next);
      const after = () => {
        job.callback?.(null);
        // Після end() 'drain' уже нікому не потрібен — Node його не шле.
        if (this.#needDrain && this.#length === 0 && !this.#ending) {
          this.#needDrain = false;
          this.emit("drain");
        }
        this.#maybeFinish();
      };
      // Синхронний колбек відкладаємо, як це робить Node (process.nextTick),
      // щоб 'drain' не прилетів ще до того, як write() повернув значення.
      if (sync) queueMicrotask(after);
      else after();
    };
    this.#sink(job.chunk, job.encoding, done);
    sync = false;
  }

  end(chunk, encoding, callback) {
    if (typeof chunk === "function") {
      callback = chunk;
      chunk = undefined;
    } else if (typeof encoding === "function") {
      callback = encoding;
      encoding = undefined;
    }
    if (chunk !== undefined && chunk !== null) this.write(chunk, encoding);
    if (callback) this.once("finish", callback);
    this.#ending = true;
    this.#maybeFinish();
    return this;
  }

  #maybeFinish() {
    if (!this.#ending || this.#finished || this.#writing || this.#buffer.length || this.#destroyed) return;
    this.#finished = true;
    const emitFinish = () => queueMicrotask(() => this.emit("finish"));
    if (this.#final) this.#final((error) => (error ? this.emit("error", error) : emitFinish()));
    else emitFinish();
  }

  destroy(error) {
    if (this.#destroyed) return this;
    this.#destroyed = true;
    this.#buffer = [];
    queueMicrotask(() => {
      if (error) this.emit("error", error);
      this.emit("close");
    });
    return this;
  }
}
