# Gift Shop — Initial database model

This document records the initial database structure deployed to the **separate** Supabase project:

- Organization: `gift-shop`
- Project ref: `ycsjfsoijafepgslzzlz`
- Region: `eu-west-1`
- Supabase migration: `gift_shop_initial_catalog_and_orders`

## Tables

| Table | Purpose |
|---|---|
| `public.gift_categories` | Product categories; slug, sort order and active status |
| `public.gift_products` | Product catalog; EUR pricing, stock quantity, publication status |
| `public.gift_product_images` | Image URLs and ordering per product |
| `public.gift_orders` | Orders, customer contact/delivery details, EUR totals, status |
| `public.gift_order_items` | Immutable order line item snapshots: product name, quantity, unit price |

## Access rules

- Row Level Security (RLS) is enabled on **all five** tables.
- Anonymous/authenticated visitors can **read active categories and published products only**.
- Product images are visible only if their associated product is published.
- Customer orders and order items have **no public or authenticated direct access policies** by design.
- A secure checkout backend with validated prices, totals, stock and rate limits must be implemented **before taking live orders**.
- Do not expose Supabase secret/service-role credentials in client-side code.

## Status

- Initial schema is deployed and verified.
- No product catalog, checkout, authentication or admin UI has been implemented yet.
- Product assortment, store name, and visual identity are to be decided.

## Next steps

1. Choose first gift sets; prepare actual product photography and descriptions.
2. Build storefront and mobile layouts.
3. Implement authorized admin inventory management.
4. Implement secure order creation and fulfillment process.
5. Integrate payment/delivery providers and test end-to-end before launch.
