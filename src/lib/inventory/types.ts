export type InventorySource = "supabase" | "workbook-seed";

export type InventoryProductRecord = {
  itemCode: string;
  description: string;
  portfolio: string | null;
  qtyOnHand: number;
  unitCost: number | null;
  monthlyTarget: number | null;
  expiryDate: string | null;
  batch: string | null;
  notes: string | null;
  lastUpdated: string | null;
  monthlyMovement: number[];
};

export type InventoryImportSummary = {
  id: string;
  sourceFilename: string;
  sourceSnapshotAt: string | null;
  rowCount: number;
  acceptedCount: number;
  warningCount: number;
  rejectedCount: number;
  committedAt: string | null;
};

export type InventoryDataset = {
  source: InventorySource;
  months: string[];
  products: InventoryProductRecord[];
  historyRowCount: number;
  importSummary: InventoryImportSummary | null;
};
