# PICO PARK — Local Co-op Clone

PicoPark маягийн олон тоглогчтой (2–8) хамтын ажиллагааны platformer. Бүх физик
болон тоглоомын логик сервер дээр 60Hz-ээр бодогдоно (authoritative real-time
backend, WebSocket), клиент нь canvas дээр interpolation-тэй зурна.

## Ажиллуулах

```bash
npm install
npm run dev        # http://localhost:3000
```

Тоглогч бүр `http://localhost:3000`-ийг өөр цонх/таб/төхөөрөмж дээр нээхэд
автоматаар нэгдэнэ (макс 8). Lobby дээр ENTER буюу START дарж эхлүүлнэ.

Production:

```bash
npm run build
npm start
```

## Удирдлага

| Товч | Үйлдэл |
| --- | --- |
| ← → эсвэл A D | хөдлөх |
| SPACE эсвэл ↑ / W | үсрэх |
| ENTER | тоглоом эхлүүлэх / lobby руу буцах |
| R | түвшинг дахин эхлүүлэх |

## Механикууд

- Бие биенийхээ **толгой дээр гарч** өндөрт хүрнэ (stack), доороосоо үсэрч
  нөхдөө өргөнө, хажуугаас **түлхэж** болно.
- **Түлхүүр** авсан тоглогч **хаалганд** хүрэхэд онгойно; түвшин дуусахын тулд
  **бүх** тоглогч хаалгаар орох ёстой.
- Тоон **товчлуур** дээр заасан тооны тоглогч зэрэг зогсоход **хаалт** нээгдэнэ.
- **Өргөс** болон ангал — үхвэл 1 секундын дараа эхлэх цэг дээр амилна.
- 4 түвшин: RUN & JUMP → STACK UP (2+ тоглогч) → PRESS TOGETHER (2+) → DANGER ZONE.

## Бүтэц

- `server.js` — Next.js custom server + `ws` WebSocket (`/ws` зам), 60Hz
  симуляци, 30Hz state broadcast. HMR upgrade-ууд Next рүү дамжина.
- `game/engine.js` — сервер талын физик/логик (tile collision, тоглогч
  хоорондын мөргөлдөөн, түлхүүр/хаалга/товчлуур/өргөс, түвшний урсгал).
- `game/levels.js` — түвшнүүд (30×17 tile grid, ачаалахад автоматаар шалгагдана).
- `app/page.tsx` — клиент: canvas render, snapshot interpolation, удирдлага.
- `scripts/coop-bot-test.js` — 2 bot-оор STACK UP түвшний хамтын механикийг
  автоматаар туршина (сервер асаалттай үед `node scripts/coop-bot-test.js`).
