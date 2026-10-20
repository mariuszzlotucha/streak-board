# Dry-run `claude-review` na PR #226 (S-24, faza 1)

Data: 2026-10-20. Cel: pierwszy przebieg promptu z #225 (`.claude/review/claude-review.md`) na prawdziwym PR-ze, na subskrypcji Claude, poza limitem 1,5 USD z evalu.

## Przebieg

- Polecenie: `node scripts/claude-review-dry-run.mjs 226 --claude 'npx -y @anthropic-ai/claude-code@2.1.296'` (wersja jak w CI), z worktree na gałęzi `s-24/reviewers-hardening/tooling`, czyli z `checkSummaryBody` po zmianie (bez wzmianek i linków poza kodem). Skrypt czyta prompt i pliki z checkoutu, a z `gh` bierze tylko diff i dane PR-u; #226 jest scalony, więc różnica względem merge commitu z CI nie ma znaczenia.
- Wyjście: kod 0, `OK: one summary through --body-file -, body checks passed, no gh pr comment denial`.
- Tury: 7. Odmowy poleceń: 0. Narzędzia: `Read`, `Bash`. Koszt nominalny: 0,26 USD (cena API; CI i ten przebieg idą przez subskrypcję), nie 0,8 USD jak w szacunku planu.
- Liczba przebiegów: 1 z dozwolonych 2. Prompt bez zmian.

## Zapisane podsumowanie

```
<!-- claude-review:summary -->
## Claude review: APPROVED

Commit cb7d540. The only code change is one sentence in `REVIEWER_INSTRUCTIONS` (packages/code-reviewer/prompts/reviewer.ts:45) naming English as the output language; it sits inside the template literal, does not touch the schema or verdict rule, and the old-against-new eval that lessons.md requires for reviewer changes is recorded in the PR.

### Findings

None.

### Not verified

- The rate of `response did not match schema` errors and the 600 s timeouts reported in the PR body were not reproduced here; the checkout cannot run the eval.
```

## Ocena ręczna (rzeczy, których skrypt nie sprawdza)

| Kontrola                                      | Wynik                                                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Tylko angielski                               | Tak, całe podsumowanie.                                                                                                    |
| Brak uwagi o pliku Markdown                   | Tak. PR zmienia też README-ki i folder zmiany, a sekcja „Findings” to „None.”; recenzent oparł się na jednej zmianie kodu. |
| Brak wzmianki `@` i linku                     | Tak (reguła z #225, teraz sprawdzana mechanicznie przez `checkSummaryBody`).                                               |
| Linia `Commit`                                | `cb7d540`, czyli `headRefOid` z #226, nie merge commit `fd3f52d`.                                                          |
| Kształt (marker, werdykt, jedno podsumowanie) | Zgodny z szablonem; jeden `gh pr comment --body-file -`.                                                                   |

## Czego ten przebieg nie pokazuje

- Komentarze inline: narzędzie MCP nie istnieje lokalnie, więc połowa reguł z #225 (angielski i brak wzmianek w komentarzach inline, awaria komentarza inline) czeka na prawdziwy PR z etykietą `claude-review`.
- Zachowanie przy więcej niż 8 znaleziskach: PR #226 nie ma ani jednego znaleziska.
- Jeden przebieg na jednym PR-ze nie mierzy rozrzutu między przebiegami.

## Prawdziwy przebieg na PR #229 (etykieta `claude-review`, 2026-10-20)

Pierwszy prawdziwy przebieg promptu z #225 w CI, razem z komentarzem inline, którego dry-run lokalnie nie ćwiczy.

| Kontrola             | Wynik                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Werdykt              | APPROVED, podsumowanie po angielsku.                                                                   |
| Komentarz inline     | Jeden, LOW, `provider.ts:384` (pisownie `"."` w `reviewerRoot`), po angielsku.                         |
| Wzmianki `@` i linki | Brak, w podsumowaniu i w komentarzu inline.                                                            |
| Uwagi o dokumentacji | Brak, mimo że PR zmienia README-ki i folder zmiany.                                                    |
| Poprawka             | Naprawiona w `6d55595` (każda pisownia `"."` zostaje na tym checkoucie); PR zmergowany jako `de080b2`. |

Połowa reguł, której dry-run nie widział (angielski i brak wzmianek w komentarzu inline), jest więc potwierdzona na jednym prawdziwym PR-ze. Zachowanie przy więcej niż 8 znaleziskach i rozrzut między przebiegami nadal nie są zmierzone.
