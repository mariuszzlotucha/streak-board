---
title: "Raport architektoniczny: do zrobienia"
created: 2026-10-07
type: todo
---

# Raport architektoniczny: do zrobienia

Notatka do `context/architect-report.md` (raport z modułu 4, 10xArchitect). To nie jest artefakt źródłowy. Zbiera dwie rzeczy, które zostały do zrobienia po tej gałęzi:

- [ ] **Autor dopisuje własne powody** przy czterech decyzjach z L5 (sekcja 1). Raport ma tam dziś „BRAK artefaktu”.
- [ ] **Raport trzeba skrócić** do około dwóch stron (sekcja 2). Dziś ma ok. 4200 słów.

## 1. Do uzupełnienia przez autora

### Wymagane: „dlaczego” przy czterech decyzjach z L5

Prompt wymaga w §6: „co AI podpowiedziało, a co rozstrzygnąłeś samodzielnie i dlaczego”. Raport ma pierwsze dwie części. Własnych powodów autora nie ma w żadnym artefakcie: L5 zapisuje tylko powody swoich rekomendacji. Dlatego w raporcie stoi „BRAK artefaktu” i nie wolno tego uzupełniać domysłem ani powodami z L5.

| Decyzja                                  | Co raport mówi, że rozstrzygnięto                                                                               | Gdzie dopisać „Dlaczego: …”       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 02 D-2, okno dat                         | luka zamknięta; funkcje SQL mają zapisywać tylko bieżący okres                                                  | `context/architect-report.md:151` |
| 02 D-1, okres widziany przez użytkownika | odznaczenie albo jego cofnięcie ma być odrzucane bez zapisu (HTTP 409), gdy widziany okres nie jest już bieżący | `context/architect-report.md:152` |
| 03 D-1, ACL                              | Fazy 1–3 i 6; Fazy 4–5 czekają na osobną decyzję                                                                | `context/architect-report.md:153` |
| Q-01, spadek streaka                     | reguła „połowa, w dół” jest ostateczna; do poprawy jest PRD, nie kod                                            | `context/architect-report.md:154` |

Kroki. Numery linii dotyczą stanu z commita, w którym dodano ten plik, więc przy każdym kroku jest fraza do wyszukania.

1. `context/architect-report.md:145`, akapit „W skrócie” w §6: zastąp ostatnie zdanie („Dlaczego rozstrzygnąłem te cztery sprawy z L5 tak, a nie inaczej: BRAK artefaktu, bo …”) swoimi powodami. Wystarczy jedno zdanie na całość albo cztery krótkie człony.
2. `context/architect-report.md:151-154` (opcjonalnie): na końcu każdego punktu dopisz „Dlaczego: …”.
3. `context/architect-report.md:160`, „Luki i zależności”: usuń z listy BRAK fragment „moich własnych uzasadnień czterech decyzji z L5,”.

Pisz własnymi słowami. To Twoje powody, więc nie musisz ich opierać na artefaktach. Tych samych decyzji dotyczą jeszcze linie 20, 127 i 137, ale prompt wymaga „dlaczego” tylko w §6, więc tam nic nie trzeba zmieniać.

### Opcjonalnie

- **Otwarte kwestie produktowe** (`context/architect-report.md:156`): raport zgłasza dwie niewiadome, które rozstrzyga tylko właściciel produktu. Jeśli zapadną, dopisz je w §6 jako kolejne decyzje. (1) Reguła okresu: strefa Warszawa i poniedziałkowy początek `weekly` są w kodzie i w modelu L5 (T-10, N-19), ale PRD ich nie podaje (B-07). (2) Obsługa konfliktu 409 w UI: L5-02 przewiduje tylko przeładowanie strony (§4.6), bez komunikatu.
- **Zapis decyzji w artefaktach L5:** cztery decyzje z tabeli wyżej nie są zapisane w L5, które nadal pokazuje je jako otwarte, i raport mówi o tym wprost. Zapis byłby osobną zmianą. W tej gałęzi artefaktów źródłowych celowo nie ruszano.

## 2. Raport ma być krótszy

**Wymaganie** (oryginalny prompt modułu 4): „zwięzły two-pager (~2 strony)” i „Maksymalnie dwie strony. Tnij, nie streszczaj wszystkiego.” Autor powtórzył je w liście kontrolnej: najwyżej około dwóch stron. Dwie strony to ok. 1000–1200 słów (szacunek przy 500–600 słowach na stronę prozy).

**Stan:** raport tego nie spełnia i w tej gałęzi urósł.

| Wersja                                     | Słowa (`wc -w`) |
| ------------------------------------------ | --------------- |
| master po PR #84 (`ff717ef`)               | 1278            |
| po rundach recenzji (`560eeb3`)            | 3094            |
| po dodaniu elementów z promptu (`f71aa4e`) | 4203            |

To ok. 3,5–4,2 razy więcej niż dwie strony.

**Gdzie jest objętość** (słowa bez składni tabel i nagłówków, stan z `f71aa4e`):

| Część                                                           | Słowa |
| --------------------------------------------------------------- | ----- |
| wstęp przed §1 (tabela A/B i przykład fakt / projekt / decyzja) | 428   |
| §1 Opisane projekty                                             | 251   |
| §2 Mapa projektu                                                | 304   |
| §3 Analiza ficzera                                              | 330   |
| §4 Plan refaktoryzacji                                          | 627   |
| §5 Domena wg DDD (5.1–5.5; sam 5.3: 559)                        | 1266  |
| §6 Decyzje                                                      | 639   |
| Luki i zależności                                               | 70    |
| razem                                                           | 3915  |

**Dlaczego jest długi:** kolejne recenzje domagały się rozdzielenia faktu, projektu L5 (niewdrożonego) i decyzji autora w przykładzie z odznaczeniem (okres, HTTP 409). Ten sam przykład jest więc opowiedziany trzy razy (wstęp, §5.3, §6), a decyzje powtarzają się we wstępie, w §5.3, §5.4 i §6. Ostatnia runda dodała brakujące elementy promptu i niczego nie skracano, bo autor polecił: „dodaj to czego nie ma, ale nie skracaj nic”.

**Propozycja skrócenia** (do decyzji autora, jeszcze nie wykonana):

- usunąć wstęp (428 słów) i §5.5 (61 słów);
- przykład z okresem zostawić raz, w §5.3: fakt / projekt L5-02 (niewdrożony) / moja decyzja, ok. 120 słów; resztę zastąpić odesłaniem do L5-02, który ją zawiera;
- §6 sprowadzić do ok. 5 zdań (akapit „W skrócie” ma już 4) i usunąć powtórzenia decyzji z innych sekcji;
- w §4 zostawić jedną linię na fazę z kolumną auto/ręcznie, a „Docelowy kształt” skrócić do jednego zdania;
- docelowo ok. 1000–1200 słów; orientacyjny budżet: §1 120, §2 150, §3 180, §4 250, §5 330, §6 120, Luki 40.

**Co zachować przy skracaniu** (ograniczenia z poleceń autora):

- nie modyfikować artefaktów źródłowych (L2–L5) ani kodu;
- decyzje z §6 (02 D-2, 02 D-1, 03 D-1, Q-01) zostają decyzjami autora, nie faktami z artefaktów; zostaje zastrzeżenie, że L5 nadal pokazuje je jako otwarte, a ich status się nie zmienia;
- przy R-08 zostaje rozróżnienie: znika dopiero po Fazie 3 (Migracja B), nie po Fazie 1;
- rzeczy niewdrożone opisujemy trybem planu („ma być”, „mają”), a przykład rozdziela fakt, projekt L5 (niewdrożony) i decyzję autora co najmniej raz;
- cudzysłów „…” tylko przy dosłownych cytatach, a każde twierdzenie ma odwołanie do artefaktu (sekcja, wiersz V, identyfikator);
- po skróceniu: `npx prettier --check context/architect-report.md` i ponowna weryfikacja liczb oraz odwołań do sekcji względem artefaktów.
