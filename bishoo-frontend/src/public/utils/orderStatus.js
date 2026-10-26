/**
 * An order's real statuses (orders/entities/order.entity.ts OrderStatus), in plain Swahili for
 * the buyer, the buyer's tabs, and the steps an order goes through. One place, so a page never
 * filters on a status that does not exist.
 */
export const BUYER_STATUS = {
  pending_payment: 'Inasubiri malipo',
  paid: 'Imelipwa',
  preparing: 'Muuzaji anaandaa',
  ready_for_pickup: 'Iko tayari kuchukuliwa',
  in_transit: 'Iko njiani',
  delivered: 'Imefika',
  completed: 'Imekamilika',
  disputed: 'Kuna malalamiko',
  cancelled: 'Imeghairiwa',
};

export const PAYMENT_STATUS = {
  pending: 'Haijalipwa', upfront_paid: 'Sehemu imelipwa', paid: 'Imelipwa',
  released: 'Imelipwa', refunded: 'Imerudishwa', failed: 'Imeshindikana',
};

export const STATUS_TONE = (status) => (
  ['completed', 'delivered'].includes(status) ? { bg: '#ecfdf3', fg: '#166534' }
    : ['cancelled', 'disputed'].includes(status) ? { bg: '#fef2f2', fg: '#b91c1c' }
      : status === 'pending_payment' ? { bg: '#fffbeb', fg: '#92400e' }
        : { bg: '#eff6ff', fg: '#1d4ed8' });

/** The buyer's tabs: what is happening to the order, not the raw status. */
export const BUYER_TABS = [
  { key: 'all', label: 'Zote', statuses: null },
  { key: 'pay', label: 'Za kulipa', statuses: ['pending_payment'] },
  { key: 'coming', label: 'Zinakuja', statuses: ['paid', 'preparing', 'ready_for_pickup', 'in_transit'] },
  { key: 'arrived', label: 'Zimefika', statuses: ['delivered', 'completed'] },
  { key: 'closed', label: 'Zilizoghairiwa', statuses: ['cancelled', 'disputed'] },
];

/** The steps an order goes through, and how far it has come (-1: not started or closed). */
export const ORDER_STEPS = ['Imelipwa', 'Inaandaliwa', 'Njiani', 'Imefika', 'Imekamilika'];
export const stepIndex = (status) => ({
  paid: 0, preparing: 1, ready_for_pickup: 2, in_transit: 2, delivered: 3, completed: 4,
}[status] ?? -1);

export const statusLabel = (status) => BUYER_STATUS[status] || String(status || '').replace(/_/g, ' ');
