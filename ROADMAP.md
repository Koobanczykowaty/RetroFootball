# RetroFootball — Roadmap

Priorytety: **P1**: następny etap, największy wpływ na zabawę. **P2**: rozbudowa treści i trybów. **P3**: duże systemy wymagające infrastruktury.

Gra celowo nie ma autów, rzutów rożnych, spalonych ani fauli (piłka odbija się od band) – to nie jest brak do uzupełnienia.

**Zrobione:** pad Xbox, lokalny multiplayer (klawiatura + pad, dwa pady), formacje 2-3 / 3-2, wskaźniki odbiorcy podania i zmiany zawodnika. Balans uznany na razie za dobry.

## P1 — Dopracowanie rozgrywki (v0.3)

1. **Test gry na dwa pady** na prawdziwym sprzęcie.
2. ~~**Lepsza czytelność akcji**: krótkie spowolnienie po golu.~~ Zrobione w v0.3.0 (slow-mo z przybliżeniem).
3. **Główki i woleje**: piłka w powietrzu na wysokości głowy, przycisk strzału przy górnej piłce.
4. **Własna czcionka pixel art** (wbudowana, np. bitmap font generowany jak sprite'y), aby UI wyglądało tak samo na każdym systemie.
5. **Code-splitting Phasera**, żeby zmniejszyć ostrzeżenie o rozmiarze paczki.

## P2 — Treść i tryby (v0.4–v0.6)

1. **Więcej drużyn i edytor kolorów strojów**: `TEAMS` w konfiguracji, sprite'y generują się same z kolorów.
2. **Więcej formacji i taktyki** (pressing wysoki / niski) jako dane w konfiguracji.
3. **2 graczy w jednej drużynie** (co-op przeciwko komputerowi). Fundament już jest: każdy gracz ma własny `HumanController`; trzeba pozwolić, by dwóch steruje tą samą drużyną (np. różni sterowani zawodnicy, oddzielne znaczniki P1/P2).
4. **Statystyki zawodników i umiejętności** (szybkość, strzał, podanie) wpływające na `ActionSystem`.
5. **Turniej / puchar** (drabinka kilku meczów) i **liga** z tabelą.
6. **Zapisy postępów** (localStorage, później konto).
7. **Nowe stadiony i pogoda** (deszcz spowalnia piłkę, śnieg zmienia kolor murawy; parametry tarcia per stadion).
8. ~~**Muzyka w menu**~~ Zrobione w v0.3.0: chiptune w menu i w meczu, efekty 8-bit, doping kibiców.
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
- ~~CI: `npm run build && npm test && npm run test:sim` przy każdym pushu.~~ Zrobione w v0.3.0: błąd w symulacji blokuje wdrożenie.
