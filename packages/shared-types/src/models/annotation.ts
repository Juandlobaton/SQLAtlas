export interface Annotation {
  id: string;
  tenantId: string;
  procedureId: string;
  userId: string;
  annotationType: AnnotationType;
  content?: string;
  lineStart?: number;
  lineEnd?: number;
  tags?: string[];
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    displayName: string;
    avatarUrl?: string;
  };
}

export type AnnotationType = 'comment' | 'tag' | 'bookmark' | 'warning' | 'approval';

export interface Comment {
  id: string;
  annotationId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    displayName: string;
    avatarUrl?: string;
  };
}
