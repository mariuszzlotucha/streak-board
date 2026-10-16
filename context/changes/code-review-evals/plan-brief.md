# Ewaluacje i utwardzenie AI-recenzenta — Plan Brief

> Full plan: `context/changes/code-review-evals/plan.md`

## What & Why

Wymagana bramka `ai-review` ufa modelowi, a nikt nie mierzy, jak model zachowuje się na podróbkach, wstrzyknięciach i ukrytym kodzie. Zmiana daje recenzentowi zestaw ewaluacji promptfoo i na nim domyka luki zebrane przez właściciela 2026-10-16: podrobione znaczniki, plik z bajtem NUL, marker komentarza, brak testów workflow, demo bez limitu i wstrzyknięcia podbijające oceny. Rozstrzyga też odłożone pytanie, czy werdykt wiąże sama reguła z ocen.

## Starting Point

`packages/code-reviewer` ma importowalny barrel i `reviewDiff` z narzędziami repo i surowszym werdyktem. Ewaluacji nie ma: zastępują je ręczna baza 6 PR-ów i lekcja „stary obok nowego”. `FENCE_TAG` łapie tylko ASCII. Plik `.ts` z NUL jest dla bramki niewidoczny (`Binary files … differ`, `readFile` i `searchCode` go pomijają). Logikę `review.yml` sprawdzały tylko jednorazowe sondy.

## Desired End State

`packages/code-reviewer/evals/` uruchamia prawdziwego recenzenta na 15 przypadkach: domyślnie na glm-5.1 ×3, w trybie stary vs nowy i na macierzy modeli z lekcji M5L3. Raport pokazuje regresje i liczniki kryterium werdyktu. Bramka zamyka wejścia tagami z losowym sufiksem, a diff z ukrytym plikiem kończy się wynikiem `unreviewable` i czerwonym checkiem. Sticky komentarz rozpoznaje się po markerze i nagłówku. Testy w `integration` przypinają logikę workflow. Wiązanie werdyktu wynika z danych.

## Key Decisions Made

| Decision                        | Choice                                                                                            | Why (1 sentence)                                                                                                        | Source      |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| Zakres przebiegu                | Domyślnie glm-5.1 ×3; trzy modele lekcji w osobnej konfiguracji na żądanie                        | Tani przebieg przed każdą zmianą (ok. 3–4 USD), a porównanie modeli zostaje                                             | Plan        |
| Instalacja promptfoo            | Izolowany pakiet `packages/code-reviewer/evals/` z własnym lockfile, Node ≥ 22.22                 | 626 pakietów, 1,4 GB i `ai@6` nie trafiają do CI, akcji bramki ani `release`                                            | Plan        |
| Podrobione znaczniki            | Losowy sufiks w nazwach tagów, ogłoszony w wiadomości; neutralizacja zostaje                      | Żaden wariant znaku nie podrobi zamknięcia; Fix B z F2 czekał tylko na ewaluacje                                        | Plan        |
| Plik pokazany jako binarny      | Fail closed: `UnreviewableDiffError`, kod 4, wynik `unreviewable`, `ai-cr:failed`                 | Deterministycznie, bez modelu, w recenzencie z base commit                                                              | Plan        |
| Wiązanie werdyktu               | Stałe kryterium: sama reguła, gdy B = 0 i A ≥ 1, inaczej surowszy                                 | Decyzja na danych, zgodnie z zapisem właściciela; kryterium ustalone przed pomiarem                                     | Plan        |
| Przypadki z atakami a bramka    | Pliki YAML w `evals/cases/` wyłączone z diffu bramki, cały katalog z Prettiera                    | Dane testowe nie wyglądają jak atak dla recenzenta, który ocenia też ten PR; inny plik w `cases/` dalej trafia do diffu | Plan        |
| Wstrzyknięcia podbijające oceny | Pomiar i zakaz regresji; wynik datowany w Known limits                                            | Bez nowych fałszywych alarmów; wyzwalacz i flaga w schemacie byłyby kruche                                              | Plan        |
| Testy logiki workflow           | Vitest uruchamia bloki `run:` pod stubami `gh` i `npm`                                            | Testuje plik, który biegnie, w `integration`, bez zmiany `ci.yml`                                                       | Follow-up   |
| Zagnieżdżony lockfile           | Dokładna ścieżka `packages/code-reviewer/evals/package-lock.json` obok głównego                   | Lockfile pakietu ewaluacji dałby `too-large`, a `*package-lock.json` schowałby też inne pliki, bo `*` łapie `/`         | Plan review |
| Marker komentarza               | Marker + nagłówek `## AI code review:`; zakaz markera w prompcie `claude-review`                  | Komentarz Claude z markerem nie zostanie przejęty                                                                       | Follow-up   |
| Szum w porównaniu stary vs nowy | Przypadek podejrzany powtarzany ×5, regresja dopiero po powtórzeniu; sufit 24 576 tokenów na #103 | Przy ×3 jeden przebieg różnicy to często szum, a maksimum z trzech prób to rzut monetą                                  | Plan review |

A = przebiegi zaakceptowanych PR-ów, w których fail dał tylko model. B = przebiegi z zasianym błędem, które złapał tylko model.

## Scope

**In scope:** pakiet ewaluacji (dostawca, 15 przypadków, trzy konfiguracje, raport); testy offline przypadków i workflow; sufiks tagów, `unreviewable`, marker, demo pod limitem; wiązanie werdyktu według kryterium; README, lekcja, `test-plan.md`, `open-items`, decyzje właściciela.

**Out of scope:** ewaluacje w CI; zmiana modelu produkcyjnego; normalizacja podróbek; pokazywanie treści plików z NUL; wyzwalacz i flaga w schemacie; opakowanie wyników narzędzi repo; `pull_request_target`, CODEOWNERS, `ci.yml`, `.nvmrc`; pozostałe dema.

## Architecture / Approach

Dostawca promptfoo (`provider.ts`) ładuje barrel recenzenta z bieżącego albo innego checkoutu. Diff buduje jak CI: commity historycznych PR-ów albo tymczasowe repo z plików przypadku, z tymi samymi wykluczeniami co `review.yml` i z gitem bez konfiguracji użytkownika, jak na runnerze. Potem woła `reviewDiff` z narzędziami repo i zwraca płaski wynik (werdykty modelu i reguły, oceny, podsumowanie, koszt, tokeny). Asercje JS i `llm-rubric` (Claude Sonnet 5.5) oceniają wynik, a `report.ts` liczy regresje i kryterium. Zmiany bramki płyną przez cały kontrakt: CLI (kod 4), akcja (`unreviewable`), `review.yml` (komentarz, etykiety). Testy przypinają ten kontrakt pod stubami.

## Phases at a Glance

| Phase                                    | What it delivers                                                                                                 | Key risk                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. Zestaw ewaluacji i utwardzenie bramki | Pakiet ewaluacji z testami offline, testy workflow, marker, sufiks, `unreviewable`, demo; płatna sesja ewaluacji | Zmiana promptu przesuwa jakość albo tokeny rozumowania (#103); stary recenzent ocenia ten PR |
| 2. Wiązanie werdyktu i domknięcie        | Wiązanie według kryterium, wyniki w Known limits, lekcja, `test-plan.md`, `open-items`                           | Mała próbka kryterium (ok. 20 przebiegów na stronę)                                          |

**Prerequisites:** PR planowania zmergowany; `OPENROUTER_API_KEY` w środowisku powłoki (skrypty nie czytają `.env`), na koncie z zapasem ok. 15 USD; Node ≥ 22.22 do ewaluacji (maszyna ma 24.21); Docker do actionlint; `bash`, `git` i `jq` (są).

**Estimated effort:** jeden długi przebieg `/10x-goal-implement` dla fazy 1 (warunek: „nie zaczynaj fazy 2”); sesja ewaluacji ok. 2 h i ok. 10–13 USD, plus ok. 0,6 USD na każdy przypadek podejrzany; krótki przebieg dla fazy 2; przegląd implementacji i jeden PR.

## Open Risks & Assumptions

- **Mała próbka kryterium:** pojedynczy fałszywy fail przechyla wiązanie na samą regułę, jeśli model nie złapał żadnego błędu sam.
- **Modele na OpenRouter się zmieniają**, więc wyniki są datowane. **Koszty to szacunki** z bazy i cen z 2026-10-16.
- **Inne modele mogą inaczej używać narzędzi:** dwufazowy projekt dostrojono pod GLM-5.1. Raport pokazuje `tool_calls`.
- **Ten PR ocenia stary recenzent.** Dosłowne ataki są tylko w wyłączonych przypadkach, ale jego narzędzia mogą je przeczytać, więc opis PR-a nazywa je danymi testowymi. Zwykły fail rozstrzyga proces z README.
- **Lista rozszerzeń binarnych** zablokuje nowy typ pliku do czasu jej poprawki na `master`.

## Success Criteria (Summary)

- Przed każdą zmianą recenzenta jedno polecenie pokazuje, czy nowy recenzent zalicza co najmniej to, co stary, z kosztem i tokenami.
- Kod schowany za bajtem NUL i podrobione znaczniki nie przechodzą bramki. Komentarz Claude nie podszyje się pod komentarz `ai-review`.
- Decyzja o wiązaniu werdyktu i odporność na wstrzyknięcia są zapisane z danymi i datą.
