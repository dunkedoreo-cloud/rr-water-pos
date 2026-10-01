// Test orders for verifying Orders Log and Fleet Delivery views
const testOrders = [
  {
    orderNo: '#839102',
    time: '10:15 AM',
    timestamp: Date.now() - 600000,
    channel: 'delivery',
    prodKey: 'purified',
    prodName: '5-Gal Purified Refill',
    gallons: 15,
    unitPrice: 35,
    total: 525,
    paidAmount: 0,
    unpaidAmount: 525,
    status: 'pending',
    tendered: 0,
    change: 0,
    note: 'Purok 2 - Aling Nena Store'
  },
  {
    orderNo: '#104928',
    time: '09:30 AM',
    timestamp: Date.now() - 1800000,
    channel: 'walkin',
    prodKey: 'purified',
    prodName: '5-Gal Purified Refill',
    gallons: 2,
    unitPrice: 35,
    total: 70,
    paidAmount: 70,
    unpaidAmount: 0,
    status: 'paid',
    tendered: 70,
    change: 0,
    note: 'Walk-in Counter'
  }
];

if (typeof localStorage !== 'undefined') {
  localStorage.setItem('rr_pos_stored_orders', JSON.stringify(testOrders));
}
