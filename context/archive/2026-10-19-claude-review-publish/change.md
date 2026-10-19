---
change_id: claude-review-publish
title: Claude review posts nothing: surface the denied calls and fix the summary
status: archived
created: 2026-10-19
updated: 2026-10-19
archived_at: 2026-10-19T19:02:33Z
---

## Notes

Pierwszy prawdziwy test zmiany `claude-review` (archiwum `context/archive/2026-10-18-claude-review/`, PR #195 i #196) wypadł negatywnie na PR #205 (S-23 `dependency-hygiene`, scalony `cc978a4`): etykieta `claude-review` dodana dwa razy (14:02 i 14:07 UTC, 2026-10-19), przebiegi 39265408742 i 39266174600 zakończone `success` po 19 turach, koszt 0,84 i 0,82 USD, `permission_denials_count` 3 i 2, a na PR-ze zero komentarzy: ani podsumowania z markerem `claude-review:summary`, ani komentarzy inline („No buffered inline comments”). Log przebiegu zapisuje tylko licznik odmów, a `claude-execution-output.json` zostaje na runnerze bez artefaktu, więc odrzucone wywołania są niewidoczne; wzorzec odpowiada przebiegowi 38592940294 opisanemu w `.claude/review/claude-review.md` (odrzucone formy `gh pr comment`). Wiersze ręczne 2.5–2.8 zarchiwizowanego planu nie są spełnione (2.6 wymaga zera odmów); archiwum jest tylko do odczytu, stąd nowa zmiana (open-items §7, 7.1).

Zakres do zbadania i zaplanowania: (1) krok w `.github/workflows/claude-review.yml` wgrywający `claude-execution-output.json` jako artefakt (`if: always()`), żeby na jednym tanim PR-ze z etykietą zobaczyć odrzucone wywołania; (2) poprawka promptu albo `--allowedTools` według tej diagnozy (kandydaci: forma `gh pr comment` z wieloliniowym `--body`, narzędzia do odczytu, które prompt zakłada); (3) ponowne sprawdzenie wierszy 2.5–2.8 na 2–3 PR-ach. Do naprawy nie dodawać etykiety `claude-review` (każdy przebieg kosztuje około 0,8 USD i nic nie publikuje). Bramka `ai-review` działa poprawnie i nie jest w zakresie.
