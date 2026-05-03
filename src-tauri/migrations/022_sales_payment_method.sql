-- Denormaliza el método de pago principal en `sales` para evitar el JOIN
-- en el listado de Ventas (que se mostraba siempre como undefined).
-- Cuando una venta tiene varios payments, se guarda el del primero (no-deposit preferido).

ALTER TABLE sales ADD COLUMN payment_method TEXT;

-- Backfill: para ventas existentes, tomamos el método del primer payment no-deposit
-- (o el primer payment si todos son deposits).
UPDATE sales
SET payment_method = (
  SELECT method FROM sale_payments
  WHERE sale_payments.sale_id = sales.id
  ORDER BY (is_deposit ASC), rowid ASC
  LIMIT 1
)
WHERE payment_method IS NULL;
