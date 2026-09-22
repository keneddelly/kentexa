import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/products.entity';
import { Order } from '../orders/entities/order.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceCounter } from '../invoices/entities/invoice-counter.entity';
import { ReceiptCounter } from '../invoices/entities/receipt-counter.entity';
import { ClassifiedInvoiceRequest } from '../classifieds/entities/classified-invoice-request.entity';
import { Payment } from './entities/payment.entity';
import { AccountRole } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { Classified } from '../classifieds/entities/classified.entity';

/**
 * Real-Postgres harness for PaymentConfirmationService, reusing the SAME
 * dedicated local database/role/safety-abort pattern already established by
 * business/b5b-closure-test-db.ts (same env vars: B5B_TEST_DB_HOST/PORT/
 * PASSWORD). This is a plain-entity set (no production-migration replay
 * needed — none of these tables' shapes come from a hand-written migration
 * at this baseline), so schema is simply synchronize:true'd fresh.
 */
export const PC_TEST_DB_NAME = 'kentexa_b5b_test';
export const PC_TEST_DB_USER = 'kentexa_b5b_test_user';

export const PC_ENTITIES = [User, Product, Order, Invoice, InvoiceCounter, ReceiptCounter, ClassifiedInvoiceRequest, Payment, AccountRole, ActiveRoleSession, Classified];

export interface PCTestConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function getPCTestConnectionConfig(): PCTestConnectionConfig | null {
  const password = process.env.B5B_TEST_DB_PASSWORD;
  if (!password) return null;
  return {
    host: process.env.B5B_TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.B5B_TEST_DB_PORT || '5432', 10),
    user: PC_TEST_DB_USER,
    password,
    database: PC_TEST_DB_NAME,
  };
}

async function assertSafeSession(client: Client): Promise<void> {
  const { rows } = await client.query('SELECT current_database() AS db, current_user AS usr, session_user AS session_usr');
  const db = rows[0]?.db;
  const usr = rows[0]?.usr;
  const sessionUsr = rows[0]?.session_usr;
  if (db !== PC_TEST_DB_NAME || usr !== PC_TEST_DB_USER || sessionUsr !== PC_TEST_DB_USER) {
    throw new Error(
      `PaymentConfirmation test-db SAFETY ABORT: expected database "${PC_TEST_DB_NAME}" as user "${PC_TEST_DB_USER}", ` +
      `got database "${db}" as user "${usr}" (session_user "${sessionUsr}").`,
    );
  }
}

export async function resetPCTestSchema(client: Client): Promise<void> {
  await assertSafeSession(client);
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query(`CREATE SCHEMA public AUTHORIZATION ${PC_TEST_DB_USER}`);
}
