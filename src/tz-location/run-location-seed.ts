/**
 * run-location-seed.ts — CLI seed runner
 *
 * Run with:
 *   npx ts-node src/tz-location/run-location-seed.ts
 *
 * Or add to package.json:
 *   "seed:locations": "ts-node src/tz-location/run-location-seed.ts"
 *
 * Place at: src/tz-location/run-location-seed.ts
 */
import { DataSource } from 'typeorm';
import { TzRegion } from './entities/tz-region.entity';
import { TzDistrict } from './entities/tz-district.entity';
import { TzWard } from './entities/tz-ward.entity';
import { seedTzLocations } from './tz-complete-seed';

// Never hard-code a password: this repository is public. Same variable
// names as AppModule (DB_PASSWORD/DB_USERNAME), with the old DB_PASS/DB_USER
// still accepted.
const password = process.env.DB_PASSWORD ?? process.env.DB_PASS;
if (!password) {
  console.error('Seed failed: set DB_PASSWORD (and DB_NAME) in the environment first.');
  process.exit(1);
}

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
  password,
  database: process.env.DB_NAME || 'kentexa',
  entities: [TzRegion, TzDistrict, TzWard],
  synchronize: false,
});

dataSource
  .initialize()
  .then(() => seedTzLocations(dataSource))
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
