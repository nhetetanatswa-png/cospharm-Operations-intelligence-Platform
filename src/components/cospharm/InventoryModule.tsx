import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  History,
  PackageOpen,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, type Status } from "./StatusBadge";
import type { AuditEntry, CurrentUser, InventoryMovement, InventoryProduct } from "./types";

type ImportStatus = "new" | "changed" | "unchanged" | "conflict";
type ImportRow = {
  row: number;
  status: ImportStatus;
  reason: string;
  product: InventoryProduct;
  existing?: InventoryProduct;
  changedFields: string[];
};

type ImportPreview = {
  fileName: string;
  rows: ImportRow[];
  movements: InventoryMovement[];
  sheetName: string;
};

const PAGE_SIZE = 30;
const money = new Intl.NumberFormat("en-BW", {
  style: "currency",
  currency: "BWP",
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("en-BW");

const productHeaders = [
  "SKU",
  "Product",
  "Category",
  "Pack size",
  "Unit",
  "Supplier",
  "Location",
  "Batch",
  "Expiry",
  "On hand",
  "Reorder level",
  "Capacity",
  "Unit cost",
  "Stock value",
  "Status",
  "Last counted",
];

function normaliseKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function valueFrom(row: Record<string, unknown>, aliases: string[]) {
  const keys = Object.keys(row);
  const key = keys.find((candidate) => aliases.includes(normaliseKey(candidate)));
  return key ? row[key] : undefined;
}

function textValue(row: Record<string, unknown>, aliases: string[], fallback = "") {
  return String(valueFrom(row, aliases) ?? fallback).trim();
}

function numberValue(row: Record<string, unknown>, aliases: string[], fallback = 0) {
  const raw = valueFrom(row, aliases);
  const parsed = Number(String(raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(
  row: Record<string, unknown>,
  aliases: string[],
  fallback: string,
  monthOnly = false,
) {
  const raw = valueFrom(row, aliases);
  if (!raw) return fallback;
  const value = raw instanceof Date ? raw : new Date(String(raw));
  if (!Number.isNaN(value.getTime())) {
    const iso = value.toISOString().slice(0, 10);
    return monthOnly ? iso.slice(0, 7) : iso;
  }
  const text = String(raw).trim();
  const isoLike = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!isoLike) return text;
  const normalised = `${isoLike[1]}-${isoLike[2].padStart(2, "0")}-${(isoLike[3] ?? "01").padStart(2, "0")}`;
  return monthOnly ? normalised.slice(0, 7) : normalised;
}

function deriveStatus(onHand: number, reorder: number): Status {
  if (onHand <= reorder * 0.45) return "red";
  if (onHand <= reorder) return "yellow";
  return "green";
}

function importProduct(row: Record<string, unknown>, index: number): InventoryProduct {
  const sku = textValue(row, ["sku", "stockcode", "productcode", "itemcode"]);
  const name = textValue(row, ["product", "productname", "item", "itemdescription", "description"]);
  const onHand = numberValue(row, [
    "onhand",
    "closingstock",
    "closingbalance",
    "quantity",
    "qty",
    "stockonhand",
  ]);
  const reorder = numberValue(row, ["reorderlevel", "reorder", "minimumstock", "minstock"]);
  const status = deriveStatus(onHand, reorder);
  return {
    id: `IMP-${String(index + 1).padStart(4, "0")}`,
    sku,
    name,
    category: textValue(row, ["category", "productcategory", "group"], "Uncategorised"),
    packSize: textValue(row, ["packsize", "pack", "size"], "—"),
    unit: textValue(row, ["unit", "uom", "unitofmeasure"], "Each"),
    supplier: textValue(row, ["supplier", "vendor"], "—"),
    location: textValue(row, ["location", "bin", "binlocation", "warehouse"], "—"),
    batch: textValue(row, ["batch", "batchnumber", "lot", "lotnumber"], "—"),
    expiry: dateValue(row, ["expiry", "expirydate", "expiration"], "—", true),
    onHand,
    reorder,
    capacity: numberValue(
      row,
      ["capacity", "maximumstock", "maxstock"],
      Math.max(onHand, reorder * 4),
    ),
    unitCost: numberValue(row, ["unitcost", "cost", "costprice", "price"]),
    status,
    issue:
      status === "red"
        ? "Critically below reorder level"
        : status === "yellow"
          ? "Below reorder level"
          : undefined,
    damagedUnits: numberValue(row, ["damaged", "damagedunits"], 0) || undefined,
    lastCounted: dateValue(
      row,
      ["lastcounted", "countdate", "date"],
      new Date().toISOString().slice(0, 10),
    ),
    active: textValue(row, ["active", "status"], "yes").toLowerCase() !== "inactive",
  };
}

function classifyRows(
  rawRows: Record<string, unknown>[],
  products: InventoryProduct[],
): ImportRow[] {
  const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
  const byName = new Map(products.map((p) => [p.name.toLowerCase(), p]));
  const incomingCounts = rawRows.reduce((map, row) => {
    const sku = textValue(row, ["sku", "stockcode", "productcode", "itemcode"]).toLowerCase();
    if (sku) map.set(sku, (map.get(sku) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  return rawRows.map((raw, index) => {
    const product = importProduct(raw, index);
    if (!product.sku || !product.name)
      return {
        row: index + 2,
        status: "conflict",
        reason: "SKU and product name are required",
        product,
        changedFields: [],
      };
    if ((incomingCounts.get(product.sku.toLowerCase()) ?? 0) > 1)
      return {
        row: index + 2,
        status: "conflict",
        reason: "Duplicate SKU in workbook",
        product,
        changedFields: [],
      };
    const existing = bySku.get(product.sku.toLowerCase());
    const nameMatch = byName.get(product.name.toLowerCase());
    if (!existing && nameMatch)
      return {
        row: index + 2,
        status: "conflict",
        reason: `Product name already belongs to ${nameMatch.sku}`,
        product,
        existing: nameMatch,
        changedFields: [],
      };
    if (!existing)
      return {
        row: index + 2,
        status: "new",
        reason: "SKU is not in inventory",
        product,
        changedFields: [],
      };
    const fields: (keyof InventoryProduct)[] = [
      "name",
      "category",
      "packSize",
      "unit",
      "supplier",
      "location",
      "batch",
      "expiry",
      "onHand",
      "reorder",
      "capacity",
      "unitCost",
      "active",
    ];
    const changedFields = fields.filter(
      (field) => String(existing[field] ?? "") !== String(product[field] ?? ""),
    );
    return {
      row: index + 2,
      status: changedFields.length ? "changed" : "unchanged",
      reason: changedFields.length
        ? `${changedFields.length} field${changedFields.length === 1 ? "" : "s"} changed`
        : "Matches current inventory",
      product: { ...product, id: existing.id },
      existing,
      changedFields,
    };
  });
}

function previewTone(status: ImportStatus) {
  if (status === "new") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "changed") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "conflict") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function InventoryModule({
  products,
  movements,
  audit,
  user,
  onAdjust,
  onSync,
}: {
  products: InventoryProduct[];
  movements: InventoryMovement[];
  audit: AuditEntry[];
  user: CurrentUser;
  onAdjust: (product: InventoryProduct) => void;
  onSync: (rows: ImportRow[], movements: InventoryMovement[], fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<InventoryProduct | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewFilter, setPreviewFilter] = useState<ImportStatus | "all">("all");
  const [importError, setImportError] = useState("");

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!needle ||
          [p.sku, p.name, p.category, p.supplier, p.location, p.batch]
            .join(" ")
            .toLowerCase()
            .includes(needle)) &&
        (category === "all" || p.category === category) &&
        (status === "all" || p.status === status),
    );
  }, [products, query, category, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const low = products.filter((p) => p.status !== "green").length;
  const value = products.reduce((sum, p) => sum + p.onHand * p.unitCost, 0);
  const units = products.reduce((sum, p) => sum + p.onHand, 0);

  async function readWorkbook(file: File) {
    setImportError("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      if (!workbook.SheetNames.length) throw new Error("The workbook contains no sheets.");
      const productSheetName =
        workbook.SheetNames.find((name) => /product|inventory|stock/i.test(name)) ??
        workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[productSheetName],
        { defval: "", raw: false },
      );
      if (!rawRows.length)
        throw new Error(
          "No product rows were found. Keep a single header row and product data below it.",
        );
      const movementSheetName = workbook.SheetNames.find((name) =>
        /movement|transaction|history/i.test(name),
      );
      const importedMovements = movementSheetName
        ? XLSX.utils
            .sheet_to_json<Record<string, unknown>>(workbook.Sheets[movementSheetName], {
              defval: "",
              raw: false,
            })
            .map((row, index) => ({
              id: textValue(row, ["id", "movementid"], `IMP-MV-${Date.now()}-${index}`),
              productId: "",
              sku: textValue(row, ["sku", "stockcode", "productcode", "itemcode"]),
              month: textValue(row, ["month", "period"]).slice(0, 7),
              date: textValue(
                row,
                ["date", "movementdate"],
                new Date().toISOString().slice(0, 10),
              ).slice(0, 10),
              type: (textValue(row, ["type", "movementtype"], "ADJUSTMENT").toUpperCase() ||
                "ADJUSTMENT") as InventoryMovement["type"],
              quantity: numberValue(row, ["quantity", "qty", "movement"]),
              balance: numberValue(row, ["balance", "closingbalance", "closingstock"]),
              reference: textValue(row, ["reference", "ref", "document"], "Workbook import"),
              note: textValue(row, ["note", "notes", "comment"]),
            }))
        : [];
      setPreview({
        fileName: file.name,
        rows: classifyRows(rawRows, products),
        movements: importedMovements,
        sheetName: productSheetName,
      });
      setPreviewFilter("all");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The workbook could not be read.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function exportWorkbook() {
    const XLSX = await import("xlsx");
    const productRows = products.map((p) => ({
      SKU: p.sku,
      Product: p.name,
      Category: p.category,
      "Pack size": p.packSize,
      Unit: p.unit,
      Supplier: p.supplier,
      Location: p.location,
      Batch: p.batch ?? "",
      Expiry: p.expiry,
      "On hand": p.onHand,
      "Reorder level": p.reorder,
      Capacity: p.capacity,
      "Unit cost": p.unitCost,
      "Stock value": Number((p.onHand * p.unitCost).toFixed(2)),
      Status: p.status,
      "Last counted": p.lastCounted,
      Active: p.active ? "Yes" : "No",
    }));
    const movementRows = movements.map((m) => ({
      ID: m.id,
      SKU: m.sku,
      Month: m.month,
      Date: m.date,
      Type: m.type,
      Quantity: m.quantity,
      Balance: m.balance,
      Reference: m.reference,
      Note: m.note ?? "",
    }));
    const workbook = XLSX.utils.book_new();
    const productSheet = XLSX.utils.json_to_sheet(productRows, {
      header: [...productHeaders, "Active"],
    });
    productSheet["!freeze"] = { xSplit: 2, ySplit: 1 };
    productSheet["!cols"] = [14, 34, 20, 12, 10, 24, 12, 14, 12, 12, 14, 12, 12, 14, 10, 14, 9].map(
      (wch) => ({ wch }),
    );
    const movementSheet = XLSX.utils.json_to_sheet(movementRows);
    movementSheet["!freeze"] = { ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, productSheet, "Products");
    XLSX.utils.book_append_sheet(workbook, movementSheet, "Monthly movements");
    XLSX.writeFile(workbook, `Cospharm_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const counts = preview?.rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { new: 0, changed: 0, unchanged: 0, conflict: 0 },
  ) ?? { new: 0, changed: 0, unchanged: 0, conflict: 0 };
  const previewRows =
    preview?.rows.filter((row) => previewFilter === "all" || row.status === previewFilter) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <FileSpreadsheet className="size-4" /> Inventory command centre
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Master product sheet</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One clean register for every product the organisation handles. Search, review and move
            data in or out without breaking the operational dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id="inventory-workbook"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readWorkbook(file);
            }}
          />
          <Button variant="outline" className="gap-2" asChild>
            <label htmlFor="inventory-workbook" className="cursor-pointer">
              <ArrowUpFromLine className="size-4" /> Import / sync
            </label>
          </Button>
          <Button className="gap-2" onClick={() => void exportWorkbook()}>
            <ArrowDownToLine className="size-4" /> Export Excel
          </Button>
        </div>
      </div>

      {importError ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="size-4" /> {importError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Boxes className="size-4" />}
          label="Active products"
          value={integer.format(products.filter((p) => p.active).length)}
          detail="Master SKUs"
        />
        <Metric
          icon={<PackageOpen className="size-4" />}
          label="Units on hand"
          value={integer.format(units)}
          detail="Across all locations"
        />
        <Metric
          icon={<AlertTriangle className="size-4" />}
          label="Need attention"
          value={integer.format(low)}
          detail="At or below reorder"
          tone={low ? "warning" : "normal"}
        />
        <Metric
          icon={<History className="size-4" />}
          label="Inventory value"
          value={money.format(value)}
          detail={`${integer.format(movements.length)} movement records`}
        />
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-slate-50/80 p-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search SKU, product, supplier, batch or location…"
              className="bg-white pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[190px] bg-white">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px] bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="green">Healthy</SelectItem>
                <SelectItem value="yellow">Low</SelectItem>
                <SelectItem value="red">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="inventory-grid overflow-auto">
            <Table className="min-w-[1650px] text-xs">
              <TableHeader className="sticky top-0 z-20 bg-slate-100 shadow-[0_1px_0_0_var(--color-border)]">
                <TableRow>
                  {productHeaders.map((header, index) => (
                    <TableHead
                      key={header}
                      className={`${index < 2 ? "sticky z-30 bg-slate-100" : ""} ${index === 0 ? "left-0 w-[130px]" : index === 1 ? "left-[130px] min-w-[290px]" : "whitespace-nowrap"}`}
                    >
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((product) => (
                  <TableRow
                    key={product.id}
                    onClick={() => setSelected(product)}
                    className="cursor-pointer hover:bg-blue-50/60"
                  >
                    <TableCell className="sticky left-0 z-10 bg-white font-mono font-semibold text-primary group-hover:bg-blue-50">
                      {product.sku}
                    </TableCell>
                    <TableCell className="sticky left-[130px] z-10 bg-white font-medium group-hover:bg-blue-50">
                      <div className="max-w-[290px] truncate" title={product.name}>
                        {product.name}
                      </div>
                    </TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>{product.packSize}</TableCell>
                    <TableCell>{product.unit}</TableCell>
                    <TableCell>{product.supplier}</TableCell>
                    <TableCell className="font-mono">{product.location}</TableCell>
                    <TableCell className="font-mono">{product.batch ?? "—"}</TableCell>
                    <TableCell>{product.expiry}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {integer.format(product.onHand)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {integer.format(product.reorder)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {integer.format(product.capacity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(product.unitCost)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money.format(product.onHand * product.unitCost)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={product.status}
                        label={
                          product.status === "green"
                            ? "Healthy"
                            : product.status === "yellow"
                              ? "Low"
                              : "Critical"
                        }
                      />
                    </TableCell>
                    <TableCell>{product.lastCounted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-2 border-t bg-white px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {filtered.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} products
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-20 text-center">
                Page {safePage} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProductSheet
        product={selected}
        movements={movements}
        audit={audit}
        user={user}
        onClose={() => setSelected(null)}
        onAdjust={(product) => {
          setSelected(null);
          onAdjust(product);
        }}
      />

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="flex max-h-[88vh] max-w-6xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-emerald-600" /> Excel import / sync preview
            </DialogTitle>
            <DialogDescription>
              {preview?.fileName} · “{preview?.sheetName}” sheet · No inventory data has been
              changed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["new", "changed", "unchanged", "conflict"] as ImportStatus[]).map((item) => (
              <button
                key={item}
                onClick={() => setPreviewFilter(item)}
                className={`rounded-md border p-3 text-left ${previewTone(item)} ${previewFilter === item ? "ring-2 ring-primary/40" : ""}`}
              >
                <div className="text-2xl font-semibold">{counts[item]}</div>
                <div className="text-xs font-medium capitalize">{item}</div>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Rows are matched by SKU. Duplicate or ambiguous products are blocked as conflicts.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setPreviewFilter("all")}>
              Show all
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-100">
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>On hand</TableHead>
                  <TableHead>Reason / fields</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => (
                  <TableRow key={`${row.row}-${row.product.sku}`}>
                    <TableCell className="font-mono text-xs">{row.row}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={previewTone(row.status)}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.product.sku || "—"}</TableCell>
                    <TableCell className="font-medium">{row.product.name || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {integer.format(row.product.onHand)}
                    </TableCell>
                    <TableCell className="max-w-[360px] text-xs text-muted-foreground">
                      {row.changedFields.length ? row.changedFields.join(", ") : row.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <p className="mr-auto text-xs text-muted-foreground">
              {preview?.movements.length
                ? `${preview.movements.length} movement rows will also be linked by SKU. `
                : ""}
              {counts.conflict
                ? `${counts.conflict} conflict row${counts.conflict === 1 ? "" : "s"} will be skipped.`
                : "Ready to sync."}
            </p>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button
              disabled={!preview || counts.new + counts.changed === 0}
              onClick={() => {
                if (!preview) return;
                onSync(preview.rows, preview.movements, preview.fileName);
                setPreview(null);
              }}
            >
              <CheckCircle2 className="mr-2 size-4" /> Apply {counts.new + counts.changed} row
              {counts.new + counts.changed === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  tone = "normal",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "normal" | "warning";
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`grid size-10 place-items-center rounded-lg ${tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-primary"}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-semibold tracking-tight">{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductSheet({
  product,
  movements,
  audit,
  user,
  onClose,
  onAdjust,
}: {
  product: InventoryProduct | null;
  movements: InventoryMovement[];
  audit: AuditEntry[];
  user: CurrentUser;
  onClose: () => void;
  onAdjust: (product: InventoryProduct) => void;
}) {
  if (!product) return null;
  const productMovements = movements
    .filter((m) => m.productId === product.id || m.sku === product.sku)
    .sort((a, b) => b.date.localeCompare(a.date));
  const productAudit = audit.filter(
    (entry) => entry.entityType === "stock" && entry.entityId === product.id,
  );
  const fill = Math.min(100, Math.round((product.onHand / Math.max(1, product.capacity)) * 100));
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        <div className="border-b bg-slate-50 p-6">
          <SheetHeader>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {product.sku}
              </Badge>
              <StatusBadge
                status={product.status}
                label={
                  product.status === "green"
                    ? "Healthy"
                    : product.status === "yellow"
                      ? "Low stock"
                      : "Critical"
                }
              />
            </div>
            <SheetTitle className="text-2xl">{product.name}</SheetTitle>
            <SheetDescription>
              {product.category} · {product.packSize} · {product.supplier}
            </SheetDescription>
          </SheetHeader>
        </div>
        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Detail label="On hand" value={integer.format(product.onHand)} strong />
            <Detail label="Reorder" value={integer.format(product.reorder)} />
            <Detail label="Unit cost" value={money.format(product.unitCost)} />
            <Detail
              label="Stock value"
              value={money.format(product.onHand * product.unitCost)}
              strong
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span>Capacity used</span>
              <span>{fill}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${product.status === "red" ? "bg-red-500" : product.status === "yellow" ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${fill}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border bg-white p-4 sm:grid-cols-3">
            <Detail label="Location" value={product.location} />
            <Detail label="Batch" value={product.batch ?? "—"} />
            <Detail label="Expiry" value={product.expiry} />
            <Detail label="Unit" value={product.unit} />
            <Detail label="Last counted" value={product.lastCounted} />
            <Detail label="Account" value={user.name} />
          </div>
          <Button className="w-full gap-2" onClick={() => onAdjust(product)}>
            <SlidersHorizontal className="size-4" /> Update stock
          </Button>
          <Tabs defaultValue="movements">
            <TabsList>
              <TabsTrigger value="movements">
                Movement history ({productMovements.length})
              </TabsTrigger>
              <TabsTrigger value="audit">Audit ({productAudit.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="movements">
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Movement</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{movement.month}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{movement.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{movement.reference}</div>
                          <div className="text-[11px] text-muted-foreground">{movement.note}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {movement.quantity}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {movement.balance}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="audit">
              <div className="space-y-2">
                {productAudit.length ? (
                  productAudit.map((entry) => (
                    <div key={entry.id} className="rounded-md border p-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="font-medium">
                          {entry.field}: {entry.oldValue} → {entry.newValue}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {entry.user} · {entry.comment}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No changes recorded for this product.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`${strong ? "text-lg font-semibold" : "text-sm font-medium"} mt-0.5`}>
        {value}
      </p>
    </div>
  );
}

export type { ImportRow };
