import { chromium } from "playwright";
import path from "node:path";

const html = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
});
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1 });
await page.goto(`file://${html.replaceAll("\\", "/")}`, { waitUntil: "networkidle" });
await page.pdf({
  path: output,
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", right: "15mm", bottom: "16mm", left: "15mm" },
  displayHeaderFooter: false,
});
await browser.close();
console.log(output);
