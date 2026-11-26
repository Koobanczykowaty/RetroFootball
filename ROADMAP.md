# RetroFootball — Roadmap

Priorytety: **P1**: następny etap, największy wpływ na zabawę. **P2**: rozbudowa treści i trybów. **P3**: duże systemy wymagające infrastruktury.

Gra celowo nie ma autów, rzutów rożnych, spalonych ani fauli (piłka odbija się od band) – to nie jest brak do uzupełnienia.

**Zrobione:** pad Xbox, lokalny multiplayer (klawiatura + pad, dwa pady), formacje 2-3 / 3-2, wskaźniki odbiorcy podania i zmiany zawodnika. Balans uznany na razie za dobry.

## P1 — Dopracowanie rozgrywki (v0.3)

1. ~~**Test gry na dwa pady** na prawdziwym sprzęcie.~~ Zrobione: przetestowane na prawdziwych padach.
2. ~~**Lepsza czytelność akcji**: krótkie spowolnienie po golu.~~ Zrobione w v0.3.0 (slow-mo z przybliżeniem).
3. ~~**Główki i woleje**~~ Zrobione: D / S przy piłce w powietrzu, z wyczuciem czasu.
4. ~~**Własna czcionka pixel art**~~ Zrobione: wbudowana czcionka RetroGala (glify rysowane w kodzie), rozmiary dopasowane do siatki pikseli gry.
5. ~~**Code-splitting Phasera**~~ Zrobione: Phaser w osobnym pliku (po aktualizacji gry przeglądarka pobiera tylko ~120 kB kodu gry).

## P2 — Treść i tryby (v0.4–v0.6)

1. ~~**Więcej drużyn i edytor kolorów strojów**~~ Zrobione: 6 drużyn, edytor STROJE (podstawa pod personalizację i multiplayer).
2. **Więcej formacji i taktyki** (pressing wysoki / niski) jako dane w konfiguracji. **Odłożone, do decyzji później** (pomysł nie jest odrzucony). Analiza: przy 5 zawodnikach w polu sensownych ustawień jest niewiele, a każda opcja wydłuża przygotowanie meczu i mnoży kombinacje do zbalansowania. Najtańszy eksperyment to jeden przełącznik DEFENSYWNIE / ZRÓWNOWAŻONIE / OFENSYWNIE, ale najpierw warto sprawdzić, czy testerzy zmieniają obecne formacje.
3. ~~**2 graczy w jednej drużynie** (co-op przeciwko komputerowi).~~ Zrobione: TRYB RAZEM na ekranie 2 GRACZY.
4. **Statystyki zawodników i umiejętności** (szybkość, strzał, podanie) wpływające na `ActionSystem`.
5. ~~**Turniej / puchar** (drabinka kilku meczów) i **liga** z tabelą.~~ Zrobione: TURNIEJ (liga mecz i rewanż, puchar z dogrywką i złotym golem), 3–6 drużyn, każda grana przez człowieka albo CPU.
6. ~~**Zapisy postępów** (localStorage, później konto).~~ Zrobione w localStorage: turniej z KONTYNUUJ i licznik trofeów. Konto później.
7. **Nowe stadiony i pogoda** (deszcz spowalnia piłkę, śnieg zmienia kolor murawy; parametry tarcia per stadion).
8. ~~**Muzyka w menu**~~ Zrobione w v0.3.0: chiptune w menu i w meczu, efekty 8-bit, doping kibiców.
9. ~~**Ustawienia rozgrywki**: czas, prędkość gry, asysty (auto-celowanie podań).~~ Zrobione: PRĘDKOŚĆ GRY (wolna / normalna / szybka), PODANIA (auto / ręczne), LOB (ręczny / auto) w USTAWIENIACH; długość meczu była już wcześniej.

## Opcjonalne (drobne usprawnienia, do decyzji)

- **Turniej: „POMIŃ WSZYSTKIE MECZE CPU”**: w lidze 6 drużyn z jednym graczem jest ok. 20 meczów CPU do pominięcia pojedynczo.
- **Puchar: drużyny z wolnym losem od razu w następnej rundzie**: teraz w półfinale widać „?”, dopóki cała pierwsza runda się nie skończy.

## P3 — Desktop, LAN i online (v1.x)

Cel: wersja **desktop** (z multiplayerem lokalnym i **LAN**) oraz wersja **online** (przeglądarka i desktop). Kod gry **nie jest rozdzielany** na dwie gry: wszystkie wersje korzystają z jednego wspólnego rdzenia, a różnią się tylko opakowaniem i tym, gdzie liczy się mecz. Podział następuje na etapie 1, zanim powstanie multiplayer sieciowy.

Docelowa struktura (jedno repozytorium, kilka pakietów):
- `core`: symulacja meczu i zasady gry, bez Phasera, z seedowanym RNG;
- `client`: Phaser, menu, grafika i dźwięk (obecna gra);
- `server`: Node, liczy mecz bez grafiki na tym samym `core`;
- `desktop`: Electron, opakowuje `client` i potrafi uruchomić `server` lokalnie.

Model sieciowy, jeden dla LAN i online: jedna maszyna (gospodarz) liczy mecz, gracze wysyłają tylko wejście i dostają stan; własny zawodnik jest przewidywany lokalnie, żeby nie czuć opóźnienia. W LAN gospodarzem jest aplikacja desktop jednego z graczy (gry w sieci domowej wykrywają się same przez UDP; przeglądarka tego nie potrafi, więc LAN jest tylko na desktopie). Online gospodarzem jest serwer w chmurze.

Etapy:
1. **Rdzeń symulacji**: wydzielenie logiki meczu (zawodnicy, piłka, AI, kolizje, zegar) od renderowania, seedowany RNG. Gra wygląda tak samo; symulacje CI pilnują, że nic się nie zepsuło. Fundament pod wszystko dalej (patrz niżej). **Zrobione na gałęzi `core`, czeka na akceptację:** rdzeń w `src/core` (bez Phasera, sterowanie człowieka też w rdzeniu), seedowany RNG, test determinizmu (cały mecz liczony w Node bez przeglądarki). Do dokończenia w kolejnych etapach: stan zmiany stron per mecz (serwer z kilkoma meczami naraz) i stały krok czasu (sieć, powtórki).
2. **Aplikacja desktop** (Electron), jeszcze bez sieci. Electron, bo ma wbudowany Node (serwer LAN i wykrywanie gier w tym samym języku); Tauri jest lżejszy, ale sieć trzeba by pisać w Ruście.
3. **Multiplayer LAN** na desktopie: gospodarz u jednego z graczy, automatyczne wykrywanie gier w sieci. Najprostsza sieć do przetestowania (mały ping, bez serwera).
4. **Multiplayer online**: serwer w chmurze, pokoje prywatne i matchmaking; przeglądarka i desktop łączą się z tym samym serwerem.
5. **System powtórek** (zapis wejść i deterministyczne odtworzenie; wynika z etapu 1).
6. **Rankingi** i tabele wyników (wymaga serwera online).
7. **Kariera**: transfery, rozwój zawodników, sezony.

Punkty P2, które zostały (pogoda, statystyki zawodników), lepiej robić po etapie 1, żeby od razu trafiły do wspólnego rdzenia.

## Fundamenty techniczne do wprowadzania po drodze

- Seedowany RNG w całej logice rozgrywki (wymagany dla powtórek i online). Część etapu 1 w P3.
- Wydzielenie symulacji meczu od renderowania do końca (encje → czyste dane + osobne widoki), żeby logikę dało się testować bez przeglądarki. Część etapu 1 w P3.
- ~~CI: `npm run build && npm test && npm run test:sim` przy każdym pushu.~~ Zrobione w v0.3.0: błąd w symulacji blokuje wdrożenie.
