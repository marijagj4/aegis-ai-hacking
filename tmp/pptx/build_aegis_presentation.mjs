import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const { SKILL_DIR, TMP_DIR, WORKSPACE_DIR, FINAL_PPTX, RUNTIME_PYTHON } = process.env;
if (![SKILL_DIR, TMP_DIR, WORKSPACE_DIR, FINAL_PPTX, RUNTIME_PYTHON].every((v) => path.isAbsolute(v ?? ""))) {
  throw new Error("Missing absolute presentation paths");
}

const { resolvePresentationFont, finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href,
);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });
const family = resolvePresentationFont();
const mono = "Consolas";

const W = 1280;
const H = 720;
const C = {
  bg: "#EAF4FF",
  bg2: "#F4F9FF",
  ink: "#15324B",
  muted: "#3F5970",
  faint: "#69839C",
  cyan: "#0B7F87",
  teal: "#0B7F87",
  blue: "#1E5C9F",
  blue2: "#2E5F8C",
  red: "#C74762",
  red2: "#E9BAC8",
  gold: "#A46F18",
  panel: "#F8FCFF",
  panel2: "#DDEBFA",
  code: "#122B45",
  white: "#FFFFFF",
};

const project = WORKSPACE_DIR;
const assets = path.join(project, "output", "submission", "assets");
const imgBytes = {};
async function readImage(name) {
  if (!imgBytes[name]) imgBytes[name] = await fs.readFile(path.join(assets, name));
  return imgBytes[name];
}

const deck = Presentation.create({ slideSize: { width: W, height: H } });

function addBox(slide, x, y, w, h, fill, radius = 16, line = fill) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { fill: line, width: line === "none" ? 0 : 1 },
  });
}

function addText(slide, text, x, y, w, h, style = {}, fill = "none") {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: style.typeface ?? family,
    fontSize: style.fontSize ?? 20,
    bold: style.bold ?? false,
    color: style.color ?? C.ink,
    italic: style.italic ?? false,
    autoFit: style.autoFit ?? "none",
    align: style.align ?? "left",
  };
  return shape;
}

function addCode(slide, code, x, y, w, h, fontSize = 17) {
  addBox(slide, x, y, w, h, C.code, 12, "#36516D");
  addText(slide, code, x + 18, y + 14, w - 36, h - 28, {
    typeface: mono,
    fontSize,
    color: "#D8E4F1",
    autoFit: "shrink",
  });
}

function addImage(slide, file, x, y, w, h, fit = "contain", alt = file) {
  return slide.images.add({
    blob: imgBytes[file],
    contentType: "image/png",
    alt,
    fit,
    position: { left: x, top: y, width: w, height: h },
    geometry: "roundRect",
    borderRadius: 12,
  });
}

function addFooter(slide, n) {
  addText(slide, "AEGIS  •  локална Purple-Team лабораторија", 54, 688, 450, 18, {
    fontSize: 13, color: C.faint,
  });
  addText(slide, String(n).padStart(2, "0"), 1190, 688, 36, 18, {
    fontSize: 13, color: C.faint, align: "right",
  });
}

function addHeader(slide, kicker, title, n, subtitle = "") {
  addText(slide, kicker.toUpperCase(), 54, 34, 600, 20, {
    fontSize: 14, bold: true, color: C.cyan, typeface: mono,
  });
  addText(slide, title, 54, 58, 1110, 54, {
    fontSize: 34, bold: true, color: C.ink,
  });
  if (subtitle) addText(slide, subtitle, 56, 116, 1080, 28, { fontSize: 18, color: C.muted });
  addBox(slide, 54, 152, 1172, 2, C.blue2, 0, C.blue2);
  addFooter(slide, n);
}

function note(slide, text) {
  slide.speakerNotes.textFrame.setText(text);
}

function card(slide, x, y, w, h, title, body, accent = C.blue, titleSize = 20, bodySize = 16) {
  addBox(slide, x, y, w, h, C.panel, 16, "#D3DEE9");
  addBox(slide, x, y, 6, h, accent, 3, accent);
  addText(slide, title, x + 20, y + 16, w - 36, 28, { fontSize: titleSize, bold: true, color: C.ink });
  addText(slide, body, x + 20, y + 54, w - 36, h - 68, { fontSize: bodySize, color: C.muted, autoFit: "shrink" });
}

function step(slide, n, title, body, x, y, w, accent) {
  addText(slide, n, x, y + 2, 36, 28, { fontSize: 16, bold: true, color: accent, typeface: mono });
  addText(slide, title, x + 46, y, w - 46, 26, { fontSize: 20, bold: true, color: C.ink });
  addText(slide, body, x + 46, y + 30, w - 46, 44, { fontSize: 16, color: C.muted, autoFit: "shrink" });
}

function diagramNode(slide, x, y, w, h, label, detail, accent) {
  addBox(slide, x, y, w, h, C.panel2, 14, accent);
  addText(slide, label, x + 14, y + 12, w - 28, 24, { fontSize: 19, bold: true, color: C.ink });
  addText(slide, detail, x + 14, y + 43, w - 28, h - 52, { fontSize: 14, color: C.muted, autoFit: "shrink" });
}

function connector(slide, x, y, w, h = 4, color = C.blue2) { addBox(slide, x, y, w, h, color, 0, color); }

for (const f of ["dashboard.png", "mission-controls.png", "blocked-target.png", "prompt-block.png", "retest-fixed.png", "aegis-guardian.png", "not-approved-lab.png", "redis-approved-pending-web.png", "target-dropdown.png", "web-no-finding-real.png", "redis-retest-fixed-real.png", "catalog-reviewed-real.png", "assessment-report-fixed-real.png"]) {
  await readImage(f);
}

// 1. Cover
{
  const s = deck.slides.add();
  s.background.fill = C.bg;
  addBox(s, 0, 0, W, H, C.bg, 0, C.bg);
  addBox(s, 0, 0, 16, H, C.cyan, 0, C.cyan);
  addImage(s, "aegis-guardian.png", 830, 95, 330, 330, "contain", "AEGIS shield logo");
  addText(s, "ПРОЕКТНА ПРЕЗЕНТАЦИЈА", 72, 82, 500, 24, { fontSize: 16, bold: true, color: C.cyan, typeface: mono });
  addText(s, "AEGIS", 68, 132, 650, 92, { fontSize: 74, bold: true, color: C.ink });
  addText(s, "Агентно базирано етичко хакирање со LLM", 72, 242, 700, 78, { fontSize: 34, bold: true, color: C.ink, autoFit: "shrink" });
  addText(s, "Локална Purple-Team платформа за проценка, верификација и ретестирање", 74, 340, 650, 54, { fontSize: 21, color: C.muted, autoFit: "shrink" });
  addBox(s, 74, 462, 514, 2, C.blue2, 0, C.blue2);
  addText(s, "Docker лабораторија  •  Nmap  •  Ollama  •  Policy & Ethical Guards", 74, 486, 700, 28, { fontSize: 17, color: C.muted });
  addText(s, "Изработила: Марија Ѓорѓиева", 74, 614, 420, 24, { fontSize: 16, color: C.faint });
  addText(s, "2026", 1120, 614, 64, 24, { fontSize: 16, color: C.faint, align: "right" });
  note(s, "На овој слајд го претставувам AEGIS како локална, контролирана Purple-Team платформа. Главната идеја е да го спојам реалното скенирање со Nmap и проверката на сервисот со локални јазични модели, но моделот никогаш сам не прогласува ранливост.");
}

// 2. Problem and goal
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "01  •  Вовед", "Зошто AEGIS?", 2, "LLM може да помогне во анализа, но без контрола може да донесе погрешна или ризична одлука");
  card(s, 60, 198, 350, 220, "Проблем", "Обично скенирање покажува дека портата е отворена. Тоа само по себе не докажува ранливост и не кажува дали проблемот е поправен.", C.red, 22, 18);
  card(s, 465, 198, 350, 220, "Решение", "AEGIS комбинира Nmap, детерминистички верификатор, повеќе локални LLM улоги и policy проверки во еден повторлив процес.", C.cyan, 22, 18);
  card(s, 870, 198, 350, 220, "Цел", "Да добиеме проверлив резултат: OPEN, FIXED или NO_FINDING, придружен со извештај и audit trail.", C.gold, 22, 18);
  addText(s, "Клучен принцип", 60, 478, 210, 24, { fontSize: 16, bold: true, color: C.cyan, typeface: mono });
  addText(s, "LLM објаснува и сумира. Верификаторот одлучува дали наодот навистина постои.", 60, 510, 1050, 46, { fontSize: 27, bold: true, color: C.ink, autoFit: "shrink" });
  note(s, "Воведот треба да ја постави разликата меѓу откривање и докажување. Nmap може да каже дека сервисот слуша на порта, но AEGIS користи специјализиран верификатор: за Redis проверува дали бара автентикација, а за веб сервисот само потврдува дека сервисот одговара.");
}

// 3. Purple team concept
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "02  •  Методологија", "Red, Blue и Purple улогите во AEGIS", 3, "Куќата е локалниот компјутер и Docker лабораторијата");
  addBox(s, 64, 184, 1152, 48, C.panel, 12, C.blue2);
  addText(s, "КУЌАТА = локален компјутер + Docker lab     |     ВРАТИ = порти 6380 / 8082     |     КАТАНЕЦ = authentication", 88, 197, 1090, 24, { fontSize: 16, bold: true, color: C.ink, typeface: mono, autoFit: "shrink" });
  addBox(s, 64, 258, 350, 280, "#FDECEF", 22, C.red2);
  addText(s, "RED TEAM", 94, 282, 250, 30, { fontSize: 22, bold: true, color: C.red, typeface: mono });
  addText(s, "ПРОБЛЕМ / ПРОВЕРКА", 94, 323, 260, 26, { fontSize: 16, bold: true, color: C.red, typeface: mono });
  addText(s, "Проверува дали вратата е отклучена", 94, 360, 280, 44, { fontSize: 23, bold: true, color: C.ink, autoFit: "shrink" });
  addText(s, "Nmap ги наоѓа портите.\nRedis / HTTP verifier потврдува.\nMetasploit catalog само прегледува.", 94, 430, 260, 82, { fontSize: 17, color: C.muted, autoFit: "shrink" });
  addBox(s, 465, 258, 350, 280, "#EEF4FF", 22, C.blue2);
  addText(s, "BLUE TEAM", 495, 282, 250, 30, { fontSize: 22, bold: true, color: C.blue, typeface: mono });
  addText(s, "РЕШЕНИЕ / ЗАШТИТА", 495, 323, 270, 26, { fontSize: 16, bold: true, color: C.blue, typeface: mono });
  addText(s, "Го ограничува и го поправа проблемот", 495, 360, 280, 44, { fontSize: 23, bold: true, color: C.ink, autoFit: "shrink" });
  addText(s, "Policy + Ethical Scope Guard\nPrompt / Transfer Guard\nRedis закрпа + Retest", 495, 430, 260, 82, { fontSize: 17, color: C.muted, autoFit: "shrink" });
  addBox(s, 866, 258, 350, 280, "#EAF8F4", 22, C.cyan);
  addText(s, "PURPLE TEAM", 896, 282, 250, 30, { fontSize: 22, bold: true, color: C.cyan, typeface: mono });
  addText(s, "КРАЈНА ЦЕЛ / ПОВРАТНА ВРСКА", 896, 323, 285, 26, { fontSize: 15, bold: true, color: C.cyan, typeface: mono, autoFit: "shrink" });
  addText(s, "OPEN → PATCH → FIXED", 896, 360, 280, 40, { fontSize: 24, bold: true, color: C.ink, typeface: mono, autoFit: "shrink" });
  addText(s, "Истата проверка се повторува после поправката и остава audit trail.", 896, 430, 260, 82, { fontSize: 17, color: C.muted, autoFit: "shrink" });
  addText(s, "AEGIS = инспектор кој проверува само сопствена куќа, запишува доказ и не ја обива вратата автоматски.", 110, 588, 1060, 38, { fontSize: 20, color: C.ink, align: "center", autoFit: "shrink" });
  note(s, "Овој слајд ја користи аналогијата со куќа. Red Team гледа дали портата е отворена и дали Redis прифаќа PING без клуч. Blue Team применува политика, ја блокира ексфилтрацијата и додава requirepass. Purple Team ја споредува состојбата OPEN со состојбата после закрпата и бара FIXED.");
}

// 4. Architecture
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "03  •  Архитектура", "Како е составен системот", 4, "Кориснички интерфејс, оркестратор, алатки, модели и докази");
  addBox(s, 58, 190, 260, 410, C.panel, 18, "#D3DEE9");
  addText(s, "КОРИСНИК", 82, 216, 190, 24, { fontSize: 15, bold: true, color: C.cyan, typeface: mono });
  addText(s, "AEGIS dashboard", 82, 254, 190, 30, { fontSize: 25, bold: true, color: C.ink });
  addText(s, "Target registry\nMission controls\nPrompt console\nReports & audit", 82, 320, 180, 130, { fontSize: 19, color: C.muted, autoFit: "shrink" });
  addText(s, "http://127.0.0.1:8000", 82, 540, 190, 25, { fontSize: 15, color: C.blue, typeface: mono });
  diagramNode(s, 385, 194, 260, 112, "FastAPI оркестратор", "Policy gate • scope gate\nroute /run-assessment", C.blue);
  diagramNode(s, 385, 340, 260, 112, "Tool agents", "Nmap • HTTP verifier\nRedis verifier", C.red);
  diagramNode(s, 385, 486, 260, 112, "Evidence layer", "Reports • audit JSONL\nOPEN / FIXED / NO_FINDING", C.gold);
  diagramNode(s, 720, 194, 220, 112, "Docker labs", "web-lab :8082\nredis-lab :6380", C.cyan);
  diagramNode(s, 720, 340, 220, 112, "Ollama", "llama3.2:1b\nllama3.2:3b", C.cyan);
  diagramNode(s, 720, 486, 220, 112, "Metasploit", "Каталог само\nexecution disabled", C.red);
  connector(s, 318, 246, 67, 4, C.blue); connector(s, 645, 246, 75, 4, C.blue);
  connector(s, 318, 394, 67, 4, C.red); connector(s, 645, 394, 75, 4, C.cyan);
  connector(s, 318, 540, 67, 4, C.gold); connector(s, 645, 540, 75, 4, C.red);
  addText(s, "Секој чекор се запишува како evidence: кој агент работел, што видел и зошто донел одлука.", 70, 640, 1110, 26, { fontSize: 18, color: C.muted, align: "center" });
  note(s, "Архитектурата е поделена во слоеви. FastAPI не се поврзува директно со произволен интернет домаќин. Target registry прво открива Docker лаборатории со AEGIS labels, а корисникот мора рачно да одобри една. Дури потоа се повикуваат Nmap и верификаторот.");
}

// 5. Discover and approve
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "04  •  Подготовка", "Discover и Approve пред скенирање", 5, "Корисникот прво ги открива локалните Docker лаборатории, па рачно одобрува една мета");
  addImage(s, "not-approved-lab.png", 54, 192, 500, 330, "contain", "Real AEGIS screenshot before any lab is approved");
  addBox(s, 610, 192, 560, 108, C.panel, 14, C.cyan);
  addText(s, "1  DISCOVER", 636, 210, 170, 24, { fontSize: 16, bold: true, color: C.cyan, typeface: mono });
  addText(s, "Docker labels → PENDING local labs", 636, 244, 480, 28, { fontSize: 20, bold: true, color: C.ink });
  addText(s, "Docker labels + 127.0.0.1 binding → PENDING", 636, 272, 480, 24, { fontSize: 15, color: C.muted, autoFit: "shrink" });
  addText(s, "↓", 876, 304, 30, 28, { fontSize: 25, bold: true, color: C.blue2, align: "center" });
  addBox(s, 610, 326, 560, 112, C.panel, 14, C.blue2);
  addText(s, "2  APPROVE", 636, 344, 170, 24, { fontSize: 16, bold: true, color: C.blue, typeface: mono });
  addText(s, "Human-in-the-loop одлука", 636, 378, 420, 28, { fontSize: 20, bold: true, color: C.ink });
  addText(s, "Корисникот избира target од dropdown и клика Approve.", 636, 406, 480, 34, { fontSize: 15, color: C.muted, autoFit: "shrink" });
  addText(s, "↓", 876, 446, 30, 28, { fontSize: 25, bold: true, color: C.blue2, align: "center" });
  addBox(s, 610, 472, 560, 122, "#EEF4FF", 14, C.red);
  addText(s, "3  ETHICAL SCOPE", 636, 490, 210, 24, { fontSize: 16, bold: true, color: C.red, typeface: mono });
  addText(s, "APPROVED само ако е 127.0.0.1", 636, 524, 480, 28, { fontSize: 20, bold: true, color: C.ink });
  addText(s, "Без approval / надвор од loopback → BLOCKED; tools_called = [].", 636, 556, 480, 40, { fontSize: 15, color: C.muted, autoFit: "shrink" });
  note(s, "Ова е првиот вистински чекор во интерфејсот. Discover не скенира мрежа, туку ги бара активните Docker контејнери со AEGIS labels. Тие почнуваат како PENDING. Корисникот мора да избере и да одобри. Без тоа, Policy и Ethical Scope Guard го стопираат assessment-от пред Nmap.");
}

// 6. Target choice
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "05  •  Избор на лабораторија", "Web или Redis: што значи секоја мета", 6, "Истиот интерфејс води кон различен verifier и различен очекуван исход");
  addImage(s, "target-dropdown.png", 54, 196, 470, 340, "contain", "Real AEGIS screenshot showing the Web and Redis target choices");
  card(s, 578, 194, 590, 140, "web-lab  •  127.0.0.1:8082", "FastAPI / Uvicorn сервис. AEGIS проверува дали сервисот одговара и очекува NO_FINDING кога нема потврден наод.", C.cyan, 22, 18);
  card(s, 578, 360, 590, 140, "redis-lab  •  127.0.0.1:6380", "Redis база за демонстрација на CWE-306. Без лозинка дава OPEN, со --requirepass и retest дава FIXED.", C.red, 22, 18);
  addBox(s, 54, 574, 1114, 72, C.panel, 14, C.blue2);
  addText(s, "МОЖНИ СОСТОЈБИ", 78, 589, 210, 22, { fontSize: 15, bold: true, color: C.blue, typeface: mono });
  addText(s, "NOT APPROVED → BLOCKED   |   APPROVED + web → NO_FINDING   |   Redis без auth → OPEN   |   Redis по patch → FIXED", 78, 619, 1050, 24, { fontSize: 16, color: C.ink, typeface: mono, autoFit: "shrink" });
  note(s, "Web и Redis се две различни лаборатории. Web сервисот е за service discovery и намерно нема verified finding. Redis е сценариото со наод: прво OPEN кога PING поминува без лозинка, а потоа FIXED кога PING враќа NOAUTH. Ако target не е approved, резултатот е BLOCKED пред алатките.");
}

// 7. Model roles
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "06  •  LLM оркестрација", "Кој модел за која задача", 7, "Моделите не се случајно менувани: секој има јасна улога во pipeline-от");
  diagramNode(s, 72, 226, 330, 170, "llama3.2:1b или 3b", "Nmap triage\nИзбраниот модел чита structured scan\nКласификација: web / database", C.blue);
  diagramNode(s, 474, 226, 330, 170, "llama3.2:3b", "Semantic Prompt Guard\nПроверува injection и override\nFail-closed одлука", C.cyan);
  diagramNode(s, 876, 226, 330, 170, "llama3.2:3b или 1b", "Final analysis / recommendations\nМоже да се смени од UI\nСекогаш после verifier", C.gold);
  addText(s, "Nmap XML / JSON", 120, 444, 220, 24, { fontSize: 15, color: C.faint, typeface: mono, align: "center" });
  addText(s, "Prompt input", 540, 444, 200, 24, { fontSize: 15, color: C.faint, typeface: mono, align: "center" });
  addText(s, "Verified finding", 940, 444, 200, 24, { fontSize: 15, color: C.faint, typeface: mono, align: "center" });
  addText(s, "→", 402, 438, 64, 30, { fontSize: 24, bold: true, color: C.blue2, align: "center" });
  addText(s, "→", 804, 438, 64, 30, { fontSize: 24, bold: true, color: C.blue2, align: "center" });
  addBox(s, 72, 514, 1136, 84, C.panel, 14, C.blue2);
  addText(s, "Опционално: OpenRouter може да се активира само со сопствен API key. Во основната демонстрација сите модели се локални преку Ollama.", 98, 540, 1080, 34, { fontSize: 19, color: C.ink, align: "center", autoFit: "shrink" });
  note(s, "Моделот за Nmap triage не одлучува дали постои ранливост. Тој само го класифицира сервисот и дава контекст. Semantic Prompt Guard е посилен локален модел кој ги проверува prompt-ите. Финалната анализа може да користи друг модел, но препораката секогаш доаѓа после детерминистичкиот verifier.");
}

// 8. Pipeline
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "07  •  Workflow", "Од Docker target до проверен извештај", 8, "Целиот pipeline во редоследот што го извршува апликацијата");
  const nodes = [
    ["1", "Discover", "Docker labels"],
    ["2", "Approve", "loopback only"],
    ["3", "Policy", "scope gate"],
    ["4", "Nmap", "real tool call"],
    ["5", "Triage", "local LLM"],
    ["6", "Verify", "socket / HTTP"],
    ["7", "Report", "OPEN evidence"],
    ["8", "Catalog", "msfconsole review"],
    ["9", "Retest", "FIXED after patch"],
  ];
  let x = 42;
  for (let i = 0; i < nodes.length; i++) {
    const [n, title, detail] = nodes[i];
    const accent = i < 3 ? C.cyan : i < 5 ? C.blue : i < 7 ? C.gold : C.red;
    addBox(s, x, 236, 116, 144, C.panel, 16, accent);
    addText(s, n, x + 12, 249, 28, 25, { fontSize: 15, bold: true, color: accent, typeface: mono });
    addText(s, title, x + 12, 286, 92, 28, { fontSize: 17, bold: true, color: C.ink, autoFit: "shrink" });
    addText(s, detail, x + 12, 330, 92, 34, { fontSize: 12.5, color: C.muted, autoFit: "shrink" });
    if (i < nodes.length - 1) addText(s, "→", x + 118, 292, 22, 28, { fontSize: 22, bold: true, color: C.blue2, align: "center" });
    x += 135;
  }
  addBox(s, 64, 428, 1090, 102, C.panel, 14, C.blue2);
  addText(s, "Позитивен пример  •  redis-lab:6380", 88, 446, 360, 24, { fontSize: 16, bold: true, color: C.cyan, typeface: mono });
  addText(s, "Nmap детектира open 6380, но Redis verifier преку PING детерминистички произведува CWE-306 (OPEN). LLM не измислува наод.", 88, 476, 1010, 34, { fontSize: 17, color: C.ink, autoFit: "shrink" });
  addBox(s, 64, 554, 1090, 102, C.panel, 14, C.blue2);
  addText(s, "Затворање на циклусот  •  Retest", 88, 572, 360, 24, { fontSize: 16, bold: true, color: C.red, typeface: mono });
  addText(s, "По --requirepass во docker-compose.yml, Retest повторува socket тест, добива -NOAUTH и ја менува состојбата од OPEN во FIXED.", 88, 602, 1010, 34, { fontSize: 17, color: C.ink, autoFit: "shrink" });
  note(s, "Каталогот е посебен чекор помеѓу Report и Retest. Тој не стартува exploit, туку само овозможува listing и controlled match за верификуван OPEN finding. После тоа операторот внесува закрпа, а Retest ја проверува состојбата повторно.");
}

// 9. Environment
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "08  •  Лабораториска околина", "Изолација и потребни ресурси", 9, "Сè работи локално, на loopback адреси, во Docker");
  card(s, 60, 196, 330, 190, "Хардвер", "Windows 11 машина\nМинимум 8 GB RAM за удобно работење\nСлободен простор за Docker images и модели", C.cyan, 21, 17);
  card(s, 425, 196, 330, 190, "Софтвер", "Docker Desktop\nPython + FastAPI\nNmap CLI\nOllama + llama3.2:1b / 3b\nMetasploit Framework (msfconsole)", C.blue, 21, 17);
  card(s, 790, 196, 430, 190, "Изолација", "Docker ports се врзани само на 127.0.0.1. Data Exfiltration Guard / TransferGuardian спречува испраќање извештаи кон надворешен домен. Нема автоматски payload.", C.red, 21, 17);
  addCode(s, "web-lab    127.0.0.1:8082 → 8081\nredis-lab  127.0.0.1:6380 → 6379\n\nTarget Registry Guard = Docker label + explicit human approval", 60, 442, 650, 138, 18);
  addText(s, "Безбедносно предупредување", 760, 448, 380, 28, { fontSize: 19, bold: true, color: C.red });
  addText(s, "Операциите се наменети само за сопствената лабораторија. Не додавај надворешен target без експлицитна дозвола и одделена, изолирана средина.", 760, 488, 410, 92, { fontSize: 18, color: C.muted, autoFit: "shrink" });
  note(s, "Пред демонстрацијата се нагласува дека околината е лабораторија, а не production мрежа. Docker Compose ги подига двата сервиси. Target registry не чита произволни адреси, туку бара локални Docker labels и 127.0.0.1 port binding.");
}

// 10. Redis OPEN
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "09  •  Сценарио A", "Redis наод: OPEN", 10, "Отворена порта не е доволна. Наодот се потврдува со директен, не-деструктивен probe");
  addImage(s, "mission-controls.png", 54, 190, 510, 365, "contain", "Mission controls screenshot");
  addText(s, "Редослед", 620, 194, 190, 24, { fontSize: 15, bold: true, color: C.cyan, typeface: mono });
  step(s, "01", "Nmap", "6380/tcp е open на 127.0.0.1.", 620, 232, 500, C.blue);
  step(s, "02", "Redis verifier", "Испраќа PING преку socket.", 620, 314, 500, C.cyan);
  step(s, "03", "Доказ", "+PONG без лозинка → CWE-306.", 620, 396, 500, C.red);
  addCode(s, "verification.status = \"open\"\nfinding = \"CWE-306\"\nseverity = \"high\"", 620, 482, 500, 102, 17);
  note(s, "Во првото Redis сценарио target registry го открива redis-lab и корисникот го одобрува. Nmap гледа дека портата е отворена, но RedisAccessVerifier прави вистинска проверка: PING враќа +PONG и Redis прифаќа команда без authentication. Тоа е моментот кога системот создава проверен OPEN наод.");
}

// 11. Redis FIXED retest
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "10  •  Сценарио B", "Закрпа и retest: FIXED", 11, "Истата проверка потврдува дека authentication сега е задолжителна");
  addImage(s, "redis-retest-fixed-real.png", 54, 190, 520, 390, "contain", "Real Redis remediation retest screenshot");
  addBox(s, 628, 204, 530, 116, "#E7F7F1", 16, C.cyan);
  addText(s, "PATCH", 652, 224, 100, 24, { fontSize: 15, bold: true, color: C.cyan, typeface: mono });
  addText(s, "redis-server --requirepass …", 652, 260, 450, 30, { fontSize: 22, bold: true, color: C.ink, typeface: mono });
  addBox(s, 628, 350, 530, 116, "#FBEAEE", 16, C.red);
  addText(s, "RETEST", 652, 370, 120, 24, { fontSize: 15, bold: true, color: C.red, typeface: mono });
  addText(s, "-NOAUTH → finding no longer verified", 652, 406, 455, 30, { fontSize: 21, bold: true, color: C.ink, autoFit: "shrink" });
  addText(s, "Статусот FIXED доаѓа од новиот verifier резултат и од споредбата со претходниот OPEN report. Nmap сè уште може да гледа open port, затоа што достапноста не значи и неавтентициран пристап.", 628, 506, 520, 74, { fontSize: 18, color: C.muted, autoFit: "shrink" });
  note(s, "После remediation во compose е додаден Redis requirepass. Retest повторно го повикува Nmap и Redis verifier. Port 6380 останува open, но директниот PING без лозинка враќа -NOAUTH. Затоа AEGIS ја означува состојбата како FIXED, а не затоа што портата исчезнала.");
}

// 12. Web NO_FINDING
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "11  •  Сценарио C", "Web сервис: NO_FINDING", 12, "Сервисот е достапен, но проценката нема доказ за ранливост");
  addImage(s, "web-no-finding-real.png", 58, 204, 500, 312, "contain", "Real web-lab NO_FINDING assessment screenshot");
  card(s, 628, 204, 510, 136, "Што значи NO_FINDING?", "Системот потврдил дека сервисот одговара, но не потврдил конкретна ранливост. Овој резултат е различен од FIXED.", C.gold, 22, 18);
  card(s, 628, 370, 510, 146, "Зошто LLM не одлучува?", "LLM triage моделот само го класифицира набљудувањето и предлага следен безбеден чекор. HTTP verifier ја одредува состојбата.", C.cyan, 22, 18);
  addText(s, "Извештајот останува корисен: покажува што е измерено и што не е докажано.", 86, 575, 1030, 30, { fontSize: 20, bold: true, color: C.ink, align: "center" });
  note(s, "Ова сценарио покажува важна граница. Отворената веб порта и HTTP одговорот се service discovery, не доказ за exploitability. AEGIS го задржува NO_FINDING за да избегне претерано тврдење.");
}

// 13. Multi-model configuration
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "12  •  Multi-model конфигурација", "Избор на модел од интерфејсот", 13, "Моделите имаат одделни улоги, а операторот може да избере друга локална комбинација");
  diagramNode(s, 72, 236, 280, 160, "llama3.2:1b", "Nmap triage\nбрза класификација\nмал footprint", C.blue);
  diagramNode(s, 500, 236, 280, 160, "llama3.2:3b", "Semantic Prompt Guard\nфинална анализа\nлокално и fail-closed", C.cyan);
  diagramNode(s, 928, 236, 280, 160, "Оpcionално", "OpenRouter provider\nсамо со сопствен API key\nне е активен по default", C.gold);
  connector(s, 352, 316, 148, 4, C.blue); connector(s, 780, 316, 148, 4, C.cyan);
  addText(s, "Nmap result", 110, 442, 180, 24, { fontSize: 15, color: C.faint, typeface: mono, align: "center" });
  addText(s, "Guard + recommendations", 520, 442, 240, 24, { fontSize: 15, color: C.faint, typeface: mono, align: "center" });
  addText(s, "Provider swap", 982, 442, 180, 24, { fontSize: 15, color: C.faint, typeface: mono, align: "center" });
  addBox(s, 72, 512, 1136, 76, C.panel, 14, "#D3DEE9");
  addText(s, "Пример од демонстрацијата", 96, 530, 230, 22, { fontSize: 15, bold: true, color: C.cyan, typeface: mono });
  addText(s, "triage = llama3.2:3b   •   final analysis = llama3.2:1b   •   guard = llama3.2:3b", 96, 558, 1020, 24, { fontSize: 18, color: C.ink, typeface: mono, autoFit: "shrink" });
  note(s, "На овој слајд покажувам дека multi-model не значи дека моделите се случајно сменети. Секој има улога. Во UI може да се постави модел за Nmap triage и друг за финална анализа. Semantic guard останува посебен и fail-closed. OpenRouter е подготвен како опционален provider, но локалниот режим е основниот демонстрациски режим.");
}

// 14. Guards
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "13  •  Заштитни механизми", "Ethical guard пред секоја ризична акција", 14, "AEGIS блокира prompt injection, непотребна ексфилтрација и target надвор од дозволениот scope");
  addImage(s, "blocked-target.png", 54, 196, 440, 300, "contain", "Blocked target response");
  addImage(s, "prompt-block.png", 520, 196, 440, 300, "contain", "Semantic prompt guard block");
  addBox(s, 986, 196, 230, 300, C.panel, 16, C.red2);
  addText(s, "BLOCK", 1016, 232, 160, 30, { fontSize: 24, bold: true, color: C.red, typeface: mono });
  addText(s, "tools_called = []\n\npolicy.allowed = false\nscope.allowed = false\n\nLLM не добива команда", 1016, 286, 170, 160, { fontSize: 17, color: C.muted, typeface: mono, autoFit: "shrink" });
  addText(s, "ALLOW" , 64, 548, 120, 24, { fontSize: 15, bold: true, color: C.cyan, typeface: mono });
  addText(s, "Безбедно едукативно прашање стигнува до локалниот LLM и добива одговор.", 64, 576, 500, 30, { fontSize: 18, color: C.ink });
  addText(s, "BLOCK", 640, 548, 120, 24, { fontSize: 15, bold: true, color: C.red, typeface: mono });
  addText(s, "Непознат target или обид за override се блокира пред алатката или моделот.", 640, 576, 560, 30, { fontSize: 18, color: C.ink });
  note(s, "Овде ја покажувам разликата меѓу Policy/Ethical Scope Guard и Semantic Prompt Guard. Првиот контролира каде смее да се работи, вториот контролира што смее да стигне до LLM. Ако target не е одобрен, Nmap воопшто не се повикува. Ако prompt се обидува да ги заобиколи правилата, моделот не добива input.");
}

// 15. Metasploit catalog
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "14  •  Контролирана валидација", "Metasploit каталог без автоматизиран напад", 15, "AEGIS ги наоѓа соодветните модули за преглед, но автоматското извршување е строго исклучено");
  addImage(s, "catalog-reviewed-real.png", 66, 204, 350, 218, "contain", "Real AEGIS catalog review output");
  addBox(s, 66, 438, 350, 94, "#FDECEF", 18, C.red2);
  addText(s, "1  •  LIST — локален каталог", 96, 454, 290, 24, { fontSize: 16, bold: true, color: C.red, typeface: mono, autoFit: "shrink" });
  addText(s, "msfconsole listing; auxiliary кандидати; нула payload и execution.", 96, 486, 286, 34, { fontSize: 15, color: C.muted, autoFit: "shrink" });
  addBox(s, 465, 204, 350, 328, "#EEF4FF", 18, C.blue2);
  addText(s, "2  •  MATCH", 495, 234, 250, 26, { fontSize: 17, bold: true, color: C.blue, typeface: mono });
  addText(s, "AI селекција", 495, 280, 250, 28, { fontSize: 25, bold: true, color: C.ink });
  addText(s, "llama3.2:3b споредува verified OPEN finding со листата на дозволени имиња. Моделот предлага match само ако каталогот врати кандидат. Параметрите се прикажуваат за едукативен преглед.", 495, 338, 250, 136, { fontSize: 17, color: C.muted, autoFit: "shrink" });
  addBox(s, 864, 204, 350, 328, "#EAF8F4", 18, C.cyan);
  addText(s, "3  •  REVIEW", 894, 234, 250, 26, { fontSize: 17, bold: true, color: C.cyan, typeface: mono });
  addText(s, "Човечка одлука", 894, 280, 250, 28, { fontSize: 25, bold: true, color: C.ink });
  addText(s, "execution: disabled е задолжително. Операторот или професорот ги прегледува доказите, а секоја понатамошна офанзивна активност бара посебна, изолирана и одобрена средина.", 894, 338, 250, 136, { fontSize: 17, color: C.muted, autoFit: "shrink" });
  addText(s, "→", 416, 354, 49, 28, { fontSize: 24, bold: true, color: C.red, align: "center" }); addText(s, "→", 815, 354, 49, 28, { fontSize: 24, bold: true, color: C.blue, align: "center" });
  addText(s, "Забелешка за Windows: каталогот е опционален. Ако локалната Ruby компонента е блокирана од Windows Security, статусот е UNAVAILABLE, а останатите делови на AEGIS продолжуваат нормално.", 80, 594, 1120, 30, { fontSize: 17, color: C.gold, align: "center", autoFit: "shrink" });
  note(s, "Ова е намерно ограничен дел. Кодот го поддржува listing и match, но AEGIS не извршува Metasploit exploit. Тоа е коректно за етичка лабораторија. Во моменталната конфигурација native Ruby делот може да биде блокиран од Windows Security, па не треба да тврдиме дека имаме демонстриран exploit.");
}

// 16. Evidence and audit
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "15  •  Докази", "Извештај, audit trail и репродуктивност", 16, "Секој run остава трага што може да се прегледа и спореди");
  addImage(s, "assessment-report-fixed-real.png", 62, 204, 440, 292, "contain", "Real generated AEGIS assessment report screenshot");
  addBox(s, 572, 204, 590, 292, C.panel, 18, "#D3DEE9");
  addText(s, "Што се запишува?", 600, 232, 320, 28, { fontSize: 24, bold: true, color: C.ink });
  addText(s, "• target и scope одлука\n• точната алатка и нејзиниот резултат\n• моделот што ја направил triage анализата\n• verified finding и препорака\n• report ID и retest споредба", 600, 286, 490, 150, { fontSize: 19, color: C.muted, autoFit: "shrink" });
  addBox(s, 62, 538, 1100, 2, C.blue2, 0, C.blue2);
  addText(s, "Audit trail = оперативна трага за демонстрација и debugging. Не го претставуваме како криптографски immutable ledger.", 62, 572, 1100, 30, { fontSize: 19, color: C.gold, align: "center", autoFit: "shrink" });
  note(s, "Извештајот е Markdown и се зачувува во reports директориумот. Audit trail е append-only JSONL на апликациско ниво. Тоа е доволно за лабораториска демонстрација и за да се види кој агент што направил, но не го нарекувам криптографски immutable систем.");
}

// 17. Assignment coverage and limits
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "16  •  Покриеност", "Што е имплементирано и кои се границите", 17, "Транспарентната проценка е дел од етичкиот дизајн");
  const rows = [
    ["Nmap повик + agent triage", "Има", C.cyan],
    ["Проверка на ранливост + report", "Има", C.cyan],
    ["Patch → policy/retest", "Има", C.cyan],
    ["Повеќе локални модели", "Има", C.cyan],
    ["Ethical scope и prompt блокирање", "Има", C.cyan],
    ["Metasploit listing / match", "Делумно", C.gold],
    ["Автоматски exploit / ексфилтрација", "Исклучено", C.red],
    ["OpenRouter cloud модел", "Опционално", C.gold],
  ];
  addText(s, "Барање / способност", 72, 194, 500, 24, { fontSize: 15, bold: true, color: C.faint, typeface: mono });
  addText(s, "Статус", 1010, 194, 160, 24, { fontSize: 15, bold: true, color: C.faint, typeface: mono });
  let y = 232;
  for (const [label, status, color] of rows) {
    addBox(s, 64, y, 1100, 42, C.panel, 8, "#D3DEE9");
    addText(s, label, 82, y + 10, 760, 24, { fontSize: 18, color: C.ink });
    addText(s, status, 1010, y + 10, 140, 24, { fontSize: 18, bold: true, color, align: "right" });
    y += 50;
  }
  addText(s, "Оваа листа ја кажува реалната состојба: AEGIS демонстрира безбедна проценка, а не неконтролиран офанзивен автомат.", 72, 650, 1100, 24, { fontSize: 18, color: C.muted, align: "center", autoFit: "shrink" });
  note(s, "Овој слајд е корисен ако професорот праша што точно е завршено. Не тврдам дека има активен exploit. Има локален Nmap, агенти, verifier, multi-model, reports и retest. Metasploit делот е listing/match со execution disabled, а OpenRouter е само опционален provider.");
}

// 18. Conclusion and demo plan
{
  const s = deck.slides.add(); s.background.fill = C.bg; addHeader(s, "17  •  Заклучок", "Што демонстрира AEGIS", 18, "Безбедна и детерминистичка оркестрација на алатки и модели во локална лабораторија");
  addText(s, "1", 82, 224, 50, 42, { fontSize: 34, bold: true, color: C.cyan, typeface: mono });
  addText(s, "Реален алат, а не симулација", 146, 222, 450, 32, { fontSize: 24, bold: true, color: C.ink, autoFit: "shrink" });
  addText(s, "Nmap и Metasploit се повикуваат како системски процеси, а структурираниот резултат се предава на Triage агентот за анализа и контекст.", 146, 262, 470, 52, { fontSize: 18, color: C.muted, autoFit: "shrink" });
  addText(s, "2", 82, 358, 50, 42, { fontSize: 34, bold: true, color: C.blue, typeface: mono });
  addText(s, "Проверлив и точен наод", 146, 356, 400, 32, { fontSize: 24, bold: true, color: C.ink });
  addText(s, "Verifier модулите детерминистички одлучуваат OPEN, FIXED или NO_FINDING. LLM помага за контекст, објаснување и препорака, но не ја прогласува ранливоста.", 146, 396, 470, 58, { fontSize: 18, color: C.muted, autoFit: "shrink" });
  addText(s, "3", 82, 492, 50, 42, { fontSize: 34, bold: true, color: C.red, typeface: mono });
  addText(s, "Строги етички граници", 146, 490, 470, 32, { fontSize: 24, bold: true, color: C.ink, autoFit: "shrink" });
  addText(s, "Scope, Prompt и Transfer заштитниците спречуваат надворешни мети, измамнички команди и истекување податоци. Офанзивното извршување останува исклучено.", 146, 530, 470, 58, { fontSize: 18, color: C.muted, autoFit: "shrink" });
  addBox(s, 710, 214, 450, 344, C.panel, 18, "#D3DEE9");
  addText(s, "Демо редослед за одбрана", 744, 248, 370, 30, { fontSize: 25, bold: true, color: C.ink });
  addText(s, "1  Discover + approve\n2  Run web-lab → NO_FINDING\n3  Run redis-lab → OPEN\n4  Patch Redis\n5  Retest → FIXED\n6  Prompt BLOCK + transfer BLOCK", 744, 310, 340, 180, { fontSize: 20, color: C.muted, typeface: mono, autoFit: "shrink" });
  note(s, "На крајот го поврзувам целиот проект со кратка демонстрација: прво web NO_FINDING, потоа Redis OPEN, рачна закрпа, Redis FIXED retest, а на крај prompt и transfer BLOCK. Така професорот гледа и реален алат, и LLM, и заштитни механизми.");
}

const draftPath = path.join(TMP_DIR, "AEGIS_prezentacija_draft.pptx");
await (await PresentationFile.exportPptx(deck)).save(draftPath);
const montage = await deck.export({ format: "webp", montage: true, scale: 0.75 });
await fs.writeFile(path.join(TMP_DIR, "AEGIS_prezentacija_montage.webp"), new Uint8Array(await montage.arrayBuffer()));
for (let i = 0; i < deck.slides.items.length; i++) {
  const slide = deck.slides.items[i];
  const preview = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(TMP_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const requirements = {
  explicitTotalSlideCount: 18,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
};
const stagingDir = path.join(WORKSPACE_DIR, ".codex-finalizer");
await fs.mkdir(stagingDir, { recursive: true });
await finalizePresentation({
  ...requirements,
  workspaceDir: WORKSPACE_DIR,
  candidatePath: draftPath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  requiredNativeTableOwnerSlides: [],
  fontPolicy: { basis: "design", families: [family, mono], scriptFonts: { cs: family, ea: family, symbol: family } },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, `${path.basename(FINAL_PPTX)}.validation.json`),
});

console.log(JSON.stringify({ draftPath, finalPath: FINAL_PPTX, slideCount: deck.slides.items.length, font: family }, null, 2));
