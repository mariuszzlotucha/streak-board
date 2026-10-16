# Frame Brief: Usunięcie konta w ustawieniach (S-15 `account-deletion`)

> Etap ustalania ram przed /10x-plan. Ten dokument rejestruje, co jest _faktycznie_ przedmiotem problemu, oddzielone od tego, co początkowo założono. Data: 2026-10-16.

## Zgłoszona obserwacja

Użytkownik nie może sam usunąć konta. Polityka prywatności mówi „There is no delete button yet” i każe napisać e-mail do operatora, który usuwa konto w ciągu miesiąca (`src/components/privacy/AccountDeletion.astro:9-12`). Słowa właściciela: „new slice for removing account in settings of my. User should get warning modal first”.

## Początkowe ujęcie (zachowane)

- **Podana przez użytkownika przyczyna lub podejście**: brakuje przycisku usuwania konta na `/settings`.
- **Proponowany przez użytkownika kierunek**: przycisk „usuń konto” na `/settings`, najpierw okno z ostrzeżeniem, potem usunięcie (wycinek S-15 w `roadmap.md`).
- **Zawężenie przed delegowaniem**: powód: użytkownicy mają odchodzić sami, bez pisania do operatora (M-2 otwiera produkt dla obcych osób). Okno chroni przede wszystkim samego usuwającego przed przypadkowym kliknięciem. Właściciel oczekuje, że grupa właściciela **przetrwa** usunięcie jego konta.

## Mapa wymiarów

Obserwacja może pochodzić z każdego z tych wymiarów:

1. **Punkt wejścia i ochrona przed pomyłką**: nie ma przycisku ani okna potwierdzenia. ← początkowe ujęcie
2. **Grupa właściciela**: konto właściciela nie da się usunąć, bo baza to blokuje, a reguła domeny mówi, że właściciel jest jeden i stały. Ramy zakładają, że usunięcie konta to jedna operacja, a nie decyzja o tym, co dzieje się z grupą.
3. **Taski utworzone przez usuwającego**: usunięcie konta kasuje jego taski razem z postępem innych członków, a wyjście z grupy je zostawia. Ramy zakładają, że kaskada w bazie ma już właściwy zakres.
4. **Możliwość usunięcia po stronie serwera**: aplikacja nie ma uprawnień, żeby usunąć użytkownika z Supabase Auth. To kwestia wykonalności, a nie ram; zostaje dla `/10x-plan`.

## Badanie hipotez

| Hipoteza                                                              | Dowody                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Werdykt                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1. Brakuje przycisku i okna (początkowe ujęcie)                       | Brak przycisku jest prawdziwy (`AccountDeletion.astro:9`). Okno potwierdzenia już istnieje jako wzorzec: `ConfirmAction` w `GroupSettingsCard.astro:29-35` („Delete group”, „This cannot be undone”), a `alert-dialog` jest w `src/components/ui/`. `/api/account` jest już chronione (`src/middleware.ts:9`).                                                                                                                                                                                                                                                                                       | SŁABE: prawdziwe, ale to łatwa część |
| 2. Grupa właściciela musi przetrwać, a dziś nie może                  | `groups.owner_id … on delete restrict` (`20260925003350_create_groups_and_group_members.sql:15`) celowo: „implementator przyszłej funkcji usuwania konta musi jawnie obsłużyć »usuń lub przekaż grupę«” (`archive/2026-09-25-group-schema-and-rls/plan.md:55,72`). Reguła N-02: jeden stały właściciel, wychodzi tylko przez usunięcie grupy (`context/domain/01-domain-distillation.md:160`, `glossary.md:11`; `leave.ts:21-33`). Otwarte pytanie Q-09 tego samego dokumentu (`:246`). Polityka obiecuje, że grupa znika (`AccountDeletion.astro:13-15`). Nie istnieje żadne przekazanie własności. | SILNE                                |
| 3. Taski usuwającego mają przetrwać, a dziś znikają z postępem innych | `tasks.created_by … on delete cascade` (`20260930120000_create_tasks.sql:21`), a odznaczenia innych idą za taskiem kaskadą (`task_checkoffs` → `task_participants` → `tasks`). Wyjście z grupy zostawia taski (`archive/2026-09-30-task-create-and-manage/plan.md:17,34`: zostają, ale nikt nimi nie zarządza). Polityka obiecuje usunięcie tych tasków (`AccountDeletion.astro:17-20`).                                                                                                                                                                                                             | SILNE                                |
| 4. Serwer nie ma uprawnień do usunięcia użytkownika Auth              | Aplikacja czyta tylko `SUPABASE_URL` i `SUPABASE_KEY`; żadnego klucza service-role ani `admin.deleteUser` w `src/` i `astro.config.mjs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | SILNE, ale to wykonalność, nie ramy  |

## Sygnały zawężające

- Właściciel: grupa **musi przetrwać** usunięcie konta właściciela **w tym wycinku**. To odrzuca warianty „na razie grupa znika” i „na razie właściciel jest blokowany” i zmienia regułę N-02.
- Właściciel: pozostali członkowie **zachowują taski** usuwającego i swój postęp na nich, tak jak po zwykłym wyjściu z grupy. To odwraca obecną kaskadę i obietnicę polityki prywatności.
- Okno ma chronić usuwającego przed pomyłką, nie informować innych. Wzorzec `ConfirmAction` wystarcza na tę część.

## Konwencja między systemami

Dane wspólne przeżywają usunięcie osoby, która je utworzyła. Jeśli przestrzeń ma właściciela, własność przechodzi na kogoś innego albo przestrzeń znika tylko wtedy, gdy nie zostaje w niej nikt. W tym repo projekt grup przewidział ten moment: `on delete restrict` istnieje po to, żeby usunięcie konta nie skasowało grupy po cichu (`group-schema-and-rls/plan.md:72`). Wiodąca hipoteza (2 + 3) jest zgodna z tą intencją. Obecna polityka prywatności (grupa i taski znikają) opisuje stan bazy, a nie decyzję produktową, bo Q-09 nigdy nie zostało rozstrzygnięte.

## Przeformułowany (lub potwierdzony) opis problemu

> **Rzeczywisty problem, wokół którego należy planować, to**: usunięcie konta musi zabrać dane osoby, ale nie dane, z których korzystają inni. Grupa właściciela przechodzi na innego członka, a taski usuwającego zostają w grupie razem z postępem pozostałych.

Przycisk i okno to najmniejsza część. Jest do tego gotowy wzorzec. Żeby tak usuwać, trzeba zmienić regułę domeny N-02 (jeden stały właściciel) i rozstrzygnąć Q-09. Zmienia to też PRD (FR-003 i sekcja uprawnień), słownik, odwrócone obietnice polityki prywatności oraz dwie relacje w bazie, które dziś wymuszają przeciwne zachowanie. Bez tego przycisk albo zawiedzie dla każdego właściciela grupy, albo po cichu skasuje postęp innych.

Pytania domenowe, których ta rama nie rozstrzyga (dla właściciela, w `/10x-plan`):

- Kto zostaje nowym właścicielem: reguła automatyczna (np. najdłużej obecny członek) czy wybór właściciela w oknie przed usunięciem?
- Co, gdy właściciel jest jedynym członkiem: grupa znika razem z kontem?
- Kto zarządza taskiem, którego twórca usunął konto? Dziś po wyjściu z grupy nikt (`task-create-and-manage/plan.md:34`). Czy to samo wystarczy, skoro twórca nie może już wrócić?
- Zachowany task nie może dalej wskazywać na usuniętą osobę w sposób, który ją identyfikuje (polityka obiecuje usunięcie danych).
- Czy przekazanie własności istnieje tylko przy usuwaniu konta, czy także jako zwykła akcja w ustawieniach (np. żeby właściciel mógł wyjść z grupy)? To decyzja o zakresie.

## Pewność

- **WYSOKA**: dwie jawne decyzje właściciela, potwierdzone przez stan bazy, regułę N-02, otwarte Q-09 i zapisaną intencję z planu grup.

## Co zmienia się dla /10x-plan

Plan dotyczy przede wszystkim reguły „co zostaje po usuniętym koncie”: następcy właściciela, zachowania tasków i postępu innych, zmian w bazie i w PRD, słowniku i polityce prywatności. Przycisk z oknem (wzorzec `ConfirmAction`) i usunięcie z Supabase Auth (punkt 4) są częściami tego planu, a nie jego osią. Wycinek urósł względem opisu w `roadmap.md`: plan powinien ocenić, czy przekazanie własności nie jest osobnym, wcześniejszym wycinkiem.

## Odniesienia

- Pliki źródłowe: `src/components/privacy/AccountDeletion.astro:9-20`, `supabase/migrations/20260925003350_create_groups_and_group_members.sql:15,24`, `supabase/migrations/20260930120000_create_tasks.sql:21`, `supabase/migrations/20261001090000_create_task_participants.sql:92-116`, `src/pages/api/groups/leave.ts:21-33`, `src/components/dashboard/GroupSettingsCard.astro:29-35`, `src/middleware.ts:9`
- Domena: `context/domain/01-domain-distillation.md:160` (N-02), `:246` (Q-09); `context/domain/glossary.md:11,21`
- Wcześniejsze decyzje: `context/archive/2026-09-25-group-schema-and-rls/plan.md:55,72`; `context/archive/2026-09-30-task-create-and-manage/plan.md:17,34`
- PRD: `context/foundation/prd.md` FR-003, sekcja „Access Control”
- Powiązane badania: brak (`research.md` jeszcze nie istnieje)
- Zadania badawcze: odczyty wykonane bezpośrednio w sesji, bez osobnych pod-agentów
