import { loadConfig } from "../config";
import { addToCart } from "../services/cart";
import { search } from "../services/search";
import { getProductToppings } from "../services/product";
import { withSpinner, ok, dim, bold, warn } from "../ui";

const storeId = parseInt(process.argv[2]);
const productId = process.argv[3];
const productName = process.argv[4] || "Product";
const quantity = parseInt(process.argv[5] || "1");
const toppingsArg = process.argv[6];

if (!storeId || !productId) {
  console.error('Usage: rappi add-to-cart <store_id> <product_id> [name] [qty] [topping_ids]');
  console.error('  topping_ids: comma-separated topping IDs (e.g., "1720411,1720415")');
  process.exit(1);
}

const toppings = toppingsArg
  ? toppingsArg.split(",").map((t) => parseInt(t.trim()))
  : [];

const config = await loadConfig();

// Look up product price from search
let price = 0;
const searchResult = await withSpinner("Looking up price...", () => search(productName, config));
for (const store of searchResult.stores) {
  if (store.store_id === storeId) {
    const prod = store.products.find((p: any) => p.product_id === parseInt(productId));
    if (prod) {
      price = prod.price;
      break;
    }
  }
}

// Check for required toppings
const toppingData = await withSpinner("Checking toppings...", () => getProductToppings(storeId, parseInt(productId), config));
const requiredGroups = toppingData.categories.filter((cat: any) => cat.min_toppings_for_categories > 0);
let hasWarning = false;

if (requiredGroups.length && !toppingsArg) {
  console.log(`\n${warn("⚠️  This product has required toppings:")}`);
  for (const group of requiredGroups) {
    console.log(`    • ${group.description} (required - pick ${group.min_toppings_for_categories})`);
  }
  console.log(`${dim("Run: rappi product")} ${storeId} ${productId} ${dim("to see options")}\n`);
  hasWarning = true;
}

const result = await withSpinner("Adding to cart...", () =>
  addToCart(
    "restaurant",
    [{ id: storeId, products: [{ id: productId, name: productName, toppings, units: quantity, price }] }],
    config,
  ),
);

console.log(`\n${ok(`Added ${bold(productName)} to cart`)}\n`);

if (hasWarning && !toppingsArg) {
  console.log(`${warn("⚠️  Note: Product added without required toppings selected")}`);
  console.log(`${dim("Add toppings with: rappi add-to-cart")} ${storeId} ${productId} "${productName}" 1 "<topping_ids>"\n`);
}

for (const store of result.stores) {
  const status = store.is_open ? "" : ` ${dim("(CLOSED)")}`;
  console.log(`  ${bold(store.name)} ${dim(`[${store.id}]`)}${status}`);
  console.log(`  ${dim("ETA")} ${store.eta_label}\n`);

  for (const p of store.products) {
    const amt = p.total > 0
      ? `$${p.total.toLocaleString("es-CO")}`
      : `$${p.price.toLocaleString("es-CO")}`;
    console.log(`    ${p.name} ${dim(`x${p.units}`)} -- ${amt}`);
  }

  console.log(`\n  ${dim("Total")} ${bold(`$${store.total.toLocaleString("es-CO")}`)}\n`);
}
