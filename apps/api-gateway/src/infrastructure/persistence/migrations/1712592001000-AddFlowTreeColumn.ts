import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlowTreeColumn1712592001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "procedures" ADD COLUMN IF NOT EXISTS "flow_tree" JSONB`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "procedures" DROP COLUMN IF EXISTS "flow_tree"`);
  }
}
