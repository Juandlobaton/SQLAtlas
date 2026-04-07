import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('table_accesses')
export class TableAccessOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index()
  tenantId!: string;

  @Column({ name: 'procedure_id', type: 'uuid' })
  @Index()
  procedureId!: string;

  @Column({ name: 'table_id', type: 'uuid', nullable: true })
  @Index()
  tableId!: string | null;

  @Column({ name: 'table_name', length: 255 })
  tableName!: string;

  @Column({ name: 'full_table_name', length: 500 })
  @Index()
  fullTableName!: string;

  @Column({ length: 50 })
  operation!: string;

  @Column({ type: 'jsonb', default: '[]' })
  columns!: string[];

  @Column({ name: 'line_number', type: 'int', nullable: true })
  lineNumber!: number | null;

  @Column({ name: 'is_temp_table', default: false })
  isTempTable!: boolean;

  @Column({ name: 'is_dynamic', default: false })
  isDynamic!: boolean;

  @Column({ type: 'float', default: 1.0 })
  confidence!: number;

  @Column({ name: 'analysis_job_id', type: 'uuid', nullable: true })
  analysisJobId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
