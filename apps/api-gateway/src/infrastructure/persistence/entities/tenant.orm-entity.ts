import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tenants')
export class TenantOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 100, unique: true })
  slug!: string;

  @Column({ length: 50, default: 'free' })
  plan!: string;

  @Column({ type: 'jsonb', default: '{}' })
  settings!: Record<string, unknown>;

  @Column({ name: 'max_connections', default: 5 })
  maxConnections!: number;

  @Column({ name: 'max_users', default: 10 })
  maxUsers!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
