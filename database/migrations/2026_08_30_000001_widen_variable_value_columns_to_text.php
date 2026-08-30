<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Avoids Schema::change() (requires pragma_table_xinfo, SQLite >= 3.26.0);
     * recreates the tables instead, matching 2026_04_01_145542_make_requests_url_nullable.php.
     *
     * Note: SQLite has no VARCHAR length enforcement (dynamic typing), so existing
     * installs already accept unlimited-length variable values — this is a schema
     * clarity fix (TEXT, matching requests.body) rather than a functional one.
     */
    public function up(): void
    {
        $this->recreateEnvironmentVariables(valueType: 'TEXT');
        $this->recreateCollectionVariables(valueType: 'TEXT');
    }

    public function down(): void
    {
        $this->recreateEnvironmentVariables(valueType: 'VARCHAR');
        $this->recreateCollectionVariables(valueType: 'VARCHAR');
    }

    private function columnType(string $table, string $column): ?string
    {
        $columns = DB::select("PRAGMA table_info('{$table}')");

        return collect($columns)->firstWhere('name', $column)?->type;
    }

    private function recreateEnvironmentVariables(string $valueType): void
    {
        if (strtolower($this->columnType('environment_variables', 'value') ?? '') === strtolower($valueType)) {
            return;
        }

        DB::statement('PRAGMA foreign_keys = OFF');

        DB::statement("CREATE TABLE environment_variables_new (
            \"id\" integer primary key autoincrement not null,
            \"environment_id\" integer not null,
            \"key\" varchar not null,
            \"value\" {$valueType} not null,
            \"enabled\" tinyint(1) not null default '1',
            foreign key(\"environment_id\") references \"environments\"(\"id\") on delete cascade
        )");

        DB::statement('INSERT INTO environment_variables_new SELECT * FROM environment_variables');
        DB::statement('DROP TABLE environment_variables');
        DB::statement('ALTER TABLE environment_variables_new RENAME TO environment_variables');

        DB::statement('PRAGMA foreign_keys = ON');
    }

    private function recreateCollectionVariables(string $valueType): void
    {
        if (strtolower($this->columnType('collection_variables', 'value') ?? '') === strtolower($valueType)) {
            return;
        }

        DB::statement('PRAGMA foreign_keys = OFF');

        DB::statement("CREATE TABLE collection_variables_new (
            \"id\" integer primary key autoincrement not null,
            \"collection_id\" integer not null,
            \"key\" varchar not null,
            \"value\" {$valueType} not null default '',
            \"enabled\" tinyint(1) not null default '1',
            foreign key(\"collection_id\") references \"collections\"(\"id\") on delete cascade
        )");

        DB::statement('INSERT INTO collection_variables_new SELECT * FROM collection_variables');
        DB::statement('DROP TABLE collection_variables');
        DB::statement('ALTER TABLE collection_variables_new RENAME TO collection_variables');

        DB::statement('PRAGMA foreign_keys = ON');
    }
};
