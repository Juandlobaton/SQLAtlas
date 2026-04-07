import { DiscoveredSchema } from '../entities/discovered-schema.entity';
import type { CreateDiscoveredSchema } from '../types';

export interface IDiscoveredSchemaRepository {
  findById(id: string): Promise<DiscoveredSchema | null>;
  findByConnection(connectionId: string): Promise<DiscoveredSchema[]>;
  findByName(connectionId: string, schemaName: string, catalogName?: string): Promise<DiscoveredSchema | null>;
  upsert(data: CreateDiscoveredSchema): Promise<DiscoveredSchema>;
  bulkUpsert(data: CreateDiscoveredSchema[]): Promise<number>;
  delete(id: string): Promise<void>;
}

export const DISCOVERED_SCHEMA_REPOSITORY = Symbol('IDiscoveredSchemaRepository');
