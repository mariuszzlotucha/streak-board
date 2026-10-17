---
project: "StreakBoard"
version: 1
status: draft
created: 2026-09-14
context_type: greenfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: false
---

## Vision & Problem Statement

Ty i grono przyjaciół macie trudność z utrzymaniem motywacji do indywidualnych nawyków (np. trening, czytanie książki). Wcześniej korzystaliście ze wspólnie prowadzonego arkusza Google, w którym każdego dnia kolorowaliście komórki na zielono (zrealizowano) lub czerwono (nie zrealizowano) dla każdej kategorii/celu; wielu użytkowników mogło być podpiętych pod ten sam cel. Wartość dawała widoczność dla innych, ale ręczne prowadzenie arkusza było męczące i narzędzie w końcu przestało być używane.

Istniejące aplikacje do budowania nawyków są projektowane dla pojedynczego użytkownika i nie obsługują modelu, w którym kilka osób śledzi ten sam cel równolegle i widzi nawzajem swoją konsekwencję. Sam prosty widok siatki (zielony/czerwony) już wystarczał, by to działało — brakowało tylko automatyzacji tego widoku i mechanizmu grywalizacji (streaki), który nagradza konsekwencję w czasie. Aplikacja odtwarza ten widok jako siatkę odznaczeń przy każdym tasku (FR-013).

## User & Persona

Osoba budująca lub utrzymująca osobisty nawyk/cel (np. trening, czytanie), która pozostaje zmotywowana dzięki widoczności swojej konsekwencji wśród grona znajomych śledzących ten sam lub podobny cel równolegle. Kontekst: wcześniej korzystała z ręcznie prowadzonego, wspólnego arkusza z przyjaciółmi. Moment sięgnięcia po produkt: codziennie, żeby odznaczyć, czy dana czynność została wykonana, i zobaczyć, jak radzi sobie reszta grupy.

## Success Criteria

### Primary

- Użytkownik otwiera aplikację (zalogowany), widzi zakładkę „Zadania" ze swoimi taskami (jednorazowymi lub powtarzalnymi — codziennie/co tydzień; każdy task należy do grupy), odznacza task jako wykonany, i przechodzi do zakładki „Tablica wyników", gdzie widzi ranking/postępy swoje i grupy. Dostarczalne w 3 tygodnie pracy po godzinach.

### Secondary

- Powiadomienia/przypomnienia o niewykonanym tasku.
- Historia/statystyki długoterminowe (wykresy streaków w czasie). Siatka odznaczeń (FR-013) spełnia §Vision i nie zamyka tego punktu: wykresy i statystyki nadal są poza zakresem.

### Guardrails

- Widoczność tylko dla własnej grupy — członkowie jednej grupy nie widzą tasków/wyników grupy, do której nie należą.
- Odznaczenie tasku musi być natychmiastowe (bez zauważalnego opóźnienia) — to kluczowa interakcja motywacyjna.

## User Stories

### US-01: Użytkownik odznacza task jako wykonany i widzi wynik w tablicy grupy

- **Given** zalogowany użytkownik należący do grupy, z co najmniej jednym taskiem, do którego jest zapisany
- **When** otwiera zakładkę „Zadania” i odznacza task jako wykonany
- **Then** task jest oznaczony jako zrealizowany na dziś, a wynik jest natychmiast widoczny w tablicy wyników grupy

## Functional Requirements

### Autoryzacja

- FR-001: Użytkownik może się zalogować (email/OAuth/passwordless). Priority: must-have
  > Socratic: Counter-argument considered: "bez logowania nie da się śledzić streaków/tożsamości
  > w czasie". Resolution: kept; trwałe konto jest wymogiem funkcjonalnym dla całej mechaniki
  > grywalizacji.

### Konto

- FR-010: Użytkownik ustawia nick (2–24 znaki, unikalny w aplikacji), który członkowie jego grupy widzą zamiast adresu e-mail; bez nicka nie wejdzie na dashboard. Priority: must-have
  > Socratic: Counter-argument considered: "obowiązkowy nick to dodatkowy ekran po rejestracji,
  > zanim użytkownik zobaczy wartość". Resolution: kept; adres e-mail to dana logowania, nie może
  > być nazwą widoczną dla grupy (S-14).
- FR-011: Użytkownik może usunąć swoje konto w ustawieniach po potwierdzeniu w oknie z ostrzeżeniem; usunięcie jest natychmiastowe i nieodwracalne, a użytkownik zostaje wylogowany. Znikają konto, nick, członkostwo, własne uczestnictwa i odznaczenia, sesje, tożsamości logowania i wpisy dziennika bezpieczeństwa. Taski utworzone przez usuwającego zostają w grupie z postępem innych i przechodzą na właściciela grupy. Właściciel grupy z innymi członkami wybiera w oknie następcę, który przejmuje grupę; grupa, której usuwający jest jedynym członkiem, znika razem z kontem. Priority: must-have
  > Socratic: Counter-argument considered: "usunięcie konta jednym przyciskiem zabiera też
  > dane, z których korzystają inni członkowie grupy". Resolution: kept; usunięcie zabiera dane
  > osoby, a grupa i taski, z których korzystają inni, zostają (S-15).

### Grupy

- FR-002: Użytkownik może dołączyć do grupy przez link/kod. Priority: must-have
  > Socratic: No counter-argument considered; stands as written.
- FR-003: Właściciel grupy (na początku jej twórca) może zarządzać grupą (usunąć grupę, usunąć z niej członka). Priority: must-have
  > Socratic: Counter-argument considered: "jedna osoba z pełną kontrolą to single point of
  > failure, jeśli zniknie/straci dostęp". Resolution: kept; prosty model jednego admina
  > wystarczy na MVP dla małej grupy znajomych.
- FR-012: Właściciel grupy może przekazać ją innemu członkowi; dawny właściciel zostaje w grupie jako zwykły członek (może ją potem opuścić), a nowy właściciel raz widzi na dashboardzie komunikat o przejęciu grupy. Priority: must-have
  > Socratic: Counter-argument considered: "przekazanie własności to dodatkowa akcja, której
  > mała grupa znajomych prawie nie użyje". Resolution: kept; bez niej grupa nie przetrwa
  > usunięcia konta właściciela, a właściciel nie może opuścić grupy, nie usuwając jej (S-15).

### Taski

- FR-004: Użytkownik może utworzyć task w grupie (jednorazowy lub powtarzalny: dziennie/tygodniowo). Priority: must-have
  > Socratic: Counter-argument considered: "dwa typy cykli to więcej złożoności niż trzeba na
  > start". Resolution: kept; bez tego MVP nie oddaje realnego use case'u (trening codziennie,
  > czytanie książki tygodniowo).
- FR-005: Twórca tasku może nim zarządzać (edytować, usunąć). Priority: must-have
  > Socratic: Counter-argument considered: "task staje się osierocony, jeśli jego twórca opuści
  > grupę — nikt inny nie może go poprawić". Resolution: kept; to najmniejszy model wystarczający
  > na MVP, edge case odejścia twórcy do rozwiązania później.
- FR-006: Użytkownik może dołączyć (zapisać się) do tasku stworzonego przez innego członka grupy. Priority: must-have
  > Socratic: Counter-argument considered: "otwarte dołączanie może zaśmiecić tablicę wyników
  > nieaktywnymi uczestnikami". Resolution: kept; to sedno pomysłu — bez tego nie ma wspólnej
  > motywacji ("wielu userów na jeden cel").
- FR-007: Użytkownik może wypisać się z tasku, do którego jest zapisany. Priority: must-have

  > Socratic: Counter-argument considered: "wypisanie się może zaburzyć wspólny streak/licznik
  > grupy, jeśli inni na nim polegają". Resolution: kept; bez tego użytkownik utknie w taskach,
  > których nie chce już robić.

  Wypisanie się z tasku (tak samo opuszczenie grupy i usunięcie członka przez właściciela) kasuje streak i całą historię odznaczeń tego uczestnika w tym tasku; okno potwierdzenia mówi to wprost. Ponowny zapis zaczyna od zera.

- FR-008: Użytkownik może odznaczyć wystąpienie tasku jako wykonane. Priority: must-have
  > Socratic: Counter-argument considered: "system opiera się w pełni na uczciwości — nic nie
  > weryfikuje, że task faktycznie wykonano". Resolution: kept; to zamierzone — produkt jest dla
  > zaufanego grona znajomych, weryfikacja nie jest potrzebna w tej skali.

### Tablica wyników

- FR-009: Użytkownik może zobaczyć tablicę wyników swojej grupy. Priority: must-have
  > Socratic: Counter-argument considered: "publiczna tablica wyników może zniechęcać osoby,
  > które zostają w tyle, zamiast motywować". Resolution: kept; to sedno wartości produktu —
  > widoczność wyników to główny mechanizm motywacyjny.
- FR-013: Członek grupy widzi przy każdym tasku siatkę odznaczeń: wiersz na każdego uczestnika, który jest członkiem grupy, kolumna na każdy okres. Task dzienny pokazuje 7 ostatnich dni (w strefie Europe/Warsaw) łącznie z dzisiejszym, tygodniowy 4 ostatnie tygodnie łącznie z bieżącym, jednorazowy jedną kolumnę. Komórka ma jeden z czterech stanów: wykonane (jest odznaczenie), pominięte (zamknięty okres bez odznaczenia), otwarte (bieżący okres jeszcze nieodznaczony) i przed zapisem (okres sprzed okresu zapisu, bez odznaczenia; zapisane odznaczenie wygrywa). Komórka widza w bieżącym okresie zmienia się od razu po odznaczeniu. Priority: must-have
  > Socratic: Counter-argument considered: "siatka to najszerszy widok w aplikacji i dubluje
  > streak". Resolution: kept; zielono-czerwona siatka to pierwotna wartość z §Vision, a streak
  > nie pokazuje, kto w którym okresie wykonał task (S-13).

## Non-Functional Requirements

- Wszystkie kluczowe działania (przegląd tasków, odznaczanie, tablica wyników) są w pełni użyteczne na ekranie smartfona — bez utraty funkcjonalności względem większego ekranu.

## Business Logic

Za każdy dzień/okres, w którym użytkownik wykona przypisany task, jego streak dla tego tasku rośnie o jeden; za każdy pominięty zamknięty dzień/okres streak jest dzielony na pół z zaokrągleniem w dół (więc streak 1 spada do 0), a suma streaków użytkownika decyduje o jego pozycji w tablicy wyników grupy.

Reguła korzysta z pojedynczego wejścia widocznego dla użytkownika: czy dany task został odznaczony jako wykonany w swoim okresie (dzień/tydzień) czy nie. Wynikiem jest aktualna wartość streaka per task oraz suma streaków per użytkownik. Użytkownik spotyka się z tą regułą dwojako: natychmiast po odznaczeniu tasku widzi zaktualizowany streak, a przy wejściu w zakładkę „Tablica wyników” widzi swoją pozycję względem reszty grupy wynikającą z sumy streaków.

## Access Control

Logowanie (email+hasło / OAuth / passwordless) — potrzebne, bo produkt jest z założenia grupowy i użytkownicy wracają z różnych urządzeń/sesji, żeby widzieć postępy innych członków celu/grupy.

Model dwupoziomowy: **grupa** to stała przestrzeń (wspólna tablica), do której użytkownik dołącza raz — przez link/kod. **Task** to element wewnątrz grupy, tworzony przez jednego z jej członków; inni członkowie grupy widzą wszystkie taski i opcjonalnie zapisują się do wybranych.

Uprawnienia: właściciel grupy (na początku jej twórca) zarządza grupą (może usunąć grupę, usunąć z niej członków) i może przekazać ją innemu członkowi; przy usunięciu swojego konta musi to zrobić, chyba że jest jedynym członkiem (wtedy grupa znika). Twórca tasku zarządza swoim taskiem (edytuje, usuwa); po usunięciu konta twórcy taskiem zarządza właściciel grupy. Pozostali członkowie są sobie równi — mogą dołączać do grupy (przez link/kod), tworzyć własne taski, zapisywać się/wypisywać z tasków innych, odznaczać własną realizację.

Członkowie grupy widzą nawzajem nicki, nie adresy e-mail; własny adres widzi tylko właściciel konta w ustawieniach.

## Non-Goals

- Wiele grup na jednego użytkownika — użytkownik należy do jednej grupy na start; upraszcza model danych i UI na MVP.
- Konfigurowalne przez admina/głosowanie tempo spadku streaka — stała reguła spadku dla wszystkich grup na MVP; konfigurowalność to pomysł na skalę znacznie większej liczby grup, nie na teraz.
- Weryfikacja/anti-cheat wykonania tasku — system opiera się na zaufaniu w gronie znajomych.
- Działanie offline — aplikacja wymaga połączenia z internetem; brak trybu offline-first na MVP.

## Open Questions

- Znana luka (Q-04, decyzja właściciela: akceptowana): baza przyjmuje odznaczenie z okresem w oknie dat `UTC−7 … UTC+1` względem bieżącej daty, więc uczestnik może zapisać odznaczenie z niedawnego okresu poza bieżącym. Zaufane grono znajomych; kod bez zmian.
- Sposób sprawdzenia, czy siatka (FR-013) spełnia gwiazdę przewodnią, bez analityki — pytanie właściciela dla roadmapy M-3.
