/** Статті довідника акту «Рантайм»: Node.js зсередини. */

export const CODEX = {
  "event-loop": {
    title: "Event loop у Node: фази й черги",
    aliases: ["event loop", "цикл подій", "libuv", "setImmediate", "setTimeout", "фази циклу", "poll"],
    summary:
      "Один потік JavaScript і цикл libuv, що по колу обходить фази: таймери, I/O (poll), setImmediate (check), закриття. Між будь-якими двома колбеками виконуються nextTick і мікрозадачі.",
    how:
      "Node виконує ваш JS в одному потоці. Коли код доходить до асинхронної операції (сокет, файл, таймер), він реєструє колбек і йде далі, а libuv — C-бібліотека під Node — стежить за подіями ОС. Цикл обходить фази в фіксованому порядку: timers (колбеки setTimeout/setInterval, чий час настав) → pending callbacks (частина I/O-колбеків, відкладених з попередньої ітерації, наприклад деякі помилки TCP) → idle/prepare (внутрішні) → poll (нові I/O-події: дані із сокетів, завершені задачі threadpool) → check (setImmediate) → close callbacks (події 'close').\n\n" +
      "Poll — серце циклу. Якщо черги порожні, Node чекає в ньому на I/O рівно до найближчого таймера; якщо є setImmediate — не чекає зовсім. Звідси два наслідки. setTimeout(fn, 0) насправді означає «не раніше ніж за 1 мс». А порядок setTimeout(0) проти setImmediate у головному модулі не визначений: усе залежить від того, чи встигла минути та 1 мс до першої фази timers. Усередині I/O-колбека порядок завжди той самий: після poll іде check, тож setImmediate спрацює першим.\n\n" +
      "Між кожними двома колбеками (з Node 11 — навіть між двома таймерами однієї фази) Node вичерпує чергу process.nextTick, а потім чергу мікрозадач (проміси, queueMicrotask). Поки колбек виконується, цикл стоїть: жоден інший запит, таймер чи health check не обробляється. Тому головне правило продуктивності Node — кожен колбек має бути коротким.",
    code: [
      {
        lang: "js",
        caption: "Усередині I/O-колбека порядок детермінований",
        src: [
          'const fs = require("node:fs");',
          "",
          'fs.stat(".", () => {                                     // фаза poll',
          '  setTimeout(() => console.log("timeout"), 0);           // наступна ітерація, timers',
          '  setImmediate(() => console.log("immediate"));          // ця ітерація, check',
          '  process.nextTick(() => console.log("nextTick"));       // одразу після колбека',
          '  Promise.resolve().then(() => console.log("promise"));  // після nextTick',
          "});",
          "// nextTick → promise → immediate → timeout",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Один потік без блокувань обслуговує тисячі одночасних з'єднань: жодних потоків на запит і перемикань контексту.",
      "− Будь-яка синхронна робота на 100 мс зупиняє всіх клієнтів процесу одночасно, а не лише автора запиту.",
      "− Порядок setTimeout(0) і setImmediate поза I/O-колбеком не гарантовано — не будуйте на ньому логіку.",
    ],
    numbers: [
      "setTimeout(fn, 0) у Node — мінімум 1 мс.",
      "Event loop lag p99 здорового API — одиниці мілісекунд; понад 100 мс користувачі вже відчувають.",
      "Процес на 1000 RPS за секунду блокування накопичує в черзі ~1000 запитів.",
    ],
    interview: [
      "Назвіть фази event loop у Node. У якій із них виконується setImmediate, а в якій — колбек fs.readFile?",
      "Чому порядок setTimeout(0) і setImmediate у головному модулі не визначений, а в I/O-колбеку — визначений?",
    ],
    frontendBridge:
      "У браузері принцип той самий: одна задача → усі мікрозадачі → можливо, рендер кадру. Довгий обробник кліку блокує малювання, а в Node довгий хендлер блокує всі інші запити. Замість requestAnimationFrame і рендеру тут фази libuv, а setImmediate — найближчий аналог MessageChannel-трюку, яким React scheduler у браузері віддає керування циклу (у Node той самий scheduler використовує саме setImmediate).",
    see: ["microtasks", "libuv-threadpool", "blocking-event-loop"],
  },

  microtasks: {
    title: "process.nextTick, проміси й queueMicrotask",
    aliases: ["microtask", "мікрозадачі", "nextTick", "queueMicrotask", "Promise.then", "starvation", "голодування"],
    summary:
      "Після кожного колбека Node спершу вичерпує чергу nextTick, потім — чергу мікрозадач V8 (then, await, queueMicrotask). Обидві черги працюють до повного спорожнення, тож рекурсивне планування «заморожує» event loop.",
    how:
      "Мікрозадачі — не фаза циклу, а «перерва» між будь-якими двома колбеками. Коли поточний колбек (чи головний CommonJS-модуль) завершився, Node виконує всі process.nextTick, потім V8 виконує всі мікрозадачі: колбеки then/catch/finally, продовження після await, queueMicrotask. Якщо мікрозадача запланувала новий nextTick, він виконається після того, як спорожніє вся черга мікрозадач, — і так по колу, доки обидві черги не стануть порожніми.\n\n" +
      "Черга nextTick вичерпується повністю, разом із вкладеними викликами. Тому `function loop() { process.nextTick(loop) }` навіки блокує I/O: цикл ніколи не дійде до poll. Те саме з нескінченним ланцюжком промісів. setImmediate такої проблеми не має: колбек, запланований у фазі check, виконається вже на наступній ітерації, і між ними встигнуть таймери та I/O.\n\n" +
      "Навіщо тоді nextTick? Ним API Node гарантують асинхронність колбека «якомога раніше» — наприклад, щоб код устиг підписатися на 'error' новоствореного об'єкта до того, як подію буде емітовано. Для власного коду документація Node радить queueMicrotask: це стандартний механізм, однаковий у браузері й Node. І пам'ятайте про ESM: там головний модуль виконується всередині асинхронної задачі, тож на верхньому рівні мікрозадачі спрацьовують раніше за nextTick.",
    code: [
      {
        lang: "js",
        caption: "CommonJS: nextTick-черга до кінця, потім мікрозадачі",
        src: [
          'setTimeout(() => console.log("timeout"), 0);',
          'Promise.resolve().then(() => console.log("promise"));',
          'queueMicrotask(() => console.log("microtask"));',
          "process.nextTick(() => {",
          '  console.log("tick 1");',
          '  process.nextTick(() => console.log("tick 2"));  // ще в цій же черзі',
          "});",
          "// tick 1 → tick 2 → promise → microtask → timeout",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Мікрозадачі дешеві: без походу в libuv і без мінімальної затримки таймера.",
      "− Нескінченний потік мікрозадач (nextTick-рекурсія, then у циклі) заморожує I/O так само, як синхронний while.",
      "− Порядок nextTick і промісів різний у CommonJS і ESM — не будуйте на ньому логіку.",
    ],
    numbers: ["await навіть на вже виконаному промісі віддає керування: продовження стає мікрозадачею, а не виконується синхронно."],
    interview: [
      "Що виведе код із nextTick, Promise.then, setTimeout(0) і setImmediate — і чому саме так?",
      "Чим небезпечний рекурсивний process.nextTick і чим setImmediate тут кращий?",
    ],
    frontendBridge:
      "У браузері nextTick немає, але мікрозадачі ті самі: then, await, queueMicrotask. Продовження після await в обробнику кліку виконується до того, як браузер візьме наступну подію чи намалює кадр. І нескінченний ланцюжок then так само заморожує вкладку, як рекурсивний nextTick — сервер.",
    see: ["event-loop", "esm-cjs", "async-errors"],
  },

  "libuv-threadpool": {
    title: "libuv threadpool: де Node все-таки використовує потоки",
    aliases: ["threadpool", "UV_THREADPOOL_SIZE", "libuv", "пул потоків", "dns.lookup", "fs", "pbkdf2"],
    summary:
      "Мережа в Node працює без потоків (epoll, kqueue, IOCP), а файли, dns.lookup, частина crypto і zlib ідуть у пул libuv — за замовчуванням 4 потоки на весь процес.",
    how:
      "Про готовність сокетів ОС уміє повідомляти сама (epoll у Linux, kqueue у macOS, IOCP у Windows), тож тисячі з'єднань обслуговує один потік. Для звичайних файлів epoll не працює, а частина операцій (getaddrinfo, хешування паролів, стиснення) — просто важкі блокуючі виклики. Їх libuv виконує в пулі робочих потоків: головний потік кладе задачу в чергу й іде далі, потік пулу робить блокуючий виклик, результат повертається в event loop, і колбек виконується у фазі poll.\n\n" +
      "У пул ідуть: усі асинхронні fs-операції, dns.lookup (а отже, і кожен http.get за іменем хоста без власного lookup), crypto.pbkdf2, scrypt, асинхронні randomBytes/randomFill, generateKeyPair, асинхронні методи zlib. Не йдуть: сокети, HTTP, таймери, dns.resolve* (c-ares сам робить мережеві запити). Ваш JavaScript у потоках пулу не виконується ніколи.\n\n" +
      "Пул один на процес і за замовчуванням має 4 потоки (UV_THREADPOOL_SIZE, максимум 1024). П'ять одночасних pbkdf2 по 200 мс — і п'ятий чекає в черзі, а разом із ним чекають readFile і dns.lookup вихідних запитів: повільний логін робить повільним завантаження файлів. Більший пул допомагає, лише поки вистачає ядер: 16 потоків хешування на 2 vCPU просто ділять ті самі ядра. Змінну задають в оточенні до запуску — пул створюється при першому використанні.",
    code: [
      {
        lang: "js",
        caption: "Четверо в пулі, п'ятий у черзі",
        src: [
          'const crypto = require("node:crypto");',
          "const start = Date.now();",
          "for (let i = 1; i <= 5; i++) {",
          '  crypto.pbkdf2("pw", "salt", 600_000, 64, "sha256", () => {',
          "    console.log(`hash ${i}: ${Date.now() - start} ms`);",
          "  });",
          "}",
          "// hash 1..4: ~200 ms, hash 5: ~400 ms",
          "// UV_THREADPOOL_SIZE=5 node pool.js → усі п'ять ~200–300 ms",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Блокуючі системні виклики не зупиняють event loop — ви пишете звичайний асинхронний код.",
      "− Пул маленький і спільний: CPU-важкі crypto і zlib забирають потоки у fs і dns.lookup, затримки «перетікають» між непов'язаними ендпоінтами.",
      "− Більший UV_THREADPOOL_SIZE не створює ядер: понад кількість vCPU CPU-задачі лише ділять той самий час.",
    ],
    numbers: [
      "Пул за замовчуванням — 4 потоки на процес; максимум UV_THREADPOOL_SIZE — 1024.",
      "pbkdf2 з 600 000 ітерацій SHA-256 (рекомендація OWASP) — ~200–400 мс CPU на одне хешування.",
    ],
    interview: [
      "Які операції Node виконує в threadpool, а які — ні? Чому мережі потоки не потрібні?",
      "Логіни стали повільними — і раптом повільними стали завантаження файлів. Як це пов'язано?",
    ],
    frontendBridge:
      "Браузер робить те саме непомітно: fetch, декодування картинок і парсинг — поза головним потоком, а результат приходить задачею в event loop. У Node ви бачите межу цього механізму: 4 потоки на процес, і ваші pbkdf2 конкурують з вашими ж readFile — приблизно як шість з'єднань на домен у HTTP/1.1.",
    see: ["event-loop", "blocking-event-loop", "worker-threads-cluster"],
  },

  "blocking-event-loop": {
    title: "Блокування event loop: хто зупиняє сервер",
    aliases: ["blocking", "блокування", "event loop lag", "Sync API", "ReDoS", "JSON.parse", "head-of-line blocking", "--trace-sync-io"],
    summary:
      "Будь-який синхронний код довше за кілька мілісекунд зупиняє всі запити процесу: і чужі, і health check. Типові винуватці — *Sync-API, JSON.parse великих тіл, катастрофічні регулярки й CPU-важкі цикли.",
    how:
      "У Node немає «потоку на запит»: коли хендлер рахує 300 мс, решта запитів цього процесу стоїть у черзі, навіть якщо їм треба 2 мс. Зовні це виглядає як загадковий стрибок p99 на всіх ендпоінтах одночасно при спокійній базі і CPU ≈ 100% одного ядра. Найчесніші метрики — event loop lag (із якою затримкою спрацьовує колбек) і ELU (частка часу, коли цикл зайнятий).\n\n" +
      "Типові винуватці: readFileSync, pbkdf2Sync, execSync, zlib.*Sync у хендлері; JSON.parse і JSON.stringify десятків мегабайтів; регулярки з вкладеними квантифікаторами — `/^(\\w+)*$/` на рядку «aaaa…!» перебирає експоненційну кількість варіантів (ReDoS); сортування й агрегація сотень тисяч елементів у пам'яті; рендер великих шаблонів; бібліотеки на чистому JS замість нативних (bcryptjs замість bcrypt). Прапорець --trace-sync-io друкує стек кожного синхронного I/O після першого оберту циклу — зручно ганяти на staging.\n\n" +
      "Лікування за зростанням складності: обмежити вхід (ліміт тіла, пагінація, ліміт довжини рядка перед регуляркою); взяти асинхронний API (pbkdf2 замість pbkdf2Sync — робота піде в threadpool); порізати роботу на частини з setImmediate між ними; винести CPU-роботу в пул worker_threads чи окремий сервіс із чергою. Обгортка `new Promise((r) => r(heavy()))` чи async-функція нічого не змінює: код однаково виконується в головному потоці.",
    code: [
      {
        lang: "js",
        caption: "Та сама робота — у головному потоці і в threadpool",
        src: [
          "// ❌ ~300 мс CPU у головному потоці: стоять усі запити процесу",
          'const hash = crypto.pbkdf2Sync(password, salt, 600_000, 64, "sha256");',
          "",
          "// ✅ робота в threadpool, event loop вільний",
          'const pbkdf2 = util.promisify(crypto.pbkdf2);',
          'const hash = await pbkdf2(password, salt, 600_000, 64, "sha256");',
          "",
          "// ❌ ReDoS: 28 символів «a» і «!» — ≈ 8 с, кожен наступний символ множить час",
          '/^(\\w+)*$/.test("a".repeat(28) + "!");',
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Асинхронні API і worker_threads повністю знімають проблему для CPU-роботи, яку можна винести.",
      "− Нарізання на частини ускладнює код і трохи збільшує загальний час задачі — зате інші запити не чекають.",
      "− Жодна обгортка в Promise не робить синхронний код асинхронним.",
    ],
    numbers: [
      "pbkdf2Sync із 600 000 ітерацій SHA-256 — ≈ 200–400 мс CPU на сучасному ядрі.",
      "JSON.parse 20 МБ — ≈ 100+ мс; парсинг лінійний, тож 200 МБ — секунда й більше.",
      "Kubernetes за замовчуванням: timeoutSeconds 1, failureThreshold 3 — три поспіль блокування по секунді, і liveness перезапускає под.",
    ],
    interview: [
      "Як знайти, що саме блокує event loop на проді?",
      "Чому `async function hash() { return pbkdf2Sync(...) }` не допомагає?",
    ],
    frontendBridge:
      "Це long task, тільки на сервері. Обробник понад 50 мс у браузері блокує рендер і псує INP; у Node «кадрів» немає, але довгий таск так само зупиняє все інше — і страждають не пікселі одного користувача, а запити тисяч.",
    see: ["event-loop", "profiling", "worker-threads-cluster", "libuv-threadpool"],
  },

  profiling: {
    title: "Профілювання CPU і моніторинг event loop",
    aliases: ["profiling", "профілювання", "flame graph", "--cpu-prof", "clinic", "0x", "ELU", "monitorEventLoopDelay", "event loop lag", "inspector"],
    summary:
      "Метрики event loop lag і ELU кажуть, що цикл зайнятий; CPU-профіль і flame graph — чим саме. Спершу вимірюйте, потім виправляйте.",
    how:
      "perf_hooks дає два вбудовані сигнали. monitorEventLoopDelay() — гістограма затримок циклу в наносекундах (percentile(99), max, mean): якщо p99 стрибнув із 5 до 900 мс, цикл щось блокує. performance.eventLoopUtilization() — частка часу, коли цикл не простоював у poll: ELU 0.95 означає, що процес на межі, навіть якщо CPU машини лише 30% (для JS процес Node використовує одне ядро). Обидві метрики варто експортувати в моніторинг і тримати на них алерти — вони раніше за p99 показують, що процес захлинається.\n\n" +
      "CPU-профіль — це семплінг: V8 що мілісекунду (--cpu-prof-interval, за замовчуванням 1000 мкс) записує поточний стек викликів. `node --cpu-prof server.js` пише файл .cpuprofile, коли процес штатно завершується (сервер має обробити SIGINT/SIGTERM і викликати process.exit — інакше профіль не запишеться). Файл відкривають у Chrome DevTools або speedscope. На живому процесі: --inspect або сигнал SIGUSR1 (у Linux і macOS вмикає інспектор без перезапуску), далі chrome://inspect; або програмно через node:inspector (Profiler.start/stop). 0x і clinic.js (Flame, Doctor) — обгортки, що збирають профіль під навантаженням і малюють flame graph.\n\n" +
      "Як читати flame graph: кожен прямокутник — функція, під нею — хто її викликав. Ширина — частка семплів, у яких функція була в стеку разом із дочірніми; вісь X — не час: однакові стеки злиті разом. Шукайте широкі «полиці» на верхівках — функції, які самі палять CPU (self time). Якщо майже весь графік — одна полиця pbkdf2Sync чи JSON.parse під вашим хендлером, це і є блокування. У DevTools є ще flame chart — там X означає час, і видно окремі довгі виклики. Інспектор на проді — відкритий порт із повним доступом до процесу: лише через port-forward, ніколи назовні.",
    code: [
      {
        lang: "js",
        caption: "Метрики event loop для моніторингу",
        src: [
          'const { monitorEventLoopDelay, performance } = require("node:perf_hooks");',
          "",
          "const lag = monitorEventLoopDelay({ resolution: 20 });",
          "lag.enable();",
          "let last = performance.eventLoopUtilization();",
          "",
          "setInterval(() => {",
          "  const elu = performance.eventLoopUtilization(last); // дельта з минулого зрізу",
          "  last = performance.eventLoopUtilization();",
          '  metrics.gauge("event_loop_lag_p99_ms", lag.percentile(99) / 1e6);',
          '  metrics.gauge("event_loop_utilization", elu.utilization);',
          "  lag.reset();",
          "}, 10_000).unref();",
        ].join("\n"),
      },
      {
        lang: "text",
        caption: "Зняти профіль під навантаженням",
        src: [
          "# staging: профіль пишеться при штатному виході процесу",
          "node --cpu-prof --cpu-prof-dir=./profiles server.js",
          "npx autocannon -c 50 -d 20 http://localhost:3000/api/login",
          "# Ctrl+C → ./profiles/CPU.<дата>.<pid>….cpuprofile → DevTools / speedscope",
          "",
          "# живий процес: увімкнути інспектор без перезапуску",
          "kill -USR1 <pid>   # далі chrome://inspect (через port-forward)",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Семплінговий профайлер дешевий: його можна ненадовго вмикати навіть на одному поді в проді.",
      "− Профіль показує, де CPU, але не де чекання: повільний SQL у CPU-профілі не видно — для цього трейси.",
      "− Інспектор — повний доступ до процесу: лише через port-forward і на час розслідування.",
    ],
    numbers: [
      "Інтервал семплювання --cpu-prof — 1000 мкс за замовчуванням.",
      "Алерт на event loop lag p99 зазвичай ставлять на 100–200 мс протягом кількох хвилин.",
      "ELU понад 0.9 тривалий час — процес насичений, черга запитів росте.",
    ],
    interview: [
      "p99 стрибнув, база спокійна, CPU пода — 100% одного ядра. Як знайдете функцію-винуватця?",
      "Чим flame graph відрізняється від flame chart у DevTools?",
    ],
    frontendBridge:
      "Це та сама вкладка Performance, де ви шукали long tasks і зайві ререндери: стек викликів, ширина — час. Різниця лише в тому, що профілюєте ви не вкладку, а сервер під навантаженням — і винуватець зупиняє не кадр, а тисячу запитів.",
    see: ["blocking-event-loop", "event-loop", "memory-leaks", "postmortem"],
  },

  "event-emitter": {
    title: "EventEmitter: синхронні події Node",
    aliases: ["EventEmitter", "events", "on", "once", "emit", "error event", "MaxListenersExceededWarning"],
    summary:
      "Основа стрімів, сокетів і серверів у Node. emit викликає слухачів синхронно, по порядку; подія 'error' без слухача кидає виняток і валить процес.",
    how:
      "EventEmitter — це список функцій на кожне ім'я події. `emit(name, ...args)` синхронно, у порядку додавання, викликає всіх слухачів і повертає true, якщо вони були. Жодної черги й асинхронності: якщо слухач робить щось важке, emit (і код, що його викликав) чекає, а виняток у слухачі летить у код emit. Слухачі копіюються перед викликом, тож зняття чи додавання слухача під час emit на поточний виклик не впливає.\n\n" +
      "'error' — особлива подія: якщо на неї немає жодного слухача, emit('error', err) кидає err. Для сокета чи стріму це uncaught exception і падіння процесу — тому на кожен сокет, стрім і клієнт бази, які ви створюєте, треба вішати обробник 'error'. Відхилений проміс асинхронного слухача емітер за замовчуванням не бачить — це unhandled rejection (опція captureRejections перенаправляє такі відхилення в 'error').\n\n" +
      "Слухач на довгоживучому емітері (шина подій, клієнт Redis, process) тримає посилання на все, що захопив у замикання. Додавати слухача на кожен запит і не знімати — це витік пам'яті; Node попереджає MaxListenersExceededWarning, коли на одну подію назбирається понад 10 слухачів. Для одноразових подій є `events.once(emitter, name)` — проміс, що відхиляється, якщо раніше прийде 'error'.",
    code: [
      {
        lang: "js",
        caption: "emit синхронний; once як проміс",
        src: [
          'const { EventEmitter, once } = require("node:events");',
          "",
          "const bus = new EventEmitter();",
          'bus.on("order", (order) => console.log("email", order.id));',
          'bus.on("order", (order) => console.log("analytics", order.id));',
          "",
          'console.log("до emit");',
          'bus.emit("order", { id: 7 }); // обидва слухачі — тут, у цьому стеку',
          'console.log("після emit");',
          "",
          "// усередині async-функції: чекати подію, 'error' відхилить проміс",
          'const [socket] = await once(server, "connection");',
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Простий і швидкий механізм: жодних черг, слухачі виконуються одразу.",
      "− Синхронність — пастка: важкий слухач гальмує того, хто емітить, а виняток у слухачі летить у код emit.",
      "− Забутий off на довгоживучому емітері — класичний витік пам'яті.",
    ],
    numbers: ["MaxListenersExceededWarning — після 10 слухачів на одну подію (EventEmitter.defaultMaxListeners)."],
    interview: [
      "Що станеться, якщо стрім емітить 'error', а слухача немає?",
      "emit синхронний чи асинхронний? Що буде, якщо слухач кине виняток?",
    ],
    frontendBridge:
      "Це addEventListener з DOM, тільки без спливання: dispatchEvent у браузері теж викликає слухачів синхронно. А витік через забутий off на кожен запит — та сама помилка, що й addEventListener у useEffect без cleanup.",
    see: ["streams-backpressure", "memory-leaks", "async-errors"],
  },

  "streams-backpressure": {
    title: "Стріми і backpressure",
    aliases: ["streams", "стріми", "backpressure", "highWaterMark", "drain", "pipeline", "Writable", "Readable"],
    summary:
      "write() повертає false, коли внутрішній буфер досяг highWaterMark: це прохання почекати 'drain'. Хто його ігнорує, тримає в пам'яті все, що ще не прийняв повільний клієнт.",
    how:
      "Стрім обробляє дані частинами (чанками), не завантажуючи їх у пам'ять цілком: файл на 5 ГБ віддається клієнту через буфер у десятки кілобайтів. Але швидкості різні: диск читає гігабайт за секунду, мобільний клієнт приймає мегабайт. Backpressure — механізм, яким повільний споживач каже швидкому виробникові «зачекай».\n\n" +
      "У Writable є буфер розміром highWaterMark (у Node 22 — 64 КіБ для байтових стрімів, 16 об'єктів в objectMode). write() завжди приймає чанк у буфер, але повертає false, коли буфер повний. Правильна реакція — перестати писати (і читати джерело) до події 'drain'. Сам write() не відмовляє і не гальмує: код, що ігнорує false, просто роздуває буфер — так віддача великого експорту повільному клієнту з'їдає гігабайти RAM і закінчується OOM.\n\n" +
      "На практиці backpressure руками пишуть рідко: `await pipeline(source, transform, dest)` з node:stream/promises сам чекає 'drain', передає помилки й знищує всі стріми ланцюжка, якщо один упав (старий .pipe() помилок не передає й лишає відкриті дескриптори). Readable — async iterable, тож `for await (const chunk of readable)` теж поважає backpressure: наступний чанк читається, лише коли ви обробили попередній.",
    code: [
      {
        lang: "js",
        caption: "Експорт на гігабайти з пам'яттю в кілобайти",
        src: [
          'const { pipeline } = require("node:stream/promises");',
          'const { createReadStream } = require("node:fs");',
          'const { createGzip } = require("node:zlib");',
          "",
          'app.get("/export", async (req, res) => {',
          '  res.setHeader("Content-Encoding", "gzip");',
          "  try {",
          '    await pipeline(createReadStream("export.csv"), createGzip(), res);',
          "  } catch (err) {",
          '    req.log.warn({ err }, "export aborted"); // клієнт пішов — pipeline усе прибрав',
          "  }",
          "});",
        ].join("\n"),
      },
      {
        lang: "js",
        caption: "Той самий принцип вручну",
        src: [
          "for await (const chunk of source) {",
          '  if (!dest.write(chunk)) await once(dest, "drain");',
          "}",
          "dest.end();",
          'await once(dest, "finish");',
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Пам'ять не залежить від розміру даних — лише від highWaterMark і кількості стрімів.",
      "− Ручна робота з 'drain' і помилками — джерело витоків; pipeline() закриває більшість пасток.",
      "− Великий highWaterMark пришвидшує передачу, але множиться на кількість одночасних клієнтів.",
    ],
    numbers: [
      "highWaterMark за замовчуванням у Node 22: 64 КіБ для байтових стрімів, 16 об'єктів для objectMode.",
      "1000 повільних клієнтів × 64 КіБ — ~64 МБ; без backpressure — стільки, скільки встигне прочитати диск.",
    ],
    interview: [
      "Що означає false, повернутий із write()? Що буде, якщо його ігнорувати?",
      "Чому pipeline() кращий за .pipe()?",
    ],
    frontendBridge:
      "У браузері той самий механізм живе в Streams API: у WritableStream є desiredSize, а `await writer.ready` — це 'drain' у світі Web Streams. Коли React стрімить HTML через renderToPipeableStream, він так само чекає 'drain', якщо з'єднання користувача не встигає.",
    see: ["event-emitter", "memory-leaks", "http-handler"],
  },

  "async-errors": {
    title: "Помилки в асинхронному коді",
    aliases: ["unhandled rejection", "uncaughtException", "unhandledRejection", "try catch async", "асинхронні помилки", "падіння процесу"],
    summary:
      "try/catch ловить лише синхронні винятки й відхилення, на які ви чекаєте через await. Помилка в колбеку таймера — uncaught exception; відхилений проміс без обробника з Node 15 валить процес із кодом 1.",
    how:
      "try/catch працює, поки помилка летить у тому самому стеку викликів. `try { setTimeout(() => { throw err }) } catch {}` не ловить нічого: колбек виконається пізніше, в іншому стеку, і помилка стане uncaught exception. Так само `try { loadUser() } catch {}` без await: async-функція не кидає, а повертає відхилений проміс, і try уже завершився. З await — ловить: продовження функції виконується всередині try.\n\n" +
      "Якщо відхилений проміс так і не отримав обробника (catch, then із другим аргументом, await у try), Node генерує подію 'unhandledRejection'. З Node 15 за замовчуванням діє режим --unhandled-rejections=throw: без підписника на цю подію відхилення стає uncaught exception, процес друкує стек у stderr і завершується з кодом 1. Перевірка відбувається після того, як спорожніє черга мікрозадач, тож обробник, доданий у тій самій синхронній ділянці коду, встигає.\n\n" +
      "process.on('uncaughtException') — не спосіб «продовжити роботу», а останній шанс записати лог і метрику: стан процесу після невідомого винятку невизначений (напіввідкриті транзакції, зламані інваріанти). Стратегія: ловити помилку якомога ближче до джерела (await у try, 'error' на кожному стрімі), а для решти — залогувати, перестати приймати з'єднання й вийти з кодом 1, щоб оркестратор підняв чистий процес. Express 4 не бачить відхилень async-хендлерів (потрібна обгортка чи next(err)); Express 5 передає їх в error middleware сам.",
    code: [
      {
        lang: "js",
        caption: "Що ловиться, а що — ні",
        src: [
          'async function loadUser() { throw new Error("db down"); }',
          "",
          "try { loadUser(); } catch { /* ніколи: без await проміс просто відхилений */ }",
          "",
          "async function handler() {",
          "  try { await loadUser(); } catch (err) { /* ловиться: await у try */ }",
          "}",
          "",
          "loadUser().catch((err) => log.error(err)); // оброблено",
          'process.on("exit", (code) => console.log("exit", code));',
          "// перший loadUser() без обробника → стек у stderr, exit 1",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Падіння на unhandled rejection робить помилки видимими, а не тихо зіпсованими даними.",
      "− Один забутий await у фоновій задачі кладе весь процес і всі його запити.",
      "− Глобальний обробник, що «ковтає» помилки, приховує баги й лишає процес у невизначеному стані.",
    ],
    numbers: ["Node 15+: --unhandled-rejections=throw за замовчуванням, код виходу — 1."],
    interview: [
      "Чому try/catch не ловить помилку з setTimeout? А помилку async-функції без await?",
      "Що робити в process.on('uncaughtException')?",
    ],
    frontendBridge:
      "У браузері невідловлений reject — лише червоний рядок у консолі й подія unhandledrejection у window: вкладка живе далі. На сервері той самий забутий catch вбиває процес разом із запитами інших користувачів. Error Boundary в React теж не ловить помилок з обробників подій і async-коду — з тієї ж причини: інший стек.",
    see: ["event-emitter", "promise-concurrency", "api-errors"],
  },

  "promise-concurrency": {
    title: "Конкурентність промісів: all, allSettled і ліміти",
    aliases: ["Promise.all", "allSettled", "Promise.race", "Promise.any", "p-limit", "concurrency", "конкурентність", "mapLimit"],
    summary:
      "Promise.all запускає все одразу й відхиляється на першій помилці, не скасовуючи решти. Для сотень задач потрібен ліміт одночасних викликів — інакше ви покладете пул бази чи чужий API.",
    how:
      "Проміс — це вже запущена робота: `items.map(fetchUser)` стартує всі запити в момент виклику, а Promise.all лише чекає. Promise.all виконується, коли виконались усі, і відхиляється на першій помилці — але решта запитів працює далі, їх ніхто не скасує. allSettled чекає всіх і повертає статуси, race — першого, хто завершився, any — першого успішного.\n\n" +
      "10 000 id через Promise.all — це 10 000 одночасних запитів: пул node-postgres (10 з'єднань за замовчуванням) вишикує їх у чергу, таймаути почнуть спрацьовувати раніше за роботу, чужий API відповість 429, а пам'ять заповнять проміси й буфери. Рішення — пул із лімітом: N «воркерів» беруть наступний елемент, щойно звільнились (p-limit, p-map з concurrency). Пачки по N через Promise.all гірші: кожна пачка чекає найповільнішу задачу, і слоти простоюють.\n\n" +
      "Для скасування — AbortController: сигнал передається у fetch, запит до бази чи власну функцію, і після першої помилки решту можна зупинити, а не лише проігнорувати. Для послідовної обробки (порядок важливий або API не терпить паралелізму) — звичайний for...of з await. А `forEach(async …)` не чекає нічого: forEach ігнорує повернені проміси.",
    code: [
      {
        lang: "js",
        caption: "Ліміт конкурентності замість фан-ауту",
        src: [
          "// ❌ 10 000 одночасних запитів до бази",
          "const users = await Promise.all(ids.map((id) => db.findUser(id)));",
          "",
          "// ✅ не більше 8 одночасно, порядок результатів збережено",
          'import pLimit from "p-limit";',
          "const limit = pLimit(8);",
          "const users = await Promise.all(ids.map((id) => limit(() => db.findUser(id))));",
          "",
          "// ❌ forEach не чекає: відповідь піде раніше, ніж запишуться замовлення",
          "orders.forEach(async (order) => { await db.save(order); });",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Паралелізм різко скорочує час: 100 незалежних запитів по 50 мс із лімітом 10 — ~0.5 с замість 5 с.",
      "− Без ліміту паралелізм перетворюється на DDoS власної бази чи партнерського API.",
      "− Promise.all не скасовує решту: після першої помилки робота й побічні ефекти тривають.",
    ],
    numbers: [
      "Пул node-postgres за замовчуванням — 10 з'єднань.",
      "100 задач по 50 мс: із лімітом 10 — ≈ 500 мс; послідовно — 5 с.",
    ],
    interview: [
      "Чим Promise.all відрізняється від allSettled? Що відбувається з рештою промісів після першої помилки?",
      "Як обробити 10 000 елементів через зовнішній API, що витримує 20 одночасних запитів?",
    ],
    frontendBridge:
      "Браузер обмежує вас сам: 6 з'єднань на домен у HTTP/1.1, решта fetch чекає. На сервері такого запобіжника немає — ліміт ставите ви. А десятки useQuery на одній сторінці — той самий фан-аут, тільки на бекенді він множиться на кількість користувачів.",
    see: ["async-errors", "libuv-threadpool", "event-loop"],
  },

  "memory-leaks": {
    title: "Витоки пам'яті в Node",
    aliases: ["memory leak", "витік пам'яті", "heap snapshot", "OOM", "OOMKilled", "heapUsed", "RSS", "GC", "WeakMap"],
    summary:
      "У довгоживучому процесі все, що досяжне з глобального стану, живе вічно: кеш без ліміту, слухач на кожен запит, забутий setInterval, замикання з великим буфером. Знаходять витоки порівнянням heap snapshot.",
    how:
      "Сервер живе тижнями, і кожен запит, що лишає по собі хоч кілобайт у досяжному стані, за мільйон запитів дає гігабайт. GC прибирає лише недосяжне: якщо об'єкт тримає Map у модулі, масив у глобальній змінній, слухач на process чи на довгоживучому емітері, активний таймер чи замикання, яке все це захопило, — він живе. Симптом — heapUsed росте «пилкою» з дедалі вищими мінімумами, GC працює частіше (і з'їдає CPU), а закінчується все «JavaScript heap out of memory» чи OOMKilled від Kubernetes.\n\n" +
      "Класика: кеш у Map без ліміту й TTL (гірше — з ключем від даних користувача: кожен utm-параметр — новий запис); bus.on на кожен запит без off; setInterval, створений у хендлері й ніколи не очищений (тримає замикання з req/res); замикання, що захопило весь буфер, хоча потрібна лише його довжина; масиви «для дебагу» в глобальному стані. Лікування: LRU з max і ttl, зняття слухачів і таймерів на req.on('close'), WeakMap для метаданих, прив'язаних до об'єктів, копіювання в замикання лише потрібних полів.\n\n" +
      "Діагностика: метрики process.memoryUsage() (rss, heapUsed, external) у моніторингу; потім два-три heap snapshot з інтервалом під навантаженням (--heapsnapshot-signal=SIGUSR2, v8.writeHeapSnapshot() або DevTools → Memory) і режим Comparison: які конструктори множаться і хто їх тримає (Retainers). Знімок синхронний: він зупиняє процес на секунди й потребує приблизно вдвічі більше пам'яті, ніж займає купа, — знімайте на поді, виведеному з балансування. --heapsnapshot-near-heap-limit=N пише знімок автоматично перед OOM.",
    code: [
      {
        lang: "js",
        caption: "Межа для кешу і прибирання за запитом",
        src: [
          "// ❌ ключ — повний URL: кожен ?utm=… — новий запис, назавжди",
          "const cache = new Map();",
          "",
          "// ✅ LRU з межею й часом життя",
          'const { LRUCache } = require("lru-cache");',
          "const cache = new LRUCache({ max: 5_000, ttl: 60_000 });",
          "",
          "// ✅ слухачі й таймери запиту знімаються разом із запитом",
          'req.on("close", () => {',
          '  bus.off("price", onPrice);',
          "  clearInterval(ping);",
          "});",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ LRU і WeakMap знімають більшість витоків без зміни архітектури.",
      "− Heap snapshot на проді дорогий: пауза на секунди й подвійна пам'ять.",
      "− Рестарт подів «лікує» витік симптоматично й ховає його до наступного піку.",
    ],
    numbers: [
      "Витік 1 КБ на запит при 500 RPS — ≈ 1.8 ГБ на годину.",
      "Heap snapshot потребує пам'яті приблизно вдвічі більше за поточну купу.",
      "У контейнері --max-old-space-size зазвичай ставлять на ~75% ліміту пам'яті, лишаючи місце буферам поза купою.",
    ],
    interview: [
      "RSS росте, а heapUsed — ні. Що це може бути?",
      "Як знайти витік на проді, не поклавши сервіс?",
    ],
    frontendBridge:
      "Той самий Memory-таб DevTools і ті самі причини: addEventListener без cleanup у useEffect, setInterval без clearInterval, замикання в глобальному store. Різниця в масштабі часу: вкладку закривають за годину, а процес на сервері живе тижнями й накопичує витоки всіх користувачів.",
    see: ["event-emitter", "profiling", "streams-backpressure"],
  },

  "worker-threads-cluster": {
    title: "worker_threads, cluster і child_process",
    aliases: ["worker_threads", "cluster", "child_process", "Piscina", "багатоядерність", "fork", "multi-core"],
    summary:
      "Один процес Node — одне ядро для JS. cluster множить процеси на одному порту, worker_threads дає окремі потоки з власним event loop для CPU-роботи, child_process запускає зовнішні програми.",
    how:
      "worker_threads запускає окремий V8-ізолят із власним event loop у тому самому процесі. Дані передаються через postMessage (structured clone — копіювання); ArrayBuffer можна передати без копіювання (transferList), SharedArrayBuffer — розділити. Воркер стартує десятки мілісекунд і має власну купу, тому працюють пулом (Piscina): N воркерів за кількістю ядер і черга задач із лімітом. Це правильний інструмент для CPU-роботи в межах сервісу — ресайз на чистому JS, парсинг великих файлів, генерація PDF: головний потік лишається вільним для запитів і health check.\n\n" +
      "cluster форкає кілька процесів Node, що слухають один порт; primary розподіляє з'єднання (round-robin на всіх платформах, крім Windows). Кожен воркер — повний процес зі своєю пам'яттю й без спільного стану (сесії й кеші — у Redis). cluster множить пропускну здатність, але від блокування не рятує: важкий запит так само зупиняє свій процес і всі запити, що на нього потрапили. child_process (spawn, execFile, fork) — для зовнішніх програм (ffmpeg, ImageMagick) чи повної ізоляції; процес на кожен запит — дорогий старт і непередбачувана пам'ять.\n\n" +
      "У Kubernetes cluster часто не потрібен: один процес на под і горизонтальне масштабування простіші для лімітів пам'яті, health check і graceful shutdown. os.availableParallelism() каже, скільки паралельних потоків ОС рекомендує процесу; у контейнері звіряйте це з CPU-лімітом пода.",
    code: [
      {
        lang: "js",
        caption: "Робота у воркері (для ілюстрації — у проді пул із лімітом черги)",
        src: [
          "// main.js",
          'const { Worker } = require("node:worker_threads");',
          "",
          "function runInWorker(file, data) {",
          "  return new Promise((resolve, reject) => {",
          "    const worker = new Worker(file, { workerData: data });",
          '    worker.once("message", resolve);',
          '    worker.once("error", reject);',
          "  });",
          "}",
          "",
          "// resize.js — власний event loop, головний потік вільний",
          'const { parentPort, workerData } = require("node:worker_threads");',
          "parentPort.postMessage(resizeSync(workerData.image, workerData.width));",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Пул worker_threads ізолює CPU-роботу: легкі запити й health check не чекають важких.",
      "+ cluster чи більше подів майже лінійно множать пропускну здатність I/O-сервісу.",
      "− Передача даних у воркер — копіювання (крім transfer і SharedArrayBuffer): для дрібних задач накладні витрати більші за виграш.",
      "− Процес на запит (child_process) — десятки мілісекунд старту й десятки мегабайтів пам'яті на кожен.",
    ],
    numbers: [
      "Старт worker_thread — ~20 мс і більше; тому пул, а не воркер на запит.",
      "Порожній процес Node — ~40–50 МБ RSS.",
    ],
    interview: [
      "Коли worker_threads, а коли cluster? Чому cluster не рятує від CPU-важкого хендлера?",
      "Як передати великий масив у воркер без копіювання?",
    ],
    frontendBridge:
      "worker_threads — це Web Workers для сервера: той самий postMessage, structured clone і transfer. Якщо ви виносили парсинг CSV чи підсвітку коду у Web Worker, щоб не гальмував UI, — тут та сама ідея, тільки «UI» — це тисячі запитів.",
    see: ["blocking-event-loop", "libuv-threadpool", "event-loop"],
  },

  "esm-cjs": {
    title: "ESM і CommonJS у Node 22",
    aliases: ["ESM", "CommonJS", "require", "import", "type module", "mjs", "cjs", "require(esm)", "import.meta.dirname"],
    summary:
      "Дві модульні системи: синхронний require і асинхронний import. Тип файлу визначають .mjs/.cjs або поле \"type\" у package.json — і від цього залежать __dirname, top-level await і навіть порядок nextTick відносно промісів.",
    how:
      "CommonJS (require, module.exports) — історична система Node: модуль завантажується й виконується синхронно в момент require, експорти — звичайний об'єкт. ES-модулі (import/export) — стандарт мови: граф залежностей розбирається статично й завантажується асинхронно, експорти — живі зв'язування, доступний top-level await. Як трактувати .js, Node вирішує за найближчим package.json: \"type\": \"module\" — ESM, інакше CommonJS; .mjs і .cjs завжди однозначні.\n\n" +
      "Відмінності, що ламають код: в ESM немає __dirname, __filename і require — є import.meta.dirname, import.meta.filename (Node 20.11+) і createRequire. Шлях в import пишуть із розширенням. import CommonJS-модуля з ESM працює (module.exports стає default); зворотний напрямок довго був неможливий, але з Node 22.12 require() синхронного ES-модуля (без top-level await) працює без прапорця.\n\n" +
      "Тонкість для predict-задач: головний ES-модуль виконується як асинхронна задача, тож мікрозадачі, заплановані на його верхньому рівні, спрацьовують раніше за process.nextTick. У CommonJS навпаки — nextTick першим. Тому всі сніпети цієї гри запускаються як CommonJS, а в продакшн-коді на порядок між nextTick і промісами не покладаються взагалі.",
    code: [
      {
        lang: "js",
        caption: "Один код, два порядки",
        src: [
          'process.nextTick(() => console.log("nextTick"));',
          'Promise.resolve().then(() => console.log("promise"));',
          "",
          "// node script.cjs → nextTick, promise",
          "// node script.mjs → promise, nextTick",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ ESM — стандарт: однаковий синтаксис у браузері, бандлерах і Node, статичний аналіз для tree-shaking.",
      "− Змішаний проєкт (ESM-застосунок, CJS-залежності, TS, що компілює в одне з двох) — джерело ERR_REQUIRE_ESM і подвійних екземплярів пакета.",
      "− Поведінка на верхньому рівні модуля відрізняється — тести мають запускатися в тому ж режимі, що й прод.",
    ],
    interview: [
      "Чим import відрізняється від require? Чому в ESM немає __dirname?",
      "Як підключити ESM-only пакет у CommonJS-проєкті на Node 22?",
    ],
    frontendBridge:
      "Ви пишете import усе життя, але в браузері й бандлері він поводиться м'якше: Vite і webpack самі розв'язують шляхи без розширень і змішують CJS з ESM. Node суворіший: розширення обов'язкові, тип модуля — з package.json. Звідси половина помилок «у Next працює, а в скрипті падає».",
    see: ["microtasks", "event-loop"],
  },
};
