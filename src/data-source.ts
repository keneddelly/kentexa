import 'dotenv/config';
import { DataSource } from 'typeorm';

// Standalone TypeORM CLI config — used only by `npm run migration:*`, never
// imported by the running app (app.module.ts keeps its own
// TypeOrmModule.forRoot() with autoLoadEntities, which this can't use since
// the CLI runs outside Nest's DI container). Connection settings mirror
// app.module.ts exactly so a generated migration reflects the real schema.
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kentexa',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
