[English](README.md) | [Русский](README.ru.md)

# Процесс определения атрибутов слов

## Методика
Этот процесс добавляет к частотным леммам три семантических атрибута:
- `imageability`
- `emotional_valence`
- `is_profane`

Сначала из словаря с корнями отбирается рабочий список лемм:
- берутся только леммы с одним корнем
- учитываются наиболее частотные корни
- для каждого такого корня берутся наиболее частотные леммы с дополнительным включением самых частотных слов словаря

Так получается компактный и репрезентативный срез словаря `dictionary-top.csv`.

Дальше LLM используется только для того, чтобы независимо для каждой леммы оценить:
- насколько слово наглядно и легко вообразимо
- какая у него типичная эмоциональная окраска
- является ли оно бранным

После этого оценки присоединяются обратно к рабочему списку, а итоговый файл при необходимости вручную уточняется.

Те же три атрибута отдельно заполняются для списка вручную выбранных лемм, которые не входят в рабочий список.

### Определения полей

#### `imageability`
Насколько легко слово в изоляции вызывает конкретное чувственно-наглядное представление: объект, существо, действие, признак, ощущение или сцену.

Оценка ставится:
- без дополнительного контекста
- по наиболее обычному современному значению слова

Шкала:
- `1` — образ почти отсутствует; слово в основном абстрактное, логическое или служебное
- `2` — образ слабый, расплывчатый или сильно зависит от контекста
- `3` — образ есть, но он не очень конкретный или возникает не сразу
- `4` — слово хорошо вызывает наглядный образ, сцену или чувственный признак
- `5` — слово очень легко и быстро вызывает чёткий конкретный образ

Практическое правило:
если слово можно легко представить, показать, нарисовать, сыграть как действие или описать как ясный чувственный признак, оно обычно получает `4` или `5`.

#### `emotional_valence`
Типичная эмоциональная окраска слова в современном нейтральном употреблении.

Оценка ставится по тому, какую обычную эмоциональную реакцию вызывает слово само по себе.

Шкала:
- `1` — явно негативное
- `2` — скорее негативное
- `3` — нейтральное
- `4` — скорее положительное
- `5` — явно положительное

Практическое правило:
если слово не тянет ни в плюс, ни в минус, ставится `3`.

#### `is_profane`
Является ли слово бранным, обсценным или грубо-оскорбительным в обычном современном русском.

Значения:
- `1` — слово является бранным, обсценным или устойчиво используется как грубое оскорбление
- `0` — слово не является бранным

Здесь `1` получают:
- мат
- обсценная лексика
- грубые ругательства
- слова, которые обычно воспринимаются как прямое оскорбление

Здесь `0` получают:
- просто негативные слова
- неприятные слова
- грубоватые, но небранные бытовые слова
- слова с тяжёлой тематикой, если они сами по себе не являются руганью

## Артефакты
Конечные артефакты этого процесса:
- `source/data/attributes/dictionary-top-with-attributes.csv`
- `source/data/attributes/extra-lemmas-with-attributes.csv`

## Шаги

### 1. `01-build-dictionary-top.ts`
Создаёт:
- `source/data/attributes/dictionary-top.csv`

Читает:
- `source/data/roots/dictionary-source-with-roots.csv`
- `source/data/roots/root-ipm.csv`

Логика шага:
- файл повторяет структуру `source/data/roots/dictionary-source-with-roots.csv`, но поле `roots` заменяется на `root`, а поле `root_IPM` добавляется
- в файл попадают только леммы с одним `root`
- исключение: если у строки несколько корней, но все они являются омонимами одного и того же базового корня, строка раскладывается на несколько строк, по одной на каждый `root`
- учитываются только 5000 наиболее частотных корней по `IPM` из `source/data/roots/root-ipm.csv`
- для каждого корня сохраняются 10 наиболее частотных лемм по `IPM`
- если лемма входит в 5000 самых частотных по `IPM` среди всего словаря, она включается сверх лимита в 10 строк на корень
- если одна и та же пара `Lemma` + `root` встречается в нескольких строках, сохраняется строка с максимальным `IPM`
- итоговый файл отсортирован так:
  - сначала идут группы по `root`
  - группы отсортированы по убыванию `root_IPM`
  - внутри группы строки отсортированы по убыванию `IPM`

### 2. Заполнение атрибутов через LLM

#### 2.1. `02-01-build-llm-attributes.ts`
Создаёт:
- `source/data/attributes/llm-attributes.original.csv`

Читает:
- `source/data/attributes/dictionary-top.csv`

Логика шага:
- берёт из `dictionary-top.csv` только поля `Number` и `Lemma`
- добавляет пустые поля `imageability`, `emotional_valence`, `is_profane`
- сохраняет порядок строк из `dictionary-top.csv`

#### 2.2. `02-02-split-llm-attributes.ts`
Создаёт:
- набор `.original.csv` файлов в `source/data/attributes/llm-attributes.chunks/`

Читает:
- `source/data/attributes/llm-attributes.original.csv`

Логика шага:
- разбивает подготовленный CSV на независимые части для ручного запуска LLM
- для каждой части создаёт отдельный исходный файл

### 2.3. `02-03-prompt-llm-attributes.md`
Промпт для LLM-этапа.

Важно:
- LLM заполняет только `imageability`, `emotional_valence`, `is_profane`
- каждая строка оценивается независимо по самому слову
- LLM не меняет структуру CSV и не добавляет новых полей

### 2.4. `02-04-merge-llm-attributes.ts`
Создаёт:
- `source/data/attributes/llm-attributes.llm.csv`

Читает:
- заполненные `.llm.csv` из `source/data/attributes/llm-attributes.chunks/`

Логика шага:
- собирает заполненные части обратно в один файл
- проверяет согласованность заголовков chunk-файлов

### 2.5. `02-05-validate-llm-attributes.ts`
Проверяет:
- `source/data/attributes/llm-attributes.llm.csv`

Логика шага:
- убеждается, что не потеряны строки
- убеждается, что `Number` и `Lemma` не изменились
- убеждается, что сохранён исходный порядок строк
- проверяет заполненность полей `imageability`, `emotional_valence`, `is_profane`
- проверяет допустимость значений:
  - `imageability`: `1`–`5`
  - `emotional_valence`: `1`–`5`
  - `is_profane`: `0` или `1`

### 3. `03-build-dictionary-top-with-attributes.ts`
Создаёт:
- `source/data/attributes/dictionary-top-with-attributes.csv`

Читает:
- `source/data/attributes/dictionary-top.csv`
- `source/data/attributes/llm-attributes.llm.csv`

Логика шага:
- берёт все строки из `dictionary-top.csv`
- присоединяет к ним `imageability`, `emotional_valence`, `is_profane`
- сверяет, что строки в обоих входных файлах совпадают
- сохраняет исходный порядок и все поля `dictionary-top.csv`

### 4. Атрибуты вручную выбранных лемм

Исходный файл:
- `source/data/attributes/extra-lemmas-llm-attributes.original.csv`

Он содержит поля `Number` и `Lemma`, а также пустые поля `imageability`, `emotional_valence`, `is_profane`.

#### 4.1. Заполнение через LLM

Создаёт:
- `source/data/attributes/extra-lemmas-llm-attributes.llm.csv`

Для заполнения используется `02-03-prompt-llm-attributes.md`. В копии промпта меняются только имена входного и выходного файлов:
- вход: `extra-lemmas-llm-attributes.original.csv`
- выход: `extra-lemmas-llm-attributes.llm.csv`

Все остальные инструкции промпта остаются без изменений.

#### 4.2. `04-build-extra-lemmas-with-attributes.ts`

Создаёт:
- `source/data/attributes/extra-lemmas-with-attributes.csv`

Читает:
- `source/data/attributes/extra-lemmas-llm-attributes.original.csv`
- `source/data/attributes/extra-lemmas-llm-attributes.llm.csv`
- `source/data/roots/dictionary-source-with-roots.csv`
- `source/data/roots/root-ipm.csv`

Логика шага:
- сверяет заголовки, число строк, `Number`, `Lemma` и порядок строк в двух файлах LLM-атрибутов
- проверяет допустимость значений `imageability`, `emotional_valence`, `is_profane`
- находит исходную строку слова в `dictionary-source-with-roots.csv` по полю `Number`
- переносит `PoS`, `IPM`, `R`, `D`, `Doc` и список корней из исходного словаря, сохраняя вручную выбранную форму в поле `Lemma`
- для однокорневой леммы берёт `root_IPM` из `root-ipm.csv`, а для многокорневой суммирует `IPM` всех её корней
- добавляет заполненные атрибуты и создаёт файл с теми же полями и в том же порядке, что и `dictionary-top-with-attributes.csv`

### 5. Ручные правки `dictionary-top-with-attributes.csv`
После сборки итоговый файл вручную уточняется здесь:
- `source/data/attributes/dictionary-top-with-attributes.csv`

На этом шаге:
- исправляются отдельные неточные значения LLM-полей `imageability`, `emotional_valence`, `is_profane`


## Порядок запуска

Один раз установить локальные зависимости:

```bash
cd source/pipelines/attributes
npm install
```

Дальше запускать шаги так:

```bash
node 01-build-dictionary-top.ts
node 02-01-build-llm-attributes.ts
node 02-02-split-llm-attributes.ts
```

После этого нужно заполнить файлы `*.llm.csv` в `source/data/attributes/llm-attributes.chunks/`
по инструкции из `02-03-prompt-llm-attributes.md`.

Затем продолжить:

```bash
node 02-04-merge-llm-attributes.ts
node 02-05-validate-llm-attributes.ts
node 03-build-dictionary-top-with-attributes.ts
```

Для вручную выбранных лемм заполнить
`source/data/attributes/extra-lemmas-llm-attributes.llm.csv` по инструкции из
`02-03-prompt-llm-attributes.md`, изменив только имена входного и выходного файлов.
Затем запустить:

```bash
node 04-build-extra-lemmas-with-attributes.ts
```

После этого при необходимости вручную внести правки в
`source/data/attributes/dictionary-top-with-attributes.csv`.
