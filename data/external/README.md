[English](README.md) | [Русский](README.ru.md)

# Sources of files in `data/external`

This directory contains external data used by the project. The origin of each file is listed below.

## `freqrnc2011.csv`

- Source: [dict.ruslang.ru](http://dict.ruslang.ru)
- Source description: a frequency dictionary of modern Russian by S. A. Sharov and O. N. Lyashevskaya, designed as a representative core word list and compiled from a large corpus of texts across multiple genres, including spoken language.
- Direct link to the source archive: [Freq2011.zip](http://dict.ruslang.ru/Freq2011.zip)
- File description: a CSV version of the data from this frequency dictionary.

## `lemmas_to_roots.tsv`

- Source: repository [tabidots/ru_roots](https://github.com/tabidots/ru_roots/tree/main)
- Source description: the repository contains data from A. I. Kuznetsova's *Dictionary of Russian Morphemes* (1986), digitized with OCR and then manually proofread and corrected by the repository author.
- Direct link to the file: [lemmas_to_roots.tsv](https://github.com/tabidots/ru_roots/blob/main/lemmas_to_roots.tsv)
- File description: data from the dictionary index; a lemma-to-root table, in some cases with stress marks and disambiguating notes.

## `root_groups.txt`

- Source: repository [tabidots/ru_roots](https://github.com/tabidots/ru_roots/tree/main)
- Source description: the same digitized and proofread dataset from A. I. Kuznetsova's *Dictionary of Russian Morphemes*.
- Direct link to the file: [root_groups.txt](https://github.com/tabidots/ru_roots/blob/main/root_groups.txt)
- File description: data from Appendix I of the dictionary; groups of related or alternating roots and redirect lines pointing to a canonical root.

## `train_Tikhonov_reformat.txt`

- Source: repository [AlexeySorokin/NeuralMorphemeSegmentation](https://github.com/AlexeySorokin/NeuralMorphemeSegmentation/)
- Source description: a repository with code for neural morpheme segmentation of Russian words.
- Direct link to the file: [train_Tikhonov_reformat.txt](https://github.com/AlexeySorokin/NeuralMorphemeSegmentation/blob/master/data/train_Tikhonov_reformat.txt)
- File description: a training dataset derived from A. N. Tikhonov's morphological dictionary.
