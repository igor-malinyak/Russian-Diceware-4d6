[English](README.md) | [Русский](README.ru.md)

# Сборка списка слов

Этот процесс собирает готовый список Russian Diceware 4d6 из слов,
отобранных на предыдущем этапе. Сначала он готовит одноколоночный CSV
для ручных правок, а затем сортирует слова и добавляет рабочие поля.

## Шаги

### 1. `01-build-selected-words.ts`

Читает:
- `source/data/selection/final-candidates-selected.csv`

Создаёт:
- `source/data/wordlist/selected-words.csv`

Логика шага:
- читает слова из столбца `Lemma`
- завершает работу с ошибкой, если находит пустое или повторяющееся слово
- сохраняет исходные написания и порядок слов
- записывает только столбец `word`

Выходной CSV содержит один столбец:

```text
word
```

### 2. Внести ручные правки

Создать рабочую копию отобранных слов:

```bash
cp source/data/wordlist/selected-words.csv source/data/wordlist/edited-words.csv
```

Затем вручную отредактировать `source/data/wordlist/edited-words.csv`.

### 3. `03-build-word-metadata-input.ts`

Читает:
- `source/data/wordlist/edited-words.csv`

Создаёт:
- `source/data/wordlist/word-metadata-input.csv`

Логика шага:
- сортирует слова по русскому алфавиту с учётом `ё`
- автоматически заполняет `transliteration`
- оставляет `abbreviation` и `top_1000` пустыми для ручного заполнения

Выходной CSV содержит столбцы:

```text
word,transliteration,abbreviation,top_1000
```

### 4. Выполнить ручное заполнение

Создать рабочую копию подготовленной таблицы:

```bash
cp source/data/wordlist/word-metadata-input.csv source/data/wordlist/word-metadata-completed.csv
```

Затем вручную отредактировать `source/data/wordlist/word-metadata-completed.csv`:
- заполнить `abbreviation`
- заполнить `top_1000`

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
(cd source/pipelines/wordlist && npm install)
```

Затем из корня репозитория выполнить шаг 1:

```bash
node source/pipelines/wordlist/01-build-selected-words.ts
```

Выполнить ручные правки из шага 2, затем запустить шаг 3:

```bash
node source/pipelines/wordlist/03-build-word-metadata-input.ts
```

После этого выполнить ручную работу из шага 4.
