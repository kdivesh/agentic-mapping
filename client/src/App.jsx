import React, { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename || 'download.bin'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(()=>URL.revokeObjectURL(url), 1000)
}

export default function App(){
  const [mode, setMode] = useState("preview") // preview | direct
  const [xsdFiles, setXsdFiles] = useState([])
  const [sourceFile, setSourceFile] = useState(null)
  const [projectName, setProjectName] = useState("mapping-output")
  const [progress, setProgress] = useState(0)

  const [review, setReview] = useState(null) // { jobId, mappings, targets, issues, samples }
  const [edits, setEdits] = useState({})

  const onPickXsd = (e)=> setXsdFiles(Array.from(e.target.files||[]))
  const onPickSrc = (e)=> setSourceFile((e.target.files||[])[0] || null)

  function resetReview() { setReview(null); setEdits({}); setProgress(0); }

  async function handlePreviewSubmit(){
    setProgress(0)
    const form = new FormData()
    xsdFiles.forEach(f => form.append("xsd_files", f))
    if (sourceFile) form.append("source_file", sourceFile)
    form.append("project_name", projectName || "mapping-output")

    const r = await fetch(`${API_BASE}/api/map/preview`, { method:"POST", body:form })
    if(!r.ok){ const t = await r.text(); throw new Error(t) }
    const data = await r.json()
    setReview(data)
  }

  async function handleFinalize(){
    if(!review?.jobId) return
    const payload = {
      jobId: review.jobId,
      edits: Object.entries(edits).map(([SourceField, TargetPath])=>({ SourceField, TargetPath }))
    }
    const r = await fetch(`${API_BASE}/api/map/finalize`, {
      method:"POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload)
    })
    if(!r.ok){ const t = await r.text(); throw new Error(t) }
    const blob = await r.blob()
    downloadBlob(blob, `${projectName||"mapping-output"}.zip`)
  }

  async function handleDirect(){
    await handlePreviewSubmit()
    await handleFinalize()
  }

  const issuesCount = review?.issues?.length || 0

  return (
    <div className="container">
      <h1>CBRE Mapping Studio — Human-in-the-loop</h1>

      <div className="card" style={{marginBottom:12}}>
        <div className="row" style={{marginBottom:8}}>
          <label className="row"><input type="radio" checked={mode==="preview"} onChange={()=>setMode("preview")}/> Preview & Review</label>
          <label className="row"><input type="radio" checked={mode==="direct"} onChange={()=>setMode("direct")}/> Direct Download</label>
          <span className="muted">API base: {API_BASE}</span>
        </div>
        <div className="row">
          <div>
            <div className="muted">XSD files (multi)</div>
            <input type="file" multiple onChange={e=> setXsdFiles(Array.from(e.target.files||[]))} accept=".xsd,application/xml"/>
          </div>
          <div>
            <div className="muted">Source file (.csv/.xlsx/.xls)</div>
            <input type="file" onChange={e=> setSourceFile((e.target.files||[])[0]||null)} accept=".csv,.xlsx,.xls"/>
          </div>
          <div>
            <div className="muted">Project</div>
            <input type="text" value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="mapping-output"/>
          </div>
          <div className="row" style={{marginLeft:"auto"}}>
            <progress max="100" value={progress}></progress>
            {mode==="preview"
              ? <button className="btn-primary" onClick={handlePreviewSubmit}>Generate Preview</button>
              : <button className="btn-primary" onClick={handleDirect}>Upload & Download</button>
            }
            <button className="btn" onClick={resetReview}>Reset</button>
          </div>
        </div>
      </div>

      {mode==="preview" && review && (
        <div className="card">
          <div className="row" style={{justifyContent:"space-between"}}>
            <div><strong>Review & Approve</strong> — Issues: {issuesCount}</div>
            <div className="row">
              <button className="btn" onClick={()=>setEdits(Object.fromEntries(review.mappings.map(m=>[m.SourceField, m.TargetPath||""])))}>Accept All</button>
              <button className="btn" onClick={()=>setEdits({})}>Reset Edits</button>
              <button className="btn-primary" onClick={handleFinalize}>Finalize & Download</button>
            </div>
          </div>
          <div style={{overflow:"auto", marginTop:8, maxHeight:"60vh"}}>
            <table>
              <thead>
                <tr>
                  <th>SourceField</th>
                  <th>TargetPath (editable)</th>
                  <th>MatchScore</th>
                  <th>Alternates</th>
                </tr>
              </thead>
              <tbody>
                {review.mappings.map((m)=>{
                  const v = (edits[m.SourceField] ?? m.TargetPath) || ""
                  const pct = Math.round((m.MatchScore||0)*100)
                  const bg = (m.MatchScore<60/100) ? "bg-red" : (m.MatchScore<80/100) ? "bg-yellow" : "bg-green"
                  return (
                    <tr key={m.SourceField}>
                      <td style={{fontWeight:600}}>{m.SourceField}</td>
                      <td>
                        <input list={`dl-${m.SourceField}`} value={v}
                          onChange={e=>setEdits(s=>({...s, [m.SourceField]: e.target.value}))}
                          placeholder="Type or select a target path" style={{width:"100%"}}
                        />
                        <datalist id={`dl-${m.SourceField}`}>
                          {review.targets.slice(0,5000).map(p=><option key={p} value={p} />)}
                        </datalist>
                      </td>
                      <td className={bg} style={{textAlign:"center"}}>{pct}%</td>
                      <td>
                        <select value="" onChange={e=>setEdits(s=>({...s, [m.SourceField]: e.target.value}))}>
                          <option value="" disabled>Choose alternate…</option>
                          {(m.alternates||[]).map(a=>(<option key={a.path} value={a.path}>{a.path} ({Math.round(a.score*100)}%)</option>))}
                        </select>
                        <button className="btn" style={{marginLeft:6}} onClick={()=>setEdits(s=>({...s, [m.SourceField]: ""}))}>Skip</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
