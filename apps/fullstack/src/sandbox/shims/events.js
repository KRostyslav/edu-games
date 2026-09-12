/**
 * EventEmitter із семантикою `node:events` — у браузерному воркері його немає.
 *
 * Поведінку звірено зі справжнім Node тестом відповідності
 * (test/shims.test.js): порядок слухачів, `once`, видалення під час emit,
 * `'error'` без слухача. Якщо шим розійдеться з Node, гра вчитиме шим, а не
 * Node, — тому кожна відмінність тут є багом.
 */

export class EventEmitter {
  #events = new Map();

  #add(name, fn, prepend) {
    if (typeof fn !== "function") {
      const error = new TypeError(`The "listener" argument must be of type function. Received ${typeof fn}`);
      error.code = "ERR_INVALID_ARG_TYPE";
      throw error;
    }
    const list = this.#events.get(name) ?? [];
    if (prepend) list.unshift(fn);
    else list.push(fn);
    this.#events.set(name, list);
    return this;
  }

  on(name, fn) {
    return this.#add(name, fn, false);
  }

  addListener(name, fn) {
    return this.#add(name, fn, false);
  }

  prependListener(name, fn) {
    return this.#add(name, fn, true);
  }

  once(name, fn) {
    const wrapper = (...args) => {
      this.removeListener(name, wrapper);
      return fn.apply(this, args);
    };
    wrapper.listener = fn;
    return this.#add(name, wrapper, false);
  }

  /** Як у Node: знімає щонайбільше один екземпляр — останній доданий. */
  removeListener(name, fn) {
    const list = this.#events.get(name);
    if (!list) return this;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i] === fn || list[i].listener === fn) {
        list.splice(i, 1);
        break;
      }
    }
    if (list.length === 0) this.#events.delete(name);
    return this;
  }

  off(name, fn) {
    return this.removeListener(name, fn);
  }

  removeAllListeners(name) {
    if (name === undefined) this.#events.clear();
    else this.#events.delete(name);
    return this;
  }

  /**
   * Слухачі копіюються перед викликом: зняття чи додавання слухача під час
   * emit на поточний виклик не впливає — рівно як у Node.
   */
  emit(name, ...args) {
    const list = this.#events.get(name);
    if (name === "error" && !list?.length) {
      const [err] = args;
      if (err instanceof Error) throw err;
      const error = new Error(`Unhandled error. (${typeof err === "string" ? `'${err}'` : String(err)})`);
      error.code = "ERR_UNHANDLED_ERROR";
      error.context = err;
      throw error;
    }
    if (!list?.length) return false;
    for (const fn of [...list]) fn.apply(this, args);
    return true;
  }

  listenerCount(name) {
    return this.#events.get(name)?.length ?? 0;
  }

  listeners(name) {
    return (this.#events.get(name) ?? []).map((fn) => fn.listener ?? fn);
  }

  eventNames() {
    return [...this.#events.keys()];
  }
}

/**
 * `events.once(emitter, name)`: проміс із масивом аргументів першої події.
 * Як і в Node, `'error'` під час очікування відхиляє проміс.
 */
export function once(emitter, name) {
  return new Promise((resolve, reject) => {
    const onEvent = (...args) => {
      if (name !== "error") emitter.removeListener("error", onError);
      resolve(args);
    };
    const onError = (error) => {
      emitter.removeListener(name, onEvent);
      reject(error);
    };
    emitter.once(name, onEvent);
    if (name !== "error") emitter.once("error", onError);
  });
}
