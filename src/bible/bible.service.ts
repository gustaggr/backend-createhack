import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface BibleBook {
  abbrev: string;
  name: string;
  chapters: string[][];
}

interface VerseRef {
  abbrev: string;
  chapter: number;
  verse: number;
}

// Referências de conforto/encorajamento para o "versículo do dia" — mesma
// referência pra todo mundo no mesmo dia civil (ver getVerseOfTheDay).
const CURATED_REFERENCES: VerseRef[] = [
  { abbrev: 'sl', chapter: 23, verse: 1 },
  { abbrev: 'sl', chapter: 34, verse: 18 },
  { abbrev: 'sl', chapter: 46, verse: 1 },
  { abbrev: 'sl', chapter: 55, verse: 22 },
  { abbrev: 'sl', chapter: 91, verse: 1 },
  { abbrev: 'sl', chapter: 94, verse: 19 },
  { abbrev: 'sl', chapter: 116, verse: 15 },
  { abbrev: 'sl', chapter: 121, verse: 1 },
  { abbrev: 'sl', chapter: 121, verse: 2 },
  { abbrev: 'sl', chapter: 147, verse: 3 },
  { abbrev: 'is', chapter: 40, verse: 29 },
  { abbrev: 'is', chapter: 40, verse: 31 },
  { abbrev: 'is', chapter: 41, verse: 10 },
  { abbrev: 'is', chapter: 43, verse: 2 },
  { abbrev: 'jr', chapter: 29, verse: 11 },
  { abbrev: 'mt', chapter: 11, verse: 28 },
  { abbrev: 'jo', chapter: 14, verse: 27 },
  { abbrev: 'jo', chapter: 16, verse: 33 },
  { abbrev: '2co', chapter: 1, verse: 3 },
  { abbrev: '2co', chapter: 4, verse: 16 },
  { abbrev: '2co', chapter: 12, verse: 9 },
  { abbrev: 'gl', chapter: 6, verse: 9 },
  { abbrev: 'fp', chapter: 4, verse: 6 },
  { abbrev: 'fp', chapter: 4, verse: 13 },
  { abbrev: 'hb', chapter: 12, verse: 1 },
  { abbrev: '1pe', chapter: 5, verse: 7 },
];

@Injectable()
export class BibleService {
  private readonly books: BibleBook[];

  constructor() {
    const dir = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(dir, 'ACF.json'), 'utf-8');
    this.books = JSON.parse(raw);
  }

  private findBook(abbrev: string): BibleBook | undefined {
    return this.books.find((b) => b.abbrev.toLowerCase() === abbrev.toLowerCase());
  }

  getVerseOfTheDay(date: Date = new Date()) {
    const daysSinceEpoch = Math.floor(date.getTime() / 86_400_000);
    const ref = CURATED_REFERENCES[daysSinceEpoch % CURATED_REFERENCES.length];

    const book = this.findBook(ref.abbrev);
    const text = book?.chapters[ref.chapter - 1]?.[ref.verse - 1] ?? '';

    return {
      reference: `${book?.name ?? ref.abbrev} ${ref.chapter}:${ref.verse}`,
      text,
    };
  }
}
