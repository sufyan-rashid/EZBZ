-- Fix: the `products` table was missing the UPDATE grant for the
-- `authenticated` role (every other table had it). Editing ANY product
-- field (name, price, SKU, etc.) goes through a direct client-side
-- `.from("products").update(...)` call, not a SECURITY DEFINER RPC, so it
-- needs this grant to work at all. This was causing "permission denied for
-- table products" (42501) on every product edit.
grant update on public.products to authenticated;
