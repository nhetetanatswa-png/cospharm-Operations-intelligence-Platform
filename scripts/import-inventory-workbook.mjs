import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

const MONTHS = new Map(
  [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ].map((name, index) => [name.toLowerCase(), index + 1]),
);

function parseArguments(argv) {
  const options = { commit: false, json: false, file: null, year: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--commit") options.commit = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--file") options.file = argv[++index] ?? null;
    else if (argument === "--year") options.year = Number(argv[++index]);
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  npm run inventory:import -- --file <workbook.xlsx>
  npm run inventory:import -- --file <workbook.xlsx> --commit

Options:
  --file    Workbook to validate or import (required)
  --year    Year for month-name movement rows; defaults to the snapshot year
  --commit  Commit through the transactional Supabase RPC (default is validation only)
  --json    Print the complete validation report as JSON
`);
}

function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) return value.result;
  if (value && typeof value === "object" && "text" in value) return value.text;
  if (value && typeof value === "object" && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  return value;
}

function textValue(cell) {
  const value = cellValue(cell);
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberValue(cell) {
  const value = cellValue(cell);
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function dateValue(cell) {
  const value = cellValue(cell);
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function findHeaderRow(sheet, headings) {
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const values = headings.map((_, index) => textValue(sheet.getCell(rowNumber, index + 1)));
    if (headings.every((heading, index) => values[index] === heading)) return rowNumber;
  }
  return null;
}

function addWarning(warnings, code, row, message) {
  warnings.push({ code, row, message });
}

async function buildImportPlan(filePath, explicitYear) {
  const sourceBuffer = await fs.readFile(filePath);
  const sourceSha256 = createHash("sha256").update(sourceBuffer).digest("hex");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sourceBuffer);

  const rawSheet = workbook.getWorksheet("Raw");
  const movementSheet = workbook.getWorksheet("Monthly Average");
  if (!rawSheet) throw new Error('Required sheet "Raw" was not found.');
  if (!movementSheet) throw new Error('Required sheet "Monthly Average" was not found.');

  const rawHeaders = [
    "Item Code",
    "Item Description",
    "Portfolio",
    "Qty On Hand",
    "Unit Cost",
    "Monthly Target",
    "Expiry Date (Largest Batch)",
    "Batch (Largest Qty)",
    "Notes",
    "Last Updated",
  ];
  const movementHeaders = ["Item Code", "Item Description", "Month", "Quantity"];
  const rawHeaderRow = findHeaderRow(rawSheet, rawHeaders);
  const movementHeaderRow = findHeaderRow(movementSheet, movementHeaders);
  if (!rawHeaderRow)
    throw new Error("The Raw sheet headers do not match the supported workbook format.");
  if (!movementHeaderRow) {
    throw new Error("The Monthly Average movement-log headers do not match the supported format.");
  }

  const warnings = [];
  const errors = [];
  const products = [];
  const productCodes = new Set();
  const lastUpdatedDates = [];

  for (let rowNumber = rawHeaderRow + 1; rowNumber <= rawSheet.rowCount; rowNumber += 1) {
    const row = rawSheet.getRow(rowNumber);
    const itemCode = textValue(row.getCell(1));
    const description = textValue(row.getCell(2));
    if (!itemCode && !description) {
      if (products.length) break;
      continue;
    }
    if (!itemCode || !description) {
      errors.push({
        code: "INVALID_PRODUCT_IDENTITY",
        row: rowNumber,
        message: "Item code and description are required.",
      });
      continue;
    }
    if (productCodes.has(itemCode)) {
      errors.push({
        code: "DUPLICATE_ITEM_CODE",
        row: rowNumber,
        message: `Duplicate item code ${itemCode}.`,
      });
      continue;
    }
    productCodes.add(itemCode);

    const sourceQuantity = numberValue(row.getCell(4));
    const quantity = sourceQuantity ?? 0;
    const unitCost = numberValue(row.getCell(5));
    const monthlyTarget = numberValue(row.getCell(6));
    const expiry = dateValue(row.getCell(7));
    const batch = textValue(row.getCell(8)) || null;
    const notes = textValue(row.getCell(9)) || null;
    const lastUpdated = dateValue(row.getCell(10));

    if (quantity < 0) {
      errors.push({
        code: "INVALID_QUANTITY",
        row: rowNumber,
        message: "Quantity on hand must be zero or greater.",
      });
      continue;
    }
    if (unitCost !== null && unitCost < 0) {
      errors.push({
        code: "INVALID_UNIT_COST",
        row: rowNumber,
        message: "Unit cost cannot be negative.",
      });
      continue;
    }
    if (monthlyTarget !== null && monthlyTarget < 0) {
      errors.push({
        code: "INVALID_TARGET",
        row: rowNumber,
        message: "Monthly target cannot be negative.",
      });
      continue;
    }

    const portfolio = textValue(row.getCell(3)) || null;
    if (sourceQuantity === null) {
      addWarning(
        warnings,
        "MISSING_QUANTITY_ASSUMED_ZERO",
        rowNumber,
        `${itemCode} has no quantity; the workbook convention imports it as zero.`,
      );
    }
    if (!portfolio)
      addWarning(warnings, "MISSING_PORTFOLIO", rowNumber, `${itemCode} has no portfolio.`);
    if (monthlyTarget === null)
      addWarning(warnings, "MISSING_TARGET", rowNumber, `${itemCode} has no monthly target.`);
    if (!expiry)
      addWarning(warnings, "MISSING_EXPIRY", rowNumber, `${itemCode} has no expiry date.`);
    if (!batch)
      addWarning(warnings, "MISSING_BATCH", rowNumber, `${itemCode} has no batch number.`);
    if (lastUpdated) lastUpdatedDates.push(lastUpdated);

    products.push({
      itemCode,
      description,
      portfolio,
      qtyOnHand: quantity,
      unitCost,
      monthlyTarget,
      expiryDate: isoDate(expiry),
      batch,
      notes,
      lastUpdated: lastUpdated?.toISOString() ?? null,
      sourceRowNumber: rowNumber,
    });
  }

  const snapshotDate = lastUpdatedDates.length
    ? new Date(Math.max(...lastUpdatedDates.map((date) => date.getTime())))
    : null;
  const movementYear = explicitYear || snapshotDate?.getUTCFullYear();
  if (!Number.isInteger(movementYear) || movementYear < 2000 || movementYear > 2200) {
    errors.push({
      code: "MISSING_MOVEMENT_YEAR",
      row: movementHeaderRow,
      message: "Supply --year because the movement year could not be inferred.",
    });
  }

  const historyRows = [];
  const historyCodes = new Set();
  for (let rowNumber = movementHeaderRow + 1; rowNumber <= movementSheet.rowCount; rowNumber += 1) {
    const row = movementSheet.getRow(rowNumber);
    const itemCode = textValue(row.getCell(1));
    const description = textValue(row.getCell(2));
    const monthName = textValue(row.getCell(3));
    const quantity = numberValue(row.getCell(4));
    if (!itemCode && !monthName && quantity === null) continue;

    const monthNumber = MONTHS.get(monthName.toLowerCase());
    if (!itemCode || !monthNumber || quantity === null) {
      errors.push({
        code: "INVALID_HISTORY_ROW",
        row: rowNumber,
        message: "History rows require a valid item code, month name and numeric quantity.",
      });
      continue;
    }
    historyCodes.add(itemCode);
    if (quantity < 0)
      addWarning(
        warnings,
        "NEGATIVE_MOVEMENT",
        rowNumber,
        `${itemCode} contains a negative movement of ${quantity}.`,
      );
    historyRows.push({
      itemCode,
      description,
      month: `${movementYear}-${String(monthNumber).padStart(2, "0")}-01`,
      quantity,
      sourceRowNumber: rowNumber,
    });
  }

  const historyOnlyCodes = [...historyCodes].filter((code) => !productCodes.has(code)).sort();
  const currentWithoutHistory = [...productCodes].filter((code) => !historyCodes.has(code)).sort();
  for (const code of historyOnlyCodes) {
    addWarning(
      warnings,
      "HISTORY_ONLY_PRODUCT",
      movementHeaderRow,
      `${code} exists in movement history but not Raw.`,
    );
  }
  for (const code of currentWithoutHistory) {
    addWarning(
      warnings,
      "CURRENT_WITHOUT_HISTORY",
      rawHeaderRow,
      `${code} exists in Raw but has no movement history.`,
    );
  }

  const validationReport = {
    workbook: path.basename(filePath),
    sourceSha256,
    snapshotAt: snapshotDate?.toISOString() ?? null,
    sheets: workbook.worksheets.map((sheet) => sheet.name),
    products: products.length,
    historyRows: historyRows.length,
    totalUnits: products.reduce((sum, product) => sum + product.qtyOnHand, 0),
    totalStockValue: products.reduce(
      (sum, product) => sum + product.qtyOnHand * (product.unitCost ?? 0),
      0,
    ),
    historyOnlyProducts: historyOnlyCodes.length,
    currentWithoutHistory: currentWithoutHistory.length,
    warnings,
    errors,
  };

  return {
    sourceBuffer,
    sourceFilename: path.basename(filePath),
    sourceSha256,
    sourceSnapshotAt: snapshotDate?.toISOString() ?? null,
    products,
    historyRows,
    validationReport,
  };
}

async function commitPlan(plan) {
  try {
    process.loadEnvFile?.(".env");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --commit.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("import_inventory_workbook", {
    p_source_filename: plan.sourceFilename,
    p_source_sha256: plan.sourceSha256,
    p_source_snapshot_at: plan.sourceSnapshotAt,
    p_products: plan.products,
    p_history_rows: plan.historyRows,
    p_validation_report: plan.validationReport,
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "The database rejected the import.");
  return data;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.file) {
    printHelp();
    throw new Error("--file is required.");
  }

  const resolvedFile = path.resolve(options.file);
  const plan = await buildImportPlan(resolvedFile, options.year);
  if (options.json) console.log(JSON.stringify(plan.validationReport, null, 2));
  else {
    console.log(`Workbook: ${plan.sourceFilename}`);
    console.log(`SHA-256: ${plan.sourceSha256}`);
    console.log(`Snapshot: ${plan.sourceSnapshotAt ?? "unknown"}`);
    console.log(`Products: ${plan.products.length}`);
    console.log(`Movement rows: ${plan.historyRows.length}`);
    console.log(`Units on hand: ${plan.validationReport.totalUnits}`);
    console.log(`Stock value: ${plan.validationReport.totalStockValue.toFixed(2)}`);
    console.log(`Warnings: ${plan.validationReport.warnings.length}`);
    console.log(`Errors: ${plan.validationReport.errors.length}`);
  }

  if (plan.validationReport.errors.length) {
    throw new Error("Validation failed. No database changes were made.");
  }
  if (options.commit) {
    const result = await commitPlan(plan);
    console.log(
      `Import committed: ${result.importId}${result.idempotent ? " (already imported)" : ""}`,
    );
  } else {
    console.log("Validation passed. Re-run with --commit after reviewing warnings.");
  }
}

main().catch((error) => {
  console.error(
    `Inventory import failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
