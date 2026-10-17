# StreakBoard na iPhonie: sprawdzenie aplikacji z ekranu początkowego

> Dla członka grupy z iPhone'em. Zajmie około 10 minut. Właściciel nie ma iPhone'a, więc tylko w ten sposób dowiemy się, czy zainstalowana aplikacja działa na iOS. Przy każdym kroku zapisz „działa” albo krótko, co zobaczyłeś (zrzut ekranu też się przyda) i odeślij właścicielowi.

Potrzebujesz: iPhone'a z Safari, konta StreakBoard (e-mail i hasło) i, jeśli możesz, konta Google, którego używasz w StreakBoard. Do kroku 6 poproś właściciela o link zaproszenia do testowej grupy.

## Kroki

1. **Dodanie do ekranu początkowego.** Otwórz w Safari `https://streakboard.app`, stuknij Udostępnij (kwadrat ze strzałką), potem „Do ekranu początkowego” i „Dodaj”.
   - Oczekiwane: na ekranie początkowym pojawia się zielona ikona z płomieniem i podpisem „StreakBoard”.
   - Wynik:
2. **Uruchomienie z ikony.** Stuknij ikonę.
   - Oczekiwane: aplikacja otwiera się na całym ekranie, bez paska adresu Safari, na stronie logowania (albo od razu na dashboardzie, jeśli jesteś zalogowany).
   - Wynik:
3. **Logowanie e-mailem i hasłem** w otwartej aplikacji.
   - Oczekiwane: trafiasz na dashboard i zostajesz w aplikacji (nie przeskakuje do Safari).
   - Wynik:
4. **Wylogowanie.** Stuknij „Sign out”.
   - Oczekiwane: wracasz na stronę startową i nie widzisz danych grupy.
   - Wynik:
5. **Logowanie przez Google.** W aplikacji stuknij „Continue with Google” i dokończ logowanie.
   - Oczekiwane: po wybraniu konta wracasz zalogowany do aplikacji z ikony. Zapisz dokładnie, co się stało, jeśli logowanie otworzy się w Safari, w okienku na stronie albo jeśli po powrocie znowu widzisz ekran logowania. To jest najważniejszy krok.
   - Wynik:
6. **Zaproszenie.** Skopiuj link zaproszenia od właściciela (np. z komunikatora), otwórz aplikację z ikony i wklej link w polu „Invite code or link” pod „Join with code”.
   - Oczekiwane: dołączasz do grupy. Jeśli stukniesz link bezpośrednio w komunikatorze, otworzy się Safari, a nie aplikacja. To jest spodziewane, napisz tylko, czy tak było.
   - Wynik:
7. **Odznaczenie tasku** w aplikacji.
   - Oczekiwane: task od razu pokazuje się jako wykonany, a streak rośnie.
   - Wynik:
8. **Model i wersja iOS** (Ustawienia → Ogólne → To urządzenie):
   - Wynik:

## Dla właściciela

Wynik przepisz do `context/changes/deployment/deployment-plan.md` (wpis S-17) i zaznacz wiersz 2.6 planu. Jeśli krok 5 nie działa, jest to znane ryzyko z `frame.md` (osobne ciasteczka aplikacji na iOS); obejściem jest logowanie hasłem w aplikacji.
