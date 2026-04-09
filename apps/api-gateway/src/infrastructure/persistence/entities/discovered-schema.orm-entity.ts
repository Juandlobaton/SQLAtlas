import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('discovered_schemas')
@Index(['connectionId', 'catalogName', 'schemaName'], { unique: true })
export class DiscoveredSchemaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index()
  tenantId!: string;

  @Column({ name: 'connection_id', type: 'uuid' })
  @Index()
  connectionId!: string;

  @Column({ name: 'schema_name', length: 255 })
  schemaName!: string;

  @Column({ length: 300 })
  @Index()
  slug!: string;

  @Column({ name: 'catalog_name', type: 'varchar', length: 255, nullable: true })
  catalogName!: string | null;

  @Column({ name: 'object_counts', type: 'jsonb', default: '{}' })
  objectCounts!: Record<string, number>;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  owner!: string | null;

  @Column({ name: 'first_seen_at', type: 'timestamptz', default: () => 'NOW()' })
  firstSeenAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'NOW()' })
  lastSeenAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
