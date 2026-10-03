import 'reflect-metadata';
import dataSource from './data-source';
import { assertStage3krSeedTarget } from './seed-stage3kr-actors';
import { TzLocationService } from '../tz-location/tz-location.service';
import { TzRegion } from '../tz-location/entities/tz-region.entity';
import { TzDistrict } from '../tz-location/entities/tz-district.entity';
import { TzWard } from '../tz-location/entities/tz-ward.entity';

async function seed(): Promise<void> {
  assertStage3krSeedTarget(process.env);
  dataSource.setOptions({ entities: [TzRegion, TzDistrict, TzWard] });
  await dataSource.initialize();
  try {
    const locations = new TzLocationService(
      dataSource.getRepository(TzRegion),
      dataSource.getRepository(TzDistrict),
      dataSource.getRepository(TzWard),
    );
    const result = await locations.seedAll();
    const places = await Promise.all(['Kariakoo', 'Mbagala'].map(name => locations.searchPlaces(name)));
    if (places.some(rows => !rows.some(row => row.type === 'ward')))
      throw new Error('Stage3KR locations incomplete: Kariakoo or Mbagala ward missing');
    console.log('Stage3KR places ready:', result);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) seed().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
