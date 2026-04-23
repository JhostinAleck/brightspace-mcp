export class DueDate {
  private constructor(private readonly date: Date | null) {}

  static at(date: Date): DueDate {
    return new DueDate(date);
  }
  static unspecified(): DueDate {
    return new DueDate(null);
  }

  toDate(): Date | null {
    return this.date;
  }
  hasValue(): boolean {
    return this.date !== null;
  }

  isBefore(other: DueDate): boolean {
    if (!this.date || !other.date) return false;
    return this.date.getTime() < other.date.getTime();
  }

  isWithin(from: Date, to: Date): boolean {
    if (!this.date) return false;
    const t = this.date.getTime();
    return t >= from.getTime() && t <= to.getTime();
  }

  isPastAt(reference: Date): boolean {
    if (!this.date) return false;
    return this.date.getTime() < reference.getTime();
  }
}
