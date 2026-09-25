import { createServerFn } from "@tanstack/react-start";
import type { InventoryDataset } from "../inventory/types";

export const getInventoryDataset = createServerFn({ method: "GET" }).handler(
  async (): Promise<InventoryDataset | null> => {
    const { loadInventoryDataset } = await import("../inventory/inventory.server");
    return loadInventoryDataset();
  },
);
