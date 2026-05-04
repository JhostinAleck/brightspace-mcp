export type LetterGradeKind = 'A' | 'B' | 'C' | 'D' | 'F';

export class LetterGrade {
  private constructor(
    readonly letter: LetterGradeKind,
    readonly percent: number,
  ) {}

  static fromPercent(percent: number): LetterGrade {
    if (percent < 0) {
      throw new Error(`LetterGrade: percent must be >= 0, got ${percent}`);
    }
    // Clamp to 100 for letter assignment; grades > 100 are valid (bonus points) and map to A
    const clamped = Math.min(percent, 100);
    let letter: LetterGradeKind;
    if (clamped >= 90) letter = 'A';
    else if (clamped >= 80) letter = 'B';
    else if (clamped >= 70) letter = 'C';
    else if (clamped >= 60) letter = 'D';
    else letter = 'F';
    return new LetterGrade(letter, percent);
  }

  get isPassing(): boolean {
    return this.letter !== 'F';
  }
}
