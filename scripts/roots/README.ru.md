[English](README.md) | [Русский](README.ru.md)

# Процесс определения корней

## Методика
Этот процесс присваивает корни леммам из `data/dictionary-source.csv`.

Он совмещает две системы корней:
- словарь Кузнецовой задаёт основную систему известных корней и различение омонимов
- словарь Тихонова помогает восстанавливать корни у лемм, которых нет в прямом покрытии Кузнецовой

В этой схеме используются два уровня:
- `root` — конкретный корень, который используется при сопоставлении и снятии омонимии
- `canonical_root` — нормализованный итоговый корень, который попадает в финальный словарь

Для корней, которые существуют в системе Кузнецовой:
- `canonical_root` задаётся через файл группировки корней Кузнецовой

Для корней, которых в системе Кузнецовой нет:
- отдельная канонизация не делается
- `canonical_root = root`

Поэтому в финальном результате `canonical_root` заполнен всегда, но настоящая кузнецовская канонизация применяется только к известным корням Кузнецовой.

LLM используется только там, где автоматического сопоставления недостаточно:
- на этапе сопоставления корней Тихонова на уровне корня
- на этапе снятия омонимии
- на остаточном этапе на уровне леммы

У пайплайна два конечных артефакта:
- `data/roots/dictionary-source-with-roots.csv` — финальный словарь лемм с полем `roots`, где всегда записан `canonical_root`
- `data/roots/root-ipm.csv` — агрегированный словарь корней с суммарным `IPM` по всем леммам, где встречается корень

## Источники
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/roots/root_groups_fixed.txt`
- `data/external/train_Tikhonov_reformat.txt`

## Выбор примеров
Когда артефакт корней хранит примеры лемм:
- примеры сортируются по убыванию `IPM`
- сохраняются top-10 примеров
- если лемма отсутствует в `data/dictionary-source.csv`, её `IPM` считается равным `0`
- такие леммы всё равно могут попасть в список примеров

## Шаги

### 1. `01-build-kuznetsova-roots.ts`
Создаёт:
- `data/roots/kuznetsova-roots.csv`

Читает:
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/roots/root_groups_fixed.txt`

Этот шаг строит основной реестр корней Кузнецовой с полями:
- `root`
- `root_base`
- `canonical_root`
- метаданные омонимии
- примеры

Именно здесь и только здесь вычисляется отображение из кузнецовского `root` в `canonical_root`.

### 2. `02-build-tikhonov-auto-root-resolution.ts`
Создаёт:
- `data/roots/tikhonov-auto-root-resolution.csv`

Читает:
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/external/train_Tikhonov_reformat.txt`
- `data/roots/kuznetsova-roots.csv`

Этот шаг строит консервативное автоматическое сопоставление:
- `tikhonov_root`
к
- кузнецовскому `root`

Важно:
- автоматическое обучение использует только такие пары лемм, где:
  - у Кузнецовой для леммы ровно один уникальный `root`
  - у Тихонова для леммы ровно один `tikhonov_root`
- тихоновские леммы с несколькими корнями не участвуют в автоматическом обучении кандидатов
- `auto_candidates` — это значения `root`, а не `canonical_root`
- `resolved_canonical_root` хранится только как справочное поле для уже детерминированных случаев
- если один `tikhonov_root` накапливает по разным леммам конфликтующие кузнецовские `root`, это считается конфликтом на уровне леммы, а не задачей сопоставления на уровне корня

### 3. LLM-сопоставление корней

#### 3.1. `03-01-build-llm-tikhonov-root-mapping.ts`
Создаёт:
- `data/roots/llm-tikhonov-root-mapping.original.csv`

Этот файл содержит только те корни Тихонова, для которых автомат не нашёл ни одного кандидата вообще.
Из него исключены корни с конфликтным автоматическим сигналом; такие случаи остаются для обработки на уровне леммы.
Каждая строка также содержит все известные тихоновские леммы для данного `tikhonov_root`.

#### 3.2. `03-02-prompt-llm-tikhonov-root-mapping.md`
Промпт для LLM-этапа.

Важно:
- LLM заполняет поля `decision` и `root`
- это задача на уровне `root`, а не `canonical_root`
- этот шаг обрабатывает корни без надёжного автоматического кандидата и должен завершаться как `mapped`, `new_root` или `lemma_level_conflict`
- при этом LLM всё равно может прийти к решению `lemma_level_conflict`, если леммы не поддерживают одно согласованное решение на уровне корня
- в промпте явно описан процесс разбиения на чанки и последующей сборки
- контекстный файл для LLM: `data/roots/kuznetsova-roots.csv`

#### 3.3. `03-03-split-llm-tikhonov-root-mapping.ts`
Обязательный подшаг LLM-этапа.

Разбивает:
- `data/roots/llm-tikhonov-root-mapping.original.csv`

На чанки в папке:
- `data/roots/llm-tikhonov-root-mapping.chunks`

#### 3.4. `03-04-merge-llm-tikhonov-root-mapping.ts`
Обязательный подшаг LLM-этапа.

Собирает заполненные chunk `.llm.csv` обратно в:
- `data/roots/llm-tikhonov-root-mapping.llm.csv`

#### 3.5. `03-05-validate-llm-tikhonov-root-mapping.ts`
Опциональный валидационный скрипт.

Проверяет, что `.llm.csv`:
- не потерял строки
- не изменил не-LLM поля
- заполнил обязательные LLM-поля

### 4. `04-build-resolved-roots.ts`
Создаёт:
- `data/roots/resolved-roots.csv`

Читает:
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/external/train_Tikhonov_reformat.txt`
- `data/roots/kuznetsova-roots.csv`
- `data/roots/llm-tikhonov-root-mapping.llm.csv`

Этот артефакт содержит корни, которые уже известны после этапа сопоставления корней Тихонова:
- все корни Кузнецовой
- все автоматически разрешённые корни Тихонова
- все новые корни, появившиеся на шаге 3

Он не включает случаи, где на шаге 3 получено решение `lemma_level_conflict`.

Поля:
- `root`
- `root_base`
- `canonical_root`
- `source`
- `examples`

Правило:
- для известных кузнецовских корней `canonical_root` берётся из системы Кузнецовой
- для новых корней `canonical_root = root`
- примеры собираются по всем известным источникам для одного и того же `root`:
  - кузнецовские леммы этого корня
  - тихоновские леммы, чьи сырые корни автоматически сводятся к этому `root`
  - тихоновские леммы, чьи сырые корни сводятся к этому `root` через шаг 3
  - после этого выбираются top-10 примеров по `IPM` с обычным fallback `0`

### 5. Снятие омонимии

#### 5.1. `05-01-build-llm-tikhonov-homonym-disambiguation.ts`
Создаёт:
- `data/roots/llm-tikhonov-homonym-disambiguation.original.csv`

Этот шаг подготавливает случаи на уровне леммы, где нужно выбрать точный омонимичный вариант `root`.
Сюда попадают только чистые случаи снятия омонимии, где все остальные неомонимичные корни уже разрешены.

#### 5.2. `05-02-prompt-llm-tikhonov-homonym-disambiguation.md`
Промпт для LLM-этапа.

Важно:
- LLM заполняет поле `roots`
- результат должен содержать точные значения `root`
- перевод в `canonical_root` делается позже через `resolved-roots.csv`
- в промпте явно описан процесс разбиения на чанки и последующей сборки
- контекстный файл для LLM: `data/roots/kuznetsova-roots.csv`

#### 5.3. `05-03-split-llm-tikhonov-homonym-disambiguation.ts`
Обязательный подшаг LLM-этапа.

Разбивает:
- `data/roots/llm-tikhonov-homonym-disambiguation.original.csv`

На чанки в папке:
- `data/roots/llm-tikhonov-homonym-disambiguation.chunks`

#### 5.4. `05-04-merge-llm-tikhonov-homonym-disambiguation.ts`
Обязательный подшаг LLM-этапа.

Собирает заполненные chunk `.llm.csv` обратно в:
- `data/roots/llm-tikhonov-homonym-disambiguation.llm.csv`

#### 5.5. `05-05-validate-llm-tikhonov-homonym-disambiguation.ts`
Опциональный скрипт валидации.

### 6. Остаточное определение корней через LLM

#### 6.1. `06-01-build-llm-roots.ts`
Создаёт:
- `data/roots/llm-roots.original.csv`

Этот шаг подготавливает оставшиеся случаи на уровне леммы, которые не покрылись:
- прямым покрытием Кузнецовой
- автоматическим разбором Тихонова
- LLM-сопоставлением корней на уровне корня
- этапом снятия омонимии

Сюда входят:
- леммы, у которых корни Тихонова дали конфликтующие автоматические сопоставления с корнями Кузнецовой
- леммы, у которых шаг 3 (LLM-сопоставление корней) закончился решением `lemma_level_conflict`
- леммы, которые всё ещё остались неразрешёнными после сопоставления на уровне корня
- смешанные случаи, где часть корней является омонимичной, а часть остаётся неразрешённой

#### 6.2. `06-02-prompt-llm-roots.md`
Промпт для LLM-этапа.

Важно:
- LLM заполняет поле `roots`
- результат всё ещё формируется на уровне `root`
- если нужен новый корень, он записывается как новый `root`
- дальше он будет вести себя как `canonical_root = root`
- входные строки могут также содержать уже фиксированные детерминированные корни и отдельные позиции с кандидатами-омонимами
- в промпте явно описан процесс разбиения на чанки и последующей сборки
- контекстный файл для LLM: `data/roots/resolved-roots.csv`

#### 6.3. `06-03-split-llm-roots.ts`
Обязательный подшаг LLM-этапа.

Разбивает:
- `data/roots/llm-roots.original.csv`

На чанки в папке:
- `data/roots/llm-roots.chunks`

#### 6.4. `06-04-merge-llm-roots.ts`
Обязательный подшаг LLM-этапа.

Собирает заполненные chunk `.llm.csv` обратно в:
- `data/roots/llm-roots.llm.csv`

#### 6.5. `06-05-validate-llm-roots.ts`
Опциональный скрипт валидации.

### 7. `07-build-dictionary-source-with-roots.ts`
Создаёт:
- `data/roots/dictionary-source-with-roots.csv`

Читает:
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/external/train_Tikhonov_reformat.txt`
- `data/roots/tikhonov-auto-root-resolution.csv`
- `data/roots/llm-tikhonov-root-mapping.llm.csv`
- `data/roots/resolved-roots.csv`
- `data/roots/llm-tikhonov-homonym-disambiguation.llm.csv`
- `data/roots/llm-roots.llm.csv`

Финальное правило:
- в итоговую колонку `roots` всегда записывается `canonical_root`
- для корней, которых нет у Кузнецовой, это тоже работает, потому что `canonical_root = root`

Порядок разрешения:
1. Если лемма есть у Кузнецовой, шаг 7 берёт кузнецовские корни напрямую и переводит их в `canonical_root`.
2. Иначе шаг 7 начинает с сырых тихоновских корней и сразу забирает все корни, которые уже разрешены на уровне корня:
   - детерминистические авторезолюшены из шага 2
   - решения шага 3 на уровне корня (`mapped` и `new_root`)
   - если после этого вся лемма уже разрешена, шаг 7 на этом заканчивает
3. Если после этого остаются неразрешённые позиции и для леммы есть заполненная строка шага 5, шаг 7 использует её как полный lemma-level результат и переводит её корни в `canonical_root`.
4. Если после этого всё ещё остаются неразрешённые позиции и для леммы есть заполненная строка шага 6, шаг 7 использует её как полный последний lemma-level fallback и переводит её корни в `canonical_root`.
5. `resolved-roots.csv` служит общим слоем канонизации для всех некузнецовских корней, которые доходят до этого шага.

Шаг 7 завершается с ошибкой, если:
- в строке шага 5 или шага 6 поле `roots` оказалось пустым
- после применения всех предыдущих шагов для леммы всё ещё не удаётся собрать итоговый набор корней
- отсутствует обязательный `.llm.csv` артефакт

### 8. `08-build-root-ipm.ts`
Создаёт:
- `data/roots/root-ipm.csv`

Читает:
- `data/roots/dictionary-source-with-roots.csv`

Этот шаг агрегирует финальный словарь по полю `roots` и записывает:
- `root`
- `IPM`

Правило подсчёта:
- каждая строка `dictionary-source-with-roots.csv` участвует со своим `IPM`
- если у леммы несколько корней, её `IPM` добавляется к каждому из этих корней
- в файл попадают все корни, встречающиеся в финальном словаре
- итоговый `IPM` для корня равен сумме `IPM` всех лемм, в которых этот корень присутствует

## Порядок запуска

Один раз установить локальные зависимости:

```bash
cd scripts/roots
npm install
```

Дальше запускать шаги так:

```bash
node 01-build-kuznetsova-roots.ts
node 02-build-tikhonov-auto-root-resolution.ts
node 03-01-build-llm-tikhonov-root-mapping.ts
```

Для этапа root-mapping использовать LLM так:
- передать модели промпт `03-02-prompt-llm-tikhonov-root-mapping.md`
- передать ей файл `data/roots/llm-tikhonov-root-mapping.original.csv`
- приложить `data/roots/kuznetsova-roots.csv` как контекст
- также дать модели эти вспомогательные скрипты как контекст:
  - `03-03-split-llm-tikhonov-root-mapping.ts`
  - `03-04-merge-llm-tikhonov-root-mapping.ts`
- LLM/агент должен:
  - выполнить split
  - обработать каждый сгенерированный chunk `.original.csv`
  - записать соответствующие chunk `.llm.csv`
  - выполнить merge
  - оставить итоговый результат в `data/roots/llm-tikhonov-root-mapping.llm.csv`

При желании провалидировать:

```bash
node 03-05-validate-llm-tikhonov-root-mapping.ts
```

Продолжить:

```bash
node 04-build-resolved-roots.ts
node 05-01-build-llm-tikhonov-homonym-disambiguation.ts
```

Для этапа снятия омонимии использовать LLM так:
- передать модели промпт `05-02-prompt-llm-tikhonov-homonym-disambiguation.md`
- передать ей файл `data/roots/llm-tikhonov-homonym-disambiguation.original.csv`
- приложить `data/roots/kuznetsova-roots.csv` как контекст
- также дать модели эти вспомогательные скрипты как контекст:
  - `05-03-split-llm-tikhonov-homonym-disambiguation.ts`
  - `05-04-merge-llm-tikhonov-homonym-disambiguation.ts`
- LLM/агент должен:
  - выполнить split
  - обработать каждый сгенерированный chunk `.original.csv`
  - записать соответствующие chunk `.llm.csv`
  - выполнить merge
  - оставить итоговый результат в `data/roots/llm-tikhonov-homonym-disambiguation.llm.csv`

При желании провалидировать:

```bash
node 05-05-validate-llm-tikhonov-homonym-disambiguation.ts
```

Дальше:

```bash
node 06-01-build-llm-roots.ts
```

Для остаточного этапа определения корней использовать LLM так:
- передать модели промпт `06-02-prompt-llm-roots.md`
- передать ей файл `data/roots/llm-roots.original.csv`
- приложить `data/roots/resolved-roots.csv` как контекст
- также дать модели эти вспомогательные скрипты как контекст:
  - `06-03-split-llm-roots.ts`
  - `06-04-merge-llm-roots.ts`
- LLM/агент должен:
  - выполнить split
  - обработать каждый сгенерированный chunk `.original.csv`
  - записать соответствующие chunk `.llm.csv`
  - выполнить merge
  - оставить итоговый результат в `data/roots/llm-roots.llm.csv`

При желании провалидировать:

```bash
node 06-05-validate-llm-roots.ts
```

Завершить:

```bash
node 07-build-dictionary-source-with-roots.ts
node 08-build-root-ipm.ts
```

## Примечания
- Не изменяйте `data/dictionary-source.csv`.
- Основные LLM-результаты всегда записываются в `.llm.csv`, а не в `.original.csv`.
- Валидационные скрипты — это опциональные вспомогательные шаги. Основные шаги читают `.llm.csv` напрямую.
