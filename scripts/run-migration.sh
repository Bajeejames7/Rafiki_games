#!/bin/bash
# Run database migration manually
# Usage: DATABASE_URL=your_db_url ./scripts/run-migration.sh

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is required"
  exit 1
fi

echo "Running migration: Add daily_points table..."
psql "$DATABASE_URL" -f lib/db/drizzle/0001_add_daily_points.sql

if [ $? -eq 0 ]; then
  echo "✓ Migration completed successfully"
else
  echo "✗ Migration failed"
  exit 1
fi
