import 'reflect-metadata';
import { config } from 'dotenv';
import { Client } from 'pg';

config();

// One-time, exact-record reconciliation. This script intentionally cannot be
// repurposed for another account by changing command-line identifiers.
const OWNER_ID = 2;
const BUSINESS_ID = 2;
const WORKSPACE_ID = 2;
const SELLER_PROFILE_ID = 1;
const SOURCE_PROFILE_ID = 6;
const TARGET_PROFILE_ID = 26;
export const PRODUCT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 17] as const;
const CONFIRM = 'TRANSFER-BISHOO-PRODUCTS-6-TO-26-14';

type ProductRow = { id: number; name: string; sellerId: number; workspaceId: number | null; commerceProfileId: number | null };
export function assertExactSource(rows: ProductRow[]): void {
  const observed = rows.map(r => Number(r.id)).sort((a, b) => a - b);
  const expected = [...PRODUCT_IDS].sort((a, b) => a - b);
  if (JSON.stringify(observed) !== JSON.stringify(expected)
    || rows.some(r => Number(r.sellerId) !== OWNER_ID || Number(r.workspaceId) !== WORKSPACE_ID || Number(r.commerceProfileId) !== SOURCE_PROFILE_ID)) {
    throw new Error('Source product set or authority differs from the reviewed 14 rows; refusing transfer');
  }
}

async function run() {
  const execute = process.argv.includes('--execute');
  if (process.argv.some(arg => arg !== '--execute' && arg !== process.argv[0] && arg !== process.argv[1])) {
    throw new Error('Only --execute is supported');
  }
  if (execute && process.env.PRODUCT_TRANSFER_CONFIRM !== CONFIRM) {
    throw new Error(`Execution requires PRODUCT_TRANSFER_CONFIRM=${CONFIRM}`);
  }
  const db = new Client({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres', password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kentexa',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(execute ? "SET LOCAL lock_timeout = '5s'" : 'SET TRANSACTION READ ONLY');
    const profiles = await db.query(`
      SELECT cp.id,cp."ownerId",cp."businessId",cp."sellerProfileId",cp.type,
             sp."businessId" AS "linkedBusinessId", b."userId" AS "businessOwnerId",b.status AS "businessStatus"
      FROM commerce_profile cp
      LEFT JOIN seller_profile sp ON sp.id=cp."sellerProfileId"
      LEFT JOIN business b ON b.id=$3
      WHERE cp.id IN ($1,$2) ORDER BY cp.id ${execute ? 'FOR UPDATE OF cp' : ''}`,
      [SOURCE_PROFILE_ID, TARGET_PROFILE_ID, BUSINESS_ID],
    );
    const source = profiles.rows.find(r => Number(r.id) === SOURCE_PROFILE_ID);
    const target = profiles.rows.find(r => Number(r.id) === TARGET_PROFILE_ID);
    if (profiles.rowCount !== 2 || !source || !target
      || Number(source.ownerId) !== OWNER_ID || source.type !== 'business'
      || source.businessId != null || Number(source.sellerProfileId) !== SELLER_PROFILE_ID
      || Number(source.linkedBusinessId) !== BUSINESS_ID
      || Number(target.ownerId) !== OWNER_ID || target.type !== 'business'
      || Number(target.businessId) !== BUSINESS_ID || target.sellerProfileId != null
      || Number(target.businessOwnerId) !== OWNER_ID || target.businessStatus !== 'active') {
      throw new Error('Legacy Seller and target BiS Business identities differ from reviewed records');
    }
    const workspace = await db.query('SELECT "businessId" FROM operational_workspace WHERE id=$1', [WORKSPACE_ID]);
    if (workspace.rowCount !== 1 || Number(workspace.rows[0].businessId) !== BUSINESS_ID) {
      throw new Error('Product workspace does not belong to BiS');
    }
    const products = await db.query<ProductRow>(`
      SELECT id,name,"sellerId","workspaceId","commerceProfileId" FROM product
      WHERE "commerceProfileId" IN ($1,$2)
      ORDER BY id ${execute ? 'FOR UPDATE' : ''}`, [SOURCE_PROFILE_ID, TARGET_PROFILE_ID]);
    const from = products.rows.filter(r => Number(r.commerceProfileId) === SOURCE_PROFILE_ID);
    const to = products.rows.filter(r => Number(r.commerceProfileId) === TARGET_PROFILE_ID);
    const alreadyMoved = from.length === 0 && to.length === 15
      && PRODUCT_IDS.every(id => to.some(r => Number(r.id) === id && Number(r.sellerId) === OWNER_ID && Number(r.workspaceId) === WORKSPACE_ID));
    if (alreadyMoved) {
      console.log('Already transferred: source=0, BiS=15. No changes.');
      await db.query('ROLLBACK');
      return;
    }
    assertExactSource(from);
    if (to.length !== 1 || Number(to[0].id) !== 18 || Number(to[0].sellerId) !== OWNER_ID || Number(to[0].workspaceId) !== WORKSPACE_ID) {
      throw new Error('BiS target catalog differs from the reviewed single product #18');
    }
    console.log(`Reviewed ${from.length} source products (${from.map(r => r.id).join(',')}) and ${to.length} BiS product; 12 historical orders and 43 inventory movements are outside this write.`);
    if (!execute) {
      console.log(`DRY RUN ONLY. For the reviewed transfer: PRODUCT_TRANSFER_CONFIRM=${CONFIRM} npm run products:transfer:bis -- --execute`);
      await db.query('ROLLBACK');
      return;
    }
    const updated = await db.query<{ id: number }>(`
      UPDATE product SET "commerceProfileId"=$1, "updatedAt"=NOW()
      WHERE id=ANY($2::int[]) AND "commerceProfileId"=$3 AND "sellerId"=$4 AND "workspaceId"=$5
      RETURNING id`, [TARGET_PROFILE_ID, [...PRODUCT_IDS], SOURCE_PROFILE_ID, OWNER_ID, WORKSPACE_ID]);
    if (updated.rowCount !== PRODUCT_IDS.length) throw new Error('Product update count changed; rolling back');
    for (const row of updated.rows) {
      await db.query(`INSERT INTO audit_log ("actorId","actorRole",action,"entityType","entityId","previousValue","newValue","createdAt")
        VALUES (NULL,'operator_script','product.profile_transfer','Product',$1,$2::jsonb,$3::jsonb,NOW())`,
      [row.id, JSON.stringify({ commerceProfileId: SOURCE_PROFILE_ID }), JSON.stringify({ commerceProfileId: TARGET_PROFILE_ID, reason: 'Legacy Bishoo products into canonical BiS Business' })]);
    }
    await db.query('COMMIT');
    console.log(`Transferred ${updated.rowCount} products into BiS profile #26; one audit row per product.`);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
