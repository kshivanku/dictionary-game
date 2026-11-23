"""Builds the game's two word lists.

Real words come from the 61,800-word list in Brysbaert, Stevens, Mandera &
Keuleers (2016), "How Many Words Do We Know?", Frontiers in Psychology 7:1116
(CC BY). Using the same list lets the game compare players with that study.

Reads:
  data/source/brysbaert-2016-lemmas.xlsx  the study's word list (sheet 1)
  data/source/enable1.txt                 extra real words, to keep fakes fake
  /usr/share/dict/words                   macOS word list, same purpose
Writes:
  data/words.txt       the study's words, one per line
  data/fake-words.txt  made-up words that look English but aren't

Run from the project folder:  python3 scripts/build_word_lists.py
"""

import random
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STUDY_LIST = ROOT / "data" / "source" / "brysbaert-2016-lemmas.xlsx"
ENABLE = ROOT / "data" / "source" / "enable1.txt"
MAC_WORDS = Path("/usr/share/dict/words")
OUT_REAL = ROOT / "data" / "words.txt"
OUT_FAKE = ROOT / "data" / "fake-words.txt"

FAKE_COUNT = 3000
SEED = 42  # same seed = same fake words every run

# Endings that turn a word into another form of it ("cities" -> "city").
# Used to reject fakes that are just a real word plus an ending.
ENDINGS = [
    ("ies", "y"), ("ied", "y"), ("ier", "y"), ("iest", "y"),
    ("es", ""), ("s", ""), ("ed", ""), ("ed", "e"), ("ing", ""), ("ing", "e"),
    ("er", ""), ("er", "e"), ("est", ""), ("ly", ""), ("ness", ""),
]


def read_study_words():
    """Read column A of the first sheet of the study's spreadsheet."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    z = zipfile.ZipFile(STUDY_LIST)
    strings = [
        "".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns)
    ]
    words = []
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    for row in sheet.iter(f"{{{ns['m']}}}row"):
        for c in row.findall("m:c", ns):
            if not c.get("r", "").startswith("A"):
                continue
            v = c.find("m:v", ns)
            if v is None:
                continue
            words.append(strings[int(v.text)] if c.get("t") == "s" else v.text)
    words = [w.strip() for w in words[1:] if w and w.strip()]  # skip header
    return sorted(set(words))


def is_form_of_real(word, real):
    for ending, put_back in ENDINGS:
        if word.endswith(ending):
            stem = word[: -len(ending)]
            if len(stem) >= 3 and (stem + put_back in real or stem in real):
                return True
    return False


def too_close_to_real(word, real):
    """True if one typo away from a real word ("tabel" for "table")."""
    letters = "abcdefghijklmnopqrstuvwxyz"
    for i in range(len(word) + 1):
        for c in letters:
            if word[:i] + c + word[i:] in real:            # missing letter
                return True
        if i < len(word):
            if word[:i] + word[i + 1:] in real:            # extra letter
                return True
            for c in letters:
                if word[:i] + c + word[i + 1:] in real:    # wrong letter
                    return True
            if i < len(word) - 1:
                if word[:i] + word[i + 1] + word[i] + word[i + 2:] in real:  # swapped
                    return True
    return False


def build_fake_words(study_words, known_real):
    """Learn which letter tends to follow each three-letter chunk in the
    study's words, then string letters together to make new ones."""
    rng = random.Random(SEED)
    follows = defaultdict(list)
    for w in study_words:
        if not re.fullmatch("[a-z]+", w):
            continue  # skip "I" and hyphenated words
        padded = "^^^" + w + "$"
        for i in range(3, len(padded)):
            follows[padded[i - 3:i]].append(padded[i])

    fakes = set()
    while len(fakes) < FAKE_COUNT:
        word, chunk = "", "^^^"
        while True:
            nxt = rng.choice(follows[chunk])
            if nxt == "$" or len(word) > 12:
                break
            word += nxt
            chunk = chunk[1:] + nxt
        if not 4 <= len(word) <= 11:
            continue
        if word in known_real or is_form_of_real(word, known_real):
            continue
        if too_close_to_real(word, known_real):
            continue
        fakes.add(word)
    return sorted(fakes)


def main():
    study = read_study_words()
    enable = set(ENABLE.read_text().split())
    mac = set()
    if MAC_WORDS.exists():
        mac = {l.strip().lower() for l in MAC_WORDS.read_text().splitlines()}
    known_real = set(w.lower() for w in study) | enable | mac

    fakes = build_fake_words(study, known_real)

    OUT_REAL.write_text("\n".join(study) + "\n")
    OUT_FAKE.write_text("\n".join(fakes) + "\n")
    print(f"Study words:     {len(study):,}  -> {OUT_REAL.relative_to(ROOT)}")
    print(f"Fake words made: {len(fakes):,}  -> {OUT_FAKE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
