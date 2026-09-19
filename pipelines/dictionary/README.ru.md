[English](README.md) | [Русский](README.ru.md)

# Сборка словаря

Этот процесс собирает словарь Russian Diceware 4d6 из итогового списка слов и редактируемого содержания.

## Шаги

### 1. Внести правки

Отредактировать содержание в `data/dictionary/dictionary.tex` или макет в `data/dictionary/dictionary-layout.tex`.
Если нужны изменения словарных данных, внести их на предыдущих этапах и заново собрать `data/wordlist/wordlist.csv`.

### 2. `01-build-dictionary.ts`

Читает:
- `data/wordlist/wordlist.csv`
- `data/dictionary/dictionary.tex`
- `data/dictionary/dictionary-layout.tex`
- `data/dictionary/releases.json`
- шрифты и лицензии из `data/external/fonts/`

Создаёт в `data/dictionary/output/`:
- `russian-diceware-4d6.pdf` — словарь с изданием и редакцией на обложке
- `russian-diceware-4d6.csv` — побайтовую копию итогового CSV
- `russian-diceware-4d6.tsv` — те же столбцы, значения и порядок строк с табуляцией как разделителем
- `release.json` — версию, отпечаток словарных данных, контрольные суммы файлов и исходников и Git-коммит

Логика шага:
- выбирает версию по реестру опубликованных выпусков
- собирает PDF и проверяет его на ошибки вёрстки
- заменяет весь предыдущий локальный комплект, не оставляя устаревших файлов
- при ошибке компиляции сохраняет временный каталог с журналом и не изменяет `output/`

Комплект игнорируется Git. Сборка не меняет реестр, не создаёт тег и не обращается к GitHub.
В `release.json` записывается текущий HEAD. Точные версии использованных исходников фиксируются контрольными суммами.

### 3. Проверить комплект

Открыть PDF из `data/dictionary/output/` и проверить содержание и макет.
Если нужны правки, повторить шаги 1 и 2, затем проверить новый PDF.
Для выпуска использовать только последний проверенный комплект без повторной сборки.

## Выбор версии

`data/dictionary/releases.json` содержит только опубликованные выпуски. Это объект с массивом `releases`. Каждая запись содержит положительные целые `edition`, `revision` и `wordlistSha256` из сведений опубликованного комплекта. Записи идут по порядку начиная с `ed1-rev1`, без пропусков.

- Реестр пуст — `ed1-rev1`.
- Данные совпадают с последним опубликованным выпуском — следующая редакция того же издания.
- Данные изменились — следующее издание с первой редакцией.

Для выбора версии сравниваются содержание и порядок словарных данных. Повторные сборки до публикации сохраняют номер выпуска. Пробные сборки не нужно добавлять в реестр.

## Порядок запуска

### 1. Один раз установить Node.js

Установить [Node.js 24](https://nodejs.org/en/download) с npm и проверить версии:

```bash
node --version
npm --version
```

### 2. Один раз установить TeX Live

1. Скачать [официальный установщик TeX Live](https://www.tug.org/texlive/acquire-netinstall.html) для своей платформы. Для macOS и Linux распаковать архив и запустить `perl install-tl --scheme=infraonly` из распакованного каталога. Для Windows запустить установщик `.exe`.

2. Выбрать набор `scheme-infraonly` (только инфраструктура TeX Live) и каталог установки. На Windows выбор набора доступен в расширенных настройках установщика. Подробности — в [инструкции TeX Live](https://www.tug.org/texlive/quickinstall.html).

3. Добавить каталог исполняемых файлов TeX Live в `PATH`. Он находится внутри каталога установки в `bin/<платформа>`, например `bin/universal-darwin` на macOS или `bin/windows` на Windows. Открыть новый терминал и проверить:

   ```bash
   tlmgr --version
   ```

4. Установить LuaLaTeX, latexmk и пакеты для макета. Зависимости пакетов `tlmgr` добавит автоматически:

   ```bash
   tlmgr install latex-bin luahbtex luatex luaotfload lualatex-math lm latexmk fontspec babel babel-russian hyphen-russian geometry graphics xcolor tools colortbl fancyhdr hyperref
   ```

   Проверить установку:

   ```bash
   lualatex --version
   latexmk --version
   ```

### 3. Один раз установить зависимости скрипта

Из корня репозитория:

```bash
cd pipelines/dictionary
npm ci
```

### 4. Собрать комплект

После правок и подготовки итогового списка слов запустить из `pipelines/dictionary/`:

```bash
node 01-build-dictionary.ts
```
