import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  History,
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { INVENTORY_MONTHS, INVENTORY_SEED, HISTORY_ONLY_PRODUCTS } from "./inventorySeed";
import { getInventoryDataset } from "@/lib/api/inventory.functions";
import type { InventoryProductRecord } from "@/lib/inventory/types";

type StockStatus = "Out of Stock" | "Critical Low" | "Low Stock" | "Normal Stock" | "Overstocked";
type MovementStatus =
  | "No movement"
  | "No target"
  | "Slow moving"
  | "Normal movement"
  | "Fast moving";

type InventoryProduct = InventoryProductRecord & {
  averageMonthlyMovement: number;
  stockValue: number;
  monthsHolding: number | null;
  nearExpiry: boolean;
  stockStatus: StockStatus;
  movementStatus: MovementStatus;
  priorityScore: number;
};

const STATUS_COLOURS: Record<StockStatus, string> = {
  "Out of Stock": "bg-red-100 text-red-800 border-red-200",
  "Critical Low": "bg-rose-100 text-rose-800 border-rose-200",
  "Low Stock": "bg-amber-100 text-amber-800 border-amber-200",
  "Normal Stock": "bg-emerald-100 text-emerald-800 border-emerald-200",
  Overstocked: "bg-sky-100 text-sky-800 border-sky-200",
};

const CHART_COLOURS: Record<StockStatus, string> = {
  "Out of Stock": "#dc2626",
  "Critical Low": "#f43f5e",
  "Low Stock": "#f59e0b",
  "Normal Stock": "#16a34a",
  Overstocked: "#0284c7",
};

const money = new Intl.NumberFormat("en-BW", {
  style: "currency",
  currency: "BWP",
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function deriveProduct(product: InventoryProductRecord, monthCount: number): InventoryProduct {
  const averageMonthlyMovement =
    product.monthlyMovement.reduce((sum, value) => sum + value, 0) / Math.max(monthCount, 1);
  const monthsHolding =
    averageMonthlyMovement > 0 ? product.qtyOnHand / averageMonthlyMovement : null;
  const expiry = product.expiryDate ? new Date(`${product.expiryDate}T00:00:00`) : null;
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  const nearExpiry = expiry !== null && expiry.getTime() < sixMonthsFromNow.getTime();

  let stockStatus: StockStatus;
  if (product.qtyOnHand < 20) stockStatus = "Out of Stock";
  else if (averageMonthlyMovement <= 0) stockStatus = "Overstocked";
  else if ((monthsHolding ?? 0) < 3) stockStatus = "Critical Low";
  else if ((monthsHolding ?? 0) < 8) stockStatus = "Low Stock";
  else if ((monthsHolding ?? 0) <= 15) stockStatus = "Normal Stock";
  else stockStatus = "Overstocked";

  let movementStatus: MovementStatus;
  if (averageMonthlyMovement <= 0) movementStatus = "No movement";
  else if (product.monthlyTarget === null || product.monthlyTarget <= 0)
    movementStatus = "No target";
  else if (averageMonthlyMovement < product.monthlyTarget * 0.5) movementStatus = "Slow moving";
  else if (averageMonthlyMovement <= product.monthlyTarget) movementStatus = "Normal movement";
  else movementStatus = "Fast moving";

  const priorityScore =
    (product.qtyOnHand < 20 ? 100 : 0) +
    (nearExpiry ? 50 : 0) +
    (stockStatus === "Critical Low" ? 40 : 0) +
    (stockStatus === "Low Stock" ? 20 : 0) +
    (movementStatus === "Slow moving" ? 10 : 0) +
    (stockStatus === "Overstocked" ? 5 : 0);

  return {
    ...product,
    averageMonthlyMovement,
    stockValue: product.qtyOnHand * (product.unitCost ?? 0),
    monthsHolding,
    nearExpiry,
    stockStatus,
    movementStatus,
    priorityScore,
  };
}

function StatusBadge({ status }: { status: StockStatus }) {
  return (
    <Badge className={`whitespace-nowrap border font-medium ${STATUS_COLOURS[status]}`}>
      {status}
    </Badge>
  );
}

function exportInventory(products: InventoryProduct[]) {
  const headings = [
    "Item Code",
    "Description",
    "Portfolio",
    "Quantity on Hand",
    "Unit Cost",
    "Stock Value",
    "Monthly Target",
    "Average Monthly Movement",
    "Months Holding",
    "Stock Status",
    "Movement Status",
    "Expiry Date",
    "Batch",
    "Priority Score",
  ];
  const escape = (value: string | number | null) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = products.map((product) =>
    [
      product.itemCode,
      product.description,
      product.portfolio,
      product.qtyOnHand,
      product.unitCost,
      product.stockValue,
      product.monthlyTarget,
      product.averageMonthlyMovement,
      product.monthsHolding,
      product.stockStatus,
      product.movementStatus,
      product.expiryDate,
      product.batch,
      product.priorityScore,
    ]
      .map(escape)
      .join(","),
  );
  const blob = new Blob([[headings.map(escape).join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `coip-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function InventoryModule() {
  const [query, setQuery] = useState("");
  const [portfolio, setPortfolio] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);

  const inventoryQuery = useQuery({
    queryKey: ["inventory", "dataset"],
    queryFn: () => getInventoryDataset(),
    staleTime: 60_000,
    retry: 1,
  });
  const liveDataset = inventoryQuery.data?.products.length ? inventoryQuery.data : null;
  const months = liveDataset?.months.length ? liveDataset.months : [...INVENTORY_MONTHS];
  const sourceProducts = liveDataset?.products ?? INVENTORY_SEED;
  const products = useMemo(
    () => sourceProducts.map((product) => deriveProduct(product, months.length)),
    [months.length, sourceProducts],
  );
  const portfolios = useMemo(
    () => Array.from(new Set(products.map((product) => product.portfolio ?? "Unassigned"))).sort(),
    [products],
  );
  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !search ||
        product.itemCode.toLowerCase().includes(search) ||
        product.description.toLowerCase().includes(search) ||
        product.batch?.toLowerCase().includes(search);
      const matchesPortfolio =
        portfolio === "all" || (product.portfolio ?? "Unassigned") === portfolio;
      const matchesStatus = status === "all" || product.stockStatus === status;
      return matchesSearch && matchesPortfolio && matchesStatus;
    });
  }, [portfolio, products, query, status]);

  const totalUnits = products.reduce((sum, product) => sum + product.qtyOnHand, 0);
  const totalValue = products.reduce((sum, product) => sum + product.stockValue, 0);
  const actionCount = products.filter(
    (product) => product.stockStatus === "Out of Stock" || product.stockStatus === "Critical Low",
  ).length;
  const nearExpiryCount = products.filter((product) => product.nearExpiry).length;
  const missingExpiryCount = products.filter((product) => product.expiryDate === null).length;
  const missingTargetCount = products.filter((product) => product.monthlyTarget === null).length;
  const currentWithoutHistory = products.filter((product) =>
    product.monthlyMovement.every((value) => value === 0),
  ).length;

  const statusData = (Object.keys(CHART_COLOURS) as StockStatus[]).map((name) => ({
    name,
    value: products.filter((product) => product.stockStatus === name).length,
  }));
  const movementData = [
    "Fast moving",
    "Normal movement",
    "Slow moving",
    "No movement",
    "No target",
  ].map((name) => ({
    name,
    value: products.filter((product) => product.movementStatus === name).length,
  }));
  const priorityProducts = [...products]
    .sort((a, b) => b.priorityScore - a.priorityScore || b.stockValue - a.stockValue)
    .slice(0, 12);
  const topValueProducts = [...products].sort((a, b) => b.stockValue - a.stockValue).slice(0, 50);
  const isLive = liveDataset?.source === "supabase";
  const historyRowCount = liveDataset?.historyRowCount ?? 1_160;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-emerald-800">
              <FileSpreadsheet className="size-5" />
              <span className="text-sm font-semibold">
                {isLive ? "Live Supabase inventory" : "Cospharm inventory workbook integrated"}
              </span>
              <Badge className={isLive ? "bg-emerald-700" : "bg-slate-700"}>
                {isLive ? "LIVE" : "SEED"}
              </Badge>
            </div>
            <h2 className="text-xl font-bold tracking-tight">Inventory intelligence</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {isLive
                ? "COIP is reading products, balances, batches and movement history from Supabase. Excel remains an import and export format."
                : "The workbook's 198-product master and January–August movement history are seeded here. COIP recalculates its stock, movement, expiry and priority rules without depending on Excel at runtime."}
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => exportInventory(filteredProducts)}
          >
            <ArrowDownToLine className="size-4" /> Export current view
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Current products</p>
            <p className="mt-1 text-2xl font-bold">{integer.format(products.length)}</p>
            <p className="text-xs text-muted-foreground">{integer.format(totalUnits)} units</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Stock value</p>
            <p className="mt-1 text-2xl font-bold">{money.format(totalValue)}</p>
            <p className="text-xs text-muted-foreground">From workbook unit cost</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Needs action</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{actionCount}</p>
            <p className="text-xs text-muted-foreground">Out or critically low</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Near expiry</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{nearExpiryCount}</p>
            <p className="text-xs text-muted-foreground">Within six months</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Movement history</p>
            <p className="mt-1 text-2xl font-bold">{integer.format(historyRowCount)}</p>
            <p className="text-xs text-muted-foreground">
              {isLive ? "Aggregated monthly records" : "Source rows, Jan–Aug 2026"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="command" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="command">Command centre</TabsTrigger>
          <TabsTrigger value="master">Inventory master</TabsTrigger>
          <TabsTrigger value="top">Top 50 by value</TabsTrigger>
          <TabsTrigger value="migration">Migration & audit</TabsTrigger>
        </TabsList>

        <TabsContent value="command" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Stock condition</CardTitle>
                <CardDescription>
                  Live application of the workbook's months-of-stock rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} margin={{ left: -16, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Products" radius={[5, 5, 0, 0]}>
                      {statusData.map((entry) => (
                        <Cell key={entry.name} fill={CHART_COLOURS[entry.name]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Movement profile</CardTitle>
                <CardDescription>Average monthly movement against target.</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={movementData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {movementData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={["#16a34a", "#0284c7", "#f59e0b", "#64748b", "#a855f7"][index]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Priority action queue</CardTitle>
              <CardDescription>
                Workbook priority scoring, with missing expiry dates treated as unknown instead of
                near-expiry.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="max-h-[430px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Priority</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Movement</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead>Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priorityProducts.map((product) => (
                      <TableRow
                        key={product.itemCode}
                        className="cursor-pointer"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <TableCell className="pl-6 font-semibold">
                          {product.priorityScore}
                        </TableCell>
                        <TableCell>
                          <p className="max-w-md truncate font-medium">{product.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {product.itemCode} · {product.portfolio ?? "Unassigned"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={product.stockStatus} />
                        </TableCell>
                        <TableCell className="text-sm">{product.movementStatus}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {integer.format(product.qtyOnHand)}
                        </TableCell>
                        <TableCell
                          className={product.nearExpiry ? "font-medium text-amber-700" : ""}
                        >
                          {product.expiryDate ?? "Unknown"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="master">
          <Card>
            <CardHeader className="gap-4">
              <div>
                <CardTitle className="text-base">Inventory master</CardTitle>
                <CardDescription>
                  One operational record per workbook item code. Select a row to inspect its monthly
                  history.
                </CardDescription>
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_190px_190px_auto]">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search code, product or batch"
                    className="pl-9"
                  />
                </div>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={portfolio}
                  onChange={(event) => setPortfolio(event.target.value)}
                >
                  <option value="all">All portfolios</option>
                  {portfolios.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">All stock statuses</option>
                  {Object.keys(CHART_COLOURS).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <Button variant="outline" onClick={() => exportInventory(filteredProducts)}>
                  <ArrowDownToLine className="mr-2 size-4" />
                  CSV
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {filteredProducts.length} of {products.length} records
              </p>
            </CardHeader>
            <CardContent className="px-0">
              <div className="max-h-[640px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="pl-6">Item</TableHead>
                      <TableHead>Portfolio</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Avg/month</TableHead>
                      <TableHead className="text-right">Months</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <TableRow
                        key={product.itemCode}
                        className="cursor-pointer"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <TableCell className="pl-6">
                          <p className="max-w-sm truncate font-medium">{product.description}</p>
                          <p className="text-xs text-muted-foreground">{product.itemCode}</p>
                        </TableCell>
                        <TableCell>
                          {product.portfolio ?? <span className="text-amber-700">Unassigned</span>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={product.stockStatus} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {integer.format(product.qtyOnHand)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {decimal.format(product.averageMonthlyMovement)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {product.monthsHolding === null
                            ? "—"
                            : decimal.format(product.monthsHolding)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money.format(product.stockValue)}
                        </TableCell>
                        <TableCell
                          className={product.nearExpiry ? "font-medium text-amber-700" : ""}
                        >
                          {product.expiryDate ?? "Unknown"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="top">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 50 products by stock value</CardTitle>
              <CardDescription>
                This replaces the workbook's broken Top 50 formula references with a deterministic
                live ranking.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="max-h-[650px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="pl-6">Rank</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right pr-6">Stock value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topValueProducts.map((product, index) => (
                      <TableRow
                        key={product.itemCode}
                        className="cursor-pointer"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <TableCell className="pl-6 font-semibold">{index + 1}</TableCell>
                        <TableCell>
                          <p className="max-w-lg truncate font-medium">{product.description}</p>
                          <p className="text-xs text-muted-foreground">{product.itemCode}</p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={product.stockStatus} />
                        </TableCell>
                        <TableCell className="text-right">
                          {integer.format(product.qtyOnHand)}
                        </TableCell>
                        <TableCell className="text-right">
                          {product.unitCost === null ? "—" : money.format(product.unitCost)}
                        </TableCell>
                        <TableCell className="pr-6 text-right font-medium">
                          {money.format(product.stockValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="migration" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <Database className="size-5 text-emerald-700" />
                <CardTitle className="text-base">Operational database</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  PostgreSQL/Supabase stores products, targets, batches, balances, movements,
                  imports and immutable audit events.
                </p>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="size-4" /> Ready for schema migration
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <FileSpreadsheet className="size-5 text-sky-700" />
                <CardTitle className="text-base">Excel compatibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  The workbook remains a migration source and export format. It is not used for
                  concurrent application writes.
                </p>
                <div className="flex items-center gap-2 text-sky-700">
                  <ArrowDownToLine className="size-4" /> Current view exports to CSV
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <ShieldCheck className="size-5 text-violet-700" />
                <CardTitle className="text-base">Controlled history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Every receipt, issue, adjustment, target change and import becomes a timestamped
                  event linked to a user.
                </p>
                <div className="flex items-center gap-2 text-violet-700">
                  <History className="size-4" /> Append-only audit trail
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Migration health</CardTitle>
              <CardDescription>
                Findings retained from the exact 2026–2027 workbook, not silently discarded.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "History-only item codes",
                  value: HISTORY_ONLY_PRODUCTS.length,
                  note: "Preserve as inactive products",
                  icon: History,
                },
                {
                  label: "Current items without movement",
                  value: currentWithoutHistory,
                  note: "Keep with zero-history flag",
                  icon: Clock3,
                },
                {
                  label: "Missing expiry",
                  value: missingExpiryCount,
                  note: "Unknown, not near-expiry",
                  icon: AlertTriangle,
                },
                {
                  label: "Missing monthly target",
                  value: missingTargetCount,
                  note: "No-target status",
                  icon: TrendingUp,
                },
              ].map(({ label, value, note, icon: Icon }) => (
                <div key={label} className="rounded-lg border p-4">
                  <Icon className="mb-3 size-5 text-muted-foreground" />
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workbook-to-COIP mapping</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="font-medium">Database records</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Raw → product, target, batch and opening-balance records. Monthly Average →
                    monthly movement history. Imports and corrections → audit records.
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="font-medium">Application views</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dashboard → command centre. Inventory Master → searchable master view. Top 50 →
                    live ranked view. Formula columns → server-calculated fields.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={selectedProduct !== null}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedProduct.description}</DialogTitle>
                <DialogDescription>
                  {selectedProduct.itemCode} · {selectedProduct.portfolio ?? "Unassigned portfolio"}{" "}
                  · Batch {selectedProduct.batch ?? "unknown"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">On hand</p>
                  <p className="text-lg font-semibold">
                    {integer.format(selectedProduct.qtyOnHand)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Stock value</p>
                  <p className="text-lg font-semibold">
                    {money.format(selectedProduct.stockValue)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Avg movement</p>
                  <p className="text-lg font-semibold">
                    {decimal.format(selectedProduct.averageMonthlyMovement)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Months holding</p>
                  <p className="text-lg font-semibold">
                    {selectedProduct.monthsHolding === null
                      ? "—"
                      : decimal.format(selectedProduct.monthsHolding)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={selectedProduct.stockStatus} />
                <Badge variant="outline">{selectedProduct.movementStatus}</Badge>
                {selectedProduct.nearExpiry && (
                  <Badge className="bg-amber-100 text-amber-800">Near expiry</Badge>
                )}
              </div>
              <div className="h-64 rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Monthly stock movement</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart
                    data={months.map((month, index) => ({
                      month: /^\d{4}-\d{2}$/.test(month)
                        ? new Date(`${month}-01T00:00:00`).toLocaleDateString("en-BW", {
                            month: "short",
                          })
                        : month.slice(0, 3),
                      movement: selectedProduct.monthlyMovement[index],
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="movement" fill="#15803d" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-muted p-3">
                  <p className="font-medium">Source details</p>
                  <p className="mt-1 text-muted-foreground">
                    Expiry: {selectedProduct.expiryDate ?? "Unknown"}
                    <br />
                    Unit cost:{" "}
                    {selectedProduct.unitCost === null
                      ? "Unknown"
                      : money.format(selectedProduct.unitCost)}
                    <br />
                    Monthly target: {selectedProduct.monthlyTarget ?? "Not set"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="font-medium">Workbook note</p>
                  <p className="mt-1 text-muted-foreground">
                    {selectedProduct.notes ?? "No note supplied."}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
