/**
 * Domain Entity: Annotation on a procedure (comments, tags, bookmarks).
 */
export class Annotation {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly procedureId: string,
    public readonly userId: string,
    public readonly annotationType: AnnotationType,
    public readonly content: string | null,
    public readonly lineStart: number | null,
    public readonly lineEnd: number | null,
    public readonly tags: string[],
    public readonly isResolved: boolean,
    public readonly resolvedBy: string | null,
    public readonly resolvedAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isInlineAnnotation(): boolean {
    return this.lineStart !== null;
  }
}

export type AnnotationType = 'comment' | 'tag' | 'bookmark' | 'warning' | 'approval';
