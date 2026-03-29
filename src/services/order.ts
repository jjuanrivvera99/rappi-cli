import type { RappiConfig } from "../schemas/config";
import type { OrdersResponse } from "../schemas/order";
import { get, post } from "../http";

export async function placeOrder(
  storeType: string,
  config: RappiConfig
): Promise<unknown> {
  return post<unknown>(
    `/api/ms/shopping-cart-proxy/${storeType}/checkout`,
    {},
    config
  );
}

export async function getOrders(
  config: RappiConfig
): Promise<OrdersResponse> {
  return get<OrdersResponse>("/api/user-order-home/orders", config);
}
