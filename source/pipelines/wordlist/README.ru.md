[English](README.md) | [Русский](README.ru.md)

# Сборка списка слов

Этот процесс собирает готовый список Russian Diceware 4d6 из слов,
отобранных на предыдущем этапе. Сначала он готовит одноколоночный CSV
для ручных правок, а затем сортирует слова и добавляет рабочие поля.

## Шаги

### 1. `01-build-selected-words.ts`

Читает:
- `source/data/selection/final-candidates-selected-1296.csv`

Создаёт:
- `source/data/wordlist/selected-words.csv`

Логика шага:
- читает стабильные идентификаторы из `Number`, а слова — из `Lemma`
- завершает работу с ошибкой, если находит пустое или повторяющееся слово либо `Number`
- сохраняет `Number`, исходные написания и порядок слов

Выходной CSV содержит столбцы:

```text
Number,word
```

### 2. Внести ручные правки

Из корня репозитория создать рабочую копию отобранных слов:

```bash
cp source/data/wordlist/selected-words.csv source/data/wordlist/edited-words.csv
```

Затем вручную отредактировать `source/data/wordlist/edited-words.csv`.
Значения `Number` нужно оставить без изменений и редактировать только `word`.

### 3. `03-build-word-metadata-input.ts`

Читает:
- `source/data/wordlist/edited-words.csv`

Создаёт:
- `source/data/wordlist/word-metadata-input.csv`

Логика шага:
- сортирует слова по русскому алфавиту с учётом `ё`
- сохраняет `Number` при изменении написания и сортировке слов
- завершает работу с ошибкой, если находит пустое или повторяющееся слово либо `Number`
- автоматически заполняет `transliteration`
- оставляет `abbreviation` пустым для ручного заполнения

Выходной CSV содержит столбцы:

```text
Number,word,transliteration,abbreviation
```

### 4. Выполнить ручное заполнение

Из корня репозитория создать рабочую копию подготовленной таблицы:

```bash
cp source/data/wordlist/word-metadata-input.csv source/data/wordlist/word-metadata-completed.csv
```

Затем вручную отредактировать `source/data/wordlist/word-metadata-completed.csv`:
- заполнить `abbreviation`

`word-metadata-input.csv` остаётся автоматически создаваемым артефактом и вручную не
редактируется.

## Правила транслитерации

Каждая буква заменяется однозначно. Единственное контекстное правило относится к
`е`: она превращается в `ye` сразу после `ь` или `ъ`, а во всех остальных позициях — в `e`.

| Буква | Транслитерация |
| --- | --- |
| а | `a` |
| б | `b` |
| в | `v` |
| г | `g` |
| д | `d` |
| е | `e`; `ye` сразу после `ь` или `ъ` |
| ё | `yo` |
| ж | `zh` |
| з | `z` |
| и | `i` |
| й | `y` |
| к | `k` |
| л | `l` |
| м | `m` |
| н | `n` |
| о | `o` |
| п | `p` |
| р | `r` |
| с | `s` |
| т | `t` |
| у | `u` |
| ф | `f` |
| х | `h` |
| ц | `ts` |
| ч | `ch` |
| ш | `sh` |
| щ | `shch` |
| ь | пропускается |
| ы | `y` |
| ъ | пропускается |
| э | `e` |
| ю | `yu` |
| я | `ya` |

## Порядок запуска

Один раз установить локальные зависимости:

```bash
cd source/pipelines/wordlist
npm install
```

Затем выполнить шаг 1:

```bash
node 01-build-selected-words.ts
```

Выполнить ручные правки из шага 2, затем запустить шаг 3:

```bash
node 03-build-word-metadata-input.ts
```

После этого выполнить ручную работу из шага 4.
