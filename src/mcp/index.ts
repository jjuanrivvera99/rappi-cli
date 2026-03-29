#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../config";
import { imageUrl } from "../formatters";
import { getUser, isPrime } from "../services/auth";
import { getAddresses, setActiveAddress, reverseGeocode } from "../services/address";
import { search } from "../services/search";
import { getStoreDetail, getRestaurantCatalog } from "../services/store";
import { getProductToppings } from "../services/product";
import { addToCart, removeFromCart, getCarts, recalculateCart } from "../services/cart";
import { getCheckoutDetail, setTip } from "../services/checkout";
import { placeOrder, getOrders } from "../services/order";
import { DEFAULT_STORE_TYPE } from "../constants";

const server = new McpServer({
  name: "rappi",
  version: "1.0.0",
});

// ─── Auth ────────────────────────────────────────────────────────────────────

server.tool("whoami", "Get current user profile and Prime status", {}, async () => {
  const config = await loadConfig();
  const [user, prime, address] = await Promise.all([
    getUser(config),
    isPrime(config),
    reverseGeocode(config),
  ]);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          name: user.name,
          email: user.email,
          phone: `${user.country_code}${user.phone}`,
          loyalty: user.loyalty.description,
          is_prime: prime,
          location: address.full_text_to_show || address.original_text,
        }, null, 2),
      },
    ],
  };
});

// ─── Addresses ───────────────────────────────────────────────────────────────

server.tool("list_addresses", "List all saved delivery addresses", {}, async () => {
  const config = await loadConfig();
  const { addresses } = await getAddresses(config);
  const result = addresses.map((a) => ({
    id: a.id,
    address: a.address,
    tag: a.tag,
    active: a.active,
    city: a.city?.city,
    orders: a.count_orders,
  }));
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

server.tool(
  "set_address",
  "Set the active delivery address by ID",
  { address_id: z.number().describe("Address ID from list_addresses") },
  async ({ address_id }) => {
    const config = await loadConfig();
    const { addresses } = await getAddresses(config);
    const addr = addresses.find((a) => a.id === address_id);
    if (!addr) return { content: [{ type: "text", text: `Address ${address_id} not found` }] };
    await setActiveAddress(address_id, config);
    return {
      content: [{ type: "text", text: `Address set to: ${addr.tag || addr.address} (${addr.address})` }],
    };
  }
);

// ─── Search ──────────────────────────────────────────────────────────────────

server.tool(
  "search",
  "Search for products and stores on Rappi",
  { query: z.string().describe("What to search for (e.g. 'hamburguesa', 'pizza')") },
  async ({ query }) => {
    const config = await loadConfig();
    const result = await search(query, config);
    const stores = result.stores.map((s) => ({
      store_id: s.store_id,
      store_name: s.store_name,
      store_type: s.store_type,
      logo: s.logo ? imageUrl(s.logo, "restaurants_logo") : undefined,
      eta: s.eta,
      shipping: s.shipping_cost,
      products: s.products.slice(0, 3).map((p) => ({
        product_id: p.product_id,
        name: p.name,
        price: p.price,
        image: p.image ? imageUrl(p.image) : undefined,
        has_toppings: p.has_toppings,
        in_stock: p.in_stock,
      })),
    }));
    return { content: [{ type: "text", text: JSON.stringify(stores, null, 2) }] };
  }
);

// ─── Restaurants ─────────────────────────────────────────────────────────────

server.tool(
  "list_restaurants",
  "List nearby restaurants",
  { limit: z.number().optional().default(20).describe("Max restaurants to return") },
  async ({ limit }) => {
    const config = await loadConfig();
    const catalog = await getRestaurantCatalog(config, { limit });
    const stores = catalog.stores.map((s) => ({
      store_id: s.store_id,
      name: s.name,
      logo: s.logo ? imageUrl(s.logo, "restaurants_logo") : undefined,
      eta: s.eta,
      score: s.score,
      shipping: s.shipping_cost,
      available: s.is_available,
    }));
    return { content: [{ type: "text", text: JSON.stringify(stores, null, 2) }] };
  }
);

// ─── Store ───────────────────────────────────────────────────────────────────

server.tool(
  "get_store",
  "Get store details and menu",
  { store_id: z.number().describe("Store ID from search or restaurants") },
  async ({ store_id }) => {
    const config = await loadConfig();
    const store = await getStoreDetail(store_id, config);
    return { content: [{ type: "text", text: JSON.stringify(store, null, 2) }] };
  }
);

// ─── Product ─────────────────────────────────────────────────────────────────

server.tool(
  "get_product_options",
  "Get product customization options (toppings) — check before adding to cart",
  {
    store_id: z.number().describe("Store ID"),
    product_id: z.number().describe("Product ID"),
  },
  async ({ store_id, product_id }) => {
    const config = await loadConfig();
    const data = await getProductToppings(store_id, product_id, config);
    const categories = data.categories.map((cat) => ({
      name: cat.description,
      required: cat.min_toppings_for_categories > 0,
      min: cat.min_toppings_for_categories,
      max: cat.max_toppings_for_categories,
      options: cat.toppings.map((t) => ({
        id: t.id,
        name: t.description,
        price: t.price,
        image: t.image ? imageUrl(t.image) : undefined,
        available: t.is_available,
      })),
    }));
    return { content: [{ type: "text", text: JSON.stringify(categories, null, 2) }] };
  }
);

// ─── Cart ────────────────────────────────────────────────────────────────────

server.tool(
  "add_to_cart",
  "Add a product to the shopping cart. Search first to get the price.",
  {
    store_id: z.number().describe("Store ID"),
    product_id: z.string().describe("Product ID"),
    name: z.string().describe("Product name"),
    quantity: z.number().optional().default(1).describe("Quantity"),
    toppings: z.array(z.number()).optional().default([]).describe("Topping IDs from get_product_options"),
    price: z.number().optional().default(0).describe("Product price from search results"),
  },
  async ({ store_id, product_id, name, quantity, toppings, price }) => {
    const config = await loadConfig();
    const result = await addToCart(
      DEFAULT_STORE_TYPE,
      [{ id: store_id, products: [{ id: product_id, name, toppings, units: quantity, price }] }],
      config
    );
    const store = result.stores?.[0];
    return {
      content: [{
        type: "text",
        text: store
          ? `Added ${name} x${quantity} to cart\nStore: ${store.name}\nTotal: $${store.total.toLocaleString("es-CO")}`
          : "Added to cart",
      }],
    };
  }
);

server.tool(
  "remove_from_cart",
  "Remove a product from the shopping cart by its compound ID (e.g. '900006505_3522980')",
  {
    product_id: z.string().describe("Compound product ID from get_cart (e.g. '900006505_3522980')"),
    store_type: z.string().optional().default(DEFAULT_STORE_TYPE),
  },
  async ({ product_id, store_type }) => {
    const config = await loadConfig();
    await removeFromCart(store_type, product_id, config);
    const carts = await getCarts(config);
    const remaining = carts.flatMap((c) =>
      c.stores.flatMap((s) => s.products.map((p) => `${p.name} x${p.units}`))
    );
    return {
      content: [{
        type: "text",
        text: remaining.length
          ? `Removed. Remaining in cart:\n${remaining.join("\n")}`
          : "Removed. Cart is now empty.",
      }],
    };
  }
);

server.tool("get_cart", "View current shopping cart", {}, async () => {
  const config = await loadConfig();
  const carts = await getCarts(config);
  if (!carts.length) return { content: [{ type: "text", text: "Cart is empty" }] };
  return { content: [{ type: "text", text: JSON.stringify(carts, null, 2) }] };
});

// ─── Checkout ────────────────────────────────────────────────────────────────

server.tool(
  "checkout_preview",
  "Preview the order with price breakdown before placing",
  { store_type: z.string().optional().default(DEFAULT_STORE_TYPE) },
  async ({ store_type }) => {
    const config = await loadConfig();
    const [cart, detail] = await Promise.allSettled([
      recalculateCart(store_type, config),
      getCheckoutDetail(store_type, config),
    ]);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          cart: cart.status === "fulfilled" ? cart.value : null,
          summary: detail.status === "fulfilled" ? detail.value : null,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  "set_tip",
  "Set tip amount for delivery",
  {
    amount: z.number().describe("Tip in COP (e.g. 2000) or 0 to remove"),
    store_type: z.string().optional().default(DEFAULT_STORE_TYPE),
  },
  async ({ amount, store_type }) => {
    const config = await loadConfig();
    await setTip(store_type, amount, config);
    return {
      content: [{ type: "text", text: amount > 0 ? `Tip set to $${amount.toLocaleString("es-CO")}` : "Tip removed" }],
    };
  }
);

// ─── Order ───────────────────────────────────────────────────────────────────

server.tool(
  "place_order",
  "Place the order. ALWAYS show checkout_preview first and get user confirmation.",
  { store_type: z.string().optional().default(DEFAULT_STORE_TYPE) },
  async ({ store_type }) => {
    const config = await loadConfig();
    const result = await placeOrder(store_type, config);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool("track_orders", "Track active and cancelled orders", {}, async () => {
  const config = await loadConfig();
  const data = await getOrders(config);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
