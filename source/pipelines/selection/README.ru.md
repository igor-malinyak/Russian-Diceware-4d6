[English](README.md) | [Русский](README.ru.md)

# Процесс ручного отбора слов

## Методика
Этот процесс готовит рабочие файлы для ручного отбора слов на основе
`source/data/attributes/dictionary-top-with-attributes.csv`.
Он также ранжирует леммы из
`source/data/attributes/extra-lemmas-with-attributes.csv`.
Также он добавляет частотные леммы с несколькими различными основами корней, исключённые при подготовке этого входного файла.

Новые атрибуты здесь не вычисляются. Вместо этого каждая лемма получает оценку на основе уже собранных данных предыдущих этапов:
- `IPM` самой леммы
- `IPM` её корня
- `imageability`
- `emotional_valence`
- `is_profane`
- длина леммы

В ходе процесса создаются следующие промежуточные рабочие файлы:
- `dictionary-top-ranked.csv` хранит все ненулевые кандидаты вместе с `ranking_score`
- `extra-lemmas-ranked.csv` ранжирует дополнительные леммы по той же формуле
- `manual-selection.csv` показывает до пяти самых сильных кандидатов на каждый корень в компактной таблице для просмотра
- `manual-selection-completed.csv` фиксирует результаты первого ручного отбора
- `final-candidates-ranked.csv` объединяет выбранные вручную леммы и сортирует их по убыванию `ranking_score`

Конечный артефакт `final-candidates-selected.csv` содержит вручную сокращённый
список из 1296 слов.

`manual-selection-completed.csv` создаётся как копия `manual-selection.csv`, после
чего заполняется вручную. Для выбранного слова в столбце `S` слева от него ставится
`x`. Если нужной леммы нет среди предложенных кандидатов, её можно вписать в
столбец `Extra`. Несколько лемм в `Extra` разделяются запятыми.

## Ranking score

`ranking_score` вычисляется по формуле:

```text
( Avg_IPM + imageability_bonus ) * imageability_factor * emotional_valence_factor * profanity_factor * length_factor
```

Где:
- `Avg_IPM` — среднее геометрическое между `IPM` леммы и `IPM` корня
- `profanity_factor` вычисляется по полю `is_profane`

### `imageability_bonus`
- `400` при `imageability = 5`
- `200` при `imageability = 4`
- `0` во всех остальных случаях

### `imageability_factor`
- `0.25` при `imageability = 1`
- `0.5` при `imageability = 2`
- `1` во всех остальных случаях

### `emotional_valence_factor`
- `0.25` при `emotional_valence = 1`
- `0.5` при `emotional_valence = 2`
- `1` во всех остальных случаях

### `profanity_factor`
- `1` при `is_profane = 0`
- `0` при `is_profane = 1`

### `length_factor`
- `0`, если длина `< 2` или `> 12`
- `4.5` при длине `2` или `3`
- `4` при длине `4`
- `3.5` при длине `5`
- `3` при длине `6`
- `2.5` при длине `7`
- `2` при длине `8`
- `1.75` при длине `9`
- `1.5` при длине `10`
- `1.25` при длине `11`
- `1` при длине `12`

## Конечный артефакт

Конечный артефакт этого процесса:
- `source/data/selection/final-candidates-selected.csv`

## Шаги

### 1. `01-build-selection-inputs.ts`

Создаёт:
- `source/data/selection/dictionary-top-ranked.csv`
- `source/data/selection/extra-lemmas-ranked.csv`
- `source/data/selection/manual-selection.csv`

Читает:
- `source/data/attributes/dictionary-top-with-attributes.csv`
- `source/data/attributes/extra-lemmas-with-attributes.csv`
- `source/data/roots/dictionary-source-with-roots.csv`

Логика шага:
- вычисляет `ranking_score` для каждой строки в обоих входных файлах с атрибутами
- удаляет строки, у которых `ranking_score = 0`
- записывает `dictionary-top-ranked.csv` со всеми исходными полями и добавленным `ranking_score`
- записывает `extra-lemmas-ranked.csv` в том же формате и порядке групп корней
- группирует строки в `dictionary-top-ranked.csv` по `root`
- сортирует строки внутри каждой группы по убыванию `ranking_score`
- сортирует группы корней по убыванию максимального `ranking_score` внутри группы
- записывает `manual-selection.csv` с пять раз повторёнными полями `S`, `Lemma`, `RS`
- для каждого корня берёт top-5 лемм по `ranking_score`
- если у корня меньше пяти подходящих лемм, оставшиеся ячейки остаются пустыми
- сохраняет в `manual-selection.csv` тот же порядок строк-корней, что и порядок групп в `dictionary-top-ranked.csv`
- в конец добавляет top-1000 уникальных лемм по `IPM` с несколькими различными основами корней, которых нет во входном файле атрибутов. Омонимические варианты одного корня исключаются так же, как при подготовке входного файла атрибутов
- каждая дополнительная строка содержит одну лемму, а в её ячейке `RS` записан `IPM`, а не `ranking_score`

### 2. Выполнить первый ручной отбор

Создать рабочую копию подготовленной таблицы:

```bash
cp source/data/selection/manual-selection.csv source/data/selection/manual-selection-completed.csv
```

Затем вручную отредактировать `source/data/selection/manual-selection-completed.csv`:
- поставить `x` в столбце `S` непосредственно перед каждым выбранным словом
- при необходимости добавить в столбец `Extra` слова, которых нет среди предложенных кандидатов
- разделять запятыми несколько слов в `Extra`

### 3. `03-count-manual-selection.ts`

Читает:
- `source/data/selection/manual-selection-completed.csv`

Логика шага:
- считает кандидатов, отмеченных `x` в любом столбце `S`
- разбирает дополнительные кандидаты из столбца `Extra` как список, разделённый запятыми
- печатает `selectedFromS`, `selectedFromExtra`, `totalSelected` и `uniqueSelected`

### 4. `04-build-final-candidates-ranked.ts`

Создаёт:
- `source/data/selection/final-candidates-ranked.csv`

Читает:
- `source/data/selection/manual-selection-completed.csv`
- `source/data/selection/dictionary-top-ranked.csv`
- `source/data/selection/extra-lemmas-ranked.csv`

Логика шага:
- собирает леммы, отмеченные `x` в столбцах `S`, и леммы из столбца `Extra`
- удаляет повторения среди выбранных лемм
- находит данные каждой выбранной леммы в двух ранжированных входных файлах
- если одна лемма встречается в нескольких строках, выбирает строку с наибольшим `ranking_score`
- завершает работу с ошибкой, если выбранной леммы нет ни в одном ранжированном входном файле
- сортирует итоговые строки по убыванию `ranking_score`, а при равной оценке — по возрастанию `Number`
- сохраняет столбцы в том же формате, что и в ранжированных входных файлах

### 5. Выполнить окончательный ручной отбор

Создать рабочую копию ранжированного списка кандидатов:

```bash
cp source/data/selection/final-candidates-ranked.csv source/data/selection/final-candidates-selected.csv
```

Затем вручную отредактировать `source/data/selection/final-candidates-selected.csv`,
оставив в нём ровно 1296 слов.

## Порядок запуска

Один раз установить локальные зависимости:

```bash
(cd source/pipelines/selection && npm install)
```

Все последующие команды выполнять из корня репозитория. Выполнить шаг 1:

```bash
node source/pipelines/selection/01-build-selection-inputs.ts
```

Выполнить ручную работу из шага 2, затем запустить скрипты из шагов 3 и 4:

```bash
node source/pipelines/selection/03-count-manual-selection.ts
node source/pipelines/selection/04-build-final-candidates-ranked.ts
```

В завершение выполнить ручную работу из шага 5.
