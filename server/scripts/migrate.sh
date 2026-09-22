#!/bin/sh
set -eu

: "${MYSQL_HOST:=mysql}"
: "${MYSQL_PORT:=3306}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"

mysql_cmd() {
  MYSQL_PWD="$MYSQL_PASSWORD" mysql \
    --protocol=TCP \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    "$MYSQL_DATABASE" "$@"
}

# The official MySQL image only executes /docker-entrypoint-initdb.d on the
# first creation of its data volume. Track applied migrations so existing
# volumes receive migrations introduced by later application versions.
migration_table_exists="$(mysql_cmd --batch --skip-column-names -e "
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'schema_migrations';
")"

mysql_cmd -e '
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT="已执行的数据库迁移";
'

# Volumes created before migration tracking was added already contain the
# pre-history schema. Mark those versions as the baseline, then run every later
# migration normally. All releases containing this runner include 001-007.
if [ "$migration_table_exists" = "0" ]; then
  users_table_exists="$(mysql_cmd --batch --skip-column-names -e "
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'users';
  ")"
  if [ "$users_table_exists" != "0" ]; then
    mysql_cmd -e "
      INSERT IGNORE INTO schema_migrations (name) VALUES
        ('001_init_schema.sql'),
        ('002_seed_test_user.sql'),
        ('003_add_alumni_files.sql'),
        ('004_add_user_email.sql'),
        ('005_add_indexes.sql'),
        ('006_add_admin_access_control.sql'),
        ('007_fix_data_domain_encoding.sql');
    "
  fi
fi

for migration in /migrations/[0-9][0-9][0-9]_*.sql; do
  [ -f "$migration" ] || continue
  name="$(basename "$migration")"
  applied="$(mysql_cmd --batch --skip-column-names -e "
    SELECT COUNT(*) FROM schema_migrations WHERE name = '$name';
  ")"
  if [ "$applied" != "0" ]; then
    continue
  fi

  echo "Applying migration: $name"
  mysql_cmd < "$migration"
  mysql_cmd -e "INSERT IGNORE INTO schema_migrations (name) VALUES ('$name');"
done
