/** Статті довідника акту «Мережа та HTTP». */

export const CODEX = {
  "tcp-basics": {
    title: "TCP: з'єднання, рукостискання, FIN і RST",
    aliases: ["TCP", "three-way handshake", "SYN", "FIN", "RST", "ECONNRESET", "TIME_WAIT", "slow start"],
    summary:
      "TCP дає застосунку впорядкований надійний потік байтів поверх ненадійної мережі. Ціна — рукостискання на старті, черговість (одна втрата гальмує все, що за нею) і стан з'єднання на обох кінцях.",
    how:
      "Перш ніж передати бодай байт, клієнт і сервер обмінюються SYN → SYN-ACK → ACK: це 1 RTT до першого запиту. Далі кожен сегмент пронумеровано, отримувач підтверджує прийняте, втрачене пересилається. Застосунку ядро віддає байти строго по порядку: якщо загубився сегмент №5, уже отримані №6–№9 чекають у буфері, доки №5 не прийде вдруге. Це head-of-line blocking на рівні транспорту — і саме він гальмує всі потоки HTTP/2 на поганій мережі.\n\n" +
      "Закрити з'єднання можна двома способами. FIN — ввічливе «я більше нічого не надішлю»: інша сторона дочитує дані й закриває свій бік. RST — аварійне «такого з'єднання немає»: його шле ядро, коли дані приходять на вже закритий сокет. У Node це `ECONNRESET` або «socket hang up», у nginx — «Connection reset by peer», у curl — «Empty reply from server» чи «Recv failure». Та сторона, що закрила першою, ще деякий час тримає сокет у TIME_WAIT (у Linux — 60 с), тож тисячі коротких з'єднань до одного upstream можуть вичерпати ефемерні порти.\n\n" +
      "Нове з'єднання ще й повільне: TCP стартує з маленького вікна перевантаження (initcwnd — 10 сегментів, ≈14 КБ) і розганяється в міру підтверджень. Тому бекенд перевикористовує з'єднання — keep-alive до балансувальника, пул до бази, агент з keepAlive для вихідних запитів — і не платить за рукостискання й «розгін» на кожен запит.",
    code: [
      {
        lang: "text",
        caption: "tcpdump: запит «наздогнав» FIN — і отримав RST",
        src: [
          "10:00:00.000  lb → node  [SYN]",
          "10:00:00.001  node → lb  [SYN, ACK]",
          "10:00:00.001  lb → node  [ACK]                 ← 1 RTT, можна слати дані",
          "10:00:00.002  lb → node  [PSH] GET /api/orders HTTP/1.1",
          "10:00:00.030  node → lb  [PSH] HTTP/1.1 200 OK  (Keep-Alive: timeout=5)",
          "   … тиша …",
          "10:00:05.030  node → lb  [FIN, ACK]            ← Node закрив простійне з'єднання",
          "10:00:05.030  lb → node  [PSH] GET /api/cart   ← балансувальник ще не бачив FIN",
          "10:00:05.031  node → lb  [RST]                 ← сокет закрито: ядро скидає",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Надійність і порядок байтів застосунок отримує безкоштовно.",
      "− Черговість: одна втрата гальмує всі дані за нею — і всі потоки HTTP/2 на цьому з'єднанні.",
      "− Нове з'єднання дороге: RTT на рукостискання плюс slow start. Звідси пули й keep-alive.",
    ],
    numbers: [
      "Рукостискання — 1 RTT: < 1 мс у межах дата-центру, 30–40 мс Київ ↔ Франкфурт, 80–120 мс Європа ↔ США.",
      "initcwnd у Linux — 10 сегментів ≈ 14 КБ: відповідь до цього розміру долітає за один RTT.",
      "TIME_WAIT у Linux — 60 с.",
    ],
    interview: [
      "Чим FIN відрізняється від RST? Коли клієнт бачить ECONNRESET?",
      "Чому перший запит на новому з'єднанні повільніший за наступні, навіть якщо сервер відповідає однаково?",
    ],
    frontendBridge:
      "DevTools → Network → Timing: Initial connection — це TCP-рукостискання (для https разом із TLS). А `TypeError: Failed to fetch` без жодного статусу часто означає саме RST чи обрив: HTTP-відповіді просто не було, тому й `res.status` немає звідки взяти.",
    see: ["tls", "keep-alive", "http-versions"],
  },

  tls: {
    title: "TLS 1.3: рукостискання, сертифікати, 0-RTT",
    aliases: ["TLS", "HTTPS", "SSL", "handshake", "SNI", "ALPN", "0-RTT", "сертифікат", "forward secrecy"],
    summary:
      "TLS 1.3 домовляється про ключі за один обмін: ClientHello з key share → ServerHello → зашифровані сертифікат, CertificateVerify і Finished. Разом із TCP — 2 RTT до першого байта запиту; 0-RTT швидше, але його дані можна повторити.",
    how:
      "Клієнт шле ClientHello: версії, набори шифрів, SNI (ім'я сервера — відкритим текстом, щоб балансувальник знав, який сертифікат показати), ALPN (`h2`, `http/1.1`) і одразу key_share — свою половину ефемерного обміну ключами (зазвичай X25519). Сервер відповідає ServerHello зі своїм key share, і з цієї миті обидві сторони мають ключі рукостискання. Усе далі вже зашифровано: EncryptedExtensions (зокрема обраний ALPN), Certificate, CertificateVerify — підпис усього діалогу приватним ключем сертифіката (доказ, що сервер цим ключем володіє), і Finished — MAC над усім діалогом (доказ, що ніхто нічого не підмінив).\n\n" +
      "Клієнт перевіряє ланцюжок сертифікатів до довіреного кореня, ім'я хоста й термін дії, відповідає своїм Finished — і в тому ж польоті може слати HTTP-запит. Отже TLS 1.3 коштує 1 RTT (TLS 1.2 — 2). Якщо клієнт не вгадав групу ключів, сервер шле HelloRetryRequest — ще +1 RTT.\n\n" +
      "Після рукостискання сервер видає session ticket. Наступного разу клієнт може відновити сесію через PSK і навіть надіслати early data (0-RTT) разом із ClientHello. Але 0-RTT-дані зловмисник може перехопити й відправити ще раз — тому лише для ідемпотентних запитів. RFC 8470 дає серверу заголовок `Early-Data: 1` і статус 425 Too Early, щоб попросити клієнта повторити запит уже після рукостискання.\n\n" +
      "На проді TLS зазвичай завершується на балансувальнику чи CDN (ALB, nginx, Cloudflare), а до Node всередині мережі йде звичайний HTTP або окреме шифрування (mTLS між сервісами). Ефемерні ключі дають forward secrecy: викрадений приватний ключ сервера не розшифрує вчорашній записаний трафік.",
    code: [
      {
        lang: "text",
        caption: "curl -v: рукостискання TLS 1.3 крок за кроком",
        src: [
          "* ALPN: curl offers h2,http/1.1",
          "* TLSv1.3 (OUT), TLS handshake, Client hello (1):",
          "* TLSv1.3 (IN), TLS handshake, Server hello (2):",
          "* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):",
          "* TLSv1.3 (IN), TLS handshake, Certificate (11):",
          "* TLSv1.3 (IN), TLS handshake, CERT verify (15):",
          "* TLSv1.3 (IN), TLS handshake, Finished (20):",
          "* TLSv1.3 (OUT), TLS handshake, Finished (20):",
          "* SSL connection using TLSv1.3 / TLS_AES_128_GCM_SHA256",
          "* ALPN: server accepted h2",
          "*  subject: CN=api.shop.ua",
          '*  subjectAltName: host "api.shop.ua" matched cert\'s "api.shop.ua"',
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ 1 RTT замість 2 у TLS 1.2, а сертифікат іде вже зашифрованим.",
      "+ Forward secrecy обов'язкова: лише ефемерний обмін ключами.",
      "− 0-RTT дані можна повторити (replay) — лише для ідемпотентних запитів, і сервер має право їх відхилити.",
      "− SNI іде відкритим текстом (поки не поширився ECH): мережа бачить домен, хоч і не бачить шлях.",
    ],
    numbers: [
      "Нове з'єднання: TCP + TLS 1.3 = 2 RTT до першого байта запиту; з TLS 1.2 — 3 RTT.",
      "Сертифікати Let's Encrypt живуть 90 днів — продовження має бути автоматичним.",
    ],
    interview: [
      "Опишіть рукостискання TLS 1.3. Що доводить CertificateVerify, а що — Finished?",
      "Чому 0-RTT небезпечний для POST /payments і що з цим робить сервер?",
    ],
    frontendBridge:
      "DevTools → Security показує протокол, шифр і сертифікат; Network → Timing → SSL — час рукостискання. `NET::ERR_CERT_*` означає не «бекенд упав», а «браузер не повірив сертифікату»: прострочений, не той домен, неповний ланцюжок.",
    see: ["tcp-basics", "http-versions", "request-lifecycle"],
  },

  "http-anatomy": {
    title: "Анатомія HTTP-запиту і відповіді на дроті",
    aliases: ["HTTP/1.1", "start line", "заголовки", "Content-Length", "chunked", "Transfer-Encoding", "curl -v", "HTTP/2 frames", "request smuggling"],
    summary:
      "HTTP/1.1 — це текст: стартовий рядок, заголовки, порожній рядок, тіло. Де тіло закінчується, каже Content-Length або chunked. HTTP/2 передає ту саму семантику бінарними фреймами HEADERS і DATA в потоках одного з'єднання.",
    how:
      "Запит починається рядком `GET /api/orders?page=2 HTTP/1.1`: метод, ціль, версія. Далі рядки `Ім'я: значення`, кожен закінчується CRLF; `Host` обов'язковий. Порожній рядок завершує заголовки, після нього — тіло. Відповідь так само: `HTTP/1.1 201 Created`, заголовки, порожній рядок, тіло. Текст після коду (reason phrase) — прикраса: клієнти читають лише число. Імена заголовків нечутливі до регістру — Node віддає їх у `req.headers` у нижньому.\n\n" +
      "Щоб перевикористати з'єднання, отримувач мусить точно знати, де закінчилось тіло. `Content-Length: 21` — рівно 21 байт. `Transfer-Encoding: chunked` — коли розмір наперед невідомий (стрімінг): шматки `<розмір hex>\\r\\n<байти>\\r\\n`, у кінці `0\\r\\n\\r\\n`. Node сам ставить Content-Length, якщо все тіло передано в `res.end(body)`, і переходить на chunked, якщо ви пишете частинами через `res.write()`. Content-Length, що не збігається з тілом, — клієнт або висить, чекаючи байтів, або обрізає відповідь. А обидва заголовки разом — неоднозначність, яку проксі й сервер можуть трактувати по-різному: так працює request smuggling. RFC 9112 забороняє відправникові ставити їх разом, а отримувачу велить вважати таке повідомлення підозрілим. Відповіді 204, 304 і відповіді на HEAD тіла не мають узагалі.\n\n" +
      "HTTP/2 зберігає методи, статуси й заголовки, але міняє обгортку. Кожен запит — потік (stream) з непарним id; його заголовки йдуть фреймом HEADERS (стиснення HPACK, псевдозаголовки `:method`, `:path`, `:scheme`, `:authority`, у відповіді — `:status`), тіло — фреймами DATA, кінець — прапорцем END_STREAM. Фрейми різних потоків перемежовуються — це і є мультиплексування. Службові фрейми: SETTINGS, WINDOW_UPDATE (керування потоком), RST_STREAM (скасувати один запит, не закриваючи з'єднання), PING, GOAWAY («нових потоків більше не приймаю»). Заголовки Connection, Keep-Alive і Transfer-Encoding у HTTP/2 заборонені: межі визначають фрейми.\n\n" +
      "`curl -v` показує все це без браузера: рядки `*` — примітки curl (DNS, з'єднання, TLS, «Re-using existing connection»), `>` — заголовки, які пішли, `<` — заголовки, які прийшли; тіло — у stdout. `-i` додає заголовки відповіді до виводу, `-I` робить HEAD, `--http1.1` / `--http2` фіксують версію, `-H` додає заголовок, `-d` — тіло (і робить запит POST).",
    code: [
      {
        lang: "text",
        caption: "HTTP/1.1 на дроті: запит із Content-Length, відповідь chunked",
        src: [
          "POST /api/orders HTTP/1.1",
          "Host: api.shop.ua",
          "Content-Type: application/json",
          "Content-Length: 21",
          "",
          '{"sku":"A-1","qty":2}',
          "",
          "HTTP/1.1 201 Created",
          "Location: /api/orders/1042",
          "Content-Type: application/json",
          "Transfer-Encoding: chunked",
          "",
          "e",
          '{"id":1042,"st',
          "c",
          'atus":"new"}',
          "0",
          "",
        ].join("\n"),
      },
      {
        lang: "text",
        caption: "HTTP/2: відповіді двох запитів у одному з'єднанні, не по черзі",
        src: [
          "[stream 1] HEADERS  :method=GET :path=/api/orders :authority=api.shop.ua",
          "[stream 3] HEADERS  :method=GET :path=/api/me     :authority=api.shop.ua",
          "[stream 3] HEADERS  :status=200 content-type=application/json",
          '[stream 3] DATA     {"id":42,"name":"Оля"}            END_STREAM',
          "[stream 1] HEADERS  :status=200 content-type=application/json",
          '[stream 1] DATA     [{"id":1,"total":420},…',
          "[stream 1] DATA     …]                                END_STREAM",
        ].join("\n"),
      },
      {
        lang: "js",
        caption: "Node обирає фреймування сам",
        src: [
          "// Тіло відоме повністю → Node поставить Content-Length",
          "res.end(JSON.stringify(order));",
          "",
          "// Тіло йде частинами → Transfer-Encoding: chunked (у HTTP/1.1)",
          'res.write("[");',
          "for await (const chunk of rows) res.write(chunk);",
          'res.end("]");',
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Текстовий HTTP/1.1 читається очима, curl-ом і tcpdump — ідеально для дебагу.",
      "− Фреймування через заголовки крихке: неузгоджені Content-Length і Transfer-Encoding між проксі й сервером дають request smuggling.",
      "+ HTTP/2: бінарні фрейми однозначні, а HPACK стискає повторювані заголовки (cookie, user-agent) між запитами.",
    ],
    numbers: [
      "Типовий набір заголовків запиту з cookie — 0,5–2 КБ. У HTTP/2 повторений заголовок із динамічної таблиці HPACK кодується кількома байтами.",
      "Ліміт заголовків запиту в Node за замовчуванням — 16 КБ (`--max-http-header-size`); більше — 431 Request Header Fields Too Large.",
    ],
    interview: [
      "Як отримувач дізнається, де закінчується тіло відповіді в HTTP/1.1? А в HTTP/2?",
      "Що таке request smuggling і до чого тут Content-Length і Transfer-Encoding?",
    ],
    frontendBridge:
      "У DevTools біля Request Headers є «Raw» — це сирий HTTP/1.1; для h2 Chrome показує псевдозаголовки `:method` і `:path` — тепер зрозуміло, звідки вони. Правий клік на запиті → Copy as cURL, додайте `-v` — і побачите той самий обмін без браузера, без CORS і без кешу.",
    see: ["http-versions", "keep-alive", "http-handler", "request-lifecycle"],
  },

  "http-versions": {
    title: "HTTP/1.1, HTTP/2, HTTP/3: що змінюється насправді",
    aliases: ["HTTP/2", "HTTP/3", "QUIC", "h2", "h3", "мультиплексування", "head-of-line blocking", "Alt-Svc", "connection migration"],
    summary:
      "Семантика та сама — методи, статуси, заголовки. Змінюється транспорт: HTTP/1.1 — один запит за раз на з'єднання, HTTP/2 — багато потоків в одному TCP, HTTP/3 — незалежні потоки QUIC поверх UDP.",
    how:
      "HTTP/1.1 тримає з'єднання відкритим, але в кожний момент на ньому виконується один запит (pipelining на практиці ніхто не ввімкнув). Тому браузер відкриває до 6 з'єднань на хост, а повільна відповідь блокує наступний запит у своєму з'єднанні — head-of-line blocking на рівні HTTP. Звідси історичні хаки: доменний шардинг, спрайти, один великий бандл.\n\n" +
      "HTTP/2 (RFC 9113) пускає десятки паралельних потоків через одне TCP-з'єднання, стискає заголовки й має керування потоком для кожного потоку окремо; версія узгоджується через ALPN під час TLS (браузери говорять h2 лише по TLS). Але TCP віддає байти строго по порядку: один загублений пакет зупиняє всі потоки, доки його не перешлють. На стабільній мережі це непомітно, на мобільній з відчутними втратами — одне h2-з'єднання може програти кільком h1.\n\n" +
      "HTTP/3 (RFC 9114) працює поверх QUIC (RFC 9000) — транспорту на UDP із вбудованим TLS 1.3. Потоки незалежні вже на транспортному рівні: втрата в одному не гальмує інші. Рукостискання — 1 RTT на транспорт і шифрування разом, при відновленні — 0-RTT. З'єднання ідентифікується connection ID, а не парою IP:порт, тож перехід Wi-Fi → LTE не рве його (connection migration). Ціна: деякі корпоративні мережі ріжуть UDP, тому браузер спершу йде по h2 і дізнається про h3 із заголовка `Alt-Svc` або DNS-запису HTTPS; QUIC живе в userspace і їсть більше CPU; тулінг слабший.\n\n" +
      "Для бекенду на Node практика така: HTTP/3 і HTTP/2 завершуються на краю мережі (CDN, балансувальник), а до інстансів усередині дата-центру йде HTTP/1.1 з keep-alive — там RTT вимірюється частками мілісекунди і втрат майже немає. У Node 22 є `node:http2`, але стабільного HTTP/3-сервера немає.",
    code: [
      {
        lang: "text",
        caption: "Яку версію говорить сервер",
        src: [
          "$ curl -sI --http2 https://api.shop.ua/health | head -1",
          "HTTP/2 200",
          "$ curl -sI https://api.shop.ua/health | grep -i alt-svc",
          'alt-svc: h3=":443"; ma=86400',
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ HTTP/2: одне з'єднання замість шести, мультиплексування, стиснення заголовків.",
      "− HTTP/2 на втратах: TCP гальмує всі потоки через один загублений пакет.",
      "+ HTTP/3: незалежні потоки, 1-RTT рукостискання, міграція з'єднання між мережами.",
      "− HTTP/3: UDP блокують деякі мережі, більше CPU, слабший тулінг — fallback на h2 обов'язковий.",
    ],
    numbers: [
      "Браузер тримає до 6 HTTP/1.1-з'єднань на хост.",
      "До першого запиту: TCP + TLS 1.3 — 2 RTT, QUIC — 1 RTT, QUIC з 0-RTT — запит летить у першому ж пакеті.",
      "Типовий SETTINGS_MAX_CONCURRENT_STREAMS — 100 паралельних потоків на з'єднання.",
    ],
    interview: [
      "Чому HTTP/2 не прибрав head-of-line blocking повністю?",
      "Що таке connection migration у QUIC і кому вона допомагає найбільше?",
    ],
    frontendBridge:
      "Колонка Protocol у DevTools → Network показує h2, h3 чи http/1.1. На HTTP/1.1 waterfall іде «сходинками» по 6 запитів із сірим Queueing — це черга на вільне з'єднання; на h2 сходинки зникають. Тому бандлінг і спрайти вже не такі критичні, як у 2014-му.",
    see: ["tcp-basics", "tls", "http-anatomy", "realtime"],
  },

  cors: {
    title: "CORS: preflight, credentials і чому це не авторизація",
    aliases: ["CORS", "preflight", "OPTIONS", "Access-Control-Allow-Origin", "credentials", "same-origin policy", "Vary: Origin", "Expose-Headers"],
    summary:
      "Браузер не дає сторінці читати відповіді з чужого origin. CORS — спосіб сервера сказати «цьому origin можна». Він захищає користувача в браузері, а сам запит до сервера все одно доходить.",
    how:
      "Origin — це схема, хост і порт: `https://app.shop.ua` і `https://api.shop.ua` — різні origin. Скрипт з app може відправити запит на api, але прочитати відповідь зможе, лише якщо сервер поверне відповідний `Access-Control-Allow-Origin`. «Прості» запити (GET, HEAD, POST лише з безпечними заголовками й Content-Type `application/x-www-form-urlencoded`, `multipart/form-data` чи `text/plain`) браузер шле одразу з заголовком Origin і просто ховає відповідь, якщо дозволу немає. Для решти — PUT, DELETE, `Content-Type: application/json`, заголовок Authorization — спершу йде preflight: `OPTIONS` з `Origin`, `Access-Control-Request-Method` і `Access-Control-Request-Headers`. Лише після 2xx з потрібними Allow-* браузер відправляє справжній запит.\n\n" +
      "З `fetch(url, { credentials: \"include\" })` (cookie, HTTP-автентифікація) правила суворіші: Allow-Origin має бути точним origin, а не `*`, плюс `Access-Control-Allow-Credentials: true`; `*` в Allow-Headers і Allow-Methods теж перестає бути шаблоном. Якщо Allow-Origin залежить від Origin запиту, потрібен `Vary: Origin` — інакше CDN чи кеш браузера віддасть відповідь з чужим Allow-Origin. І ще: JS за замовчуванням бачить лише «безпечні» заголовки відповіді (Cache-Control, Content-Language, Content-Length, Content-Type, Expires, Last-Modified, Pragma); ETag чи X-Request-Id — тільки через `Access-Control-Expose-Headers`.\n\n" +
      "CORS — не авторизація. Сервер уже отримав і виконав запит; браузер лише не показав відповідь сторінці. curl, Postman і інші сервери CORS не перевіряють узагалі. «Простий» POST форми з чужого сайту дійде до вас разом із cookie (якщо дозволяє SameSite) — це CSRF, і від нього захищають SameSite-cookie, CSRF-токени й перевірка Origin на сервері, а не CORS. Найгірша помилка — дзеркалити будь-який Origin разом із credentials: так кожен сайт в інтернеті отримує право читати дані ваших користувачів. Origin `null` (sandbox-iframe, file://) теж не дозволяйте.",
    code: [
      {
        lang: "text",
        caption: "Preflight перед PUT з JSON і cookie",
        src: [
          "OPTIONS /api/orders/42 HTTP/1.1",
          "Origin: https://app.shop.ua",
          "Access-Control-Request-Method: PUT",
          "Access-Control-Request-Headers: content-type, authorization",
          "",
          "HTTP/1.1 204 No Content",
          "Access-Control-Allow-Origin: https://app.shop.ua",
          "Access-Control-Allow-Credentials: true",
          "Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE",
          "Access-Control-Allow-Headers: content-type, authorization",
          "Access-Control-Max-Age: 600",
          "Vary: Origin, Access-Control-Request-Headers",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Max-Age кешує preflight: без нього кожен PUT коштує два запити.",
      "+ Один origin для фронтенду й API (проксі `/api` чи BFF) прибирає CORS і preflight повністю.",
      "− `*` не працює з credentials, а дзеркалення будь-якого Origin — дірка в безпеці.",
      "− Preflight — додатковий RTT перед першим незакешованим «непростим» запитом.",
    ],
    numbers: [
      "Access-Control-Max-Age: без заголовка браузер кешує preflight на 5 с; Chromium обрізає значення до 7200 с, Firefox — до 86 400 с.",
    ],
    interview: [
      "Чому запит із `Content-Type: application/json` іде з preflight, а POST звичайної форми — ні?",
      "Чи захищає CORS від CSRF? Від чого він узагалі захищає?",
    ],
    frontendBridge:
      "«blocked by CORS policy: No 'Access-Control-Allow-Origin' header» з'являється в консолі браузера, але виправляють її на сервері. У Network preflight видно окремим рядком із типом preflight: якщо він упав, справжній запит навіть не відправлявся. А в коді помилка CORS — просто `TypeError: Failed to fetch`: статус JS не бачить навмисно.",
    see: ["http-caching", "http-anatomy", "api-errors"],
  },

  "http-caching": {
    title: "HTTP-кешування: Cache-Control, ETag, 304",
    aliases: ["Cache-Control", "ETag", "If-None-Match", "304 Not Modified", "no-cache", "no-store", "max-age", "stale-while-revalidate", "Vary", "conditional GET"],
    summary:
      "Cache-Control каже, хто і скільки може зберігати відповідь; ETag та If-None-Match дозволяють перепитати «чи змінилося?» і отримати 304 без тіла.",
    how:
      "Свіжість: `Cache-Control: max-age=60` — 60 с відповідь використовують без звернення до сервера. `private` — лише браузер (персональні дані), `public` і `s-maxage` — ще й спільні кеші (CDN, проксі). `no-cache` — не «не кешувати», а «зберігати можна, але перед кожним використанням перепитати сервер». `no-store` — не зберігати ніде (токени, платіжні дані). `stale-while-revalidate=60` (RFC 5861) дозволяє віддати трохи застарілу відповідь, поки у фоні йде оновлення.\n\n" +
      "Валідація: сервер дає `ETag: \"…\"` — ідентифікатор цієї версії представлення. Коли відповідь застаріла, браузер питає з `If-None-Match: \"…\"`, і якщо тег той самий, сервер відповідає 304 Not Modified без тіла, але з ETag і Cache-Control — так кеш оновлює свіжість. Сильний ETag означає побайтову ідентичність, слабкий `W/\"…\"` — смислову (скажімо, та сама сторінка з іншим стисненням). If-None-Match порівнює слабко: `W/\"x\"` збігається з `\"x\"`, а `*` — з будь-якою наявною версією. Старший механізм — `Last-Modified` / `If-Modified-Since` з точністю до секунди; якщо є If-None-Match, його ігнорують.\n\n" +
      "304 економить трафік і час передачі, але не роботу сервера — якщо ETag рахується з уже зібраної відповіді. Дешевший варіант — тег з версії даних (колонка version, `updated_at` + id). Головне — ETag мусить залежати від вмісту: тег із довжини чи часу генерації бреше, і клієнт або назавжди застряє зі старими даними, або ніколи не отримує 304. `Vary` перелічує заголовки запиту, від яких залежить відповідь (Accept-Encoding, Origin), — вони входять у ключ кешу. Персональна відповідь з `public` за CDN — це кошик одного користувача в браузері іншого.",
    code: [
      {
        lang: "text",
        caption: "Умовний GET: у клієнта вже є актуальна версія",
        src: [
          "GET /api/cart HTTP/1.1",
          'If-None-Match: "2a-9f3c1b7e"',
          "",
          "HTTP/1.1 304 Not Modified",
          'ETag: "2a-9f3c1b7e"',
          "Cache-Control: private, max-age=60",
        ].join("\n"),
      },
      {
        lang: "text",
        caption: "Рецепти Cache-Control",
        src: [
          "app.3f9a1c.js (хеш у назві)      public, max-age=31536000, immutable",
          "index.html оболонки SPA          no-cache",
          "/api/cart, /api/me               private, no-cache  + ETag",
          "/api/checkout/token              no-store",
          "/api/catalog через CDN           public, s-maxage=300, stale-while-revalidate=60",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ 304 економить трафік і час на мобільних мережах.",
      "− ETag як хеш серіалізованої відповіді не економить CPU і запит до бази — лише байти.",
      "− Помилка public/private — витік персональних даних через спільний кеш.",
      "+ Хеш у назві файлу + immutable — статика, яку ніколи не треба перевіряти.",
    ],
    numbers: [
      "max-age=31536000 — рік, стандарт для файлів із хешем у назві.",
      "304 — кілька сотень байтів заголовків замість десятків кілобайтів тіла.",
    ],
    interview: [
      "Чим no-cache відрізняється від no-store?",
      "Як згенерувати ETag для списку замовлень, не серіалізуючи його щоразу?",
    ],
    frontendBridge:
      "Колонка Size у DevTools: «(memory cache)» чи «(disk cache)» — max-age відпрацював без мережі; статус 304 — була перевірка з If-None-Match. `staleTime` у React Query — той самий max-age, тільки в пам'яті JS. А галочка Disable cache вимикає саме HTTP-кеш браузера.",
    see: ["http-anatomy", "cors", "rest-design"],
  },

  "rest-design": {
    title: "Дизайн HTTP API: ресурси, методи, статуси",
    aliases: ["REST", "API design", "safe methods", "idempotent methods", "PUT vs PATCH", "201 Created", "Location", "405", "версіонування"],
    summary:
      "URL називає ресурс, метод — дію, статус — результат. Безпечні методи нічого не змінюють, ідемпотентні дають той самий стан при повторі — від цього залежать кеші, ретраї й префетч.",
    how:
      "Ресурси — іменники: `/orders`, `/orders/42`, `/orders/42/items`. Дії — методи: GET читає, POST створює (або запускає процес), PUT замінює ресурс повністю, PATCH змінює частково, DELETE видаляє. `/getOrders` чи `/deleteUser?id=7` — це RPC, перевдягнений у HTTP: кеші, логи, шлюзи й моніторинг не можуть про нього нічого зрозуміти.\n\n" +
      "RFC 9110 ділить методи за двома властивостями. Безпечні (GET, HEAD, OPTIONS, TRACE) не змінюють стан: браузери префетчать посилання, пошукові роботи ходять по GET, CDN їх кешує — тож `GET /orders/42/cancel` рано чи пізно скасує замовлення без відома користувача. Ідемпотентні (безпечні плюс PUT і DELETE) при повторі дають той самий стан сервера — відповідь може відрізнятися (другий DELETE → 404), стан — ні. Саме тому проксі й клієнти мають право повторити PUT після обриву. POST і PATCH у загальному випадку не ідемпотентні: для безпечних повторів їм потрібен Idempotency-Key. PUT із семантикою «додай ще одну штуку» ламає контракт, на який покладаються всі ці повтори.\n\n" +
      "Статуси: 201 + Location для створення, 204 без тіла, 400 для кривого формату, 422 для бізнес-валідації, 404, 409 для конфлікту стану, 405 з Allow. 5xx — лише для збоїв сервера: валідація, що повертає 500, будить чергового і змушує клієнтів ретраїти безнадійний запит. Не віддавайте внутрішню кухню: послідовні числові id розкривають обсяги бізнесу й запрошують до перебору; ORM-сутність як є — до витоку полів. Колекції — завжди з лімітом і пагінацією, фільтри — через query (`?status=paid`), еволюція — додавання полів нічого не ламає, видалення чи перейменування — нова версія (`/v2` або заголовок).",
    code: [
      {
        lang: "text",
        caption: "Типові помилки й виправлення",
        src: [
          "✗ POST /api/createOrder             ✓ POST   /api/orders                 → 201 + Location",
          "✗ GET  /api/orders/42/delete        ✓ DELETE /api/orders/42              → 204",
          "✗ POST /api/getOrders {filter}      ✓ GET    /api/orders?status=paid&limit=20",
          '✗ 200 {"ok":false,"error":"…"}      ✓ 422 application/problem+json',
          '✗ PUT  /api/cart/items/7 {"add":1}  ✓ PUT    /api/cart/items/7 {"qty":3}  (повна заміна)',
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Передбачуваний API: кеші, ретраї, моніторинг і кодогенерація з OpenAPI працюють без спецвипадків.",
      "− Не все лягає в CRUD: дія `POST /orders/42/cancel` — нормальний компроміс, поки це POST.",
      "− Суворий REST із HATEOAS майже ніхто не робить: важливіша послідовність у межах одного API.",
    ],
    numbers: ["Ліміт сторінки: за замовчуванням 20–50, максимум 100–500 — інакше один запит вивантажує всю таблицю."],
    interview: [
      "Чим PUT відрізняється від PATCH з точки зору ідемпотентності?",
      "Чому GET із побічними ефектами — баг, навіть якщо його викликає лише ваш фронтенд?",
    ],
    frontendBridge:
      "Браузери й фреймворки префетчать посилання, React Query повторно шле GET при фокусі вікна й ретраїть його після помилки. Коли GET щось змінює, ці «безкоштовні» оптимізації фронтенду стають багами бекенду.",
    see: ["api-errors", "idempotency", "pagination"],
  },

  pagination: {
    title: "Пагінація: offset проти keyset (cursor)",
    aliases: ["pagination", "offset", "keyset", "cursor", "seek method", "infinite scroll", "LIMIT OFFSET"],
    summary:
      "OFFSET простий, але повільнішає з глибиною і дублює чи губить рядки, коли дані змінюються. Keyset-курсор («після цього ключа») стабільний і однаково швидкий на будь-якій глибині, але не вміє стрибати на сторінку N.",
    how:
      "`LIMIT 20 OFFSET 100000` змушує базу прочитати й викинути сто тисяч рядків, щоб віддати двадцять: що глибша сторінка, то повільніше, лінійно. І поки користувач гортає, нові записи зверху зсувають усе вниз: друга сторінка починається з останніх елементів першої — у стрічці дублі. Видалення зсувають навпаки — елементи мовчки пропадають.\n\n" +
      "Keyset (seek) запам'ятовує ключ сортування останнього показаного рядка й просить «наступні після нього»: `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20` з індексом на `(created_at, id)`. Кожна сторінка — пошук в індексі й двадцять рядків, незалежно від глибини; вставки зверху не зсувають те, що вже нижче курсора. id як другий ключ обов'язковий: у кількох рядків може бути однаковий `created_at`, і без нього вони дублюються чи губляться на межі сторінок.\n\n" +
      "Курсор віддають клієнту непрозорим: base64url від `{ t, id }` (за потреби підписаний), поле `nextCursor` у відповіді, `null` наприкінці. Клієнт його не складає сам — і сервер може змінити схему, нічого не зламавши. Щоб знати, чи є наступна сторінка, беруть `LIMIT n + 1`. Обмеження: немає «перейти на сторінку 37» і дешевого загального лічильника (`COUNT(*)` на великій таблиці дорогий — показують оцінку або просто «ще»). Для невеликої адмін-таблиці з номерами сторінок OFFSET цілком нормальний.",
    code: [
      {
        lang: "sql",
        caption: "Keyset: перша й наступна сторінки",
        src: [
          "-- перша сторінка (+1 рядок, щоб знати, чи є далі)",
          "SELECT id, created_at, title FROM posts",
          "ORDER BY created_at DESC, id DESC",
          "LIMIT 21;",
          "",
          "-- наступна: $1, $2 — created_at і id останнього показаного рядка",
          "SELECT id, created_at, title FROM posts",
          "WHERE (created_at, id) < ($1, $2)",
          "ORDER BY created_at DESC, id DESC",
          "LIMIT 21;",
        ].join("\n"),
      },
      {
        lang: "js",
        caption: "Непрозорий курсор",
        src: [
          "const encode = (row) => btoa(JSON.stringify({ t: row.created_at, id: row.id }));",
          "const decode = (cursor) => JSON.parse(atob(cursor));",
          "",
          "const rows = await db.page(cursor ? decode(cursor) : null, limit + 1);",
          "const items = rows.slice(0, limit);",
          "res.end(JSON.stringify({ items, nextCursor: rows.length > limit ? encode(items.at(-1)) : null }));",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Keyset: однакова швидкість на будь-якій глибині і жодних дублів при вставках.",
      "− Keyset: немає стрибка на сторінку N і дешевого total.",
      "+ Offset: номери сторінок і простота — для невеликих таблиць це ок.",
      "− Offset: робота бази росте з глибиною, на живих даних — дублі й пропуски.",
    ],
    numbers: [
      "OFFSET 1 000 000 — база читає й викидає мільйон записів; keyset на тій самій глибині — кілька сторінок індексу.",
    ],
    interview: [
      "Чому в стрічці з нескінченним скролом з'являються дублі і як це виправити?",
      "Навіщо в курсорі id, якщо сортуємо за created_at?",
    ],
    frontendBridge:
      "`useInfiniteQuery` у React Query створений під курсори: `getNextPageParam: (last) => last.nextCursor`. Дублі в стрічці, які ви «лікували» фільтром за id на фронті, — симптом offset-пагінації на бекенді.",
    see: ["rest-design", "http-caching"],
  },

  idempotency: {
    title: "Ідемпотентність і Idempotency-Key",
    aliases: ["idempotency", "Idempotency-Key", "exactly-once", "дублі платежів", "SET NX", "повтор POST"],
    summary:
      "Мережа не дає exactly-once: відповідь може загубитися вже після того, як сервер усе зробив. Idempotency-Key перетворює «повторний POST» на «віддай результат того самого запиту» — і повтори стають безпечними.",
    how:
      "Клієнт шле `POST /payments`, сервер списує гроші, а відповідь губиться: таймаут, RST, телефон перескочив з Wi-Fi на LTE. Клієнт не знає, списано чи ні. Повторить без захисту — подвійне списання; не повторить — втрачене замовлення. Вихід один — зробити повтор безпечним. Клієнт генерує унікальний ключ на операцію (UUID у момент кліку «Оплатити», а не на кожну спробу) і шле його в `Idempotency-Key` з кожним повтором.\n\n" +
      "Сервер атомарно «застовплює» ключ — `SET key … NX PX` у Redis або `INSERT … ON CONFLICT DO NOTHING` у базі, — виконує операцію, зберігає статус і тіло відповіді, а на повтор віддає збережене. Дубль, що прийшов, поки перший запит ще виконується, — 409; той самий ключ з іншим тілом — 422 (так пропонує IETF-чернетка httpapi-idempotency-key-header). Ключ прив'язують до користувача, щоб чужий ключ не відкривав чужу відповідь, і тримають щонайменше добу. «Прочитати, перевірити, записати» через окремі get і set не годиться: два одночасні запити обидва побачать, що ключ вільний.\n\n" +
      "Найскладніше — збій посередині. Якщо процес упав після списання, але до збереження результату, повтор не має списати вдруге. Варіанти: бізнес-операція й запис ключа в одній транзакції бази; передати ключ далі провайдеру (Stripe сам приймає Idempotency-Key); точки відновлення для багатокрокових операцій. Stripe консервативний: зберігає й відповідь 500, якщо виконання вже почалося. А найкраща ідемпотентність — природна: `PUT /orders/{id, згенерований клієнтом}`, upsert за бізнес-ключем, унікальний індекс у базі як остання лінія оборони.",
    code: [
      {
        lang: "js",
        caption: "Redis: один атомарний SET NX замість get + set",
        src: [
          "const slot = `idem:${userId}:${key}`;",
          'const claimed = await redis.set(slot, JSON.stringify({ state: "running", fp }), { NX: true, PX: 30_000 });',
          "if (!claimed) {",
          "  const record = JSON.parse(await redis.get(slot));",
          "  if (record.fp !== fp) return send(422, { error: \"Ключ використано з іншим тілом\" });",
          '  if (record.state === "running") return send(409, { error: "Ще виконується" });',
          '  return send(record.status, record.body, { "Idempotent-Replayed": "true" });',
          "}",
          "const result = await charge(req.body);",
          'await redis.set(slot, JSON.stringify({ state: "done", fp, ...result }), { EX: 86_400 });',
          "send(result.status, result.body);",
        ].join("\n"),
      },
      {
        lang: "sql",
        caption: "Postgres: ключ і платіж в одній транзакції",
        src: [
          "BEGIN;",
          "INSERT INTO idempotency_keys (user_id, key, fingerprint)",
          "VALUES ($1, $2, $3)",
          "ON CONFLICT DO NOTHING RETURNING key;   -- 0 рядків → ключ уже є, читаємо збережене",
          "-- … бізнес-операція в тій самій транзакції …",
          "UPDATE idempotency_keys SET status = 201, body = $4 WHERE user_id = $1 AND key = $2;",
          "COMMIT;",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Безпечні ретраї POST: клієнт, мобільний SDK і черга можуть повторювати без страху дублів.",
      "− Потрібні сховище ключів із TTL і чесна обробка «впали посередині».",
      "− Ключ, згенерований на кожну спробу, а не на операцію, нічого не захищає.",
    ],
    numbers: ["Stripe зберігає ключі щонайменше 24 години.", "UUID v4 — 122 випадкові біти: колізія ключів практично неможлива."],
    interview: [
      "Клієнт отримав таймаут на POST /payments. Що він має робити і що має гарантувати сервер?",
      "Чому get + set у Redis не годиться як блокування ключа?",
    ],
    frontendBridge:
      "Мутації в React Query за замовчуванням не ретраяться — і правильно. Вмикаючи retry для мутації, генеруйте ключ один раз у момент кліку (`crypto.randomUUID()`) і передавайте той самий у кожну спробу. Задизейблена кнопка «Оплатити» — це UX, а не захист: подвійний запит усе одно прийде з мережі.",
    see: ["retries-backoff", "rest-design", "api-errors"],
  },

  realtime: {
    title: "Реалтайм: WebSocket, SSE, long polling",
    aliases: ["WebSocket", "SSE", "Server-Sent Events", "EventSource", "long polling", "Last-Event-ID", "pub/sub", "sticky sessions"],
    summary:
      "Сервер не може «подзвонити» браузеру — з'єднання завжди відкриває клієнт. WebSocket дає двосторонній канал, SSE — односторонній потік подій поверх звичайного HTTP з автоперепідключенням, long polling — повільний, але всюдисущий запасний варіант.",
    how:
      "WebSocket починається HTTP/1.1-запитом з `Upgrade: websocket`; після `101 Switching Protocols` TCP-з'єднання стає двостороннім каналом фреймів. Плюси: обидва напрямки, мізерні накладні витрати на повідомлення, бінарні дані. Мінуси: це окремий протокол — проксі й балансувальник мають уміти Upgrade і довгий простій (потрібні ping/pong, інакше idle-таймаут обірве з'єднання), перепідключення, доставку пропущеного й авторизацію доводиться писати самому, а браузерний `WebSocket` не вміє ставити заголовки — лише cookie на рукостисканні чи токен першим повідомленням.\n\n" +
      "SSE — звичайний GET із `Content-Type: text/event-stream`, у який сервер пише рядки `id:`, `event:`, `data:`, а порожній рядок завершує подію. Браузерний `EventSource` сам перепідключається (затримку задає поле `retry:`) і шле заголовок `Last-Event-ID` — сервер може дослати пропущене, якщо тримає журнал подій. Працює через усю звичайну HTTP-інфраструктуру, а в HTTP/2 мультиплексується в одне з'єднання. Мінуси: лише сервер → клієнт (назад — звичайні POST), лише текст; на HTTP/1.1 браузер тримає до 6 з'єднань на хост на всі вкладки, і кожна вкладка з SSE з'їдає одне; буферизуючі проксі треба вимкнути для потоку (`X-Accel-Buffering: no` для nginx).\n\n" +
      "Long polling: клієнт шле запит, сервер тримає його до події або ~25 с, відповідає, клієнт одразу шле наступний. Працює будь-де, але кожна подія — повний HTTP-запит із заголовками, а події між опитуваннями сервер мусить буферизувати.\n\n" +
      "Масштабування однакове для всіх трьох: довгі з'єднання розкидані по інстансах, і подія, що виникла на інстансі A, мусить дійти до користувача, підключеного до B. Для цього — pub/sub (Redis Pub/Sub, NATS, Postgres LISTEN/NOTIFY), на який підписані всі інстанси. Sticky sessions потрібні лише протоколам зі станом між кількома запитами (як long-polling-режим Socket.IO). І пам'ятайте про деплой: він рве всі з'єднання одночасно, тож перепідключення клієнтів мусить мати jitter.",
    code: [
      {
        lang: "js",
        caption: "SSE на node:http з доганянням через Last-Event-ID",
        src: [
          "createServer((req, res) => {",
          '  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });',
          "  const send = (e) => res.write(`id: ${e.id}\\nevent: ${e.type}\\ndata: ${JSON.stringify(e.data)}\\n\\n`);",
          "",
          '  const lastId = Number(req.headers["last-event-id"] ?? 0);',
          "  for (const e of history.after(req.user.id, lastId)) send(e);   // догнати пропущене",
          "  const unsubscribe = bus.subscribe(req.user.id, send);          // pub/sub між інстансами",
          '  const ping = setInterval(() => res.write(": ping\\n\\n"), 25_000); // коментар тримає проксі живими',
          "",
          '  req.on("close", () => { clearInterval(ping); unsubscribe(); });',
          "});",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ SSE: звичайний HTTP, автоперепідключення з Last-Event-ID, мультиплексується в HTTP/2.",
      "− SSE: лише сервер → клієнт і текст; на HTTP/1.1 — ліміт 6 з'єднань на хост на весь браузер.",
      "+ WebSocket: двосторонній канал, мінімальні накладні витрати, бінарні дані.",
      "− WebSocket: ping, перепідключення, авторизація й доставка пропущеного — усе вручну.",
      "− Long polling: повний HTTP-запит на кожну подію, зате працює будь-де.",
    ],
    numbers: [
      "Idle-таймаут за замовчуванням: 60 с в AWS ALB і в nginx (proxy_read_timeout) — ping чи коментар кожні 15–30 с тримає з'єднання.",
      "Long polling тримають 20–30 с — менше за idle-таймаути на шляху.",
    ],
    interview: [
      "Нотифікації для 100 тисяч одночасних користувачів: WebSocket чи SSE — і чому?",
      "Як доставити подію користувачу, чиє з'єднання тримає інший інстанс?",
    ],
    frontendBridge:
      "`EventSource` — вбудований у браузер клієнт SSE з перепідключенням, який ви отримуєте безкоштовно; для WebSocket те саме пишуть руками або беруть бібліотеку. Добрий патерн із React Query: подія каже лише «orders змінилися» → `invalidateQueries`, а дані приходять звичайним GET з усім кешуванням і ретраями.",
    see: ["keep-alive", "http-versions", "timeouts"],
  },

  "keep-alive": {
    title: "Keep-alive за балансувальником",
    aliases: ["keep-alive", "keepAliveTimeout", "headersTimeout", "requestTimeout", "idle timeout", "502 Bad Gateway", "ALB", "http.Agent", "ECONNRESET"],
    summary:
      "Балансувальник тримає пул відкритих з'єднань до інстансів. Якщо Node закриває простійне з'єднання раніше, ніж балансувальник перестає ним користуватися, запит, що потрапив у цю мить, отримує 502. Правило: сервер тримає з'єднання довше за свого клієнта.",
    how:
      "У HTTP/1.1 з'єднання за замовчуванням постійні. Node відповідає `Connection: keep-alive` і `Keep-Alive: timeout=5` і закриває сокет після `server.keepAliveTimeout` простою — у Node 22 це 5 с. AWS ALB тримає простійні з'єднання до цілей 60 с, nginx для upstream — теж 60 с. Балансувальник не зобов'язаний зважати на підказку в Keep-Alive, тож кожен живе за своїм таймером.\n\n" +
      "Гонка: після 5 с тиші Node шле FIN, а балансувальник тієї ж миті бере це «живе» з'єднання з пулу й шле по ньому запит. Запит приходить на закритий сокет, ядро відповідає RST, і балансувальник, не отримавши відповіді, віддає клієнту 502 (у логах ALB — `target_status_code` «-» і `target_processing_time` -1). У логах застосунку порожньо: запит до хендлера так і не дійшов. Почерк: невеликий стабільний відсоток 502 на всіх ендпоінтах, більше в тихі години, коли з'єднання довше простоюють. nginx ідемпотентні запити тихо пробує на іншому upstream, а неідемпотентні (POST) з версії 1.9.13 — ні, тож за nginx симптом часто «502 лише на POST».\n\n" +
      "Лікування: `server.keepAliveTimeout = 65_000` — більше за idle-таймаут балансувальника. Тоді з'єднання завжди першим закриває балансувальник, і гонки немає: він не шле запити в сокет, який сам закриває. У гайдах поруч радять `headersTimeout` більший за keepAliveTimeout — у старіших версіях Node ці таймери взаємодіяли інакше. У Node 22 простій рахує лише keepAliveTimeout, headersTimeout (60 с) обмежує отримання заголовків уже розпочатого запиту, requestTimeout (300 с) — отримання всього запиту. Жоден із них не обмежує час роботи хендлера.\n\n" +
      "Та сама гонка буває й навпаки, коли клієнт — Node: `http.globalAgent` з Node 19 тримає keep-alive, `fetch` (undici) — теж. Якщо upstream закриває простійне з'єднання раніше, ніж агент перестає ним користуватися, перший запит після паузи отримує ECONNRESET. Idle-таймаут агента має бути меншим за keep-alive сервера, а ідемпотентні запити на перевикористаному сокеті варто повторювати.",
    code: [
      {
        lang: "js",
        caption: "Node за ALB з idle timeout 60 с",
        src: [
          "const server = http.createServer(app);",
          "server.keepAliveTimeout = 65_000; // довше за ALB: з'єднання першим закриває балансувальник",
          "server.headersTimeout = 66_000;   // страховка з гайдів; у Node 22 простій рахує лише keepAliveTimeout",
          "server.listen(3000);",
        ].join("\n"),
      },
      {
        lang: "text",
        caption: "Перевірка напряму до інстансу",
        src: [
          "$ curl -sv http://10.0.3.17:3000/health 2>&1 | grep -i keep-alive",
          "< Connection: keep-alive",
          "< Keep-Alive: timeout=65",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Перевикористання з'єднань прибирає рукостискання між балансувальником і інстансом.",
      "− Таймаути треба узгоджувати на кожній парі «клієнт — сервер» у ланцюжку, і вони розповзаються з кожною новою ланкою.",
      "− Довгий keepAliveTimeout — більше простійних сокетів; на деплої їх закривають через `server.closeIdleConnections()`.",
    ],
    numbers: [
      "Node 22: keepAliveTimeout 5 с, headersTimeout 60 с, requestTimeout 300 с.",
      "AWS ALB: idle timeout 60 с за замовчуванням (налаштовується від 1 до 4000 с).",
      "nginx: keepalive_timeout для upstream — 60 с.",
    ],
    interview: [
      "Спорадичні 502 від балансувальника, а в логах застосунку тиша. Ваші гіпотези й перша перевірка?",
      "Що має бути довшим: keep-alive таймаут сервера чи idle-таймаут балансувальника — і чому?",
    ],
    frontendBridge:
      "Для браузера балансувальник і є «сервером»: 502 з HTML-сторінкою awselb чи nginx означає, що ваш Node цю відповідь навіть не бачив. React Query тричі ретраїть такі GET за замовчуванням, тож користувач нічого не помічає — доки справа не доходить до POST.",
    see: ["tcp-basics", "timeouts", "retries-backoff", "http-anatomy"],
  },

  timeouts: {
    title: "Таймаути й бюджет запиту",
    aliases: ["timeout", "таймаут", "deadline", "deadline propagation", "AbortSignal.timeout", "504", "statement_timeout", "cascading failure"],
    summary:
      "Кожен виклик по мережі мусить мати таймаут, а таймаути в ланцюжку — зменшуватися від клієнта до бази. Інакше сервер працює на клієнта, який уже пішов, а одна повільна залежність з'їдає ресурси всіх.",
    how:
      "Без таймауту повільна залежність тримає сокети, пам'ять і з'єднання з пулу, поки не прийде відповідь. `fetch` у Node (undici) за замовчуванням чекає заголовків до 300 с — на практиці це «без таймауту». У ланцюжку мобільний клієнт → шлюз → orders → payments кожна ланка має свій таймаут, і якщо внутрішній не менший за зовнішній, зовнішній здається першим (504), а внутрішній продовжує працювати на відповідь, яку вже ніхто не чекає. Ретраї зовнішньої ланки додають нову роботу поверх старої.\n\n" +
      "Правило: таймаути спадають углиб — клієнт 10 с > шлюз 8 с > сервіс 5 с > запит до бази 2 с, і кожна ланка здається раніше за того, хто її чекає. Ще краще — передача бюджету (deadline propagation): перша ланка фіксує, скільки часу є на весь запит, і передає залишок униз (gRPC робить це заголовком `grpc-timeout`, у HTTP — власним заголовком). Кожна ланка ставить на свій виклик `min(власний ліміт, залишок − запас)` і не починає роботу, якщо бюджет уже вичерпано. Передавайте саме залишок у мілісекундах, а не абсолютний час: годинники різних машин розходяться.\n\n" +
      "Ретраї множаться по ланках: три рівні, кожен з трьома повторами (чотири спроби), — до 4 × 4 × 4 = 64 запитів у платіжку від одного кліку. Повторюють на одному рівні, в межах бюджету ретраїв і лише якщо залишку дедлайну вистачає на ще одну спробу. А коли залежність падає масово, circuit breaker перестає її кликати й одразу віддає помилку, замість того щоб щоразу чекати таймауту. Клієнт пішов — зупиніться: `res.on(\"close\")` без завершеної відповіді → `AbortController.abort()` для всіх вихідних викликів.",
    code: [
      {
        lang: "js",
        caption: "Бюджет із заголовка, таймаут на виклик і скасування, коли клієнт пішов",
        src: [
          "async function handler(req, res) {",
          '  const budget = Number(req.headers["x-budget-ms"]) || 5_000; // скільки лишилось у того, хто кличе',
          "  const deadline = Date.now() + budget;",
          "  const gone = new AbortController();",
          '  res.on("close", () => { if (!res.writableFinished) gone.abort(); });',
          "",
          "  const left = deadline - Date.now() - 50; // запас на власну відповідь",
          '  if (left <= 0) return send(res, 504, { error: "Бюджет запиту вичерпано" });',
          "  const r = await fetch(PAYMENTS_URL, {",
          "    signal: AbortSignal.any([gone.signal, AbortSignal.timeout(Math.min(left, 2_000))]),",
          '    headers: { "x-budget-ms": String(left) },',
          "  });",
          "  // …",
          "}",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Спадні таймаути гарантують, що кожна ланка здається раніше за того, хто її чекає.",
      "+ Передача бюджету прибирає роботу «для нікого» після того, як клієнт уже отримав 504.",
      "− Замалий таймаут перетворює повільний, але успішний запит на помилку — рахуйте від p99 залежності, а не від середнього.",
      "− Абсолютні дедлайни залежать від синхронізації годинників — передавайте залишок у мілісекундах.",
    ],
    numbers: [
      "fetch у Node (undici): headersTimeout і bodyTimeout — по 300 с за замовчуванням.",
      "Postgres statement_timeout за замовчуванням 0 — без ліміту.",
      "3 рівні × 4 спроби = до 64 запитів у найглибшу залежність від одного кліку.",
    ],
    interview: [
      "Чому таймаути в ланцюжку сервісів мають зменшуватися вглиб?",
      "Шлюз уже віддав 504, а сервіс досі чекає на платіжку. Що не так і як це виправити?",
    ],
    frontendBridge:
      "fetch у браузері не має таймауту за замовчуванням — `AbortSignal.timeout(10_000)` ставите ви. І той самий AbortController, яким React Query скасовує запит при розмонтуванні компонента (через `signal`), на бекенді потрібен, щоб перестати працювати на клієнта, який пішов.",
    see: ["retries-backoff", "keep-alive", "idempotency"],
  },

  "retries-backoff": {
    title: "Ретраї: експоненційний backoff, jitter, бюджет",
    aliases: ["retry", "exponential backoff", "jitter", "full jitter", "Retry-After", "retry storm", "retry budget", "thundering herd", "circuit breaker"],
    summary:
      "Повтор рятує від короткого збою, але тисячі синхронних повторів самі стають збоєм. Повторюйте лише безпечне й тимчасове, з експоненційною паузою і випадковим jitter, у межах бюджету й Retry-After.",
    how:
      "Що повторювати: лише тимчасові збої — обрив мережі, 502, 503, 504, 429. 4xx — ні: той самий запит отримає ту саму відмову. 500 зазвичай теж ні: баг детермінований. І лише ідемпотентні запити або з Idempotency-Key — POST, що «впав», міг уже виконатися.\n\n" +
      "Як: експоненційний backoff — `base × 2^k` зі стелею. Але без випадковості клієнти, що впали в одну мить, повертаються теж в одну мить: синхронні хвилі (thundering herd) добивають сервіс, який саме піднімається. Full jitter — пауза випадкова від 0 до `min(cap, base × 2^k)`; Марк Брукер з AWS показав, що це зменшує і сумарну кількість запитів, і час до успіху порівняно з backoff без jitter. `Retry-After` (секунди або HTTP-дата) з 429 чи 503 важливіший за власний розрахунок: сервер знає, коли буде готовий.\n\n" +
      "Скільки: обмежити спроби (найчастіше 3), повторювати на одному рівні ланцюжка й тримати бюджет — у SRE Book від Google клієнт повторює, лише поки повтори становлять менше 10% його запитів. Коли падає все, ретраї множать навантаження саме тоді, коли сервісу найгірше, — це retry storm. Circuit breaker після серії збоїв на якийсь час перестає кликати залежність і одразу віддає помилку, а потім обережно пробує знову (half-open).",
    code: [
      {
        lang: "js",
        caption: "Full jitter",
        src: [
          "// k = 1, 2, 3 при baseMs = 100, maxMs = 2000: пауза в [0, 100), [0, 200), [0, 400) мс",
          "const delay = (k) => Math.random() * Math.min(maxMs, baseMs * 2 ** (k - 1));",
        ].join("\n"),
      },
      {
        lang: "text",
        caption: "1000 клієнтів упали о 12:00:00.000",
        src: [
          "без jitter:   хвилі по 1000 запитів о +100, +300, +700 мс — рівно тоді, коли сервіс піднімається",
          "full jitter:  повтор №1 розмазано по [0, 100) мс, №2 — по [0, 200), №3 — по [0, 400) від попередньої спроби",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Ретраї з jitter ховають від користувача короткі збої й перемикання інстансів.",
      "− Кожен ретрай — додаткове навантаження саме тоді, коли сервісу найгірше.",
      "− Ретраї на кількох рівнях множаться: 3 рівні × 4 спроби — до 64 запитів.",
      "+ Retry-After дає серверу керувати темпом повторів.",
    ],
    numbers: [
      "SRE Book: повтори — не більше 10% запитів клієнта.",
      "React Query: query — 3 повтори з паузами 1 с, 2 с, 4 с… (стеля 30 с) без jitter; mutation — 0 повторів.",
    ],
    interview: [
      "Навіщо jitter, якщо вже є експоненційний backoff?",
      "Які помилки клієнт має право повторювати і коли можна повторити POST?",
    ],
    frontendBridge:
      "React Query ретраїть кожен query тричі — 1 с, 2 с, 4 с — без jitter і на будь-яку помилку. Коли бекенд падає під сотнями тисяч вкладок, вони повертаються синхронними хвилями. Для важливих клієнтів задайте `retryDelay` з jitter і повторюйте лише тимчасове: `retry: (n, err) => n < 3 && [429, 502, 503, 504].includes(err.status)`.",
    see: ["idempotency", "timeouts", "keep-alive", "api-errors"],
  },
};
