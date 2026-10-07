---
title: "Raport architektoniczny: do zrobienia"
created: 2026-10-07
type: todo
---

# Raport architektoniczny: do zrobienia

Notatka do `context/architect-report.md` (raport z modułu 4, 10xArchitect). To nie jest artefakt źródłowy. Zbiera dwie rzeczy, które zostały do zrobienia po PR #85:

- [ ] **Autor dopisuje własne powody** przy czterech decyzjach z L5 (sekcja 1). Raport ma tam dziś „BRAK artefaktu”.
- [x] **Raport skrócony** do około dwóch stron (sekcja 2): z 4203 do 1371 słów (`wc -w`).

## 1. Do uzupełnienia przez autora

### Wymagane: „dlaczego” przy czterech decyzjach z L5

Prompt wymaga w §6: „co AI podpowiedziało, a co rozstrzygnąłeś samodzielnie i dlaczego”. Raport ma pierwsze dwie części. Własnych powodów autora nie ma w żadnym artefakcie: L5 zapisuje tylko powody swoich rekomendacji. Dlatego w raporcie stoi „BRAK artefaktu” i nie wolno tego uzupełniać domysłem ani powodami z L5.

| Decyzja                                  | Co raport mówi, że rozstrzygnięto                                                                               | Gdzie dopisać „bo …”                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 02 D-2, okno dat                         | luka zamknięta; funkcje SQL mają zapisywać tylko bieżący okres                                                  | `context/architect-report.md:73`, zdanie „Z L5 rozstrzygnąłem cztery sprawy …” |
| 02 D-1, okres widziany przez użytkownika | odznaczenie albo jego cofnięcie ma być odrzucane bez zapisu (HTTP 409), gdy widziany okres nie jest już bieżący | to samo zdanie                                                                 |
| 03 D-1, ACL                              | Fazy 1–3 i 6; Fazy 4–5 czekają                                                                                  | to samo zdanie                                                                 |
| Q-01, spadek streaka                     | reguła „połowa, w dół” jest ostateczna; do poprawy jest PRD, nie kod                                            | to samo zdanie                                                                 |

Kroki. Numery linii dotyczą stanu po skróceniu (cały §6 to jeden akapit w linii 73), więc przy każdym kroku jest fraza do wyszukania.

1. `context/architect-report.md:73`, §6: zastąp zdanie „Dlaczego rozstrzygnąłem te cztery sprawy tak, a nie inaczej: BRAK artefaktu, bo …” swoimi powodami. Wystarczy jedno zdanie na całość albo cztery krótkie człony.
2. `context/architect-report.md:73` (opcjonalnie): w zdaniu „Z L5 rozstrzygnąłem cztery sprawy …” dopisz „bo …” po każdej z czterech decyzji; wtedy zdanie z kroku 1 wystarczy usunąć.
3. `context/architect-report.md:77`, „Luki”: usuń z listy BRAK fragment „moich uzasadnień czterech decyzji z L5,”.

Pisz własnymi słowami. To Twoje powody, więc nie musisz ich opierać na artefaktach. Tych samych decyzji dotyczy jeszcze punkt „Moja decyzja” w §5 (linia 67), ale prompt wymaga „dlaczego” tylko w §6, więc tam nic nie trzeba zmieniać. Powody wydłużą §6, który już jest najdłuższy względem budżetu (sekcja 2).

### Opcjonalnie

- **Otwarte kwestie produktowe** (`context/architect-report.md:73`, ostatnie zdanie §6, „Otwarte zostają …”): raport zgłasza dwie niewiadome, które rozstrzyga tylko właściciel produktu. Jeśli zapadną, dopisz je w §6 jako kolejne decyzje. (1) Reguła okresu: strefa Warszawa i poniedziałkowy początek `weekly` są w kodzie i w modelu L5 (T-10, N-19), ale PRD ich nie podaje (B-07). (2) Obsługa konfliktu 409 w UI: L5-02 przewiduje tylko przeładowanie strony (§4.6), bez komunikatu.
- **Zapis decyzji w artefaktach L5:** cztery decyzje z tabeli wyżej nie są zapisane w L5, które nadal pokazuje je jako otwarte, i raport mówi o tym wprost. Zapis byłby osobną zmianą. Artefaktów źródłowych celowo nie ruszano.

## 2. Długość raportu

**Wymaganie** (oryginalny prompt modułu 4): „zwięzły two-pager (~2 strony)” i „Maksymalnie dwie strony. Tnij, nie streszczaj wszystkiego.” Autor powtórzył je w liście kontrolnej: najwyżej około dwóch stron. Dwie strony to ok. 1000–1200 słów (szacunek przy 500–600 słowach na stronę prozy).

**Stan:** skrócone według propozycji z poprzedniej wersji tej notatki: wstęp zastąpiony jednozdaniową legendą, §5.5 usunięty, przykład z okresem opowiedziany raz (w §5: fakt, projekt L5-02, moja decyzja), §6 w pięciu zdaniach, w §4 jedna linia na fazę z kolumnami „Automatycznie” i „Ręcznie” oraz jedno zdanie „Docelowego kształtu”.

| Wersja                                     | Słowa (`wc -w`) |
| ------------------------------------------ | --------------- |
| master po PR #84 (`ff717ef`)               | 1278            |
| po rundach recenzji (`560eeb3`)            | 3094            |
| po dodaniu elementów z promptu (`f71aa4e`) | 4203            |
| po skróceniu                               | 1371            |

**Objętość po skróceniu** (słowa bez składni tabel i nagłówków, wobec budżetu z propozycji):

| Część                  | Słowa | Budżet |
| ---------------------- | ----- | ------ |
| legenda przed §1       | 23    | 0      |
| §1 Opisane projekty    | 92    | 120    |
| §2 Mapa projektu       | 138   | 150    |
| §3 Analiza ficzera     | 211   | 180    |
| §4 Plan refaktoryzacji | 234   | 250    |
| §5 Domena wg DDD       | 342   | 330    |
| §6 Decyzje             | 204   | 120    |
| Luki                   | 33    | 40     |
| razem                  | 1277  | 1190   |

To ok. 2,1–2,6 strony przy 500–600 słowach na stronę, czyli nadal nieco powyżej celu: o 87 słów ponad budżet, głównie w §6 i §3. Część nadwyżki to uwagi z recenzji zewnętrznej przyjęte przy skracaniu: legenda (fakt, wniosek [I], moja decyzja), krótkie „więc …” przy strefach ryzyka i przy długu, rozdzielenie skali technicznej od kontekstu rozwoju i jawne ogniwo L2 → L3 → L4.

**Co jeszcze można uciąć** (decyzja autora; każde cięcie usuwa sprawdzony fakt):

- podział rozjazdów 8/1/3 w §5 (ok. 16 słów);
- zastrzeżenie o neutralności planu w §4 (ok. 30 słów);
- wyliczenie otwartych spraw w §6, zastąpione odesłaniem do L5 (ok. 25 słów);
- „więc …” przy strefach ryzyka w §2 i przy długu w §3 (ok. 45 słów; o te dopiski prosiła recenzja).

**Co zachować przy dalszych zmianach** (ograniczenia z poleceń autora):

- nie modyfikować artefaktów źródłowych (L2–L5) ani kodu;
- decyzje z §6 (02 D-2, 02 D-1, 03 D-1, Q-01) zostają decyzjami autora, nie faktami z artefaktów; zostaje zastrzeżenie, że L5 nadal pokazuje je jako otwarte, a ich status się nie zmienia;
- przy R-08 zostaje rozróżnienie: znika dopiero po Fazie 3 (Migracja B), nie po Fazie 1;
- rzeczy niewdrożone opisujemy trybem planu („ma być”, „mają”), a przykład rozdziela fakt, projekt L5 (niewdrożony) i decyzję autora co najmniej raz;
- cudzysłów „…” tylko przy dosłownych cytatach, a każde twierdzenie ma odwołanie do artefaktu (sekcja, wiersz V, identyfikator);
- po każdej zmianie: `npx prettier --check context/architect-report.md` i ponowna weryfikacja liczb oraz odwołań do sekcji względem artefaktów.
