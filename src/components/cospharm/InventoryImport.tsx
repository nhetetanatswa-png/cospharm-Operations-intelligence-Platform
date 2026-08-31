import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import type { StockItem } from "./types";

export type ImportedRow = Omit<StockItem, "status"> & { unitCost?: number };

const HEADER_KEYS: Record<string, string[]> = {
  sku: ["item code", "sku", "code"],
  name: ["item description", "description", "product", "item"],
  category: ["portfolio", "category"],
  onHand: ["qty on hand", "quantity", "qty", "on hand"],
  reorder: ["monthly target", "reorder", "reorder level"],
  expiry: ["expiry date", "expiry date (largest batch)", "expiry"],
  batch: ["batch", "batch (largest qty)"],
  unitCost: ["unit cost", "cost"],
};

function norm(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function toIsoDate(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : "";
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseInventoryWorkbook(data: ArrayBuffer): { rows: ImportedRow[]; sheet: string; skipped: number } {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  let best: { rows: ImportedRow[]; sheet: string; skipped: number } = { rows: [], sheet: "", skipped: 0 };

  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, blankrows: false });
    const headerIndex = grid.findIndex((r) =>
      Array.isArray(r) && r.some((c) => HEADER_KEYS.sku.includes(norm(c))) && r.some((c) => HEADER_KEYS.name.includes(norm(c))),
    );
    if (headerIndex === -1) continue;

    const header = (grid[headerIndex] as unknown[]).map(norm);
    const col = (field: keyof typeof HEADER_KEYS) =>
      header.findIndex((h) => HEADER_KEYS[field].some((k) => h === k || h.startsWith(k)));

    const idx = {
      sku: col("sku"), name: col("name"), category: col("category"), onHand: col("onHand"),
      reorder: col("reorder"), expiry: col("expiry"), batch: col("batch"), unitCost: col("unitCost"),
    };

    const rows: ImportedRow[] = [];
    let skipped = 0;
    for (const raw of grid.slice(headerIndex + 1)) {
      const r = raw as unknown[];
      const sku = String(r[idx.sku] ?? "").trim();
      const name = String(r[idx.name] ?? "").trim();
      if (!sku || !name) { if (r.some((c) => String(c ?? "").trim())) skipped += 1; continue; }
      const onHand = num(r[idx.onHand]);
      const reorder = idx.reorder >= 0 ? num(r[idx.reorder]) : 0;
      rows.push({
        id: `INV-${sku}`,
        sku,
        name,
        category: idx.category >= 0 ? String(r[idx.category] ?? "General").trim() || "General" : "General",
        onHand,
        reorder,
        capacity: Math.max(onHand, reorder * 2, 1),
        expiry: idx.expiry >= 0 ? toIsoDate(r[idx.expiry]) : "",
        batch: idx.batch >= 0 ? String(r[idx.batch] ?? "").trim() || undefined : undefined,
        unitCost: idx.unitCost >= 0 ? num(r[idx.unitCost]) : undefined,
      });
    }
    if (rows.length > best.rows.length) best = { rows, sheet: sheetName, skipped };
  }
  return best;
}

export function InventoryImportDialog({
  onImport,
  onFailure,
  disabled,
}: {
  onImport: (rows: ImportedRow[], sheet: string, fileName: string) => void;
  onFailure: (fileName: string, reason: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [sheet, setSheet] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setError(null);
    try {
      const parsed = parseInventoryWorkbook(await file.arrayBuffer());
      if (parsed.rows.length === 0) {
        const reason = "No sheet with 'Item Code' and 'Item Description' columns was found.";
        setError(reason);
        setRows([]);
        onFailure(file.name, reason);
        return;
      }
      setRows(parsed.rows);
      setSheet(parsed.sheet);
      setSkipped(parsed.skipped);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Could not read the workbook.";
      setError(reason);
      setRows([]);
      onFailure(file.name, reason);
    }
  }

  function reset() {
    setRows([]); setSheet(""); setSkipped(0); setFileName(""); setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={disabled}>
          <Upload className="size-4" /> Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" /> Import inventory workbook
          </DialogTitle>
          <DialogDescription>
            Upload the Cospharm inventory workbook (.xlsx). Rows are matched on Item Code — existing items are
            updated, new items are added, and the import is written to the audit trail.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
        />

        {error ? (
          <p className="flex items-center gap-2 rounded-md border border-status-red/40 bg-status-red/5 p-3 text-sm text-status-red">
            <AlertTriangle className="size-4" /> {error}
          </p>
        ) : null}

        {rows.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{rows.length}</span> items read from sheet “{sheet}”
              {skipped > 0 ? ` · ${skipped} incomplete rows skipped` : ""}.
            </p>
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead>Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell className="max-w-[18rem] truncate text-sm">{r.name}</TableCell>
                      <TableCell className="text-sm">{r.category}</TableCell>
                      <TableCell className="text-right text-sm">{r.onHand}</TableCell>
                      <TableCell className="text-right text-sm">{r.reorder}</TableCell>
                      <TableCell className="text-sm">{r.expiry || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > 50 ? <p className="text-xs text-muted-foreground">Showing the first 50 rows.</p> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={rows.length === 0}
            onClick={() => { onImport(rows, sheet, fileName); setOpen(false); reset(); }}
          >
            Import {rows.length > 0 ? `${rows.length} items` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
