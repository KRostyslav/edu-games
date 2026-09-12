/** Вузли дерева навичок акту «Рантайм». */

export const SKILLS = [
  {
    id: "rt-loop",
    act: "runtime",
    title: "Event loop і черги",
    summary: "Фази libuv, nextTick і мікрозадачі: хто виконується першим і чому саме так.",
    levels: ["rt-event-loop", "rt-microtasks"],
    topics: ["event-loop", "microtasks", "esm-cjs"],
  },
  {
    id: "rt-errors",
    act: "runtime",
    title: "Асинхронні помилки й конкурентність",
    summary: "Що ловить try/catch, що валить процес і як запускати сотні задач, не поклавши базу.",
    levels: ["rt-async-errors", "rt-promise-pool"],
    topics: ["async-errors", "promise-concurrency"],
  },
  {
    id: "rt-cpu",
    act: "runtime",
    title: "CPU і блокування",
    summary: "Знайти, що тримає event loop, довести це профілем і прибрати з головного потоку.",
    levels: ["rt-blocking", "rt-yield"],
    topics: ["blocking-event-loop", "profiling"],
  },
  {
    id: "rt-threads",
    act: "runtime",
    title: "Потоки й ядра",
    summary: "libuv threadpool, worker_threads і cluster: де в Node живуть потоки і як використати всі ядра.",
    levels: ["rt-threadpool", "rt-scale-cores"],
    topics: ["libuv-threadpool", "worker-threads-cluster"],
  },
  {
    id: "rt-streams",
    act: "runtime",
    title: "Події й стріми",
    summary: "EventEmitter, backpressure і pipeline — як Node пересуває дані, не тримаючи їх у пам'яті.",
    levels: ["rt-emitter", "rt-backpressure"],
    topics: ["event-emitter", "streams-backpressure"],
  },
  {
    id: "rt-memory",
    act: "runtime",
    title: "Пам'ять",
    summary: "Що тримає об'єкти живими в довгоживучому процесі і як знайти витік, не поклавши сервіс.",
    levels: ["rt-memory-leak"],
    topics: ["memory-leaks"],
  },
];
