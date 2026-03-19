# Word attributes

Input CSV name format:
- `llm-attributes.chunk-XXX.original.csv`

Output CSV name format:
- `llm-attributes.chunk-XXX.llm.csv`

Return the completed CSV as the corresponding `.llm.csv` file for the input `.original.csv` file.

Fill the following columns in the CSV:
- `imageability`
- `emotional_valence`
- `is_profane`

Fill only these three columns.
Do not change:
- `Number`
- `Lemma`
- row order
- row count
- header

## Attribute definitions

### `imageability`
How easily the word, in isolation, evokes a concrete sensory image, scene, action, property, feeling, or perceptible situation.

Use the most common modern meaning of the word.
Do not invent extra context.

Scale:
- `1` — almost no concrete image; mostly abstract, logical, or functional
- `2` — weak, vague, or context-dependent image
- `3` — some image exists, but it is not very concrete or not immediate
- `4` — the word evokes a clear image, scene, action, or sensory property
- `5` — the word very quickly evokes a sharp and concrete image

Practical rule:
If the word can be easily imagined, shown, drawn, acted out, or described as a clear sensory property, it is usually `4` or `5`.

Examples:
- `1`: `смысл`, `причина`, `рифма`
- `2`: `уровень`, `жанр`, `обычный`
- `3`: `тень`, `граница`, `медленно`
- `4`: `лес`, `бежать`, `красный`, `вверх`
- `5`: `ложка`, `корова`, `банан`, `резать`, `мокрый`

### `emotional_valence`
The typical emotional polarity of the word in modern neutral usage.

Judge the emotional reaction the word itself usually carries.
Do not build a special scenario around it.

Scale:
- `1` — clearly negative
- `2` — somewhat negative
- `3` — neutral
- `4` — somewhat positive
- `5` — clearly positive

Practical rule:
If the word is neither positive nor negative on its own, use `3`.

Examples:
- `1`: `труп`, `могила`, `рана`
- `2`: `грязь`, `крыса`, `плесень`
- `3`: `стол`, `окно`, `веревка`
- `4`: `сад`, `подарок`, `улыбка`
- `5`: `счастье`, `радость`, `праздник`

### `is_profane`
Whether the word is profane, obscene, or a strongly insulting word in ordinary modern Russian.

Values:
- `1` — profane, obscene, or a stable direct insult
- `0` — not profane

Use `1` for:
- mat
- obscene vocabulary
- harsh swear words
- words that are commonly understood as a direct insult

Use `0` for:
- merely negative words
- unpleasant words
- rough but non-profane everyday words
- words about death, violence, dirt, sickness, and similar themes if the word itself is not swearing

Examples:
- `грязь` → `0`
- `смерть` → `0`
- `дурак` → usually `1`
- obscene vocabulary → `1`

## Rules
- Evaluate each row independently.
- Work strictly row by row.
- Use the word itself, without extra context.
- Use only the definitions and rules stated in this prompt.
- Do not invent extra criteria, hidden rules, heuristics, or shortcuts.
- Do not use bulk defaults, pattern-based guessing, or cross-row inference.
- Do not go beyond the instruction by adding your own interpretation framework.
- If a word is emotionally neutral, prefer `3` for `emotional_valence`.
- If a word is negative but not profanity, keep `is_profane = 0`.
- Use only these values:
  - `imageability`: `1`, `2`, `3`, `4`, `5`
  - `emotional_valence`: `1`, `2`, `3`, `4`, `5`
  - `is_profane`: `0`, `1`
- Do not add comments, notes, or extra columns.
