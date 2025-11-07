// server.js — Agentic mapping backend with preview/finalize (CommonJS)
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const xlsx = require("xlsx");
const archiver = require("archiver");
const { parse: parseCsv } = require("csv-parse");
const iconv = require("iconv-lite");
const crypto = require("crypto");

const PORT = process.env.PORT || 8000;
const AZURE_ENDPOINT   = process.env.AZURE_OPENAI_ENDPOINT || "";
const AZURE_API_KEY    = process.env.AZURE_OPENAI_API_KEY || "";
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "";
const AZURE_API_VER    = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";

const app = express();
app.use(cors({ origin: ["http://localhost:5173","http://127.0.0.1:5173"], credentials: false }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const JOBS = new Map(); // jobId -> { state, createdAt }

function sniffDelimiter(headLine) {
  const candidates = [",",";","\t","|"];
  let best=",",bestCount=0;
  for (const d of candidates) {
    const c = (headLine || "").split(d).length - 1;
    if (c > bestCount) { best = d; bestCount = c; }
  }
  return best;
}

async function readSourceBufferToRows(buf, filename) {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const wb = xlsx.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { defval: "" });
  }
  const head = iconv.decode(buf.slice(0, 10000), "utf-8");
  const delim = sniffDelimiter((head.split(/\r?\n/)[0] || ","));
  return new Promise((resolve, reject) => {
    parseCsv(iconv.decode(buf, "utf-8"), {
      delimiter: delim, columns: true, relax_column_count: true, trim: true
    }, (err, records) => {
      if (err) return reject(err);
      resolve(records.map(r => { for (const k in r) if (r[k] == null) r[k] = ""; return r; }));
    });
  });
}

function parseXsdPaths(name, xmlString) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const j = parser.parse(xmlString);
  let schema = j["xs:schema"] || j.schema || Object.values(j).find(v => v && typeof v === "object" && (v["xs:element"] || v["element"]));
  if (!schema) return [];
  const complexTypes = {};
  const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const cts = toArray(schema["xs:complexType"]);
  for (const ct of cts) if (ct && ct.name) complexTypes[ct.name] = ct;
  const elements = toArray(schema["xs:element"]);
  const rows = [];
  function childElements(ct) {
    if (!ct) return [];
    const seq = ct["xs:sequence"];
    const all = ct["xs:all"];
    const choice = ct["xs:choice"];
    const container = seq || all || choice;
    if (!container) return [];
    return toArray(container["xs:element"]).map(e => ({ ...e }));
  }
  function walk(el, prefix) {
    if (!el) return;
    const elName = el.name || (el.ref ? String(el.ref).split(":").pop() : "(anon)");
    const pathStr = prefix ? `${prefix}/${elName}` : elName;
    const mino = el.minOccurs ?? "1";
    const maxo = el.maxOccurs ?? "1";
    const tname = el.type ? String(el.type).split(":").pop() : null;
    let ct = null;
    if (tname && complexTypes[tname]) ct = complexTypes[tname];
    else if (el["xs:complexType"]) ct = el["xs:complexType"];
    const kids = childElements(ct);
    if (!ct || !kids.length) {
      rows.push({ schema: name, path: pathStr, name: elName, type: tname || (ct ? "complex" : "simple"), minOccurs: String(mino), maxOccurs: String(maxo) });
      return;
    }
    for (const kid of kids) walk(kid, pathStr);
  }
  for (const gel of elements) walk(gel, "");
  const seen = new Set();
  return rows.filter(r => { const key = `${r.schema}|${r.path}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

function diceSimilarity(a, b) {
  a = String(a || "").toLowerCase(); b = String(b || "").toLowerCase();
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bg = s => { const g = []; for (let i=0;i<s.length-1;i++) g.push(s.slice(i,i+2)); return g; };
  const A = bg(a), B = bg(b);
  const map = new Map();
  for (const x of A) map.set(x, (map.get(x) || 0) + 1);
  let inter = 0;
  for (const x of B) {
    const c = map.get(x) || 0;
    if (c > 0) { inter++; map.set(x, c-1); }
  }
  return (2 * inter) / (A.length + B.length || 1);
}

async function mapFieldsBatch(sourceCols, targetRows, samplesByCol) {
  const targetPaths = targetRows.map(r => r.path);
  if (AZURE_ENDPOINT && AZURE_API_KEY && AZURE_DEPLOYMENT) {
    try {
      const url = `${AZURE_ENDPOINT.replace(/\/?$/, "/")}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${AZURE_API_VER}`;
      const system = [
        "You map source dataset fields to XSD target element paths.",
        "Return STRICT JSON: an array of {source:string, target:string, score:number, rationale:string}.",
        "Score 0..1 float; prefer exact semantic matches; if unsure choose closest but lower score."
      ].join("\n");
      const user = JSON.stringify({ sourceColumns: sourceCols, targetPaths, sourceSamples: samplesByCol });
      const resp = await axios.post(url, {
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1, response_format: { type: "json_object" }
      }, { headers: { "api-key": AZURE_API_KEY, "Content-Type": "application/json" }, timeout: 60000 });
      const raw = resp?.data?.choices?.[0]?.message?.content || "{}";
      let parsed = {}; try { parsed = JSON.parse(raw); } catch {}
      const list = Array.isArray(parsed) ? parsed : (parsed.mappings || parsed.data || []);
      if (Array.isArray(list) && list.length) {
        return list.map(x => ({
          SourceField: x.source,
          TargetPath: x.target,
          MatchScore: Math.max(0, Math.min(1, Number(x.score) || 0)),
          Rationale: x.rationale || ""
        }));
      }
    } catch (e) {
      console.warn("[AOAI] falling back:", e?.message || e);
    }
  }
  return sourceCols.map(col => {
    let best = { path: "", score: 0 };
    for (const r of targetRows) {
      const s = diceSimilarity(col, r.path.split("/").pop());
      if (s > best.score) best = { path: r.path, score: s };
    }
    return { SourceField: col, TargetPath: best.path, MatchScore: best.score, Rationale: "Local similarity" };
  });
}

function aoaFromDf(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return [headers, ...rows.map(r => headers.map(h => r[h]))];
}
function colorForScore(v) {
  if (v < 0.6) return "#FCE4E4";
  if (v < 0.8) return "#FFF3CD";
  return "#D4EDDA";
}
function buildExcelBuffer(dfBySource, dfByScore, targetDict, srcPreview) {
  const wb = xlsx.utils.book_new();
  function addSheet(name, data, styleScore = true) {
    const aoa = aoaFromDf(data);
    const ws = xlsx.utils.aoa_to_sheet(aoa);
    const headers = aoa[0] || [];
    ws["!cols"] = headers.map(h => ({ wch: Math.max(12, Math.min(60, String(h).length + 2)) }));
    const msIdx = headers.indexOf("MatchScore");
    if (styleScore && msIdx >= 0) {
      for (let r = 1; r < aoa.length; r++) {
        const cellRef = xlsx.utils.encode_cell({ c: msIdx, r });
        const v = Number(data[r - 1]["MatchScore"]) || 0;
        ws[cellRef] = { t: "s", v: `${(v * 100).toFixed(1)}%` };
        ws[cellRef].s = { fill: { patternType: "solid", fgColor: { rgb: colorForScore(v).replace("#","").toUpperCase() } } };
      }
    }
    xlsx.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  addSheet("Suggested Mapping (By Source)", dfBySource);
  addSheet("Suggested Mapping (By Score)", dfByScore);
  addSheet("Target Dictionary", targetDict, false);
  addSheet("Source Preview (first 50)", srcPreview, false);
  return xlsx.write(wb, { bookType: "xlsx", type: "buffer" });
}
function dfToHtmlDoc(title, rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
  const thead = `<tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr>`;
  const tbody = rows.map(r => `<tr>${headers.map(h => {
      const val = r[h];
      if (h === "MatchScore") {
        const v = Number(val) || 0;
        const pct = `${(v * 100).toFixed(1)}%`;
        const bg = colorForScore(v);
        const low = v < 0.60 ? ' style="background:#FCE4E4;"' : "";
        return `<td style="text-align:center;background:${bg};"${low}>${esc(pct)}</td>`;
      }
      return `<td>${esc(val)}</td>`;
    }).join("")}</tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;background:#fff;color:#0b3d2e;margin:24px}
  h1{color:#006a4d;margin:0 0 4px}
  h2{color:#006a4d;margin:16px 0 8px}
  .table-wrap{overflow:auto;border:1px solid #e5e5e5;border-radius:12px}
  table{border-collapse:collapse;width:100%}
  th{background:#e6f2ee;color:#0b3d2e;text-align:left;padding:10px;font-weight:600;position:sticky;top:0}
  td{padding:8px;border-top:1px solid #eee}
  .footer{margin-top:12px;color:#666;font-size:12px}
</style></head>
<body>
  <h1>CBRE — Field Mapping</h1>
  <h2>${esc(title)}</h2>
  <div class="table-wrap"><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>
  <div class="footer">Generated by Azure OpenAI–assisted mapper</div>
</body></html>`;
}
function toolVerify(mapping, targets) {
  const bySrc = mapping.filter(m => m.TargetPath).length;
  const total = mapping.length || 1;
  const low_conf = mapping.filter(m => (m.MatchScore || 0) < 0.6).map(m => m.SourceField);
  const seen = new Set(), dup = [];
  for (const m of mapping) {
    if (!m.TargetPath) continue;
    const k = m.TargetPath;
    if (seen.has(k)) dup.push(`Duplicate target: ${k}`);
    else seen.add(k);
  }
  return { coverage: bySrc / total, low_conf, issues: dup };
}
function buildPreviewPayload(state) {
  const targetsList = state.targets.rows.map(r => r.path);
  function topAlternates(src, k=3) {
    const scored = targetsList.map(p => ({ p, s: diceSimilarity(src, p.split("/").pop()) }))
                              .sort((a,b)=>b.s-a.s).slice(0,k);
    return scored.map(x => ({ path: x.p, score: x.s }));
  }
  const mappings = state.mapping.final.map(m => ({
    SourceField: m.SourceField,
    TargetPath: m.TargetPath || null,
    MatchScore: Number(m.MatchScore || 0),
    Rationale: m.Rationale || "",
    alternates: topAlternates(m.SourceField)
  }));
  return {
    projectName: state.project_name,
    mappings,
    issues: state.qa?.issues || [],
    targets: targetsList,
    samples: state.source?.samples || {}
  };
}
app.post("/api/map/preview",
  upload.fields([{ name: "xsd_files" }, { name: "source_file", maxCount: 1 }]),
  async (req, res) => {
    try {
      const projectName = (req.body.project_name || "mapping-output").trim();
      const xsdFiles = req.files["xsd_files"] || [];
      const srcFile  = (req.files["source_file"] || [])[0];
      if (!xsdFiles.length) return res.status(400).json({ error: "At least one xsd_files required" });
      if (!srcFile) return res.status(400).json({ error: "source_file required" });

      const sourceRows = await readSourceBufferToRows(srcFile.buffer, srcFile.originalname);
      const sourceFields = sourceRows.length ? Object.keys(sourceRows[0]) : [];
      const srcPreview = sourceRows.slice(0, 50);
      const samples = {};
      for (const col of sourceFields) {
        const vals = [];
        for (const r of sourceRows) { const v = (r[col] ?? "").toString(); if (v) vals.push(v); if (vals.length>=3) break; }
        samples[col] = vals;
      }

      let targets = [];
      for (const f of xsdFiles) targets = targets.concat(parseXsdPaths(f.originalname, f.buffer.toString("utf-8")));
      const seen = new Set();
      targets = targets.filter(r => { const k = `${r.schema}|${r.path}`; if (seen.has(k)) return false; seen.add(k); return true; });

      let candidates = await mapFieldsBatch(sourceFields, targets, samples);
      const hard = candidates.filter(c => c.MatchScore < 0.8).map(c => c.SourceField);
      if (hard.length) {
        const refined = await mapFieldsBatch(hard, targets, samples);
        const mapBySrc = new Map(candidates.map(m => [m.SourceField, m]));
        for (const r of refined) mapBySrc.set(r.SourceField, r);
        candidates = Array.from(mapBySrc.values());
      }

      const state = {
        project_name: projectName,
        source: { columns: sourceFields, preview: srcPreview, samples },
        targets: { rows: targets },
        mapping: { final: candidates }
      };
      state.qa = toolVerify(candidates, targets);

      const jobId = crypto.randomUUID();
      JOBS.set(jobId, { state, createdAt: Date.now() });
      res.json({ jobId, ...buildPreviewPayload(state) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Preview failed", detail: String(e?.message || e) });
    }
  }
);
app.post("/api/map/finalize", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const { jobId, edits = [], notes } = req.body || {};
    const job = JOBS.get(jobId);
    if (!job) return res.status(404).json({ error: "job not found" });
    const state = job.state;

    if (Array.isArray(edits) && edits.length) {
      const bySrc = new Map(state.mapping.final.map(m => [m.SourceField, m]));
      for (const e of edits) {
        const row = bySrc.get(e.SourceField);
        if (!row) continue;
        row.TargetPath = e.TargetPath || null;
        if (e.TargetPath && row.MatchScore < 0.9) row.MatchScore = Math.max(row.MatchScore, 0.9);
        row.Rationale = `User override${row.Rationale ? " | " + row.Rationale : ""}`;
      }
      state.mapping.final = Array.from(bySrc.values());
    }

    state.qa = toolVerify(state.mapping.final, state.targets.rows);
    const bySource = state.mapping.final.map(m => ({ SourceField: m.SourceField, TargetPath: m.TargetPath, MatchScore: m.MatchScore }));
    const byScore  = [...bySource].sort((a,b)=>b.MatchScore-a.MatchScore);
    const xbuf = buildExcelBuffer(bySource, byScore, state.targets.rows, state.source.preview);

    const htmls = [
      { name: `${state.project_name} - Suggested Mapping (By Source).html`, data: Buffer.from(dfToHtmlDoc("Suggested Mapping (By Source)", bySource)) },
      { name: `${state.project_name} - Suggested Mapping (By Score).html`,  data: Buffer.from(dfToHtmlDoc("Suggested Mapping (By Score)", byScore))  }
    ];

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${state.project_name}.zip"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", err => { throw err; });
    archive.pipe(res);
    archive.append(xbuf, { name: `${state.project_name}.xlsx` });
    for (const h of htmls) archive.append(h.data, { name: h.name });
    if (notes) archive.append(Buffer.from(String(notes)), { name: "REVIEW_NOTES.txt" });
    await archive.finalize();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Finalize failed", detail: String(e?.message || e) });
  }
});
app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
