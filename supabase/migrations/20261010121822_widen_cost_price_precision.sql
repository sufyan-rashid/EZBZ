
ALTER TABLE public.products ALTER COLUMN cost_price TYPE numeric(12,4);
ALTER TABLE public.order_items ALTER COLUMN unit_cost TYPE numeric(12,4);

UPDATE public.products
SET cost_price = round(cost_price, 4)
WHERE id = '1ade33a7-3893-4162-9614-2ac3f54a2c51';
