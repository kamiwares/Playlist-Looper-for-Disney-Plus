# Netflix Loop Playlist

Wtyczka do Chrome (Manifest V3), która odtwarza w pętli własną playlistę filmów i odcinków z Netflixa.

## Funkcje
- Dodawanie pozycji: przyciskiem „+ Dodaj do pętli” na stronie odtwarzacza, przyciskiem „Dodaj bieżący film” w popupie albo przez wklejenie linku lub ID.
- Zmiana kolejności przez przeciąganie albo przyciski ↑/↓, zmiana nazwy (✎), usuwanie (✕).
- Tryby: zapętlanie całej listy, zapętlanie jednej pozycji, jednorazowe odtworzenie. Opcjonalnie kolejność losowa.
- „Przejdź dalej N s przed końcem”, żeby pomijać napisy końcowe.
- Eksport i import playlisty w JSON.
- Licznik `1/5` na ikonie wtyczki i znacznik pętli na stronie odtwarzacza.

## Instalacja
1. Otwórz `chrome://extensions`.
2. Włącz **Tryb dewelopera** (prawy górny róg).
3. Kliknij **Załaduj rozpakowane** i wskaż ten folder.

## Użycie
1. Otwórz film na Netflixie (adres `netflix.com/watch/…`) i dodaj go do playlisty.
2. Powtórz dla kolejnych pozycji i ułóż kolejność w popupie.
3. Kliknij **▶ Start**. Kliknięcie pozycji na liście zaczyna od niej.

## Jak to działa
- `content.js` śledzi element `<video>` na stronie odtwarzacza. Za koniec pozycji uznaje: zdarzenie `ended`, osiągnięcie progu „N s przed końcem”, pojawienie się ekranu końcowego Netflixa albo samodzielne przejście Netflixa dalej po obejrzeniu ponad 85% materiału.
- `background.js` wybiera następną pozycję i otwiera `netflix.com/watch/<id>?t=0` w karcie pętli.
- Dane są w `chrome.storage.local` (`playlist`, `settings`, `state`).

## Ograniczenia
- Netflix może zmienić selektory DOM (tytuł, ekran końcowy). Podstawowe wykrywanie końca opiera się na `<video>`, więc nadal działa, ale tytuły mogą się nie uzupełniać.
- Przeglądarka nie pozwala włączyć pełnego ekranu bez kliknięcia użytkownika, więc po przejściu do kolejnej pozycji trzeba go włączyć ponownie.
- Pozycja to film albo konkretny odcinek. ID serialu (`/title/<id>`) wznawia serial tam, gdzie Netflix go zapamiętał.
