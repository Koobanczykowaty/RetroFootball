# RetroFootball

Dynamiczna, zręcznościowa gra piłkarska 2D w stylu pixel art, działająca w przeglądarce. Szybkie mecze 6 na 6 (bramkarz + 5 zawodników pola) przeciwko komputerowi, z prostym sterowaniem i klimatem mobilnych gier piłkarskich z lat 2000–2008.

Wszystkie grafiki są rysowane programowo (Canvas 2D), a wszystkie dźwięki syntezowane w locie (Web Audio API). Projekt nie zawiera żadnych zewnętrznych assetów.

## Technologia

- **TypeScript** (tryb `strict`)
- **Phaser 3.80**: silnik gry, renderer Canvas
- **Vite 5**: serwer deweloperski i build
- **Vitest**: testy jednostkowe logiki
- Bez backendu. Build to statyczna strona, którą można wrzucić na dowolny hosting plików.

## Wymagania

- Node.js 18+ (testowane na Node 26) i npm
- Nowoczesna przeglądarka (Chrome, Edge, Firefox, Safari)
- Do testu symulacyjnego (`npm run test:sim`): zainstalowany Chrome albo Edge

> Windows: jeśli `node`/`npm` nie są rozpoznawane w terminalu, dodaj `C:\Program Files\nodejs` do zmiennej PATH.

## Instalacja i uruchomienie

```bash
npm install
npm run dev        # http://localhost:3000 (otwiera przeglądarkę)
```

Build produkcyjny:

```bash
npm run build      # sprawdzenie typów (tsc) + build do dist/
npm run preview    # podgląd zbudowanej wersji
```

Zawartość `dist/` to gotowa statyczna strona (index.html + jeden plik JS).

## Komendy

| Komenda | Opis |
|---|---|
| `npm run dev` | Serwer deweloperski z hot reload |
| `npm run build` | Sprawdzenie typów i build produkcyjny do `dist/` |
| `npm run preview` | Serwuje `dist/` lokalnie |
| `npm test` | Testy jednostkowe (Vitest) |
| `npm run test:sim -- [mecze] [minuty]` | Test integracyjny: rozgrywa mecze w headless Chrome/Edge (wymaga wcześniejszego `npm run build`) |

## Sterowanie

| Klawisz | Z piłką | Bez piłki |
|---|---|---|
| Strzałki | Ruch (8 kierunków) | Ruch |
| Shift | Sprint (zużywa staminę) | Sprint |
| S (przytrzymaj) | Podanie po ziemi do partnera w kierunku ruchu. Siła (pełna po 0,35 s) ustala prędkość: od 70% (krótkie wciśnięcie) do 130% normalnej (300–480 px/s) | Przełącz na najlepiej ustawionego zawodnika |
| A (przytrzymaj) | Lob nad obrońcami w kierunku strzałki (bez auto-celu). Siła (pełna po 0,35 s) ustala, jak daleko spadnie piłka: ok. 90–380 px. Odbiorcą jest partner najbliżej miejsca lądowania | – |
| D (przytrzymaj) | Strzał (pełna siła po 0,35 s): im dłużej trzymasz, tym mocniej. ↑/↓ celuje w górny/dolny róg. Ze strzałką w stronę własnej bramki piłka leci wzdłuż strzałki (wybicie, możliwy samobój) | Wślizg / odbiór |
| Spacja | Zmiana zawodnika | Zmiana na najlepiej ustawionego zawodnika |
| Esc / P | Pauza (Esc w menu pauzy wznawia grę) | Pauza |
| M | Wycisz dźwięk | Wycisz dźwięk |

Menu obsługuje mysz i klawiaturę (↑↓ wybór, ←→ zmiana opcji, Enter/Spacja zatwierdź, Esc wstecz).

**Zmiana zawodnika strzałkami:** przytrzymaj strzałkę i naciśnij Spację (albo S bez piłki), żeby wybrać zawodnika w tym kierunku: strzałka w górę wybiera zawodnika wyżej, w lewo zawodnika po lewej, działają też skosy. Niebieska strzałka nad zawodnikiem pokazuje, na kogo przełączy Spacja.

**Kontynuowanie akcji:** zawodnik, który podał piłkę (S lub A), nie wraca od razu na pozycję. Tak samo grają zawodnicy komputera. Dopóki Twoja drużyna ma piłkę (najdłużej 6 s), biegnie dalej do przodu przed piłką w swoim korytarzu i można mu ją oddać. Po stracie piłki wraca do zwykłego ustawienia. Czas i dystans wybiegnięcia ustawisz w `supportRunMax` i `supportRunLead` w `GameplayConfig.ts`.

**Podpowiedź podania:** gdy masz piłkę, żółta strzałka nad partnerem pokazuje, do kogo trafi podanie (S) w kierunku trzymanej strzałki. Bez strzałki liczy się kierunek, w którym zawodnik jest zwrócony. Gdy w danym kierunku nie ma partnera, strzałki nie ma, a podanie pójdzie w wolne pole. Bez strzałek działa wybór automatyczny opisany niżej.

**Zmiana zawodnika (automatyczna):** gdy przeciwnik ma piłkę, gra wybiera obrońcę, który stoi między nim a Twoją bramką i może go zatrzymać, a nie tego, który goni go od tyłu. Przy luźnej piłce wybiera zawodnika, który najszybciej do niej dobiegnie. Po stracie piłki przełącza automatycznie.

**Bramkarz:** gdy Twój bramkarz złapie piłkę, przejmujesz nad nim kontrolę. Możesz się przesunąć w polu karnym i zagrać S (podanie), A (wybicie lobem) lub D (długi strzał). Bramkarza z piłką nie można zaatakować, a przeciwnicy wracają wtedy na pozycje. Klawisze trzymane jeszcze z obrony (np. D do wślizgu) nie wykonają od razu akcji bramkarza: trzeba je wcisnąć ponownie. Jeśli nic nie zrobisz przez ok. 3,5 s, bramkarz sam wybije piłkę. Nad jego głową widać odliczanie z paskiem (zielony, żółty, czerwony). Po zagraniu kontrola wraca do zawodnika z pola.

> W trybie pełnoekranowym przeglądarka przechwytuje Esc do wyjścia z pełnego ekranu, więc do pauzy użyj wtedy klawisza **P**.

## Zakres MVP (v0.2.0)

- **Menu główne** z animowanym tłem stadionu: PLAY, CONTROLS, SETTINGS, wersja gry.
- **Quick Match**: wybór jednej z dwóch drużyn (Red Eagles / Blue Sharks), długości meczu (2/4/6 min) i poziomu trudności. Ustawienia są zapamiętywane w przeglądarce.
- **Poziomy trudności** (ekran QUICK MATCH lub SETTINGS; aktualny poziom widać w meczu w lewym górnym rogu jako `CPU: …`):
  - **EASY**: komputer wolniej reaguje i biega, rzadko i nieskutecznie atakuje wślizgiem, strzela niecelnie, bramkarz często puszcza;
  - **NORMAL**: wyrównana gra;
  - **HARD**: szybki, agresywny pressing, skuteczne odbiory, celne strzały, mocny bramkarz.
  Wszystkie parametry są w `AI_PROFILES` w `GameplayConfig.ts`.
- **Formacje**: **2-3** (ofensywna: 2 obrońców + 3 napastników) albo **3-2** (defensywna: 3 obrońców + 2 napastników). Swoją wybierasz na ekranie QUICK MATCH i możesz ją zmienić w trakcie meczu w menu pauzy. Komputer losuje formację przed każdym meczem.
- **Rozgrywka 6v6**:
  - ruch w 8 kierunkach z bezwładnością, sprint i stamina;
  - podania z wyborem odbiorcy w kierunku ruchu, wyprzedzające podania do biegnącego partnera;
  - ładowany strzał z celowaniem w róg i smugą przy mocnym strzale;
  - lob nad obrońcami;
  - wślizgi z ryzykiem (nieudany wślizg chwilowo wytrąca z równowagi);
  - przyjęcie piłki, które przy szybkiej piłce może się nie udać, wtedy piłka się odbija.
- **AI**:
  - formacja zależna od roli (obrońca, pomocnik, napastnik) i od pozycji piłki;
  - do piłki biegnie tylko jeden zawodnik, więc nie ma zbiegania się całej drużyny;
  - pressing, asekuracja obrońcy, podania, loby, strzały w róg dalszy od bramkarza;
  - bramkarz ustawia się między piłką a bramką, przewiduje tor strzału, rzuca się, łapie lub odbija piłkę i wznawia grę.
- **Przebieg meczu**: rozpoczęcie, zegar 0–90 min, przerwa, druga połowa ze zmianą stron (drużyny zamieniają się bramkami), gol z efektem GOAL! (dźwięk, konfetti, wstrząs kamery, celebracja), reset pozycji, ekran końcowy ze statystykami (posiadanie, strzały, celne, podania, odbiory), REMATCH i MAIN MENU.
- **Pauza**: Resume, Restart Match, Controls, Main Menu. Gra pauzuje się też automatycznie po utracie fokusu okna.
- **Dźwięk**: kopnięcie, podanie, strzał, mocny strzał, odbicie, wślizg, obrona, gol z dopingiem, gwizdek, dźwięki menu. Można go wyciszyć i ustawić głośność.
- **Skalowanie**: proporcje 16:9 zawsze zachowane. Gra używa skali całkowitej (np. ×2 na Full HD), gdy wypełnia ona co najmniej 85% okna, w przeciwnym razie skali ułamkowej. Piksele są zawsze ostre. Działa też pełny ekran.

## Struktura projektu

```
index.html                 strona + CSS (pixelated rendering, blokada gestów)
src/main.ts                konfiguracja Phaser, skalowanie integer/fit
src/game/
  config/
    GameplayConfig.ts      WSZYSTKIE parametry gry (prędkości, siły, AI, czasy, drużyny)
    Settings.ts            ustawienia gracza (localStorage)
  logic/                   czysta logika bez Phasera (testowalna)
    PitchGeometry.ts       współrzędne boiska, wektory, formacje
    MatchWorld.ts          wspólny stan meczu + statystyki
  entities/                Player, Ball, Pitch (obiekty + rendering)
  systems/
    MatchSystem.ts         maszyna stanów meczu, wynik, zegar
    ActionSystem.ts        podanie / strzał / lob / wślizg (wspólne dla gracza i AI)
    CollisionSystem.ts     kolizje, posiadanie, przechwyty, odbiory, obrony
    AISystem.ts            zachowanie zawodników komputera i bramkarzy
    InputSystem.ts         źródła wejścia (klawiatura, bot testowy, gamepad w przyszłości)
    SoundManager.ts        syntezowane efekty dźwiękowe
  scenes/                  Boot, Menu, TeamSelect, Match, Controls, Settings
  ui/                      HUD, przyciski, nawigacja klawiaturą, pauza, nakładki
  assets/AssetGenerator.ts generowanie sprite'ów pixel art
  debug/                   tryb symulacji (testy automatyczne)
tests/                     testy jednostkowe (Vitest)
scripts/sim-test.mjs       test integracyjny w headless przeglądarce
```

Przepływ jednej klatki meczu (`MatchScene.simulate`): wejście gracza → AI obu drużyn → ruch zawodników → kolizje i posiadanie → fizyka piłki → sprawdzenie gola.

## Testy

- `npm test`: 15 testów jednostkowych maszyny stanów meczu i geometrii boiska.
- `npm run test:sim`: uruchamia `vite preview` i gra w headless Chrome/Edge w dwóch trybach:
  1. **AI vs AI**: rozgrywa N meczów z restartem sceny między nimi;
  2. **bot jako człowiek**: drużyna gracza jest sterowana skryptem przez prawdziwą ścieżkę wejścia (ładowane strzały, podania, loby, wślizgi, zmiana zawodnika oraz pauza i wznowienie prawdziwym wciśnięciem Esc).

  Test kończy się błędem, jeśli wystąpi wyjątek JS, mecz nie dojdzie do przerwy albo końca, albo któraś akcja gracza nie zostanie wykonana.

Parametry URL przydatne przy tworzeniu gry:

- `?sim=3&minutes=2`: 3 mecze AI vs AI po 2 minuty; wynik w `window.__RF_SIM__`.
- `?sim=1&human=1`: jak wyżej, ale drużyna 0 sterowana botem.
- `&difficulty=easy|normal|hard`: poziom komputera w symulacji.
- `?scene=TeamSelectScene`: otwiera wybraną scenę od razu.

## Znane ograniczenia

- Brak autów, rzutów rożnych, spalonych i fauli. Piłka odbija się od band (świadoma decyzja arcade).
- Dwie drużyny, jedna formacja, jeden stadion. Brak główek i strzałów z powietrza.
- Gra jest przeznaczona na komputer (klawiatura i mysz). Nie ma sterowania dotykowego ani wersji mobilnej.
- Brak obsługi gamepada (architektura `InputSource` jest na to gotowa).
- Balans (np. skuteczność bramkarzy, liczba goli) był strojony na symulacjach AI vs AI. Wymaga jeszcze testów z ludźmi. Wszystkie wartości są w `GameplayConfig.ts`.
- Teksty używają systemowej czcionki monospace, więc ich wygląd zależy od systemu.
- Plik JS ma ok. 1,5 MB (ok. 360 KB gzip), głównie przez Phaser. Vite wyświetla ostrzeżenie o rozmiarze chunka.

## Dalszy rozwój

Szczegółowy plan z priorytetami: [ROADMAP.md](ROADMAP.md).
