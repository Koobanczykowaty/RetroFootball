# RetroFootball

Dynamiczna, zręcznościowa gra piłkarska 2D w stylu pixel art, działająca w przeglądarce. Szybkie mecze 6 na 6 (bramkarz + 5 zawodników pola) przeciwko komputerowi, z prostym sterowaniem i klimatem mobilnych gier piłkarskich z lat 2000–2008.

Wszystkie grafiki są rysowane programowo (Canvas 2D), a wszystkie dźwięki syntezowane w locie (Web Audio API). Projekt nie zawiera żadnych zewnętrznych assetów.

## Technologia

- **TypeScript** (tryb `strict`)
- **Phaser 3.80**: silnik gry, renderer Canvas
- **Vite 8**: serwer deweloperski i build
- **Vitest**: testy jednostkowe logiki
- Bez backendu. Build to statyczna strona, którą można wrzucić na dowolny hosting plików.

## Wymagania

- Node.js 22.12+ (testowane na Node 26) i npm – tylko do budowania i testów; testerzy grający w gotową wersję nie potrzebują Node.js
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
| `npm run build:single` | Wersja na PC: cała gra w jednym pliku `release/RetroFootball.html` |

## Udostępnianie gry testerom

### Wersja lokalna na PC (jeden plik)

```bash
npm run build:single
```

Powstaje plik **`release/RetroFootball.html`** (~1,5 MB, ~370 KB po spakowaniu do ZIP). Wystarczy go wysłać – tester otwiera go **dwuklikiem** w Chrome, Edge lub Firefoxie. Nie trzeba nic instalować ani mieć internetu. Każdą nową wersję trzeba wysłać od nowa.

### GitHub Pages (link w przeglądarce)

Gra publikuje się automatycznie przy każdym `git push` na gałąź `main` (workflow `.github/workflows/deploy-pages.yml`: testy jednostkowe → build → publikacja). Jednorazowa konfiguracja:

1. Załóż konto na [github.com](https://github.com) i nowe repozytorium, np. `RetroFootball` (**publiczne** – GitHub Pages w darmowym planie działa tylko dla repozytoriów publicznych). Nie dodawaj README ani .gitignore przy zakładaniu.
2. W folderze gry (git jest w `C:\Program Files\Git\cmd`):
   ```bash
   git remote add origin https://github.com/<twoja-nazwa>/RetroFootball.git
   git push -u origin main
   ```
   Przy pierwszym pushu otworzy się okno logowania do GitHuba.
3. Na GitHubie: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. W zakładce **Actions** poczekaj na zielony znaczek (1–2 min). Gra będzie pod adresem **`https://<twoja-nazwa>.github.io/RetroFootball/`**.

Od tej pory wystarczy `git push`, a testerzy po odświeżeniu strony mają najnowszą wersję.

## Sterowanie

| Klawisz | Z piłką | Bez piłki |
|---|---|---|
| Strzałki | Ruch (8 kierunków) | Ruch |
| Shift | Sprint (zużywa staminę) | Sprint |
| S (przytrzymaj) | Podanie po ziemi do partnera w kierunku ruchu. Siła (pełna po 0,35 s) ustala prędkość: od 70% (krótkie wciśnięcie) do 130% normalnej (300–480 px/s) | Przełącz na najlepiej ustawionego zawodnika |
| A (przytrzymaj) | Lob nad obrońcami w kierunku strzałki (bez auto-celu). Siła (pełna po 0,35 s) ustala, jak daleko spadnie piłka: ok. 90–380 px. Odbiorcą jest partner najbliżej miejsca lądowania | Wślizg / odbiór |
| D (przytrzymaj) | Strzał (pełna siła po 0,35 s): im dłużej trzymasz, tym mocniej. ↑/↓ celuje w górny/dolny róg. Ze strzałką w stronę własnej bramki piłka leci wzdłuż strzałki (wybicie, możliwy samobój) | – |
| W | — (z piłką zmiana zawodnika jest wyłączona) | Zmiana na najlepiej ustawionego zawodnika |
| Esc / P | Pauza (Esc w menu pauzy wznawia grę) | Pauza |
| M | Wycisz dźwięk | Wycisz dźwięk |

Menu obsługuje mysz i klawiaturę (↑↓ wybór, ←→ zmiana opcji, Enter/Spacja zatwierdź, Esc wstecz).

**Pad Xbox** (podłącz przez USB lub Bluetooth i naciśnij dowolny przycisk, żeby przeglądarka go wykryła):

| Pad | Z piłką | Bez piłki |
|---|---|---|
| Lewa gałka / D-pad | Ruch | Ruch |
| RT | Sprint | Sprint |
| A (przytrzymaj) | Podanie (jak S) | Zmiana na najlepiej ustawionego zawodnika |
| B (przytrzymaj) | Strzał (jak D) | – |
| X (przytrzymaj) | Lob (jak A na klawiaturze) | Wślizg |
| LB (+gałka) | — (z piłką wyłączone) | Zmiana zawodnika (w kierunku gałki) |
| Menu (≡) | Pauza | Pauza |
| View (⧉) | Wycisz dźwięk | Wycisz dźwięk |

W menu gry: gałka / D-pad wybór, A zatwierdź, B wstecz. Pad i klawiatura działają jednocześnie, a obie kolumny są też na ekranie CONTROLS.

**Zmiana zawodnika strzałkami:** przytrzymaj strzałkę i naciśnij W (albo S bez piłki; na padzie LB), żeby wybrać zawodnika w tym kierunku: strzałka w górę wybiera zawodnika wyżej, w lewo zawodnika po lewej, działają też skosy. Niebieska strzałka nad zawodnikiem pokazuje, na kogo przełączy W.

**Kontynuowanie akcji:** zawodnik, który podał piłkę (S lub A), nie wraca od razu na pozycję. Tak samo grają zawodnicy komputera. Dopóki Twoja drużyna ma piłkę (najdłużej 6 s), biegnie dalej do przodu przed piłką w swoim korytarzu i można mu ją oddać. Po stracie piłki wraca do zwykłego ustawienia. Czas i dystans wybiegnięcia ustawisz w `supportRunMax` i `supportRunLead` w `GameplayConfig.ts`.

**Podpowiedź podania:** gdy masz piłkę, żółta strzałka nad partnerem pokazuje, do kogo trafi podanie (S) w kierunku trzymanej strzałki. Bez strzałki liczy się kierunek, w którym zawodnik jest zwrócony. Gdy w danym kierunku nie ma partnera, strzałki nie ma, a podanie pójdzie w wolne pole. Bez strzałek działa wybór automatyczny opisany niżej.

**Zmiana zawodnika (automatyczna):** gdy przeciwnik ma piłkę, gra wybiera obrońcę, który stoi między nim a Twoją bramką i może go zatrzymać, a nie tego, który goni go od tyłu. Przy luźnej piłce wybiera zawodnika, który najszybciej do niej dobiegnie. Po stracie piłki przełącza automatycznie.

**Bramkarz:** gdy Twój bramkarz złapie piłkę, przejmujesz nad nim kontrolę. Możesz się przesunąć w polu karnym i zagrać S (podanie), A (wybicie lobem) lub D (długi strzał). Bramkarza z piłką nie można zaatakować, a przeciwnicy wracają wtedy na pozycje. Klawisze trzymane jeszcze z obrony (np. D do wślizgu) nie wykonają od razu akcji bramkarza: trzeba je wcisnąć ponownie. Jeśli nic nie zrobisz przez ok. 3,5 s, bramkarz sam wybije piłkę. Nad jego głową widać odliczanie z paskiem (zielony, żółty, czerwony). Po zagraniu kontrola wraca do zawodnika z pola.

> W trybie pełnoekranowym przeglądarka przechwytuje Esc do wyjścia z pełnego ekranu, więc do pauzy użyj wtedy klawisza **P**.

## Zakres gry (v0.3.0)

- **Menu główne** z animowanym tłem stadionu (na horyzoncie Stadion Narodowy i Pałac Kultury i Nauki z migoczącymi światłami; na murawie dwóch piłkarzy kiwa się ze sobą): PLAY, CONTROLS, SETTINGS, wersja gry.
- **Język polski / angielski**: menu i napisy w meczu. Domyślnie według języka przeglądarki (polska przeglądarka → polski, inaczej angielski); zmiana w SETTINGS / USTAWIENIA → JĘZYK / LANGUAGE, zapamiętywana. W wersji polskiej przycisk startu meczu i baner rozpoczęcia to „HARATAJMY!”, a karta przeglądarki nazywa się „Retro Gała”.
- **Quick Match**: wybór jednej z dwóch drużyn (Czerwone Orły / Białe Bociany), długości meczu (2/4/6 min) i poziomu trudności. Ustawienia są zapamiętywane w przeglądarce.
- **Poziomy trudności** (ekran QUICK MATCH lub SETTINGS; aktualny poziom widać w meczu w lewym górnym rogu jako `CPU: …`):
  - **EASY**: komputer wolniej reaguje i biega, rzadko i nieskutecznie atakuje wślizgiem, strzela niecelnie, bramkarz często puszcza, obrońcy często nabierają się na zwody;
  - **NORMAL**: wyrównana gra; obrońcy czasem nabierają się na zwody (ostra zmiana kierunku przy dryblingu);
  - **HARD**: szybki, agresywny pressing, skuteczne odbiory, celne strzały, mocny bramkarz; zwodów nie daje się nabrać.
  Wszystkie parametry są w `AI_PROFILES` w `GameplayConfig.ts`.
- **Role zawodników** (subtelne różnice, `ROLE_TRAITS`): napastnicy biegają nieco szybciej, szybciej się męczą, ale też szybciej odzyskują siły, i strzelają celniej i mocniej; obrońcy częściej skutecznie odbierają piłkę wślizgiem.
- **2 PLAYERS (lokalnie)**: przycisk w menu głównym. Gracz 1 wybiera drużynę, gracz 2 gra drugą. Urządzenia:
  - jeden pad: P1 = klawiatura, P2 = pad;
  - dwa pady: P1 = klawiatura **albo** pad 1, P2 = pad 2.

  Ekran 2 PLAYERS pokazuje bieżący przydział. Pady można podłączyć też w trakcie meczu. Każdy wybiera swoją formację, w pauzie oba wiersze formacji da się zmienić. Sterowany zawodnik P1 ma żółty znacznik, P2 zielony (tak samo oznaczenia w HUD). Pauzować może każdy (Esc/P albo Menu na padzie). Na ekranie wyboru widać, czy pad jest podłączony.
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
- **Dwa stadiony, losowane przed każdym meczem**: **Stadion Narodowy** (trybuny, biało-czerwone flagi i bandy) oraz **Blokowisko** (wydeptana trawa z łysymi plackami, kredowe linie, bramki z rurek z dziurawą siatką, bloki z wielkiej płyty, siatka, trzepak, ławki, drzewa) ze **szmacianą piłką**. Nazwa stadionu pojawia się przy rozpoczęciu meczu; zmienia się tylko wygląd, nie fizyka.
- **Przebieg meczu**: rozpoczęcie, zegar 0–90 min, przerwa, druga połowa ze zmianą stron (drużyny zamieniają się bramkami), gol ze spowolnieniem (ok. 1,5 s slow-mo z przybliżeniem kamery na bramkę), potem GOOOL!, fanfara, konfetti, wstrząs kamery i celebracja, reset pozycji, ekran końcowy ze statystykami (posiadanie, strzały, celne, podania, odbiory), REMATCH i MAIN MENU.
- **Pauza**: Resume, Restart Match, Controls, Main Menu. Gra pauzuje się też automatycznie po utracie fokusu okna.
- **Dźwięk i muzyka (8-bit, wszystko syntezowane)**: efekty w stylu starych konsol (kopnięcie, podanie, strzał, mocny strzał, odbicie, wślizg, obrona, gol, gwizdek, menu); muzyka chiptune w menu i cichszy podkład w meczu; doping kibiców (szum trybun, który rośnie przy strzałach i golach); jingle przy golu, przerwie i na koniec meczu (wygrana / porażka / remis). W ustawieniach: DŹWIĘK, MUZYKA (osobno) i GŁOŚNOŚĆ; M wycisza wszystko.
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
    SoundManager.ts        efekty 8-bit, sekwencer muzyki, doping kibiców
  audio/Tunes.ts           melodie i jingle zapisane jako dane (nuty)
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

## Założenia projektu

- **Brak autów, rzutów rożnych, spalonych i fauli** – piłka odbija się od band. To celowa cecha gry: utrzymuje ciągłą, szybką akcję.
- Gra jest przeznaczona na komputer (klawiatura, mysz, pad Xbox). Nie ma sterowania dotykowego ani wersji mobilnej.

## Znane ograniczenia

- Dwie drużyny, dwie formacje (2-3, 3-2), jeden stadion. Brak główek i strzałów z powietrza.
- Gra na dwa pady w trybie 2 PLAYERS nie była jeszcze sprawdzona na fizycznym sprzęcie (jeden pad działa).
- Teksty używają systemowej czcionki monospace, więc ich wygląd zależy od systemu.
- Plik JS ma ok. 1,5 MB (ok. 360 KB gzip), głównie przez Phaser. Vite wyświetla ostrzeżenie o rozmiarze chunka.

## Dalszy rozwój

Szczegółowy plan z priorytetami: [ROADMAP.md](ROADMAP.md).
