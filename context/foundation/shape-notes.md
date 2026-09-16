---
project: "StreakBoard"
context_type: greenfield
created: 2026-09-14
updated: 2026-09-14
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: false
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "brak presji społecznej w narzędziach solo + ręczne narzędzie było męczące + istniejące apki nie obsługują wielu osób na jeden cel"
    - topic: "insight"
      decision: "prosty widok siatki zielony/czerwony już wystarczał; brakowało automatyzacji i grywalizacji (streaki/poziomy), której arkusz nie miał"
    - topic: "persona scope"
      decision: "nieustalone — bliska grupa znajomych na start, szerszy zasięg (dowolne małe grupy) otwarty do rozstrzygnięcia później"
    - topic: "access model"
      decision: "logowanie (email/OAuth/passwordless); role: twórca celu/grupy ma dodatkowe uprawnienia (np. usunięcie grupy/celu, usuwanie członków), reszta członków równa"
    - topic: "MVP first flow"
      decision: "otwarcie appki (zalogowany) → zakładka Zadania → odznaczenie tasku (jednorazowego lub powtarzalnego, indywidualnego lub grupowego) → zakładka Tablica wyników; 3 tygodnie pracy po godzinach, potwierdzone"
    - topic: "group/task joining model"
      decision: "dwupoziomowy: grupa = stała przestrzeń, dołącza się raz przez link/kod; task = element w grupie, tworzony przez członka, inni opcjonalnie się zapisują. Twórca grupy zarządza grupą, twórca tasku zarządza taskiem."
  frs_drafted: 9
  quality_check_status: accepted
---

# Shape Notes

Seed idea: Grupowy Todoist z grywalizacją — wspólna lista zadań, dołączanie przez link/kod, punkty/streaki i poziomy indywidualne za wykonane zadania. Zawężenie na start (sugestia z idea-check, do potwierdzenia z użytkownikiem): jedna lista na grupę, bez ról. Otwarte pytania z idea-check: czy wiele grup na użytkownika, tablica wyników i odznaki wchodzą do MVP czy są rozszerzeniem.

Kontekst uczestnika: doświadczony programista, nowy w pracy z agentami AI; termin docelowy 2026-11-04; liczba godzin tygodniowo nieustalona.

## Vision & Problem Statement

Ty i grono przyjaciół macie trudność z utrzymaniem motywacji do indywidualnych nawyków (np. trening, czytanie książki). Wcześniej korzystaliście ze wspólnie prowadzonego arkusza Google, w którym każdego dnia kolorowaliście komórki na zielono (zrealizowano) lub czerwono (nie zrealizowano) dla każdej kategorii/celu; wielu użytkowników mogło być podpiętych pod ten sam cel. Wartość dawała widoczność dla innych, ale ręczne prowadzenie arkusza było męczące i narzędzie w końcu przestało być używane.

Istniejące aplikacje do budowania nawyków są projektowane dla pojedynczego użytkownika i nie obsługują modelu, w którym kilka osób śledzi ten sam cel równolegle i widzi nawzajem swoją konsekwencję. Sam prosty widok siatki (zielony/czerwony) już wystarczał, by to działało — brakowało tylko automatyzacji tego widoku i mechanizmu grywalizacji (streaki/poziomy), który nagradza konsekwencję w czasie.

> Wgląd (skala 100x): przy setkach grup zamiast garstki znajomych, próg "spowolnienia" streaka przestaje być stały globalnie — użytkownik widzi to jako ustawienie konfigurowalne per grupa (np. przez admina grupy lub cotygodniowe głosowanie członków), nie jako jedną sztywną regułę dla wszystkich.

## User & Persona

Osoba budująca lub utrzymująca osobisty nawyk/cel (np. trening, czytanie), która pozostaje zmotywowana dzięki widoczności swojej konsekwencji wśród grona znajomych śledzących ten sam lub podobny cel równolegle. Kontekst: wcześniej korzystała z ręcznie prowadzonego, wspólnego arkusza z przyjaciółmi. Moment sięgnięcia po produkt: codziennie, żeby odznaczyć, czy dana czynność została wykonana, i zobaczyć, jak radzi sobie reszta grupy.

Zakres persony (jak szeroko myśleć o bazie użytkowników — zamknięte grono znajomych vs dowolne małe grupy) pozostaje nieustalony; do rozstrzygnięcia przy ramowaniu produktu (Faza 6) lub jako otwarte pytanie w PRD.

## Access Control

Logowanie (email+hasło / OAuth / passwordless) — potrzebne, bo produkt jest z założenia grupowy i użytkownicy wracają z różnych urządzeń/sesji, żeby widzieć postępy innych członków celu/grupy.

Model dwupoziomowy: **grupa** to stała przestrzeń (wspólna tablica), do której użytkownik dołącza raz — przez link/kod. **Task** to element wewnątrz grupy, tworzony przez jednego z jej członków; inni członkowie grupy widzą wszystkie taski i opcjonalnie zapisują się do wybranych.

Uprawnienia: twórca grupy zarządza grupą (może usunąć grupę, usunąć z niej członków). Twórca tasku zarządza swoim taskiem (edytuje, usuwa). Pozostali członkowie są sobie równi — mogą dołączać do grupy (przez link/kod), tworzyć własne taski, zapisywać się/wypisywać z tasków innych, odznaczać własną realizację.

## Success Criteria

### Primary
- Użytkownik otwiera aplikację (zalogowany), widzi zakładkę „Zadania" ze swoimi taskami (jednorazowymi lub powtarzalnymi — codziennie/co tydzień; indywidualnymi lub grupowymi), odznacza task jako wykonany, i przechodzi do zakładki „Tablica wyników", gdzie widzi ranking/postępy swoje i grupy. Dostarczalne w 3 tygodnie pracy po godzinach.

### Secondary
- Powiadomienia/przypomnienia o niewykonanym tasku.
- Historia/statystyki długoterminowe (wykresy streaków w czasie).

### Guardrails
- Widoczność tylko dla własnej grupy — członkowie jednej grupy nie widzą tasków/wyników grupy, do której nie należą.
- Odznaczenie tasku musi być natychmiastowe (bez zauważalnego opóźnienia) — to kluczowa interakcja motywacyjna.

## Functional Requirements

### Autoryzacja
- FR-001: Użytkownik może się zalogować (email/OAuth/passwordless). Priority: must-have
  > Socrates: Counter-argument considered: "bez logowania nie da się śledzić streaków/tożsamości
  > w czasie". Resolution: kept; trwałe konto jest wymogiem funkcjonalnym dla całej mechaniki
  > grywalizacji.

### Grupy
- FR-002: Użytkownik może dołączyć do grupy przez link/kod. Priority: must-have
  > Socrates: No counter-argument considered; stands as written.
- FR-003: Twórca grupy może zarządzać grupą (usunąć grupę, usunąć z niej członka). Priority: must-have
  > Socrates: Counter-argument considered: "jedna osoba z pełną kontrolą to single point of
  > failure, jeśli zniknie/straci dostęp". Resolution: kept; prosty model jednego admina
  > wystarczy na MVP dla małej grupy znajomych.

### Taski
- FR-004: Użytkownik może utworzyć task w grupie (jednorazowy lub powtarzalny: dziennie/tygodniowo). Priority: must-have
  > Socrates: Counter-argument considered: "dwa typy cykli to więcej złożoności niż trzeba na
  > start". Resolution: kept; bez tego MVP nie oddaje realnego use case'u (trening codziennie,
  > czytanie książki tygodniowo).
- FR-005: Twórca tasku może nim zarządzać (edytować, usunąć). Priority: must-have
  > Socrates: Counter-argument considered: "task staje się osierocony, jeśli jego twórca opuści
  > grupę — nikt inny nie może go poprawić". Resolution: kept; to najmniejszy model wystarczający
  > na MVP, edge case odejścia twórcy do rozwiązania później.
- FR-006: Użytkownik może dołączyć (zapisać się) do tasku stworzonego przez innego członka grupy. Priority: must-have
  > Socrates: Counter-argument considered: "otwarte dołączanie może zaśmiecić tablicę wyników
  > nieaktywnymi uczestnikami". Resolution: kept; to sedno pomysłu — bez tego nie ma wspólnej
  > motywacji ("wielu userów na jeden cel").
- FR-007: Użytkownik może wypisać się z tasku, do którego jest zapisany. Priority: must-have
  > Socrates: Counter-argument considered: "wypisanie się może zaburzyć wspólny streak/licznik
  > grupy, jeśli inni na nim polegają". Resolution: kept; bez tego użytkownik utknie w taskach,
  > których nie chce już robić.
- FR-008: Użytkownik może odznaczyć wystąpienie tasku jako wykonane. Priority: must-have
  > Socrates: Counter-argument considered: "system opiera się w pełni na uczciwości — nic nie
  > weryfikuje, że task faktycznie wykonano". Resolution: kept; to zamierzone — produkt jest dla
  > zaufanego grona znajomych, weryfikacja nie jest potrzebna w tej skali.

### Tablica wyników
- FR-009: Użytkownik może zobaczyć tablicę wyników swojej grupy. Priority: must-have
  > Socrates: Counter-argument considered: "publiczna tablica wyników może zniechęcać osoby,
  > które zostają w tyle, zamiast motywować". Resolution: kept; to sedno wartości produktu —
  > widoczność wyników to główny mechanizm motywacyjny (potwierdzone w Fazie 1).

## User Stories

### US-01: Użytkownik odznacza task jako wykonany i widzi wynik w tablicy grupy

- **Given** zalogowany użytkownik należący do grupy, z co najmniej jednym taskiem, do którego jest zapisany
- **When** otwiera zakładkę „Zadania” i odznacza task jako wykonany
- **Then** task jest oznaczony jako zrealizowany na dziś, a wynik jest natychmiast widoczny w tablicy wyników grupy

## Business Logic

Za każdy dzień/okres, w którym użytkownik wykona przypisany task, jego streak dla tego tasku rośnie o jeden; za każdy pominięty dzień/okres streak spada o wartość mniejszą niż jego pełny stan (nie zeruje się całkowicie), a suma streaków użytkownika decyduje o jego pozycji w tablicy wyników grupy.

Reguła korzysta z pojedynczego wejścia widocznego dla użytkownika: czy dany task został odznaczony jako wykonany w swoim okresie (dzień/tydzień) czy nie. Wynikiem jest aktualna wartość streaka per task oraz suma streaków per użytkownik. Użytkownik spotyka się z tą regułą dwojako: natychmiast po odznaczeniu tasku widzi zaktualizowany streak, a przy wejściu w zakładkę „Tablica wyników” widzi swoją pozycję względem reszty grupy wynikającą z sumy streaków.

## Non-Functional Requirements

- Wszystkie kluczowe działania (przegląd tasków, odznaczanie, tablica wyników) są w pełni użyteczne na ekranie smartfona — bez utraty funkcjonalności względem większego ekranu.

## Non-Goals

- Wiele grup na jednego użytkownika — użytkownik należy do jednej grupy na start; upraszcza model danych i UI na MVP.
- Konfigurowalne przez admina/głosowanie tempo spadku streaka — stała reguła spadku dla wszystkich grup na MVP; konfigurowalność to pomysł na skalę 100x (patrz wgląd w Vision), nie na teraz.
- Weryfikacja/anti-cheat wykonania tasku — system opiera się na zaufaniu w gronie znajomych (potwierdzone w rundzie Sokratesa dla FR-008).
- Działanie offline — aplikacja wymaga połączenia z internetem; brak trybu offline-first na MVP.

## Forward: tech-stack

Użytkownik wyraził preferencję stacku: frontend w React, backend w NestJS. Informacyjne — do przejęcia przez `10x-tech-stack-selector` po `/10x-prd`; nie jest częścią schematu PRD.

## Quality cross-check

- Access Control: present.
- Business Logic: present — jednozdaniowa reguła streaka.
- Project artifacts: present — shape-notes.md z poprawnym checkpointem.
- Timeline-cost ack: present — mvp_weeks (3) ≤ 3, bez potrzeby potwierdzenia dłuższego terminu.
- Non-Goals: present — 4 wpisy.
- Nazwa projektu: present — "StreakBoard" (ustalone po zapisaniu PRD, uzupełnione retroaktywnie w tym pliku).
