import { AnalysisProgress } from '../models/analysis';

export enum WsEvent {
  ANALYSIS_STARTED = 'analysis:started',
  ANALYSIS_PROGRESS = 'analysis:progress',
  ANALYSIS_COMPLETED = 'analysis:completed',
  ANALYSIS_FAILED = 'analysis:failed',

  ANNOTATION_CREATED = 'annotation:created',
  ANNOTATION_UPDATED = 'annotation:updated',
  ANNOTATION_DELETED = 'annotation:deleted',

  COMMENT_ADDED = 'comment:added',

  USER_JOINED = 'presence:joined',
  USER_LEFT = 'presence:left',
  CURSOR_MOVED = 'presence:cursor',
}

export interface WsMessage<T = unknown> {
  event: WsEvent;
  data: T;
  timestamp: string;
  userId?: string;
}

export interface AnalysisStartedEvent {
  jobId: string;
  connectionId: string;
  connectionName: string;
}

export interface AnalysisProgressEvent extends AnalysisProgress {}

export interface PresenceEvent {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  procedureId?: string;
  cursor?: { line: number; column: number };
}
