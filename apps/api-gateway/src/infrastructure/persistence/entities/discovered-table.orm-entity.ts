import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('discovered_tables')
@Index(['connectionId', 'fullQualifiedName'], { unique: true })
export class DiscoveredTableOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index()
  tenantId!: string;

  @Column({ name: 'connection_id', type: 'uuid' })
  @Index()
  connectionId!: string;

  @Column({ name: 'schema_id', type: 'uuid' })
  schemaId!: string;

  @Column({ name: 'schema_name', length: 255 })
  schemaName!: string;

  @Column({ name: 'table_name', length: 255 })
  tableName!: string;

  @Column({ length: 500 })
  @Index()
  slug!: string;

  @Column({ name: 'full_qualified_name', length: 1000 })
  @Index()
  fullQualifiedName!: string;

  @Column({ name: 'table_type', length: 50, default: 'table' })
  tableType!: string;

  @Column({ name: 'estimated_row_count', type: 'bigint', nullable: true })
  estimatedRowCount!: number | null;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes!: number | null;

  @Column({ type: 'jsonb', default: '[]' })
  columns!: Record<string, unknown>[];

  @Column({ name: 'primary_key', type: 'jsonb', default: '[]' })
  primaryKey!: string[];

  @Column({ name: 'foreign_keys', type: 'jsonb', default: '[]' })
  foreignKeys!: Record<string, unknown>[];

  @Column({ type: 'jsonb', default: '[]' })
  indexes!: Record<string, unknown>[];

  @Column({ name: 'referenced_by_count', default: 0 })
  referencedByCount!: number;

  @Column({ name: 'first_seen_at', type: 'timestamptz', default: () => 'NOW()' })
  firstSeenAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'NOW()' })
  lastSeenAt!: Date;

  @Column({ name: 'is_deleted', default: false })
  isDeleted!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
