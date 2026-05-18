import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult } from "./analysis";
import type { ParsedDataset } from "./parser";
import type { PvComparisonResult } from "./pv";

export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportFindingsCsv(
  result: AnalysisResult,
  ds: ParsedDataset,
  pv?: PvComparisonResult,
) {
  const rows: string[][] = [
    ["Severity", "Category", "Title", "Detail"],
    ...(pv ? pv.insights : []).concat(result.insights).map((i) => [i.severity, i.category, i.title, i.detail]),
    [],
    ["KPI", "Value", "Unit"],
    ["Average Power", result.kpi.avgPowerKw.toFixed(2), "kW"],
    ["Peak Power", result.kpi.peakPowerKw.toFixed(2), "kW"],
    ["Import Base Load", result.kpi.baseLoadKw.toFixed(2), "kW"],
    ["Import Energy", result.kpi.energyKwh.toFixed(2), "kWh"],
    ["Export Energy", result.kpi.exportEnergyKwh.toFixed(2), "kWh"],
    ["Export Peak", result.kpi.exportPeakKw.toFixed(2), "kW"],
    ["Duration", result.kpi.durationHours.toFixed(2), "h"],
    ["Voltage Min", result.kpi.voltageMin.toFixed(2), "V"],
    ["Voltage Max", result.kpi.voltageMax.toFixed(2), "V"],
    ["Voltage Stability CV", result.kpi.voltageStability.toFixed(3), "%"],
    ["Imbalance Avg", result.kpi.imbalanceAvgPct.toFixed(2), "%"],
    ["Imbalance Max", result.kpi.imbalanceMaxPct.toFixed(2), "%"],
    ["Import Power Factor Avg", result.kpi.pfImportSampleCount ? result.kpi.pfAvg.toFixed(3) : "n/a", ""],
    ["Import Power Factor Min", result.kpi.pfImportSampleCount ? result.kpi.pfMin.toFixed(3) : "n/a", ""],
    ["THD V Max", result.kpi.thdVAvailable ? result.kpi.thdVMaxPct.toFixed(2) : "n/a", "%"],
    ["THD I High-Load Max", result.kpi.thdAHighLoadMaxPct.toFixed(2), "%"],
    ["THD I Raw Max", result.kpi.thdAMaxPct.toFixed(2), "%"],
    ["Spike Event Count", String(result.kpi.spikeCount), ""],
    ["Battery kW", result.battery.recommendedKw.toFixed(1), "kW"],
    ["Battery kWh", result.battery.recommendedKwh.toFixed(1), "kWh"],
    ["15-Min Demand Reduction", result.battery.billingPeakReductionPct.toFixed(1), "%"],
    ["Raw Peak Reduction", result.battery.rawPeakReductionPct.toFixed(1), "%"],
  ];
  if (pv) {
    rows.push(
      [],
      ["PV KPI", "Value", "Unit"],
      ["PV Generation", pv.kpi.generationKwh.toFixed(2), "kWh"],
      ["PV Coverage", pv.kpi.coveragePct.toFixed(1), "%"],
      ["PV Self-Consumption Potential", pv.kpi.selfConsumptionKwh.toFixed(2), "kWh"],
      ["PV Surplus Potential", pv.kpi.surplusKwh.toFixed(2), "kWh"],
      ["Residual Load Min", pv.kpi.residualMinKw.toFixed(2), "kW"],
      ["Residual Load Max", pv.kpi.residualMaxKw.toFixed(2), "kW"],
    );
  }
  downloadCsv(`${stripExt(ds.fileName)}-findings.csv`, rows);
}

export function exportFindingsJson(
  result: AnalysisResult,
  ds: ParsedDataset,
  pv?: PvComparisonResult,
) {
  downloadJson(`${stripExt(ds.fileName)}-findings.json`, {
    file: ds.fileName,
    rowCount: ds.rowCount,
    intervalSeconds: ds.intervalSeconds,
    startTime: new Date(ds.startTime).toISOString(),
    endTime: new Date(ds.endTime).toISOString(),
    kpi: result.kpi,
    insights: pv ? pv.insights.concat(result.insights) : result.insights,
    battery: result.battery,
    spikes: result.spikes,
    hourlyProfile: result.hourlyProfile,
    pv: pv
      ? {
          file: pv.aligned.fileName,
          rowCount: pv.aligned.rowCount,
          intervalSeconds: pv.aligned.intervalSeconds,
          startTime: new Date(pv.aligned.startTime).toISOString(),
          endTime: new Date(pv.aligned.endTime).toISOString(),
          coveragePct: pv.aligned.coveragePct,
          kpi: pv.kpi,
          insights: pv.insights,
        }
      : null,
  });
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

export function exportPdfReport(result: AnalysisResult, ds: ParsedDataset) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setTextColor(255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Power Quality Report", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(ds.fileName, margin, 50);
  doc.text(
    `${fmtDate(ds.startTime)}  →  ${fmtDate(ds.endTime)}`,
    pageWidth - margin,
    50,
    { align: "right" },
  );

  doc.setTextColor(15, 23, 42);
  let y = 100;

  // Headline KPIs
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Executive Summary", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const summaryLines = [
    `Maximum demand reached ${result.kpi.peakPowerKw.toFixed(1)} kW (avg import ${result.kpi.avgPowerKw.toFixed(1)} kW, base import ${result.kpi.baseLoadKw.toFixed(1)} kW).`,
    `Total import energy: ${result.kpi.energyKwh.toFixed(1)} kWh over ${result.kpi.durationHours.toFixed(1)} h${result.kpi.exportEnergyKwh > 0 ? `; export energy: ${result.kpi.exportEnergyKwh.toFixed(1)} kWh` : ""}.`,
    `Voltage stability: ${result.kpi.voltageStability.toFixed(2)}% CV across phases.`,
    `Phase imbalance: avg ${result.kpi.imbalanceAvgPct.toFixed(2)}%, peak ${result.kpi.imbalanceMaxPct.toFixed(2)}%.`,
    result.kpi.pfImportSampleCount
      ? `Import power factor: avg ${result.kpi.pfAvg.toFixed(2)}, min ${result.kpi.pfMin.toFixed(2)}.`
      : "Import power factor was not assessed because no material import samples were available.",
    `Detected ${result.kpi.spikeCount} load spike event${result.kpi.spikeCount === 1 ? "" : "s"} in the dataset.`,
  ];
  for (const line of summaryLines) {
    const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 13 + 2;
  }

  y += 12;

  // KPI table
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value", "Unit"]],
    body: [
      ["Peak Power", result.kpi.peakPowerKw.toFixed(2), "kW"],
      ["Average Power", result.kpi.avgPowerKw.toFixed(2), "kW"],
      ["Import Base Load", result.kpi.baseLoadKw.toFixed(2), "kW"],
      ["Import Energy", result.kpi.energyKwh.toFixed(2), "kWh"],
      ["Export Energy", result.kpi.exportEnergyKwh.toFixed(2), "kWh"],
      ["Voltage Min / Max", `${result.kpi.voltageMin.toFixed(1)} / ${result.kpi.voltageMax.toFixed(1)}`, "V"],
      ["Voltage Stability (CV)", result.kpi.voltageStability.toFixed(3), "%"],
      ["Phase Imbalance Max", result.kpi.imbalanceMaxPct.toFixed(2), "%"],
      [
        "Import Power Factor (avg / min)",
        result.kpi.pfImportSampleCount
          ? `${result.kpi.pfAvg.toFixed(2)} / ${result.kpi.pfMin.toFixed(2)}`
          : "n/a",
        "",
      ],
      ["THD Voltage Max", result.kpi.thdVAvailable ? result.kpi.thdVMaxPct.toFixed(2) : "n/a", "%"],
      ["THD Current High-Load Max", result.kpi.thdAHighLoadMaxPct.toFixed(2), "%"],
      ["Frequency (avg)", result.kpi.frequencyAvg.toFixed(3), "Hz"],
      ["Neutral Current Max", result.kpi.neutralCurrentMax.toFixed(1), "A"],
      ["Battery Recommendation", `${result.battery.recommendedKw.toFixed(0)} kW / ${result.battery.recommendedKwh.toFixed(0)} kWh`, ""],
      ["15-Min Demand Reduction Potential", result.battery.billingPeakReductionPct.toFixed(1), "%"],
      ["Raw Peak Reduction Potential", result.battery.rawPeakReductionPct.toFixed(1), "%"],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42] },
    margin: { left: margin, right: margin },
  });

  // @ts-expect-error jsPDF autotable adds lastAutoTable
  y = (doc.lastAutoTable?.finalY ?? y) + 24;

  // Insights
  if (y > 700) {
    doc.addPage();
    y = margin;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Findings", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y + 6,
    head: [["Severity", "Category", "Finding"]],
    body: result.insights.map((i) => [
      i.severity.toUpperCase(),
      i.category,
      `${i.title}\n${i.detail}`,
    ]),
    styles: { fontSize: 9, cellPadding: 5, valign: "top" },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 70 } },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const sev = String(data.cell.raw).toLowerCase();
        if (sev === "critical") data.cell.styles.fillColor = [254, 226, 226];
        else if (sev === "warning") data.cell.styles.fillColor = [254, 243, 199];
        else if (sev === "ok") data.cell.styles.fillColor = [220, 252, 231];
        else data.cell.styles.fillColor = [219, 234, 254];
      }
    },
  });

  doc.save(`${stripExt(ds.fileName)}-power-report.pdf`);
}

export async function captureChartPng(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(element, {
    backgroundColor: getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim()
      ? `hsl(${getComputedStyle(document.documentElement)
          .getPropertyValue("--background")
          .trim()})`
      : "#ffffff",
    scale: 2,
  });
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
