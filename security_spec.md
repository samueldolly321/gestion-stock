# Security Specification: StockFlow ERP

## 1. Data Invariants

1. **User Role Lock**: A user's role must be one of the ERP's official role options: `Super Admin`, `Admin`, `Manager`, `Magasinier`, `Commercial`, `Acheteur`, `Comptable`, `Auditeur`. Users cannot self-escalate or change their role unless they are an Admin.
2. **Product Code Integrity**: SKU must be alphanumeric and must match the document ID or be valid. No malicious scripts can be injected.
3. **Audit Log Immutability**: Once an audit log is written, it is immortal and can never be updated or deleted.
4. **Valid Reference Existence**: Product movements must refer to a valid product and warehouse.
5. **No Double Selling / Inventory Checks**: In sales, the status or quantity must not cause unvalidated negative stock.
6. **Temporal Consistency**: `createdAt` must exactly match the server timestamp (`request.time`) on creation. `updatedAt` must exactly match `request.time` on updates.

---

## 2. The "Dirty Dozen" Payloads

1. **Role Escalation Attempt**: Registering/updating a user with role `Super Admin` from a standard connection.
2. **Invalid SKU Character Injection**: Creating a product with `sku: "<script>bad_sku</script>"` to exploit SQL/XSS vulnerabilities.
3. **Negative Price Poisoning**: Creating a product with `purchasePrice: -100` or `salePrice: -50`.
4. **Shadow Field Injection**: Writing a product with a ghost field `isFreeGift: true`.
5. **Backdated CreatedAt**: Creating a record with `createdAt: "2015-01-01"` instead of `request.time`.
6. **Self-Approve Purchase Order**: Modifying a purchase order status directly to `approved` as an `Acheteur` instead of `Manager` or `Admin`.
7. **Bypass Stock Movement Tracking**: Modifying product quantities directly without writing a corresponding `stock_movements` record.
8. **Malicious Document ID Poisoning**: Specifying a document ID of 500 characters containing URL patterns.
9. **Audit Trail Tampering**: Attempting to delete an `audit_logs` record or modify its fields.
10. **Client-side Timestamps**: Updating a product with a manual `updatedAt` from the client instead of `request.time`.
11. **PII Collection Scraping**: Performing a blanket `get` query on all user profiles as an unauthenticated guest.
12. **Double Refund Exploitation**: Modifying a sale invoice to `returned` status multiple times or changing payment status without approval.

---

## 3. The Test Suite Strategy

All operations listed above must trigger `PERMISSION_DENIED` inside `firestore.rules`.
The `firestore.rules` must reject all these invalid states using strict schema validators, role-based checks, and immutable constraints.
