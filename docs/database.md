# Gift Shop — Database

## Supabase infrastructure

- Organization: `gift-shop` (separate from all other projects)
- Project ID: `ycsjfsoijafepgslzzlz`
- Region: `eu-west-1`
- Current project display name: `QuarcoTM's Project`

## Initial tables

| Table | Purpose |
| --- | --- |
| `public.gift_categories` | Gift collection names, slugs, active status |
| `public.gift_products` | Products, price in EUR, quantities, publishing state |
| `public.gift_product_images` | Image URLs and sort order |
| `public.gift_orders` | Customer and delivery details, order status and totals |
| `public.gift_order_items` | Purchased products, quantity, price snapshot |

## Security

- Row Level Security is enabled on all five tables.
- Anonymous and authenticated users may read **active categories**, **published products**, and associated images only.
- No client-side read/write grants or RLS policies expose orders or order items.
- Future checkout must use a trusted server-side endpoint and validate item prices, inventory and totals on the server. Do not create customer orders directly from anonymous browser code.
- Administrative functions need a dedicated authorization implementation before being enabled.

## Current state

The database foundation exists, but product entries, media storage, checkout integration, payment processing, courier integration, administration and storefront are not yet implemented.

Do not commit API secrets or customer data to GitHub.
