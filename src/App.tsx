import { useEffect, useRef, useState } from "react"
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"

const THUMB_TIP  = 4
const INDEX_TIP  = 8
const MIDDLE_TIP = 12
const RING_TIP   = 16
const PINKY_TIP  = 20

const CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
]

interface Filter {
  id: string
  label: string
  css: string
}

const FILTERS: Filter[] = [
  { id:"thermal",    label:"Thermal",    css:"invert(1) sepia(1) saturate(10) hue-rotate(295deg) contrast(1.5)" },
  { id:"acid",       label:"Acid",       css:"hue-rotate(90deg) saturate(20) contrast(3) brightness(0.6)" },
  { id:"void",       label:"Void",       css:"invert(1) contrast(8) brightness(0.4) grayscale(1)" },
  { id:"plasma",     label:"Plasma",     css:"hue-rotate(200deg) saturate(15) contrast(4) brightness(0.5) invert(0.3)" },
  { id:"bleed",      label:"Bleed",      css:"sepia(1) saturate(20) hue-rotate(320deg) contrast(5) brightness(0.5)" },
  { id:"ghost",      label:"Ghost",      css:"invert(1) brightness(3) contrast(6) grayscale(1) opacity(0.85)" },
  { id:"toxic",      label:"Toxic",      css:"hue-rotate(80deg) saturate(25) contrast(5) brightness(0.45) invert(0.15)" },
  { id:"infrared",   label:"Infrared",   css:"invert(1) sepia(1) saturate(8) hue-rotate(220deg) contrast(2) brightness(0.7)" },
  { id:"glitch",     label:"Glitch",     css:"hue-rotate(180deg) saturate(30) contrast(8) brightness(0.3) invert(0.5)" },
  { id:"chrome",     label:"Chrome",     css:"grayscale(1) contrast(6) brightness(1.4) invert(0.1) blur(0.3px)" },
  { id:"lava",       label:"Lava",       css:"sepia(1) saturate(30) hue-rotate(340deg) contrast(6) brightness(0.4)" },
  { id:"deep",       label:"Deep Sea",   css:"hue-rotate(160deg) saturate(12) contrast(3) brightness(0.35) invert(0.2)" },
  { id:"corrupt",    label:"Corrupt",    css:"contrast(20) brightness(0.2) saturate(40) hue-rotate(270deg)" },
  { id:"ember",      label:"Ember",      css:"sepia(1) saturate(15) hue-rotate(10deg) contrast(4) brightness(0.55)" },
  { id:"ultraviolet",label:"UV",         css:"invert(0.9) hue-rotate(250deg) saturate(20) contrast(3) brightness(0.6)" },
  { id:"melt",       label:"Melt",       css:"saturate(40) hue-rotate(130deg) contrast(6) brightness(0.3) blur(0.5px)" },
  { id:"bleach",     label:"Bleach",     css:"contrast(10) brightness(2.5) saturate(0.2) invert(0.05)" },
  { id:"dusk",       label:"Dusk",       css:"sepia(0.8) hue-rotate(30deg) saturate(8) contrast(2.5) brightness(0.5)" },
  { id:"rupture",    label:"Rupture",    css:"invert(0.7) saturate(50) contrast(10) hue-rotate(310deg) brightness(0.25)" },
  { id:"frostbite",  label:"Frostbite",  css:"hue-rotate(175deg) saturate(6) contrast(3) brightness(0.9) invert(0.4)" },
  { id:"oil",        label:"Oil Slick",  css:"hue-rotate(45deg) saturate(35) contrast(5) brightness(0.4) invert(0.25)" },
  { id:"nuclear",    label:"Nuclear",    css:"brightness(3) contrast(12) saturate(0) invert(0.9) blur(0.2px)" },
  { id:"cerebral",   label:"Cerebral",   css:"invert(0.6) hue-rotate(100deg) saturate(18) contrast(7) brightness(0.35)" },
  { id:"molten",     label:"Molten",     css:"sepia(1) saturate(25) hue-rotate(355deg) contrast(8) brightness(0.35)" },
  { id:"abyssal",    label:"Abyssal",    css:"hue-rotate(240deg) saturate(8) contrast(12) brightness(0.15) invert(0.1)" },
  { id:"flare",      label:"Flare",      css:"brightness(4) contrast(8) saturate(3) hue-rotate(15deg) invert(0.1)" },
  { id:"rot",        label:"Rot",        css:"sepia(1) saturate(12) hue-rotate(60deg) contrast(6) brightness(0.3)" },
  { id:"strobe",     label:"Strobe",     css:"contrast(50) brightness(1.5) grayscale(1) invert(0.5)" },
  { id:"aurora",     label:"Aurora",     css:"hue-rotate(140deg) saturate(20) contrast(2.5) brightness(0.6) invert(0.15)" },
  { id:"obliterate", label:"Obliterate", css:"contrast(30) saturate(50) hue-rotate(180deg) brightness(0.2) invert(0.8)" },
]

const SHAPE_COLORS: string[] = ["#ff4dac","#4dffa3","#4db8ff","#ffe14d","#ff6b4d","#c44dff"]
let _id = 0

interface Slot {
  hand: number
  finger: number
}

interface Shape {
  id: number
  label: string
  color: string
  slots: Slot[]
  filter: string
}

function newShape(): Shape {
  _id++
  return {
    id: _id,
    label: `Shape ${_id}`,
    color: SHAPE_COLORS[(_id-1) % SHAPE_COLORS.length],
    slots: [
      { hand:0, finger:THUMB_TIP },
      { hand:0, finger:INDEX_TIP },
      { hand:1, finger:THUMB_TIP },
      { hand:1, finger:INDEX_TIP },
    ],
    filter: "invert",
  }
}

interface Point {
  x: number
  y: number
}

function sortByAngle(pts: Point[]): Point[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return [...pts].sort((a, b) =>
    Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  )
}

interface HandTipDef {
  id: number
  cx: number
  cy: number
  short: string
}

interface HandKnuckleDef {
  id: number
  cx: number
  cy: number
}

const HAND_TIPS: HandTipDef[] = [
  { id:THUMB_TIP,  cx:18, cy:62, short:"T" },
  { id:INDEX_TIP,  cx:34, cy:18, short:"I" },
  { id:MIDDLE_TIP, cx:50, cy:10, short:"M" },
  { id:RING_TIP,   cx:66, cy:18, short:"R" },
  { id:PINKY_TIP,  cx:80, cy:32, short:"P" },
]

const HAND_KNUCKLES: HandKnuckleDef[] = [
  { id:THUMB_TIP,  cx:28, cy:72 },
  { id:INDEX_TIP,  cx:36, cy:52 },
  { id:MIDDLE_TIP, cx:50, cy:48 },
  { id:RING_TIP,   cx:64, cy:52 },
  { id:PINKY_TIP,  cx:76, cy:58 },
]

const PALM = "M28,72 L36,52 L50,48 L64,52 L76,58 L80,78 L60,88 L40,88 Z"

interface MiniHandProps {
  handIdx: number
  selectedFingers: number[]
  onToggle: (fingerId: number) => void
}

function MiniHand({ handIdx, selectedFingers, onToggle }: MiniHandProps) {
  return (
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:10,color:"#666",marginBottom:3,fontFamily:"monospace"}}>
        {handIdx===0?"Left":"Right"}
      </div>
      <svg viewBox="0 0 100 96" width={84} height={80}>
        <path d={PALM} fill="#1a1a2e" stroke="#333" strokeWidth={1.5}/>
        {HAND_TIPS.map((t, i) => {
          const k = HAND_KNUCKLES[i]
          return <line key={t.id} x1={k.cx} y1={k.cy} x2={t.cx} y2={t.cy}
            stroke="#2a2a3e" strokeWidth={8} strokeLinecap="round"/>
        })}
        {HAND_TIPS.map(t => {
          const on = selectedFingers.includes(t.id)
          return (
            <g key={t.id} style={{cursor:"pointer"}} onClick={() => onToggle(t.id)}>
              <circle cx={t.cx} cy={t.cy} r={10}
                fill={on?"#4dffa3":"#1e1e2e"}
                stroke={on?"#4dffa3":"#444"} strokeWidth={1.5}/>
              <text x={t.cx} y={t.cy+4} textAnchor="middle"
                style={{fontSize:7,fill:on?"#000":"#888",fontFamily:"monospace",
                  pointerEvents:"none",userSelect:"none"}}>
                {t.short}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

interface FilterPickerProps {
  value: string
  onChange: (filterId: string) => void
}

function FilterPicker({ value, onChange }: FilterPickerProps) {
  return (
    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,
      scrollbarWidth:"thin",scrollbarColor:"#333 transparent"}}>
      {FILTERS.map(f => {
        const sel = value===f.id
        return (
          <div key={f.id} onClick={() => onChange(f.id)} style={{
            cursor:"pointer",flexShrink:0,width:68,
            border:`2px solid ${sel?"#4dffa3":"#2a2a3e"}`,
            borderRadius:7,overflow:"hidden",background:"#0e0e1a",
          }}>
            <div style={{
              height:40,
              background:"linear-gradient(135deg,#ff4dac,#4db8ff,#ffe14d)",
              filter:f.css,
            }}/>
            <div style={{fontSize:9,textAlign:"center",padding:"3px 2px",
              color:sel?"#4dffa3":"#555",fontFamily:"monospace"}}>
              {f.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface ShapeCardProps {
  shape: Shape
  onChange: (updated: Shape) => void
  onDelete: () => void
}

function ShapeCard({ shape, onChange, onDelete }: ShapeCardProps) {
  const [tab, setTab] = useState<"fingers" | "filter">("fingers")

  const toggleFinger = (handIdx: number, fingerId: number): void => {
    const exists = shape.slots.findIndex(s => s.hand===handIdx && s.finger===fingerId)
    let slots: Slot[]
    if (exists >= 0) {
      slots = shape.slots.filter((_, i) => i !== exists)
    } else {
      if (shape.slots.length >= 4) return
      slots = [...shape.slots, {hand: handIdx, finger: fingerId}]
    }
    onChange({...shape, slots})
  }

  const h0 = shape.slots.filter(s => s.hand===0).map(s => s.finger)
  const h1 = shape.slots.filter(s => s.hand===1).map(s => s.finger)

  return (
    <div style={{background:"#0e0e1a",border:`1.5px solid ${shape.color}33`,
      borderRadius:10,marginBottom:10,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",
        background:`${shape.color}14`,borderBottom:"1px solid #1a1a2e"}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:shape.color}}/>
        <span style={{fontFamily:"monospace",fontSize:11,color:"#ccc",flex:1}}>{shape.label}</span>
        {(["fingers","filter"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontSize:10,padding:"2px 7px",borderRadius:4,border:"none",cursor:"pointer",
            background:tab===t?"#4dffa322":"transparent",
            color:tab===t?"#4dffa3":"#555",fontFamily:"monospace",
          }}>{t}</button>
        ))}
        <button onClick={onDelete} style={{
          fontSize:11,padding:"1px 6px",borderRadius:4,border:"none",cursor:"pointer",
          background:"#ff4d4d18",color:"#ff6666",fontFamily:"monospace",
        }}>✕</button>
      </div>
      {tab==="fingers" && (
        <div style={{padding:"10px"}}>
          <div style={{fontSize:10,color:"#555",marginBottom:8,fontFamily:"monospace"}}>
            Tap fingertips to set polygon corners (max 4)
          </div>
          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            <MiniHand handIdx={0} selectedFingers={h0}
              onToggle={id => toggleFinger(0, id)}/>
            <MiniHand handIdx={1} selectedFingers={h1}
              onToggle={id => toggleFinger(1, id)}/>
          </div>
          <div style={{marginTop:6,textAlign:"center",fontSize:10,
            color: shape.slots.length>=3?"#4dffa355":"#ff6655",fontFamily:"monospace"}}>
            {shape.slots.length} point{shape.slots.length!==1?"s":""} selected
            {shape.slots.length<3?" — need at least 3":""}
          </div>
        </div>
      )}
      {tab==="filter" && (
        <div style={{padding:"10px"}}>
          <div style={{fontSize:10,color:"#555",marginBottom:8,fontFamily:"monospace"}}>
            CSS filter applied inside the mask
          </div>
          <FilterPicker value={shape.filter} onChange={v => onChange({...shape, filter:v})}/>
        </div>
      )}
    </div>
  )
}

export default function VJMaskCamera() {
  const videoRef      = useRef<HTMLVideoElement>(null)
  const baseCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef    = useRef<HTMLCanvasElement>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef        = useRef<number | null>(null)

  const shapeCanvases = useRef<Record<number, HTMLCanvasElement>>({})

  const [ready,      setReady]      = useState<boolean>(false)
  const [error,      setError]      = useState<string | null>(null)
  const [shapes,     setShapes]     = useState<Shape[]>([newShape()])
  const [editorOpen, setEditorOpen] = useState<boolean>(false)

  const shapesRef = useRef<Shape[]>(shapes)
  useEffect(() => { shapesRef.current = shapes }, [shapes])

  useEffect(() => {
    let stream: MediaStream | null = null
    const setup = async (): Promise<void> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"}})
        if (videoRef.current) videoRef.current.srcObject = stream

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        )
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions:{
            modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate:"GPU",
          },
          runningMode:"VIDEO",
          numHands:2,
        })
        setReady(true)
      } catch(e) {
        setError("Camera unavailable: " + (e as Error).message)
      }
    }
    setup()
    return () => {
      stream?.getTracks().forEach(t => t.stop())
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      landmarkerRef.current?.close()
    }
  }, [])

  useEffect(() => {
    if (!ready) return

    const loop = (): void => {
      const video      = videoRef.current
      const baseCtx    = baseCanvasRef.current?.getContext("2d")
      const overlayCtx = overlayRef.current?.getContext("2d")
      const container  = containerRef.current
      const detector   = landmarkerRef.current

      if (!video || !baseCtx || !overlayCtx || !container || !detector
          || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const W = container.clientWidth
      const H = container.clientHeight

      ;([baseCanvasRef, overlayRef] as React.RefObject<HTMLCanvasElement>[]).forEach(r => {
        if (!r.current) return
        if (r.current.width  !== W) r.current.width  = W
        if (r.current.height !== H) r.current.height = H
      })

      const vw = video.videoWidth  || W
      const vh = video.videoHeight || H
      const scale = Math.max(W/vw, H/vh)
      const dw = vw * scale
      const dh = vh * scale
      const dx = (W - dw) / 2
      const dy = (H - dh) / 2

      const drawCoverMirrored = (ctx: CanvasRenderingContext2D, filterCss: string | null): void => {
        ctx.save()
        if (filterCss) ctx.filter = filterCss
        ctx.scale(-1, 1)
        ctx.drawImage(video, -(dx + dw), dy, dw, dh)
        ctx.restore()
      }

      drawCoverMirrored(baseCtx, null)

      const result = detector.detectForVideo(video, performance.now())
      const hands: Point[][] = result.landmarks.map(hand =>
        hand.map(p => ({
          x: (1 - p.x) * dw + dx,
          y: p.y * dh + dy,
        }))
      )

      const currentShapes = shapesRef.current
      currentShapes.forEach(shape => {
        if (!shapeCanvases.current[shape.id]) {
          shapeCanvases.current[shape.id] = document.createElement("canvas")
        }
        const oc = shapeCanvases.current[shape.id]
        if (oc.width  !== W) oc.width  = W
        if (oc.height !== H) oc.height = H

        const pts: Point[] = shape.slots
          .map(s => hands[s.hand]?.[s.finger] ?? null)
          .filter((p): p is Point => p !== null)

        if (pts.length < 3) return

        const poly = sortByAngle(pts)

        const oc2d = oc.getContext("2d")
        if (!oc2d) return
        oc2d.clearRect(0, 0, W, H)
        const filterCss = FILTERS.find(f => f.id===shape.filter)?.css ?? "invert(1)"
        drawCoverMirrored(oc2d, filterCss)

        baseCtx.save()
        baseCtx.beginPath()
        baseCtx.moveTo(poly[0].x, poly[0].y)
        poly.slice(1).forEach(p => baseCtx.lineTo(p.x, p.y))
        baseCtx.closePath()
        baseCtx.clip()
        baseCtx.drawImage(oc, 0, 0)
        baseCtx.restore()
      })

      overlayCtx.clearRect(0, 0, W, H)
      overlayCtx.save()

      hands.forEach(hand => {
        overlayCtx.strokeStyle = "rgba(0,255,100,0.5)"
        overlayCtx.lineWidth   = 1.5
        CONNECTIONS.forEach(([a, b]) => {
          if (!hand[a] || !hand[b]) return
          overlayCtx.beginPath()
          overlayCtx.moveTo(hand[a].x, hand[a].y)
          overlayCtx.lineTo(hand[b].x, hand[b].y)
          overlayCtx.stroke()
        })
        overlayCtx.fillStyle = "rgba(255,80,80,0.8)"
        hand.forEach(p => {
          overlayCtx.beginPath()
          overlayCtx.arc(p.x, p.y, 3, 0, Math.PI*2)
          overlayCtx.fill()
        })
      })

      currentShapes.forEach(shape => {
        const pts: Point[] = shape.slots
          .map(s => hands[s.hand]?.[s.finger] ?? null)
          .filter((p): p is Point => p !== null)
        if (pts.length < 3) return
        const poly = sortByAngle(pts)
        overlayCtx.strokeStyle = shape.color
        overlayCtx.lineWidth   = 2.5
        poly.forEach(p => {
          overlayCtx.beginPath()
          overlayCtx.arc(p.x, p.y, 7, 0, Math.PI*2)
          overlayCtx.stroke()
        })
        overlayCtx.strokeStyle = shape.color + "88"
        overlayCtx.lineWidth = 1.5
        overlayCtx.setLineDash([4, 4])
        overlayCtx.beginPath()
        overlayCtx.moveTo(poly[0].x, poly[0].y)
        poly.slice(1).forEach(p => overlayCtx.lineTo(p.x, p.y))
        overlayCtx.closePath()
        overlayCtx.stroke()
        overlayCtx.setLineDash([])
      })

      overlayCtx.restore()

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [ready])

  useEffect(() => {
    const ids = new Set(shapes.map(s => s.id))
    Object.keys(shapeCanvases.current).forEach(k => {
      if (!ids.has(Number(k))) delete shapeCanvases.current[Number(k)]
    })
  }, [shapes])

  return (
    <div ref={containerRef} style={{
      position:"fixed",inset:0,width:"100vw",height:"100vh",
      overflow:"hidden",background:"#000",
    }}>
      {error && (
        <div style={{position:"absolute",inset:0,zIndex:50,display:"flex",
          alignItems:"center",justifyContent:"center",color:"#ff6666",
          fontFamily:"monospace",fontSize:14,padding:20,textAlign:"center"}}>
          {error}
        </div>
      )}

      <video ref={videoRef} autoPlay muted playsInline
        style={{position:"absolute",width:1,height:1,opacity:0,pointerEvents:"none"}}/>

      <canvas ref={baseCanvasRef} style={{
        position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}/>

      <canvas ref={overlayRef} style={{
        position:"absolute",inset:0,width:"100%",height:"100%",
        display:"block",pointerEvents:"none"}}/>

      <button onClick={() => setEditorOpen(o => !o)} style={{
        position:"absolute",bottom:24,right:24,zIndex:100,
        width:48,height:48,borderRadius:24,
        background:editorOpen?"#4dffa3":"#12121f",
        border:"2px solid #4dffa3",
        color:editorOpen?"#000":"#4dffa3",
        fontSize:20,cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:"0 4px 20px #000a",
        transition:"background .2s,color .2s",
      }}>
        {editorOpen?"×":"⊞"}
      </button>

      {!editorOpen && shapes.length > 0 && (
        <div style={{
          position:"absolute",bottom:20,right:78,zIndex:100,
          background:"#4dffa3",color:"#000",borderRadius:8,
          padding:"2px 8px",fontSize:11,fontFamily:"monospace",fontWeight:700,
        }}>
          {shapes.length} shape{shapes.length!==1?"s":""}
        </div>
      )}

      {editorOpen && (
        <div style={{
          position:"absolute",top:0,right:0,bottom:0,width:300,zIndex:90,
          background:"rgba(6,6,16,0.96)",borderLeft:"1px solid #1a1a2e",
          display:"flex",flexDirection:"column",
        }}>
          <div style={{padding:"14px 14px 10px",borderBottom:"1px solid #1a1a2e",
            display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontFamily:"monospace",fontSize:12,color:"#4dffa3",
              fontWeight:700,letterSpacing:1,flex:1}}>SHAPE EDITOR</span>
            <button onClick={() => setShapes(s => [...s, newShape()])} style={{
              fontSize:11,padding:"4px 10px",borderRadius:6,
              border:"1.5px solid #4dffa3",cursor:"pointer",
              background:"#4dffa311",color:"#4dffa3",fontFamily:"monospace",fontWeight:700,
            }}>+ Add</button>
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"10px 10px 80px",
            scrollbarWidth:"thin",scrollbarColor:"#222 transparent"}}>
            {shapes.length===0 && (
              <div style={{color:"#333",fontFamily:"monospace",fontSize:12,
                textAlign:"center",marginTop:40,lineHeight:1.8}}>
                No shapes.<br/>Click "+ Add" to begin.
              </div>
            )}
            {shapes.map(sh => (
              <ShapeCard key={sh.id} shape={sh}
                onChange={updated => setShapes(s => s.map(x => x.id===updated.id ? updated : x))}
                onDelete={() => setShapes(s => s.filter(x => x.id!==sh.id))}/>
            ))}
          </div>

          <div style={{position:"absolute",bottom:0,left:0,right:0,
            padding:"10px 14px",borderTop:"1px solid #1a1a2e",
            background:"rgba(6,6,16,0.99)"}}>
            <button onClick={() => setEditorOpen(false)} style={{
              width:"100%",padding:"10px",borderRadius:8,
              border:"1.5px solid #4dffa3",background:"#4dffa3",
              color:"#000",fontFamily:"monospace",fontSize:12,
              fontWeight:700,cursor:"pointer",letterSpacing:1,
            }}>CLOSE EDITOR</button>
          </div>
        </div>
      )}
    </div>
  )
}