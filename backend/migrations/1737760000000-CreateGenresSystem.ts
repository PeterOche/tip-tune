import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Migration: Create Genre Management System
 * - Creates genres table with hierarchy support
 * - Creates track_genres junction table for many-to-many relationship
 * - Adds indexes for performance
 *
 * Run: npx typeorm-ts-node-commonjs migration:run -d data-source.ts
 */
export class CreateGenresSystem1737760000000 implements MigrationInterface {
  name = 'CreateGenresSystem1737760000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Create genres table
    await queryRunner.createTable(
      new Table({
        name: 'genres',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isUnique: true,
          },
          {
            name: 'slug',
            type: 'varchar',
            length: '100',
            isUnique: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'parentGenreId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'trackCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for genres
    await queryRunner.createIndex(
      'genres',
      new TableIndex({
        name: 'IDX_genres_slug',
        columnNames: ['slug'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'genres',
      new TableIndex({
        name: 'IDX_genres_name',
        columnNames: ['name'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'genres',
      new TableIndex({
        name: 'IDX_genres_parentGenreId',
        columnNames: ['parentGenreId'],
      }),
    );

    // Create foreign key for parent genre
    await queryRunner.createForeignKey(
      'genres',
      new TableForeignKey({
        columnNames: ['parentGenreId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'genres',
        onDelete: 'SET NULL',
      }),
    );

    // Create track_genres junction table
    await queryRunner.createTable(
      new Table({
        name: 'track_genres',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'trackId',
            type: 'uuid',
          },
          {
            name: 'genreId',
            type: 'uuid',
          },
        ],
      }),
      true,
    );

    // Create unique constraint for trackId + genreId
    await queryRunner.createIndex(
      'track_genres',
      new TableIndex({
        name: 'IDX_track_genres_unique',
        columnNames: ['trackId', 'genreId'],
        isUnique: true,
      }),
    );

    // Create indexes for track_genres
    await queryRunner.createIndex(
      'track_genres',
      new TableIndex({
        name: 'IDX_track_genres_trackId',
        columnNames: ['trackId'],
      }),
    );

    await queryRunner.createIndex(
      'track_genres',
      new TableIndex({
        name: 'IDX_track_genres_genreId',
        columnNames: ['genreId'],
      }),
    );

    // Create foreign keys for track_genres
    await queryRunner.createForeignKey(
      'track_genres',
      new TableForeignKey({
        columnNames: ['trackId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tracks',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'track_genres',
      new TableForeignKey({
        columnNames: ['genreId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'genres',
        onDelete: 'CASCADE',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Drop track_genres table (foreign keys will be dropped automatically)
    await queryRunner.dropTable('track_genres', true);

    // Drop genres table (foreign keys will be dropped automatically)
    await queryRunner.dropTable('genres', true);
  }
}
