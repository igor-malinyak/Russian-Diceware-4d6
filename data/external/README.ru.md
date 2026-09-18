[English](README.md) | [Русский](README.ru.md)

# Источники файлов в `data/external`

В этой папке лежат внешние данные, используемые в проекте. Ниже указано происхождение каждого файла.

## `freqrnc2011.csv`

- Источник: [dict.ruslang.ru](http://dict.ruslang.ru)
- Описание источника: это частотный словарь современного русского языка С. А. Шарова и О. Н. Ляшевской, задуманный как представительный базовый словник и составленный по большому корпусу текстов разных жанров, включая устную речь.
- Прямая ссылка на архив с данными: [Freq2011.zip](http://dict.ruslang.ru/Freq2011.zip)
- Что содержит файл: CSV-версия данных этого частотного словаря.

## `lemmas_to_roots.tsv`

- Источник: репозиторий [tabidots/ru_roots](https://github.com/tabidots/ru_roots/tree/main)
- Описание источника: репозиторий содержит данные из «Словаря морфем русского языка» А. И. Кузнецовой (1986), оцифрованные с помощью OCR и затем вручную вычитанные и исправленные автором репозитория.
- Прямая ссылка на файл: [lemmas_to_roots.tsv](https://github.com/tabidots/ru_roots/blob/main/lemmas_to_roots.tsv)
- Что содержит файл: данные из указателя словаря; таблица соответствий «слово/лемма -> корень», местами с ударением и пояснительными пометами для снятия омонимии.

## `root_groups.txt`

- Источник: репозиторий [tabidots/ru_roots](https://github.com/tabidots/ru_roots/tree/main)
- Описание источника: тот же оцифрованный и вычитанный набор данных из словаря морфем А. И. Кузнецовой.
- Прямая ссылка на файл: [root_groups.txt](https://github.com/tabidots/ru_roots/blob/main/root_groups.txt)
- Что содержит файл: данные из приложения I словаря; группы связанных/чередующихся корней и строки-перенаправления к каноническому корню.

## `train_Tikhonov_reformat.txt`

- Источник: репозиторий [AlexeySorokin/NeuralMorphemeSegmentation](https://github.com/AlexeySorokin/NeuralMorphemeSegmentation/)
- Описание источника: репозиторий с кодом для нейросетевого разбиения русских слов на морфемы.
- Ссылка на файл: [train_Tikhonov_reformat.txt](https://github.com/AlexeySorokin/NeuralMorphemeSegmentation/blob/master/data/train_Tikhonov_reformat.txt)
- Что содержит файл: обучающая выборка, полученная из морфологического словаря А. Н. Тихонова.
