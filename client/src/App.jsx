import React, { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename || 'download.bin'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(()=>URL.revokeObjectURL(url), 1000)
}

export default function App(){
  const [screen, setScreen] = useState(1)
  const [xsdFiles, setXsdFiles] = useState([])
  const [sourceFile, setSourceFile] = useState(null)
  const [projectName, setProjectName] = useState("mapping-output")
  const [selectedRow, setSelectedRow] = useState(null)

  const [review, setReview] = useState(null)
  const [edits, setEdits] = useState({})

  const [aiProgress, setAiProgress] = useState({
    stage: 'idle',
    percentage: 0,
    currentAgent: '',
    message: '',
    details: []
  })

  function resetReview() {
    setReview(null);
    setEdits({});
    setScreen(1);
    setAiProgress({
      stage: 'idle',
      percentage: 0,
      currentAgent: '',
      message: '',
      details: []
    });
  }

  async function handlePreviewSubmit(){
    setScreen(2)

    const form = new FormData()
    xsdFiles.forEach(f => form.append("xsd_files", f))
    if (sourceFile) form.append("source_file", sourceFile)
    form.append("project_name", projectName || "mapping-output")

    simulateAIProgress()

    try {
      const r = await fetch(`${API_BASE}/api/map/preview`, { method:"POST", body:form })
      if(!r.ok){ const t = await r.text(); throw new Error(t) }
      const data = await r.json()
      setReview(data)

      setAiProgress({
        stage: 'complete',
        percentage: 100,
        currentAgent: 'Review Agent',
        message: 'Mapping complete and ready for review',
        details: [
          { agent: 'File Parser', status: 'complete', message: 'Files processed successfully' },
          { agent: 'Schema Analyzer', status: 'complete', message: 'Schema structure analyzed' },
          { agent: 'Semantic Matcher', status: 'complete', message: `${data.mappings?.length || 0} mappings generated` },
          { agent: 'Confidence Calculator', status: 'complete', message: 'Confidence scores computed' },
          { agent: 'Review Agent', status: 'complete', message: 'Ready for human review' }
        ]
      })
    } catch (error) {
      setAiProgress({
        stage: 'error',
        percentage: 0,
        currentAgent: '',
        message: 'Error during mapping process',
        details: [{ agent: 'System', status: 'error', message: error.message }]
      })
    }
  }

  function simulateAIProgress() {
    const stages = [
      { percentage: 15, agent: 'File Parser', message: 'Parsing uploaded files...', delay: 500 },
      { percentage: 30, agent: 'Schema Analyzer', message: 'Analyzing target schema structure...', delay: 1000 },
      { percentage: 50, agent: 'Data Profiler', message: 'Profiling source data patterns...', delay: 1500 },
      { percentage: 70, agent: 'Semantic Matcher', message: 'Matching fields using AI models...', delay: 2000 },
      { percentage: 85, agent: 'Confidence Calculator', message: 'Computing confidence scores...', delay: 2500 },
      { percentage: 95, agent: 'Review Agent', message: 'Preparing review interface...', delay: 3000 }
    ]

    stages.forEach(stage => {
      setTimeout(() => {
        setAiProgress(prev => ({
          ...prev,
          stage: 'processing',
          percentage: stage.percentage,
          currentAgent: stage.agent,
          message: stage.message,
          details: [
            ...prev.details.filter(d => d.agent !== stage.agent),
            { agent: stage.agent, status: 'active', message: stage.message }
          ]
        }))
      }, stage.delay)
    })
  }

  async function handleFinalize(){
    if(!review?.jobId) return

    setAiProgress({
      stage: 'finalizing',
      percentage: 0,
      currentAgent: 'Report Generator',
      message: 'Generating comprehensive reports...',
      details: [
        { agent: 'Report Generator', status: 'active', message: 'Compiling mapping documentation...' }
      ]
    })

    setTimeout(() => {
      setAiProgress(prev => ({
        ...prev,
        percentage: 50,
        message: 'Creating transformation scripts...',
        details: [
          { agent: 'Report Generator', status: 'complete', message: 'Documentation compiled' },
          { agent: 'Script Generator', status: 'active', message: 'Generating transformation code...' }
        ]
      }))
    }, 500)

    const payload = {
      jobId: review.jobId,
      edits: Object.entries(edits).map(([SourceField, TargetPath])=>({ SourceField, TargetPath }))
    }

    try {
      const r = await fetch(`${API_BASE}/api/map/finalize`, {
        method:"POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      })

      if(!r.ok){ const t = await r.text(); throw new Error(t) }

      const blob = await r.blob()

      setAiProgress({
        stage: 'complete',
        percentage: 100,
        currentAgent: 'Download Manager',
        message: 'Reports generated successfully!',
        details: [
          { agent: 'Report Generator', status: 'complete', message: 'Documentation compiled' },
          { agent: 'Script Generator', status: 'complete', message: 'Transformation code generated' },
          { agent: 'Validator', status: 'complete', message: 'Output validated' },
          { agent: 'Package Builder', status: 'complete', message: 'Archive created' },
          { agent: 'Download Manager', status: 'complete', message: 'Ready to download' }
        ]
      })

      setTimeout(() => {
        downloadBlob(blob, `${projectName||"mapping-output"}.zip`)
      }, 500)

    } catch (error) {
      setAiProgress({
        stage: 'error',
        percentage: 0,
        currentAgent: '',
        message: 'Error generating reports',
        details: [{ agent: 'System', status: 'error', message: error.message }]
      })
    }
  }

  const handleRowSelect = (mapping) => {
    setSelectedRow(mapping)
  }

  const handleAcceptMapping = (sourceField) => {
    const mapping = review.mappings.find(m => m.SourceField === sourceField)
    if (mapping) {
      setEdits(s => ({...s, [sourceField]: mapping.TargetPath}))
    }
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background-light font-display text-custom-gray-text">
      <Header />
      <main className="flex flex-1 overflow-hidden">
        {screen === 1 ? (
          <Screen1
            xsdFiles={xsdFiles}
            setXsdFiles={setXsdFiles}
            sourceFile={sourceFile}
            setSourceFile={setSourceFile}
            handlePreviewSubmit={handlePreviewSubmit}
          />
        ) : (
          <Screen2
            xsdFiles={xsdFiles}
            sourceFile={sourceFile}
            aiProgress={aiProgress}
            review={review}
            edits={edits}
            setEdits={setEdits}
            selectedRow={selectedRow}
            handleRowSelect={handleRowSelect}
            handleAcceptMapping={handleAcceptMapping}
            handleFinalize={handleFinalize}
          />
        )}
      </main>
    </div>
  )
}

function Header() {
  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-custom-gray-border px-6 py-3 bg-white z-10 shrink-0">
      <div className="flex items-center gap-4 text-custom-gray-text">
        <div className="size-6 text-custom-green-cta">
          <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path clipRule="evenodd" d="M39.475 21.6262C40.358 21.4363 40.6863 21.5589 40.7581 21.5934C40.7876 21.655 40.8547 21.857 40.8082 22.3336C40.7408 23.0255 40.4502 24.0046 39.8572 25.2301C38.6799 27.6631 36.5085 30.6631 33.5858 33.5858C30.6631 36.5085 27.6632 38.6799 25.2301 39.8572C24.0046 40.4502 23.0255 40.7407 22.3336 40.8082C21.8571 40.8547 21.6551 40.7875 21.5934 40.7581C21.5589 40.6863 21.4363 40.358 21.6262 39.475C21.8562 38.4054 22.4689 36.9657 23.5038 35.2817C24.7575 33.2417 26.5497 30.9744 28.7621 28.762C30.9744 26.5497 33.2417 24.7574 35.2817 23.5037C36.9657 22.4689 38.4054 21.8562 39.475 21.6262ZM4.41189 29.2403L18.7597 43.5881C19.8813 44.7097 21.4027 44.9179 22.7217 44.7893C24.0585 44.659 25.5148 44.1631 26.9723 43.4579C29.9052 42.0387 33.2618 39.5667 36.4142 36.4142C39.5667 33.2618 42.0387 29.9052 43.4579 26.9723C44.1631 25.5148 44.659 24.0585 44.7893 22.7217C44.9179 21.4027 44.7097 19.8813 43.5881 18.7597L29.2403 4.41187C27.8527 3.02428 25.8765 3.02573 24.2861 3.36776C22.6081 3.72863 20.7334 4.58419 18.8396 5.74801C16.4978 7.18716 13.9881 9.18353 11.5858 11.5858C9.18354 13.988 7.18717 16.4978 5.74802 18.8396C4.58421 20.7334 3.72865 22.6081 3.36778 24.2861C3.02574 25.8765 3.02429 27.8527 4.41189 29.2403Z" fill="currentColor" fillRule="evenodd"></path>
          </svg>
        </div>
        <h2 className="text-custom-gray-text text-lg font-bold leading-tight tracking-[-0.015em]">Agentic Data Mapping Studio</h2>
      </div>
      <div className="flex flex-1 justify-end gap-2 items-center">
        <button className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-custom-gray-text gap-2 text-sm font-bold leading-normal tracking-[0.015em] min-w-0 px-2.5">
          <span className="material-symbols-outlined text-xl">notifications</span>
        </button>
        <button className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-custom-gray-text gap-2 text-sm font-bold leading-normal tracking-[0.015em] min-w-0 px-2.5">
          <span className="material-symbols-outlined text-xl">help</span>
        </button>
        <button className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-custom-gray-text gap-2 text-sm font-bold leading-normal tracking-[0.015em] min-w-0 px-2.5">
          <span className="material-symbols-outlined text-xl">settings</span>
        </button>
        <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 ml-2" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAcbC_OfJa7uUsI6_w10Z5Kns5ZPCnFsBoyzlemLG5poNMVuQ7cotVyw5Bujs8veEk0tRdgZp6IBJWrBU0-VYLmohEhHUcpQD1n0SjkKh_mlYga6th1PJKr40Dfd65msIlWYKOwrXjAyi4p49CahcDVmYlCp6Bf0q-SYp5thZCcGXrU1H0MPd3gMWX5JqzzXaRCNPkTLJRmqSxiARWJC2-emsJmz_61JmY0AminME-T_yuY-0tf8E8ovtLGGJYdNclkQneuIadylSk")'}}></div>
      </div>
    </header>
  )
}

function Screen1({ xsdFiles, setXsdFiles, sourceFile, setSourceFile, handlePreviewSubmit }) {
  return (
    <>
      <aside className="w-[320px] shrink-0 border-r border-custom-gray-border bg-white flex flex-col p-4 space-y-4">
        <h3 className="text-custom-gray-text text-lg font-bold leading-tight tracking-[-0.015em] px-2 pb-2 pt-2">Project Setup</h3>
        <div className="flex-1 flex flex-col space-y-4">
          <div className="flex flex-col p-2">
            <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-gray-300 px-6 py-8">
              <div className="flex max-w-[480px] flex-col items-center gap-2">
                <p className="text-custom-gray-text text-base font-bold leading-tight tracking-[-0.015em] max-w-[480px] text-center">Upload Source Dataset</p>
                <p className="text-gray-500 text-sm font-normal leading-normal max-w-[480px] text-center">Drag and drop or click to browse.</p>
                {sourceFile && <p className="text-sm text-custom-green-secondary">{sourceFile.name}</p>}
              </div>
              <label className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-9 px-4 bg-gray-100 hover:bg-gray-200 text-custom-gray-text text-sm font-bold leading-normal tracking-[0.015em]">
                <span className="truncate">Upload File</span>
                <input type="file" className="hidden" onChange={e => setSourceFile((e.target.files||[])[0]||null)} accept=".csv,.xlsx,.xls"/>
              </label>
            </div>
          </div>
          <div className="flex flex-col p-2">
            <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-gray-300 px-6 py-8">
              <div className="flex max-w-[480px] flex-col items-center gap-2">
                <p className="text-custom-gray-text text-base font-bold leading-tight tracking-[-0.015em] max-w-[480px] text-center">Upload Target Schema</p>
                <p className="text-gray-500 text-sm font-normal leading-normal max-w-[480px] text-center">Drag and drop or click to browse.</p>
                {xsdFiles.length > 0 && <p className="text-sm text-custom-green-secondary">{xsdFiles.length} file(s)</p>}
              </div>
              <label className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-9 px-4 bg-gray-100 hover:bg-gray-200 text-custom-gray-text text-sm font-bold leading-normal tracking-[0.015em]">
                <span className="truncate">Upload Schema</span>
                <input type="file" multiple className="hidden" onChange={e => setXsdFiles(Array.from(e.target.files||[]))} accept=".xsd,application/xml"/>
              </label>
            </div>
          </div>
        </div>
        <div className="p-2">
          <button
            onClick={handlePreviewSubmit}
            disabled={!sourceFile || xsdFiles.length === 0}
            className="flex w-full min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-4 bg-custom-green-cta hover:bg-custom-green-secondary text-white text-base font-bold leading-normal tracking-[0.015em] disabled:opacity-50 disabled:cursor-not-allowed">
            <span className="truncate">Generate and Review</span>
          </button>
        </div>
      </aside>
      <section className="flex-1 flex flex-col bg-custom-gray-bg overflow-hidden items-center justify-center p-8">
        <div className="text-center text-gray-500 flex flex-col items-center max-w-md">
          <span className="material-symbols-outlined text-6xl text-gray-300">data_table</span>
          <h2 className="mt-4 text-xl font-semibold text-custom-gray-text">Ready to Begin?</h2>
          <p className="mt-2 text-sm">Upload your source dataset and target schema files in the "Project Setup" panel, then click "Generate and Review" to populate the mapping grid and start your review.</p>
        </div>
      </section>
      <aside className="w-[380px] shrink-0 border-l border-custom-gray-border bg-white flex flex-col items-center justify-center p-8">
        <div className="text-center text-gray-500 flex flex-col items-center max-w-md">
          <span className="material-symbols-outlined text-6xl text-gray-300">rule</span>
          <h2 className="mt-4 text-xl font-semibold text-custom-gray-text">Mapping Details</h2>
          <p className="mt-2 text-sm">Once the mapping is generated, you can click on any row in the grid to see detailed information, rationale, and actions here.</p>
        </div>
      </aside>
    </>
  )
}

function AIProgressPanel({ xsdFiles, sourceFile, aiProgress }) {
  const getStageStatus = (stageName) => {
    const detail = aiProgress.details.find(d => d.agent === stageName)
    if (!detail) return 'pending'
    return detail.status
  }

  const getFileIcon = (filename) => {
    const ext = filename?.split('.').pop()?.toLowerCase()
    if (ext === 'csv') return 'table_chart'
    if (ext === 'xlsx' || ext === 'xls') return 'description'
    return 'insert_drive_file'
  }

  const isSchemaFile = (filename) => {
    const ext = filename?.split('.').pop()?.toLowerCase()
    return ext === 'xsd' || ext === 'xml'
  }

  const stages = [
    { name: 'File Parser', label: 'Uploading Complete' },
    { name: 'Schema Analyzer', label: 'Analyzing Source & Target' },
    { name: 'Semantic Matcher', label: 'Mapping Fields' },
    { name: 'Review Agent', label: 'Ready for Review' }
  ]

  return (
    <aside className="w-[320px] shrink-0 border-r border-custom-gray-border bg-white flex flex-col p-4 space-y-4">
      <h3 className="text-custom-gray-text text-lg font-bold leading-tight tracking-[-0.015em] px-2 pb-2 pt-2">Files &amp; Progress</h3>

      <div className="flex flex-col space-y-4">
        <div className="flex flex-col p-2">
          <p className="text-custom-gray-text text-sm font-semibold mb-2 px-2">Source Dataset</p>
          {sourceFile ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <span className="material-symbols-outlined text-gray-600 text-xl shrink-0">
                {getFileIcon(sourceFile.name)}
              </span>
              <span className="text-sm text-custom-gray-text truncate">{sourceFile.name}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-6">
              <span className="material-symbols-outlined text-3xl text-gray-300">upload_file</span>
              <p className="text-gray-500 text-xs text-center">No file uploaded</p>
            </div>
          )}
        </div>

        <div className="flex flex-col p-2">
          <p className="text-custom-gray-text text-sm font-semibold mb-2 px-2">Target Schema</p>
          {xsdFiles.length > 0 ? (
            <div className="flex flex-col gap-2">
              {xsdFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  {isSchemaFile(file.name) ? (
                    <img src="/image.png" alt="schema" className="w-5 h-5 shrink-0" />
                  ) : (
                    <span className="material-symbols-outlined text-gray-600 text-xl shrink-0">
                      {getFileIcon(file.name)}
                    </span>
                  )}
                  <span className="text-sm text-custom-gray-text truncate">{file.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-6">
              <span className="material-symbols-outlined text-3xl text-gray-300">upload_file</span>
              <p className="text-gray-500 text-xs text-center">No files uploaded</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col p-2 mt-4">
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-custom-gray-text">
              {aiProgress.currentAgent || 'Processing'}
            </span>
            <span className="text-sm font-bold text-custom-green-secondary">
              {aiProgress.percentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="bg-custom-green-cta h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${aiProgress.percentage}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-600">{aiProgress.message}</p>
        </div>
      </div>

      <div className="flex flex-col space-y-3 p-2">
        {stages.map((stage, idx) => {
          const status = getStageStatus(stage.name)
          const isActive = aiProgress.currentAgent === stage.name
          const isComplete = status === 'complete'
          const isPending = status === 'pending'

          return (
            <div key={idx} className="flex items-center gap-3">
              <div className={`flex items-center justify-center rounded-full shrink-0 size-8 transition-all ${
                isComplete ? 'text-custom-green-cta bg-custom-green-cta/20' :
                isActive ? 'text-custom-amber bg-custom-amber/20 animate-pulse' :
                'text-gray-400 bg-gray-100'
              }`}>
                <span className={`material-symbols-outlined text-lg ${isActive ? 'animate-spin' : ''}`}>
                  {isComplete ? 'check_circle' : isActive ? 'progress_activity' : 'circle'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-normal truncate ${
                  isComplete || isActive ? 'text-custom-gray-text' : 'text-gray-400'
                }`}>
                  {stage.label}
                  {stage.name === 'Semantic Matcher' && isActive && ` (${aiProgress.percentage}%)`}
                </p>
                {isActive && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {aiProgress.message}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {aiProgress.stage === 'finalizing' && (
        <div className="flex flex-col space-y-3 p-2 border-t border-custom-gray-border pt-4">
          <h4 className="text-sm font-bold text-custom-gray-text px-2">Report Generation</h4>
          {aiProgress.details.map((detail, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className={`flex items-center justify-center rounded-full shrink-0 size-7 ${
                detail.status === 'complete' ? 'text-custom-green-cta bg-custom-green-cta/20' :
                detail.status === 'active' ? 'text-custom-amber bg-custom-amber/20' :
                'text-gray-400 bg-gray-100'
              }`}>
                <span className={`material-symbols-outlined text-base ${detail.status === 'active' ? 'animate-spin' : ''}`}>
                  {detail.status === 'complete' ? 'check_circle' : detail.status === 'active' ? 'progress_activity' : 'circle'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${
                  detail.status !== 'pending' ? 'text-custom-gray-text' : 'text-gray-400'
                }`}>
                  {detail.agent}
                </p>
                <p className="text-xs text-gray-500 truncate">{detail.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

function Screen2({ xsdFiles, sourceFile, aiProgress, review, edits, setEdits, selectedRow, handleRowSelect, handleAcceptMapping, handleFinalize }) {
  const mappings = review?.mappings || []
  const currentMapping = selectedRow || (mappings.length > 0 ? mappings[0] : null)

  const handleApplyAlternative = (sourceField, targetPath) => {
    setEdits(prev => ({...prev, [sourceField]: targetPath}))
  }

  return (
    <>
      <AIProgressPanel
        xsdFiles={xsdFiles}
        sourceFile={sourceFile}
        aiProgress={aiProgress}
      />
      <section className="flex-1 flex flex-col bg-custom-gray-bg overflow-hidden">
        <div className="p-6 border-b border-custom-gray-border flex flex-col gap-4">
          <div className="flex justify-between items-center gap-4">
            <h3 className="text-custom-gray-text text-lg font-bold leading-tight tracking-[-0.015em] whitespace-nowrap">Mapping Review Grid</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEdits(Object.fromEntries(mappings.map(m=>[m.SourceField, m.TargetPath||""])))}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold bg-green-100 text-green-700 rounded-lg hover:bg-green-200 whitespace-nowrap">
                <span className="material-symbols-outlined text-lg leading-none">check_circle</span>
                Accept All
              </button>
              <button
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 whitespace-nowrap">
                <span className="material-symbols-outlined text-lg leading-none">flag</span>
                Flag All
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
              <input className="block w-full h-10 pl-10 pr-3 text-sm border-gray-300 rounded-lg focus:ring-custom-green-secondary focus:border-custom-green-secondary" placeholder="Search by Source or Target Field" type="search"/>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-custom-green-secondary">High</button>
                <button className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-custom-green-secondary">Medium</button>
                <button className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-custom-green-secondary">Low</button>
              </div>
              <div className="w-px h-6 bg-gray-300 mx-2"></div>
              <div className="flex items-center gap-1">
                <button className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-custom-green-secondary">Accepted</button>
                <button className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-custom-green-secondary">Flagged</button>
                <button className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-custom-green-secondary">Unreviewed</button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-blue-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 font-semibold" scope="col">Source Field</th>
                <th className="px-6 py-3 font-semibold" scope="col">Target Path</th>
                <th className="px-6 py-3 font-semibold" scope="col">Confidence</th>
                <th className="px-6 py-3 font-semibold text-center" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m, idx) => {
                const v = (edits[m.SourceField] ?? m.TargetPath) || ""
                const pct = Math.round((m.MatchScore||0)*100)
                const confidenceClass = pct >= 80 ? 'bg-green-100 text-green-800' : pct >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                const confidenceLabel = pct >= 80 ? 'High' : pct >= 60 ? 'Medium' : 'Low'
                const isSelected = currentMapping?.SourceField === m.SourceField
                const alternates = m.alternates || []

                return (
                  <tr
                    key={m.SourceField}
                    onClick={() => handleRowSelect(m)}
                    className={`border-b border-custom-gray-border hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-white' : 'bg-white'}`}>
                    <td className={`px-6 py-4 font-mono ${isSelected ? 'font-medium text-custom-green-secondary' : 'text-custom-gray-text'}`}>{m.SourceField}</td>
                    <td className="px-6 py-4">
                      <select
                        value={v}
                        onChange={e => setEdits(s => ({...s, [m.SourceField]: e.target.value}))}
                        className={`w-full border text-gray-900 text-sm rounded-lg focus:ring-custom-green-secondary focus:border-custom-green-secondary block p-2.5 ${isSelected ? 'bg-white border-custom-green-secondary' : 'bg-gray-50 border-gray-300'}`}>
                        <option value={m.TargetPath}>{m.TargetPath}</option>
                        {alternates.map(a => (
                          <option key={a.path} value={a.path}>{a.path}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold ${confidenceClass}`}>
                        {pct}% {confidenceLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAcceptMapping(m.SourceField); }}
                          className="text-green-600 hover:text-green-800">
                          <span className="material-symbols-outlined text-xl">check_circle</span>
                        </button>
                        <button className="text-yellow-500 hover:text-yellow-700">
                          <span className="material-symbols-outlined text-xl">flag</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <DetailsPanel
        mapping={currentMapping}
        handleFinalize={handleFinalize}
        review={review}
        aiProgress={aiProgress}
        onApplyAlternative={handleApplyAlternative}
      />
    </>
  )
}

function DetailsPanel({ mapping, handleFinalize, review, aiProgress, onApplyAlternative }) {
  if (!mapping) return null

  const pct = Math.round((mapping.MatchScore||0)*100)
  const alternates = mapping.alternates || []
  const isFinalizing = aiProgress.stage === 'finalizing'
  const isComplete = aiProgress.stage === 'complete' && aiProgress.percentage === 100

  const getConfidenceColor = (percentage) => {
    if (percentage >= 80) return { text: 'text-green-600', bar: 'bg-green-500' }
    if (percentage >= 60) return { text: 'text-yellow-600', bar: 'bg-yellow-500' }
    return { text: 'text-red-600', bar: 'bg-red-500' }
  }

  const confidenceColors = getConfidenceColor(pct)

  return (
    <aside className="w-[380px] shrink-0 border-l border-custom-gray-border bg-white flex flex-col">
      <div className="p-4 border-b border-custom-gray-border">
        <button
          onClick={handleFinalize}
          disabled={isFinalizing}
          className="w-full flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-custom-green-cta hover:bg-custom-green-secondary text-white text-sm font-bold leading-normal tracking-[0.015em] disabled:opacity-50 disabled:cursor-not-allowed gap-2">
          {isFinalizing && (
            <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
          )}
          <span className="truncate">
            {isFinalizing ? 'Generating Reports...' : isComplete ? 'Download Complete!' : 'Finalize & Download'}
          </span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <h3 className="text-custom-gray-text text-lg font-bold leading-tight tracking-[-0.015em] mb-4">Details &amp; Actions</h3>
          <div className="space-y-4">
            <details className="group" open>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold uppercase tracking-wider text-gray-600">
                Mapping Rationale
                <span className="transition-transform group-open:rotate-180">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </span>
              </summary>
              <div className="mt-3 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-custom-gray-border break-words">
                Based on semantic similarity of <code className="font-mono text-sm break-all">{mapping.SourceField}</code> and <code className="font-mono text-sm break-all">{mapping.TargetPath}</code>.
              </div>
            </details>
            <div className="w-full h-px bg-gray-200"></div>
            <details className="group" open>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold uppercase tracking-wider text-gray-600">
                Confidence Score
                <span className="transition-transform group-open:rotate-180">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </span>
              </summary>
              <div className="mt-3 space-y-2">
                <div className={`text-4xl font-bold ${confidenceColors.text}`}>{pct}%</div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className={`${confidenceColors.bar} h-2.5 rounded-full transition-all`} style={{width: `${pct}%`}}></div>
                </div>
              </div>
            </details>
            <div className="w-full h-px bg-gray-200"></div>
            <details className="group" open>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold uppercase tracking-wider text-gray-600">
                Top 3 Alternatives
                <span className="transition-transform group-open:rotate-180">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </span>
              </summary>
              <ul className="mt-3 space-y-2">
                {alternates.slice(0, 3).map((alt, idx) => {
                  const altPct = Math.round((alt.score||0)*100)
                  const altClass = altPct >= 80 ? 'bg-green-100 text-green-800' : altPct >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                  return (
                    <li key={idx} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-gray-200 hover:border-custom-green-secondary transition-colors">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm text-custom-green-secondary block truncate">{alt.path}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1 ${altClass}`}>{altPct}%</span>
                      </div>
                      <button
                        onClick={() => onApplyAlternative(mapping.SourceField, alt.path)}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-bold bg-custom-green-cta hover:bg-custom-green-secondary text-white rounded-lg transition-colors shrink-0">
                        <span className="material-symbols-outlined text-sm">check</span>
                        Apply
                      </button>
                    </li>
                  )
                })}
              </ul>
            </details>
            <div className="w-full h-px bg-gray-200"></div>
            <details className="group" open>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold uppercase tracking-wider text-gray-600">
                Source Data Preview
                <span className="transition-transform group-open:rotate-180">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </span>
              </summary>
              <div className="mt-3 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-custom-gray-border">
                <span className="font-semibold">Sample Values:</span> <code className="font-mono text-sm">['Sample1', 'Sample2', 'Sample3']</code>
              </div>
            </details>
            <div className="w-full h-px bg-gray-200"></div>
            <details className="group" open>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold uppercase tracking-wider text-gray-600">
                Target Schema Details
                <span className="transition-transform group-open:rotate-180">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <div className="flex justify-between p-2 rounded-lg bg-gray-50">
                  <span className="font-semibold">Data Type:</span> <span>string</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-gray-50">
                  <span className="font-semibold">Required:</span> <span>True</span>
                </div>
                <div className="flex flex-col p-2 rounded-lg bg-gray-50">
                  <span className="font-semibold">Description:</span>
                  <span className="mt-1 text-gray-600">Unique identifier for the field.</span>
                </div>
              </div>
            </details>
            <div className="w-full h-px bg-gray-200"></div>
            <details className="group" open>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold uppercase tracking-wider text-gray-600">
                Reviewer Notes
                <span className="transition-transform group-open:rotate-180">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </span>
              </summary>
              <div className="mt-3">
                <textarea className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-custom-green-secondary focus:border-custom-green-secondary block p-2.5" placeholder="Add notes for audit trail..." rows="4"></textarea>
              </div>
            </details>
          </div>
        </div>
      </div>
    </aside>
  )
}
