# Frame Brief: Install promotion (S-19)

> Etap ustalania ram przed /10x-plan. Ten dokument rejestruje, co jest _faktycznie_
> przedmiotem problemu, oddzielone od tego, co początkowo założono.

## Zgłoszona obserwacja

Kolega na iPhonie nie wiedział, że StreakBoard można i trzeba zainstalować. Safari na iOS nie pokazuje żadnego monitu instalacji. Jedyna wskazówka w aplikacji to napis przy przełączniku przypomnień w Settings („Install StreakBoard on your home screen to get reminders.”), a na iPhonie przypomnienia działają tylko z zainstalowanej aplikacji.

## Początkowe ujęcie (zachowane)

- **Podana przez użytkownika przyczyna lub podejście**: aplikacja za mało promuje samą siebie jako PWA („aplikacja powinna promować bardziej PWA, instalowanie samej siebie”, 2026-10-18).
- **Proponowany przez użytkownika kierunek**: aplikacja sama zachęca do instalacji, na iPhonie instrukcja, w Chrome i Edge przycisk; to zmienia decyzję z planu S-17 („bez własnego przycisku i bez podpowiedzi dla iOS”).
- **Zawężenie przed delegowaniem**:
  - Główna obserwacja: „wszystkie urządzenia”, czyli ludzie korzystają z przeglądarki i nie instalują także na Androidzie i komputerze, nie tylko na iPhonie.
  - Kogo dotyczy: „wszystkich” (nowi członkowie z zaproszenia, obecni członkowie, odwiedzający przed rejestracją).
  - Kolega z iPhone'em jeszcze nie zainstalował aplikacji.

## Mapa wymiarów

Obserwacja może pochodzić z każdego z tych wymiarów:

1. **Brak monitu przeglądarki** — iOS Safari nie ma żadnego; S-17 zakładał, że Chrome i Edge pokażą własny.
2. **Brak wejścia i powodu w aplikacji** — nic w aplikacji nie mówi, że da się ją zainstalować ani po co. ← początkowe ujęcie
3. **Kontekst wejścia** — ludzie trafiają z linku otwartego w przeglądarce komunikatora, z której nie da się zainstalować aplikacji.
4. **Tarcie po instalacji na iOS** — zainstalowana aplikacja ma osobne ciasteczka (trzeba się zalogować drugi raz), a linki otwierają się w Safari, co może zniechęcać.

## Badanie hipotez

| Hipoteza                                                              | Dowody                                                                                                                                                                                                                                                                                                                                                                                         | Werdykt                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1. Przeglądarki nie podpowiadają instalacji                           | `context/changes/deployment/deployment-plan.md` Phase 21, wiersz 2.3: „Chrome showed no automatic install prompt” (Android, instalacja tylko z menu ⋮ „Install app”); 2.4: komputer, instalacja ręczna; S-17 `plan.md` „What We're NOT Doing”: „Chrome/Edge show their own install prompt (owner's decision)”; iOS Safari nie ma monitu (S-17 `frame.md` wymiar 2)                             | SILNE                                           |
| 2. Aplikacja nie ma wejścia ani powodu instalacji (początkowe ujęcie) | Jedyna wzmianka: `src/components/account/RemindersToggle.tsx:15` (stan `unsupported` w Settings); nigdzie nie ma wykrywania trybu zainstalowanego (`display-mode`, `navigator.standalone` — brak w `src/`); strona główna, dashboard i ekran bez grupy o instalacji milczą (wzmianki o „installed app” w `NoGroupCards.astro:30` i `MembersCard.astro:63` zakładają, że ktoś już zainstalował) | SILNE                                           |
| 3. Wejście z przeglądarki komunikatora                                | Scenariusz kolegi (zaproszenie zgubione między przeglądarkami, PR #189) jest zgodny z tym wymiarem; aplikacja nie rozpoznaje przeglądarek wbudowanych i nie podpowiada „otwórz w Safari/Chrome”                                                                                                                                                                                                | SŁABE (prawdopodobne, niesprawdzone)            |
| 4. Tarcie po instalacji na iOS                                        | S-17 `frame.md` wymiar 2 i `ios-check.md`: osobne ciasteczka, linki w Safari; wynik sprawdzenia na iOS wciąż otwarty (Phase 21, wiersz 2.6); kolega jeszcze nie próbował instalacji, więc to nie jest przyczyna obecnej obserwacji                                                                                                                                                             | SŁABE jako przyczyna, istotne jako ograniczenie |

## Sygnały zawężające

- Właściciel: problem dotyczy wszystkich urządzeń i wszystkich użytkowników, nie tylko iPhone'a.
- Zapis S-17: na Androidzie Chrome sam niczego nie zaproponował, a menu „Install app” istnieje, więc aplikacja spełnia warunki instalacji Chromium; brakuje tylko kogoś, kto o niej powie.
- Kolega nie doszedł do instalacji, więc tarcie po instalacji (wymiar 4) jeszcze się nie ujawniło.

## Konwencja między systemami

Aplikacje PWA, które chcą instalacji, zwykle pokazują własną, zamykaną zachętę. W przeglądarkach Chromium otwiera ona systemowe okno instalacji, a na iOS jest to instrukcja „Udostępnij → Do ekranu początkowego”, bo Safari nie ma API instalacji. Zachęta znika w zainstalowanej aplikacji i nie wraca po zamknięciu. Poleganie wyłącznie na monicie przeglądarki uchodzi za niewystarczające, bo Chrome pokazuje go według własnych heurystyk albo tylko jako ikonę w pasku adresu. Wiodąca hipoteza (1 + 2) odpowiada tej konwencji.

## Przeformułowany (lub potwierdzony) opis problemu

> **Rzeczywisty problem, wokół którego należy planować, to**: na żadnym urządzeniu nic nie mówi użytkownikowi, że StreakBoard da się zainstalować, jak to zrobić i co to daje, bo założenie z S-17, że przeglądarka sama to podpowie, nie sprawdziło się nawet na Androidzie.

Początkowe ujęcie jest prawidłowe co do kierunku (aplikacja ma sama zachęcać), ale nie tylko iOS potrzebuje własnej zachęty. Chromium również: tam zachęta może otworzyć systemowe okno instalacji. Zachęta musi też podawać powód: przypomnienia (na iPhonie działają tylko po instalacji) i aplikację na ekranie głównym do codziennego odznaczania. W ograniczeniach mieszczą się: osobne logowanie po instalacji na iOS i przeglądarki wbudowane w komunikatory, z których nie da się zainstalować aplikacji.

## Pewność

**WYSOKA** — oba wiodące wymiary mają dowody w tym repozytorium (zapis wdrożenia S-17 i kod), zgadzają się z konwencją i z odpowiedzią właściciela „wszystkie urządzenia”. Zachowanie na iOS po instalacji pozostaje niesprawdzone (wiersz 2.6 S-17), ale nie zmienia kierunku.

## Co zmienia się dla /10x-plan

Plan obejmuje zachętę do instalacji na wszystkich platformach, a nie tylko podpowiedź dla iOS:

- system operacyjny i przeglądarka bez API instalacji: instrukcja;
- Chromium: przycisk otwierający systemowe okno instalacji;
- przeglądarka komunikatora: podpowiedź „otwórz w przeglądarce”;
- zawsze z powodem (przypomnienia) i bez zachęty w zainstalowanej aplikacji.

Plan musi też zdecydować, gdzie i kiedy zachęta się pokazuje (strona główna, dashboard, Settings) i jak się ją zamyka, oraz uwzględnić ponowne logowanie po instalacji na iOS. Zapis S-17 „bez własnego przycisku i bez podpowiedzi dla iOS” trzeba w planie jawnie unieważnić decyzją właściciela z 2026-10-18.

## Odniesienia

- Pliki źródłowe: `src/components/account/RemindersToggle.tsx:15`, `src/components/dashboard/NoGroupCards.astro:30`, `src/components/dashboard/MembersCard.astro:63`, `public/manifest.webmanifest`, `public/sw.js:3`
- Wcześniejsze decyzje: `context/archive/2026-10-17-installable-pwa/plan.md` („What We're NOT Doing”), `context/archive/2026-10-17-installable-pwa/frame.md` (wymiar 2), `context/archive/2026-10-17-installable-pwa/ios-check.md`
- Zapis wdrożenia: `context/changes/deployment/deployment-plan.md` Phase 21 (wiersze 2.3, 2.4, 2.6)
- Roadmapa: `context/foundation/roadmap.md` S-19, MS-05
- Zadania badawcze: badanie wykonane bezpośrednio w tej sesji (bez pod-agentów)
