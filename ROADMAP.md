# RetroFootball — Roadmap

Priorytety: **P1**: następny etap, największy wpływ na zabawę. **P2**: rozbudowa treści i trybów. **P3**: duże systemy wymagające infrastruktury.

## P1 — Dopracowanie rozgrywki (v0.3)

1. **Playtesty z ludźmi i balans**: skuteczność bramkarzy, siła i celność strzałów, częstotliwość wślizgów AI, długość meczu. Wszystko w `GameplayConfig.ts`.
2. **Gamepad**: nowe `GamepadInput implements InputSource` (Gamepad API Phasera), mapowanie przycisków w `INPUT_MAP`.
3. **Stałe fragmenty gry**: auty i rzuty rożne zamiast odbijania od band (opcja w ustawieniach: „bandy” / „klasycznie”).
4. **Lepsza czytelność akcji**: wskaźnik odbiorcy podania, podświetlenie zawodnika przed zmianą, krótkie spowolnienie po golu (replay-lite).
5. **Główki i woleje**: piłka w powietrzu na wysokości głowy, przycisk strzału przy górnej piłce.
6. **Własna czcionka pixel art** (wbudowana, np. bitmap font generowany jak sprite'y), aby UI wyglądało tak samo na każdym systemie.
7. **Code-splitting Phasera**, żeby zmniejszyć ostrzeżenie o rozmiarze paczki.

## P2 — Treść i tryby (v0.4–v0.6)

1. **Lokalny multiplayer** (2 graczy na jednej klawiaturze lub z gamepadami). `MatchWorld.humanTeam` trzeba zamienić na listę kontrolerów.
2. **Więcej drużyn i edytor kolorów strojów**: `TEAMS` w konfiguracji, sprite'y generują się same z kolorów.
3. **Formacje i taktyki** (np. 2-1-1, 1-2-1; pressing wysoki / niski) jako dane w konfiguracji.
4. **Statystyki zawodników i umiejętności** (szybkość, strzał, podanie) wpływające na `ActionSystem`.
5. **Turniej / puchar** (drabinka kilku meczów) i **liga** z tabelą.
6. **Zapisy postępów** (localStorage, później konto).
7. **Nowe stadiony i pogoda** (deszcz spowalnia piłkę, śnieg zmienia kolor murawy; parametry tarcia per stadion).
8. **Muzyka w menu** (syntezowana chiptune lub legalne assety).
9. **Ustawienia rozgrywki**: czas, prędkość gry, asysty (auto-celowanie podań).

## P3 — Online i duże systemy (v1.x)

1. **Multiplayer online** (WebSocket / WebRTC, serwer autorytatywny lub lockstep). Wymaga deterministycznej symulacji: losowość przez seedowany RNG.
2. **Matchmaking i pokoje prywatne**.
3. **Kariera**: transfery, rozwój zawodników, sezony.
4. **Rankingi** i tabele wyników.
5. **System powtórek** (zapis wejść i deterministyczne odtworzenie; ten sam fundament co online).

## Fundamenty techniczne do wprowadzania po drodze

- Seedowany RNG w całej logice rozgrywki (wymagany dla powtórek i online).
- Wydzielenie symulacji meczu od renderowania do końca (encje → czyste dane + osobne widoki), żeby logikę dało się testować bez przeglądarki.
- CI: `npm run build && npm test && npm run test:sim` przy każdym pushu.
