import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Download,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Check,
  Lock,
  Printer,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "./supabase";

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────
const SHUTTER_SOUND_PATH  = "/sounds/shutter.mp3";
const STORAGE_BUCKET      = "photo-results";
const TOTAL_SHOTS         = 6;
const REQUIRED_SELECTIONS = 4;
const SELECT_TIME_LIMIT   = 30;
const RESULT_TIME_LIMIT   = 60;
const READY_TIME_LIMIT    = 10;
const ADMIN_PASSWORD      = import.meta.env.VITE_ADMIN_PASSWORD || "1318";

// 촬영 캡처 해상도
const PHOTO_ASPECT_WIDTH  = 13;
const PHOTO_ASPECT_HEIGHT = 16;
const PHOTO_OUTPUT_WIDTH  = 1300;
const PHOTO_OUTPUT_HEIGHT = 1600;

// ─────────────────────────────────────────────
// Phase
// ─────────────────────────────────────────────
const PHASE = {
  WAITING:            "WAITING",
  ADMIN_LOGIN:        "ADMIN_LOGIN",
  ADMIN:              "ADMIN",
  FRAME_TYPE_SELECT:  "FRAME_TYPE_SELECT",
  BASIC_COLOR_SELECT: "BASIC_COLOR_SELECT",
  EVENT_FRAME_SELECT: "EVENT_FRAME_SELECT",
  READY:              "READY",
  CAMERA:             "CAMERA",
  COUNTDOWN:          "COUNTDOWN",
  PREVIEW:            "PREVIEW",
  SELECT:             "SELECT",
  CAPTION_INPUT:      "CAPTION_INPUT",
  RESULT:             "RESULT",
};

// ─────────────────────────────────────────────
// 프레임 설정
// ─────────────────────────────────────────────
const FRAME_COLORS = [
  { id: "purple", name: "퍼플",   emoji: "💜", bg: "#7c3aed", accent: "#ffffff", text: "#ffffff" },
  { id: "pink",   name: "핑크",   emoji: "🩷", bg: "#ec4899", accent: "#ffffff", text: "#ffffff" },
  { id: "blue",   name: "블루",   emoji: "🩵", bg: "#38bdf8", accent: "#ffffff", text: "#ffffff" },
  { id: "mint",   name: "민트",   emoji: "💚", bg: "#22c55e", accent: "#ffffff", text: "#ffffff" },
  { id: "yellow", name: "옐로우", emoji: "💛", bg: "#facc15", accent: "#ffffff", text: "#111827" },
  { id: "black",  name: "블랙",   emoji: "🖤", bg: "#111827", accent: "#ffffff", text: "#ffffff" },
  { id: "red",    name: "레드",   emoji: "❤️", bg: "#ef4444", accent: "#ffffff", text: "#ffffff" },
  { id: "rainbow",name: "스페셜", emoji: "🌈", bg: "#05030a", accent: "#ffffff", text: "#ffffff" },
];

const EVENT_FRAMES = [
  {
    id:     "noguroPixel",
    name:   "놀구로 픽셀 프레임",
    desc:   "놀구로 네컷 전용 이벤트 프레임",
    type:   "image",
    image:  "/frames/event/noguro-pixel-frame.png",
    bg:     "#87ceeb",
    accent: "#ffffff",
    text:   "#5b3415",
    dateY:  1635,
    slots: [
      { x: 105, y:  264, width: 462, height: 640 },
      { x: 621, y:  264, width: 466, height: 640 },
      { x: 105, y:  948, width: 462, height: 575 },
      { x: 621, y:  948, width: 466, height: 575 },
    ],
  },
  {
    id:          "usaEdition",
    name:        "미국편 프레임",
    desc:        "작은 지구, 놀구로 미국편 이벤트 프레임",
    type:        "image",
    image:       "/frames/event/usa-event-frame.png",
    bg:          "#d6eaf8",
    accent:      "#ffffff",
    text:        "#1a3a6b",
    noDate:      true,
    photosOnTop: true,
    slots: [
      { x:  89, y:  495, width: 498, height: 505 },
      { x: 623, y:  495, width: 495, height: 505 },
      { x:  89, y: 1031, width: 498, height: 495 },
      { x: 623, y: 1031, width: 495, height: 495 },
    ],
  },
];

// ─────────────────────────────────────────────
// 네컷 캔버스 설정
// 슬롯 좌표: 파이썬으로 실측한 값 (1200x1800 기준)
// ─────────────────────────────────────────────
const CANVAS_W = 1200;
const CANVAS_H = 1800;

// 기본 프레임용 슬롯 (2x2 균등 배치)
const BASIC_SLOTS = [
  { x:  42, y:  170, width: 520, height: 640 },
  { x: 640, y:  170, width: 520, height: 640 },
  { x:  42, y:  860, width: 520, height: 640 },
  { x: 640, y:  860, width: 520, height: 640 },
];

// 이벤트 프레임용 슬롯 (픽셀 프레임 실측값)
const EVENT_SLOTS = [
  { x: 105, y:  264, width: 462, height: 640 },
  { x: 621, y:  264, width: 466, height: 640 },
  { x: 105, y:  948, width: 462, height: 575 },
  { x: 621, y:  948, width: 466, height: 575 },
];

// ─────────────────────────────────────────────
// 캔버스 유틸
// ─────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// object-cover 방식으로 슬롯에 이미지 그리기
function drawCoverImage(ctx, img, slot, borderRadius = 20) {
  const imgRatio  = img.width / img.height;
  const slotRatio = slot.width / slot.height;

  let dw, dh, ox, oy;
  if (imgRatio > slotRatio) {
    dh = slot.height;
    dw = dh * imgRatio;
    ox = (slot.width - dw) / 2;
    oy = 0;
  } else {
    dw = slot.width;
    dh = dw / imgRatio;
    ox = 0;
    oy = (slot.height - dh) * 0.35;
  }

  ctx.save();
  roundedRect(ctx, slot.x, slot.y, slot.width, slot.height, borderRadius);
  ctx.clip();
  ctx.drawImage(img, slot.x + ox, slot.y + oy, dw, dh);
  ctx.restore();
}

// 기본 프레임 배경 그리기
function drawBasicBackground(ctx, frame) {
  if (frame.id === "rainbow") {
    const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    grad.addColorStop(0,    "#ec4899");
    grad.addColorStop(0.25, "#a855f7");
    grad.addColorStop(0.5,  "#38bdf8");
    grad.addColorStop(0.75, "#22c55e");
    grad.addColorStop(1,    "#facc15");
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = frame.bg || "#111827";
  }
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

// 기본 프레임 오버레이(텍스트+테두리) 그리기
function drawBasicOverlay(ctx, frame, captionText = "") {
  const tc = frame.text   || "#ffffff";
  const ac = frame.accent || "#ffffff";
  const bottomText = String(captionText || "").trim().slice(0, 20) || "NOLGURO NECUT";

  BASIC_SLOTS.forEach((slot) => {
    ctx.save();
    roundedRect(ctx, slot.x - 7, slot.y - 7, slot.width + 14, slot.height + 14, 28);
    ctx.strokeStyle = ac;
    ctx.lineWidth   = 10;
    ctx.stroke();
    ctx.restore();
  });

  ctx.fillStyle = tc;
  ctx.font      = "bold 78px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("NOLGURO", 70, 110);

  ctx.font = "bold 28px sans-serif";
  ctx.save();
  ctx.translate(1140, 900); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center"; ctx.fillText("NOLGURO", 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(80, 1320); ctx.rotate(Math.PI / 2);
  ctx.textAlign = "center"; ctx.fillText("NOLGURO", 0, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font      = "bold 30px sans-serif";
  ctx.fillText(bottomText, CANVAS_W / 2, 1740);
}

// 비디오에서 캡처 (화면에 보이는 것과 동일하게 13:16 크롭)
function captureFromVideo(video, mirror) {
  if (!video || video.videoWidth === 0) return null;

  const sw = video.videoWidth;
  const sh = video.videoHeight;
  const srcAspect = sw / sh;
  const tgtAspect = PHOTO_ASPECT_WIDTH / PHOTO_ASPECT_HEIGHT;

  let cropW, cropH, cropX, cropY;
  if (srcAspect > tgtAspect) {
    cropH = sh;
    cropW = sh * tgtAspect;
    cropX = (sw - cropW) / 2;
    cropY = 0;
  } else {
    cropW = sw;
    cropH = sw / tgtAspect;
    cropX = 0;
    cropY = (sh - cropH) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width  = PHOTO_OUTPUT_WIDTH;
  canvas.height = PHOTO_OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");

  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.95);
}

// 최종 네컷 이미지 합성
async function composeFinalImage(photoList, frame, captionText = "") {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");

  const isEventFrame = frame.type === "image" && Boolean(frame.image);

  if (isEventFrame) {
    // ─── 이벤트 프레임 합성 순서 ───────────────────────
    // PNG의 슬롯 구멍이 투명(alpha=0)이므로:
    // 1. 흰색 배경
    // 2. 사진을 슬롯 좌표에 그리기
    // 3. 투명 PNG 프레임을 위에 덮기 → 슬롯 구멍으로 사진이 보임

    // 1. 흰색 배경
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. 프레임 이미지 로드
    let overlayImg = null;
    try {
      overlayImg = await loadImage(frame.image);
    } catch (e) {
      console.error("이벤트 프레임 로드 실패", e);
    }

    const activeSlots = frame.slots || EVENT_SLOTS;

    if (frame.photosOnTop) {
      // 프레임 먼저, 사진을 위에 → 흰색(불투명) 박스 프레임용
      if (overlayImg) ctx.drawImage(overlayImg, 0, 0, CANVAS_W, CANVAS_H);
      for (let i = 0; i < photoList.length; i++) {
        const img  = await loadImage(photoList[i]);
        const slot = activeSlots[i];
        drawCoverImage(ctx, img, slot, 16);
      }
    } else {
      // 사진 먼저, 프레임을 위에 → 투명 구멍 프레임용 (기본)
      for (let i = 0; i < photoList.length; i++) {
        const img  = await loadImage(photoList[i]);
        const slot = activeSlots[i];
        drawCoverImage(ctx, img, slot, 16);
      }
      if (overlayImg) ctx.drawImage(overlayImg, 0, 0, CANVAS_W, CANVAS_H);
    }

  } else {
    // ─── 기본 프레임 합성 순서 ─────────────────────────
    // 1. 배경색
    drawBasicBackground(ctx, frame);

    // 2. 사진 그리기
    for (let i = 0; i < photoList.length; i++) {
      const img  = await loadImage(photoList[i]);
      const slot = BASIC_SLOTS[i];
      drawCoverImage(ctx, img, slot, 22);
    }

    // 3. 오버레이(테두리+텍스트)
    drawBasicOverlay(ctx, frame, captionText);
  }

  // 날짜 텍스트
  const today    = new Date();
  const dateText = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

  if (!frame.noDate) {
    const dateY = frame.dateY || 1668;
    ctx.fillStyle = frame.text || "#ffffff";
    ctx.font      = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(dateText, CANVAS_W / 2, dateY);
  }

  return canvas.toDataURL("image/png");
}

async function uploadToDrive(dataUrl) {
  const scriptUrl = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
  const folderId  = import.meta.env.VITE_DRIVE_FOLDER_ID;
  if (!scriptUrl || !folderId) return;

  const fileName = `noguro-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  await fetch(scriptUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ image: dataUrl, fileName, folderId }),
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime   = header.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(base64);
  const arr    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ─────────────────────────────────────────────
// 인쇄 유틸 (CP1500 / KP-108IN 용)
// ─────────────────────────────────────────────
async function buildPrintImage(sourceDataUrl) {
  const src       = await loadImage(sourceDataUrl);
  const paperW    = 1200;
  const paperH    = Math.round((paperW * 177) / 100);
  const cutH      = Math.round((paperW * 148) / 100);
  const tabH      = Math.round((paperH - cutH) / 2);

  const canvas    = document.createElement("canvas");
  canvas.width    = paperW;
  canvas.height   = paperH;
  const ctx       = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, paperW, paperH);

  const srcRatio = src.width / src.height;
  const cutRatio = paperW / cutH;
  let dw, dh;
  if (srcRatio > cutRatio) { dw = paperW; dh = dw / srcRatio; }
  else                      { dh = cutH;  dw = dh * srcRatio; }

  const dx = (paperW - dw) / 2;
  const dy = tabH + (cutH - dh) / 2;
  ctx.drawImage(src, dx, dy, dw, dh);
  return canvas.toDataURL("image/png");
}

function openPrintIframe(imageDataUrl, onStatus) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head>
    <meta charset="utf-8"/>
    <style>
      @page { size: 100mm 177mm; margin: 0; }
      html, body { margin:0; padding:0; background:#fff; }
      img { width:100mm; height:177mm; display:block; }
    </style>
  </head><body><img src="${imageDataUrl}" /></body></html>`);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    onStatus("인쇄 화면에서 Canon SELPHY CP1500을 선택하고 인쇄를 눌러 주세요.");
    setTimeout(() => document.body.removeChild(iframe), 10000);
  }, 600);
}

// ─────────────────────────────────────────────
// 공용 컴포넌트
// ─────────────────────────────────────────────
function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="mb-6 inline-flex items-center gap-2 rounded-full bg-pink-100 px-5 py-3 font-black text-pink-500 shadow-md active:scale-95"
    >
      <ArrowLeft size={22} /> 뒤로가기
    </button>
  );
}

function FrameMini({ frame }) {
  const isImg = frame.type === "image" && frame.image;
  return (
    <div
      className="mx-auto flex h-52 w-36 flex-col justify-between overflow-hidden rounded-2xl p-3 shadow-2xl"
      style={{
        background: isImg
          ? `url(${frame.image}) center/cover no-repeat, ${frame.bg || "#111827"}`
          : frame.id === "rainbow"
          ? "linear-gradient(135deg,#ec4899,#a855f7,#38bdf8,#22c55e,#facc15)"
          : frame.bg,
        border: `5px solid ${frame.accent || "#ffffff"}`,
      }}
    >
      {!isImg && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[0,1,2,3].map((i) => (
              <div key={i} className="h-16 rounded-lg border border-white/70 bg-white/20 shadow-inner" />
            ))}
          </div>
          <div className="text-xs font-black" style={{ color: frame.text || "#ffffff" }}>
            NOLGURO
          </div>
        </>
      )}
    </div>
  );
}

function CameraStage({ videoRef, goBack, dim = false, children }) {
  return (
    <section
      className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-black shadow-2xl"
      style={{
        width:  "min(94vw, calc(88dvh * 13 / 16))",
        height: "min(88dvh, calc(94vw * 16 / 13))",
      }}
    >
      {/* 비디오: scale-x-[-1] 로 좌우반전 미리보기, object-cover 로 13:16 꽉 채움 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full scale-x-[-1] object-cover transition-opacity ${dim ? "opacity-50" : "opacity-100"}`}
      />
      <button
        onClick={goBack}
        className="absolute left-5 top-5 z-10 rounded-full bg-black/60 p-4 text-white backdrop-blur active:scale-95"
      >
        <ArrowLeft size={28} />
      </button>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────
// 메인 App
// ─────────────────────────────────────────────
export default function App() {
  // ── refs ──────────────────────────────────
  const videoRef           = useRef(null);
  const streamRef          = useRef(null);
  const shutterRef         = useRef(null);
  const capturedPhotosRef  = useRef([]);
  const selectedIndexesRef = useRef([]);
  const isCreatingRef      = useRef(false);

  // ── 기본 상태 ─────────────────────────────
  const [phase,         setPhase]         = useState(PHASE.WAITING);
  const [selectedFrame, setSelectedFrame] = useState(FRAME_COLORS[0]);
  const [basicFrameEnabled, setBasicFrameEnabled] = useState(
    () => localStorage.getItem("basicFrameEnabled") !== "false"
  );
  const [eventFrameEnabled, setEventFrameEnabled] = useState(
    () => localStorage.getItem("eventFrameEnabled") !== "false"
  );
  const [mirrorResult,  setMirrorResult]  = useState(
    () => localStorage.getItem("mirrorResult") !== "false"
  );
  const [printEnabled, setPrintEnabled] = useState(
    () => localStorage.getItem("printEnabled") !== "false"
  );
  const [mainImageMode, setMainImageMode] = useState(
    () => localStorage.getItem("mainImageMode") || "default"
  );
  const [eventFrameStatus, setEventFrameStatus] = useState(() => {
    try { return JSON.parse(localStorage.getItem("eventFrameStatus") || "{}"); }
    catch { return {}; }
  });

  // ── 관리자 ────────────────────────────────
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState("");

  // ── 카메라 ────────────────────────────────
  const [cameraReady,    setCameraReady]    = useState(false);
  const [errorMessage,   setErrorMessage]   = useState("");
  const [autoShooting,   setAutoShooting]   = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [countdown,      setCountdown]      = useState(3);
  const [readyCountdown, setReadyCountdown] = useState(READY_TIME_LIMIT);
  const [flash,          setFlash]          = useState(false);

  // ── 선택 ──────────────────────────────────
  const [selectedIndexes, setSelectedIndexes] = useState([]);
  const [selectSeconds,   setSelectSeconds]   = useState(SELECT_TIME_LIMIT);
  const [isCreating,      setIsCreating]      = useState(false);
  const [captionText,     setCaptionText]     = useState("");
  const [pendingIndexes,  setPendingIndexes]  = useState([]);

  // ── 결과 ──────────────────────────────────
  const [resultUrl,    setResultUrl]    = useState("");
  const [publicUrl,    setPublicUrl]    = useState("");
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState("");
  const [resetSeconds, setResetSeconds] = useState(RESULT_TIME_LIMIT);

  // ── 인쇄 ──────────────────────────────────
  const [printStatus, setPrintStatus] = useState("");
  const [printBusy,   setPrintBusy]   = useState(false);

  // ── ref 동기화 ────────────────────────────
  useEffect(() => { capturedPhotosRef.current  = capturedPhotos;  }, [capturedPhotos]);
  useEffect(() => { selectedIndexesRef.current = selectedIndexes; }, [selectedIndexes]);
  useEffect(() => { localStorage.setItem("basicFrameEnabled", String(basicFrameEnabled)); }, [basicFrameEnabled]);
  useEffect(() => { localStorage.setItem("eventFrameEnabled", String(eventFrameEnabled)); }, [eventFrameEnabled]);
  useEffect(() => { localStorage.setItem("mirrorResult", String(mirrorResult)); }, [mirrorResult]);
  useEffect(() => { localStorage.setItem("printEnabled", String(printEnabled)); }, [printEnabled]);
  useEffect(() => { localStorage.setItem("mainImageMode", mainImageMode); }, [mainImageMode]);
  useEffect(() => { localStorage.setItem("eventFrameStatus", JSON.stringify(eventFrameStatus)); }, [eventFrameStatus]);

  const isCameraPhase = [PHASE.READY, PHASE.CAMERA, PHASE.COUNTDOWN, PHASE.PREVIEW].includes(phase);

  // ── 카메라 시작/정지 ─────────────────────
  const attachStream = useCallback(async (stream) => {
    const v = videoRef.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    await v.play();
    setCameraReady(true);
  }, []);

  const startCamera = useCallback(async () => {
    setErrorMessage("");
    try {
      if (streamRef.current) { await attachStream(streamRef.current); return; }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      await attachStream(stream);
    } catch {
      setErrorMessage("카메라 권한을 허용해 주세요.");
      setCameraReady(false);
    }
  }, [attachStream]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  // ── 셔터 사운드 초기화 ───────────────────
  useEffect(() => { shutterRef.current = new Audio(SHUTTER_SOUND_PATH); }, []);

  // ── 카메라 phase 진입 시 시작 ────────────
  useEffect(() => {
    if (isCameraPhase) startCamera();
  }, [phase]); // eslint-disable-line

  // ── READY 카운트다운 ─────────────────────
  useEffect(() => {
    if (phase !== PHASE.READY) return;
    setReadyCountdown(READY_TIME_LIMIT);
    const t = setInterval(() => {
      setReadyCountdown((p) => {
        if (p <= 1) { clearInterval(t); setAutoShooting(true); setPhase(PHASE.CAMERA); return READY_TIME_LIMIT; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // ── CAMERA 자동 촬영 ─────────────────────
  useEffect(() => {
    if (phase !== PHASE.CAMERA || !autoShooting || !cameraReady || errorMessage) return;
    const delay = capturedPhotos.length === 0 ? 800 : 1200;
    const t = setTimeout(beginCountdown, delay);
    return () => clearTimeout(t);
  }, [phase, autoShooting, cameraReady, capturedPhotos.length, errorMessage]); // eslint-disable-line

  // ── SELECT 타이머 ─────────────────────────
  useEffect(() => {
    if (phase !== PHASE.SELECT) return;
    isCreatingRef.current = false;
    setIsCreating(false);
    setSelectSeconds(SELECT_TIME_LIMIT);
    const t = setInterval(() => {
      setSelectSeconds((p) => {
        if (p <= 1) { clearInterval(t); autoCompleteSelection(); return SELECT_TIME_LIMIT; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]); // eslint-disable-line

  // ── RESULT 자동 리셋 ─────────────────────
  useEffect(() => {
    if (phase !== PHASE.RESULT) return;
    setResetSeconds(RESULT_TIME_LIMIT);
    const t = setInterval(() => {
      setResetSeconds((p) => {
        if (p <= 1) { clearInterval(t); resetAll(); return RESULT_TIME_LIMIT; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]); // eslint-disable-line

  // ─────────────────────────────────────────
  // 액션 함수
  // ─────────────────────────────────────────
  function goBack() {
    if (phase === PHASE.ADMIN_LOGIN)  { setAdminInput(""); setAdminError(""); setPhase(PHASE.WAITING); return; }
    if (phase === PHASE.ADMIN)        { setPhase(PHASE.WAITING); return; }
    if (phase === PHASE.FRAME_TYPE_SELECT) { setPhase(PHASE.WAITING); return; }
    if (phase === PHASE.BASIC_COLOR_SELECT || phase === PHASE.EVENT_FRAME_SELECT) {
      setPhase(PHASE.FRAME_TYPE_SELECT); return;
    }
    if (isCameraPhase) {
      stopCamera(); setCapturedPhotos([]); setSelectedIndexes([]); setAutoShooting(false);
      setPhase(PHASE.WAITING); return;
    }
    if (phase === PHASE.SELECT) {
      setSelectedIndexes([]); isCreatingRef.current = false; setIsCreating(false);
      setPhase(PHASE.WAITING); return;
    }
    if (phase === PHASE.CAPTION_INPUT) {
      setPendingIndexes([]);
      setCaptionText("");
      setPhase(PHASE.SELECT);
      return;
    }
    if (phase === PHASE.RESULT) resetAll();
  }

  function openAdminLogin(e) {
    e.stopPropagation();
    setAdminInput(""); setAdminError("");
    setPhase(PHASE.ADMIN_LOGIN);
  }

  function handleAdminNumber(n) {
    setAdminError("");
    setAdminInput((p) => (p.length >= 4 ? p : p + n));
  }

  function submitAdminPassword() {
    if (adminInput === ADMIN_PASSWORD) {
      setAdminInput(""); setAdminError(""); setPhase(PHASE.ADMIN); return;
    }
    setAdminError("비밀번호가 맞지 않습니다."); setAdminInput("");
  }

  function prepareShooting(frame) {
    setSelectedFrame({ bg: "#111827", accent: "#facc15", text: "#ffffff", ...frame });
    setCapturedPhotos([]); setSelectedIndexes([]);
    setPendingIndexes([]); setCaptionText("");
    setResultUrl(""); setPublicUrl(""); setUploadError("");
    isCreatingRef.current = false; setIsCreating(false);
    setErrorMessage(""); setAutoShooting(false); setCameraReady(false);
    setPrintStatus(""); setPrintBusy(false);
    setPhase(PHASE.READY);
  }

  function playShutter() {
    const s = shutterRef.current;
    if (!s) return;
    s.currentTime = 0;
    s.play().catch(() => {});
  }

  function beginCountdown() {
    if (!cameraReady || errorMessage) return;
    setCountdown(3); setPhase(PHASE.COUNTDOWN); runCountdown(3);
  }

  function runCountdown(n) {
    setCountdown(n);
    if (n <= 1) { setTimeout(shootOneCut, 900); return; }
    setTimeout(() => runCountdown(n - 1), 1000);
  }

  function shootOneCut() {
    playShutter();
    setFlash(true); setTimeout(() => setFlash(false), 180);

    const image = captureFromVideo(videoRef.current, mirrorResult);
    if (!image) { setPhase(PHASE.CAMERA); return; }

    setCapturedPhotos((prev) => {
      const next = [...prev, image];
      setPhase(PHASE.PREVIEW);
      setTimeout(() => {
        if (next.length >= TOTAL_SHOTS) { stopCamera(); setAutoShooting(false); setPhase(PHASE.SELECT); }
        else setPhase(PHASE.CAMERA);
      }, 750);
      return next;
    });
  }

  function toggleSelect(index) {
    setSelectedIndexes((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index);
      if (prev.length >= REQUIRED_SELECTIONS) return prev;
      return [...prev, index];
    });
  }

  async function autoCompleteSelection() {
    if (isCreatingRef.current) return;
    const sel    = [...selectedIndexesRef.current];
    const photos = capturedPhotosRef.current;
    for (let i = 0; i < photos.length; i++) {
      if (sel.length >= REQUIRED_SELECTIONS) break;
      if (!sel.includes(i)) sel.push(i);
    }
    await handleSelectionComplete(sel.slice(0, REQUIRED_SELECTIONS));
  }

  async function confirmSelection() {
    if (isCreatingRef.current || selectedIndexes.length !== REQUIRED_SELECTIONS) return;
    await handleSelectionComplete(selectedIndexes);
  }

  async function handleSelectionComplete(indexes) {
    const finalIndexes = indexes.slice(0, REQUIRED_SELECTIONS);
    const isEventFrame = selectedFrame.type === "image" && Boolean(selectedFrame.image);

    if (isEventFrame) {
      await createResult(finalIndexes, "");
      return;
    }

    setPendingIndexes(finalIndexes);
    setCaptionText("");
    setPhase(PHASE.CAPTION_INPUT);
  }

  async function confirmCaption() {
    if (isCreatingRef.current) return;
    if (pendingIndexes.length !== REQUIRED_SELECTIONS) return;

    await createResult(pendingIndexes, captionText);
  }

  async function createResult(indexes, customCaption = "") {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    setIsCreating(true); setUploading(true); setUploadError("");

    try {
      const photos = indexes.map((i) => capturedPhotosRef.current[i]);
      const final  = await composeFinalImage(photos, selectedFrame, customCaption);
      setResultUrl(final);

      uploadToDrive(final).catch(console.error);

      const uploaded = await uploadResultImage(final);
      setPublicUrl(uploaded);
    } catch (err) {
      console.error(err);
      setUploadError("QR 업로드에 실패했습니다. Supabase 설정을 확인해 주세요.");
    } finally {
      setUploading(false); setPhase(PHASE.RESULT);
    }
  }

  async function uploadResultImage(dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    const uuid = crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const name = `noguro-${Date.now()}-${uuid}.png`;

    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(name, blob, {
      contentType: "image/png", upsert: false,
    });
    if (error) throw error;

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(name);
    return data.publicUrl;
  }

  function downloadResult() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl; a.download = `noguro-necut-${Date.now()}.png`; a.click();
  }

  async function handlePrint() {
    if (!resultUrl || printBusy) return;
    setPrintBusy(true); setPrintStatus("출력 준비 중입니다...");
    try {
      const printImg = await buildPrintImage(resultUrl);
      setPrintStatus("인쇄 화면을 여는 중입니다...");
      setTimeout(() => openPrintIframe(printImg, setPrintStatus), 300);
    } catch (e) {
      console.error(e);
      setPrintStatus("인쇄용 이미지 생성에 실패했습니다. 다시 눌러 주세요.");
    } finally {
      setPrintBusy(false);
    }
  }

  function resetAll() {
    stopCamera();
    setPhase(PHASE.WAITING);
    setCapturedPhotos([]); setSelectedIndexes([]);
    setPendingIndexes([]); setCaptionText("");
    setResultUrl(""); setPublicUrl(""); setUploadError("");
    setUploading(false); setCountdown(3); setReadyCountdown(READY_TIME_LIMIT);
    setFlash(false); setAutoShooting(false); setErrorMessage("");
    setAdminInput(""); setAdminError("");
    isCreatingRef.current = false; setIsCreating(false);
    setPrintStatus(""); setPrintBusy(false);
  }

  // ─────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────
  return (
    <div className="min-h-screen overflow-hidden bg-[#fff7f4] text-zinc-900">
      {flash && <div className="pointer-events-none fixed inset-0 z-50 bg-white" />}

      {/* 인쇄 상태 모달 */}
      {printStatus && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2.5rem] bg-white p-8 text-center text-zinc-800 shadow-2xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 text-4xl">🖨️</div>
            <h2 className="mt-6 text-3xl font-black text-pink-500">출력 안내</h2>
            <p className="mt-5 whitespace-pre-line text-xl font-bold text-zinc-600">{printStatus}</p>
            <button
              onClick={() => setPrintStatus("")}
              className="mt-8 rounded-full bg-zinc-900 px-8 py-4 text-xl font-black text-white active:scale-95"
            >
              결과 화면으로 돌아가기
            </button>
          </div>
        </div>
      )}

      <main className={`relative z-10 flex min-h-screen items-center justify-center ${phase === PHASE.WAITING ? "p-0" : "p-6"}`}>

        {/* ── WAITING ─────────────────────────── */}
        {phase === PHASE.WAITING && (
          <section
            onClick={() => setPhase(PHASE.FRAME_TYPE_SELECT)}
            className="relative flex h-[100dvh] w-full cursor-pointer items-center justify-center overflow-hidden bg-[#fff7f4]"
          >
            <div className="relative h-full max-w-full aspect-[2/3]">
              <img
                src={mainImageMode === "event" ? "/intro/main-image-event.png" : "/intro/main-image-clean.png"}
                alt="놀구로 네컷 메인"
                draggable={false}
                className="pointer-events-none h-full w-full select-none object-contain"
              />
              <button
                onClick={openAdminLogin}
                aria-label="관리자 설정"
                className="absolute right-[4%] top-[2%] z-50 h-[5.4%] w-[8.4%] active:scale-95"
              >
                <img src="/intro/admin-button.png" alt="관리자" className="h-full w-full object-contain" />
              </button>
            </div>
          </section>
        )}

        {/* ── ADMIN LOGIN ──────────────────────── */}
        {phase === PHASE.ADMIN_LOGIN && (
          <section className="w-full max-w-xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-center shadow-2xl">
            <BackButton onClick={goBack} />
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 text-pink-500 shadow-lg">
              <Lock size={42} />
            </div>
            <h2 className="mt-6 text-4xl font-black text-pink-500">관리자 비밀번호</h2>
            <p className="mt-3 text-lg font-bold text-zinc-500">비밀번호를 입력해 주세요.</p>
            <div className="mx-auto mt-8 flex h-20 w-full max-w-sm items-center justify-center rounded-3xl border-4 border-pink-200 bg-white text-5xl font-black tracking-[0.45em] text-pink-500 shadow-inner">
              {adminInput ? "●".repeat(adminInput.length) : ""}
            </div>
            {adminError && <p className="mt-4 text-xl font-black text-red-500">{adminError}</p>}
            <div className="mx-auto mt-8 grid max-w-sm grid-cols-3 gap-4">
              {["1","2","3","4","5","6","7","8","9"].map((n) => (
                <button key={n} onClick={() => handleAdminNumber(n)}
                  className="h-20 rounded-3xl bg-white text-3xl font-black text-zinc-700 shadow-lg active:scale-95">{n}</button>
              ))}
              <button onClick={() => setAdminInput("")}
                className="h-20 rounded-3xl bg-zinc-200 text-2xl font-black text-zinc-700 shadow-lg active:scale-95">지움</button>
              <button onClick={() => handleAdminNumber("0")}
                className="h-20 rounded-3xl bg-white text-3xl font-black text-zinc-700 shadow-lg active:scale-95">0</button>
              <button onClick={submitAdminPassword}
                className="h-20 rounded-3xl bg-pink-500 text-2xl font-black text-white shadow-lg active:scale-95">확인</button>
            </div>
          </section>
        )}

        {/* ── ADMIN ────────────────────────────── */}
        {phase === PHASE.ADMIN && (
          <section className="w-full max-w-3xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 shadow-2xl">
            <BackButton onClick={goBack} />
            <h2 className="text-center text-5xl font-black text-pink-500">관리자 설정</h2>
            <div className="mt-10 flex flex-col gap-4">
              {[
                { label: "기본 프레임 활성화", desc: "OFF이면 기본 프레임이 선택 화면에서 숨겨집니다.", value: basicFrameEnabled, set: setBasicFrameEnabled },
                { label: "이벤트 프레임 활성화", desc: "OFF이면 이벤트 프레임이 선택 화면에서 숨겨집니다.", value: eventFrameEnabled, set: setEventFrameEnabled },
                { label: "최종 사진 좌우반전", desc: "ON이면 화면에서 본 모습 그대로 저장됩니다.", value: mirrorResult, set: setMirrorResult },
                { label: "인쇄 버튼 활성화", desc: "OFF이면 결과 화면에서 인쇄 버튼이 숨겨집니다.", value: printEnabled, set: setPrintEnabled },
              ].map(({ label, desc, value, set }) => (
                <div key={label} className="rounded-[2rem] border-2 border-pink-100 bg-white p-8 shadow-xl">
                  <div className="flex items-center justify-between gap-6">
                    <div>
                      <div className="text-3xl font-black text-zinc-800">{label}</div>
                      <p className="mt-2 text-lg font-bold text-zinc-500">{desc}</p>
                    </div>
                    <button
                      onClick={() => set((p) => !p)}
                      className={`rounded-full px-8 py-4 text-2xl font-black shadow-lg active:scale-95 ${value ? "bg-pink-500 text-white" : "bg-zinc-200 text-zinc-700"}`}
                    >
                      {value ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              ))}

              {/* 이벤트 프레임 개별 관리 */}
              <div className="rounded-[2rem] border-2 border-pink-100 bg-white p-8 shadow-xl">
                <div className="text-3xl font-black text-zinc-800">이벤트 프레임 관리</div>
                <p className="mt-2 text-lg font-bold text-zinc-500">각 프레임을 개별로 활성화/비활성화할 수 있습니다.</p>
                <div className="mt-6 flex flex-col gap-4">
                  {EVENT_FRAMES.map((frame) => (
                    <div key={frame.id} className="flex items-center justify-between gap-4">
                      <span className="text-xl font-black text-zinc-800">{frame.name}</span>
                      <button
                        onClick={() => setEventFrameStatus((p) => ({ ...p, [frame.id]: p[frame.id] === false ? true : false }))}
                        className={`shrink-0 rounded-full px-6 py-3 text-xl font-black shadow-lg active:scale-95 ${eventFrameStatus[frame.id] !== false ? "bg-pink-500 text-white" : "bg-zinc-200 text-zinc-700"}`}
                      >
                        {eventFrameStatus[frame.id] !== false ? "ON" : "OFF"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 메인 화면 이미지 선택 */}
              <div className="rounded-[2rem] border-2 border-pink-100 bg-white p-8 shadow-xl">
                <div className="text-3xl font-black text-zinc-800">첫 화면 이미지</div>
                <p className="mt-2 text-lg font-bold text-zinc-500">
                  선택한 화면이 첫 번째 대기 화면으로 표시됩니다.
                </p>
                <div className="mt-6 flex gap-4">
                  <button
                    onClick={() => setMainImageMode("default")}
                    className={`flex-1 rounded-full py-4 text-2xl font-black shadow-lg active:scale-95 ${mainImageMode === "default" ? "bg-pink-500 text-white" : "bg-zinc-200 text-zinc-700"}`}
                  >
                    기본화면
                  </button>
                  <button
                    onClick={() => setMainImageMode("event")}
                    className={`flex-1 rounded-full py-4 text-2xl font-black shadow-lg active:scale-95 ${mainImageMode === "event" ? "bg-pink-500 text-white" : "bg-zinc-200 text-zinc-700"}`}
                  >
                    작은지구
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── FRAME TYPE SELECT ────────────────── */}
        {phase === PHASE.FRAME_TYPE_SELECT && (
          <section className="w-full max-w-5xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-center shadow-2xl">
            <BackButton onClick={goBack} />
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 text-5xl shadow-lg">📸</div>
            <h2 className="text-5xl font-black text-pink-500">어떤 프레임으로 찍을까요?</h2>
            <p className="mt-4 text-2xl font-bold text-zinc-500">원하는 프레임을 선택해 주세요</p>
            <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
              {basicFrameEnabled && (
                <button onClick={() => setPhase(PHASE.BASIC_COLOR_SELECT)}
                  className="rounded-[2rem] border-4 border-pink-100 bg-white p-8 shadow-xl active:scale-95">
                  <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-pink-100 text-6xl">🎨</div>
                  <div className="mt-6 text-4xl font-black text-zinc-800">기본 프레임</div>
                  <p className="mt-4 text-xl font-bold text-zinc-500">원하는 색상을 골라 촬영해요</p>
                  <div className="mt-8 rounded-full bg-gradient-to-r from-pink-400 to-rose-400 px-8 py-4 text-2xl font-black text-white shadow-lg">선택하기</div>
                </button>
              )}
              {eventFrameEnabled && (
                <button onClick={() => setPhase(PHASE.EVENT_FRAME_SELECT)}
                  className="rounded-[2rem] border-4 border-yellow-100 bg-white p-8 shadow-xl active:scale-95">
                  <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-yellow-100 text-6xl">🎉</div>
                  <div className="mt-6 text-4xl font-black text-zinc-800">이벤트 프레임</div>
                  <p className="mt-4 text-xl font-bold text-zinc-500">행사 전용 프레임으로 촬영해요</p>
                  <div className="mt-8 rounded-full bg-gradient-to-r from-yellow-300 to-pink-400 px-8 py-4 text-2xl font-black text-white shadow-lg">선택하기</div>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── BASIC COLOR SELECT ───────────────── */}
        {phase === PHASE.BASIC_COLOR_SELECT && (
          <section className="w-full max-w-6xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-center shadow-2xl">
            <BackButton onClick={goBack} />
            <h2 className="text-5xl font-black text-pink-500">기본 프레임 색상을 선택하세요</h2>
            <p className="mt-4 text-xl font-bold text-zinc-500">선택한 색상으로 네컷 프레임이 만들어져요</p>
            <div className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4">
              {FRAME_COLORS.map((frame) => (
                <button key={frame.id} onClick={() => prepareShooting(frame)}
                  className="rounded-[2rem] border-4 border-white bg-white p-5 shadow-xl active:scale-95">
                  <FrameMini frame={frame} />
                  <div className="mt-4 text-2xl font-black text-zinc-800">{frame.emoji} {frame.name}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── EVENT FRAME SELECT ───────────────── */}
        {phase === PHASE.EVENT_FRAME_SELECT && (
          <section className="w-full max-w-5xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-center shadow-2xl">
            <BackButton onClick={goBack} />
            <h2 className="text-5xl font-black text-pink-500">이벤트 프레임을 선택하세요</h2>
            <p className="mt-4 text-xl font-bold text-zinc-500">이벤트 프레임은 색상이 고정됩니다</p>
            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {EVENT_FRAMES.filter((f) => eventFrameStatus[f.id] !== false).map((frame) => (
                <button key={frame.id} onClick={() => prepareShooting(frame)}
                  className="rounded-[2rem] border-4 border-yellow-100 bg-white p-6 shadow-xl active:scale-95">
                  <FrameMini frame={frame} />
                  <div className="mt-5 text-2xl font-black text-zinc-800">{frame.name}</div>
                  <div className="mt-2 font-bold text-zinc-500">{frame.desc}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── CAMERA PHASES ────────────────────── */}
        {isCameraPhase && (
          <CameraStage videoRef={videoRef} goBack={goBack} dim={phase === PHASE.READY}>

            {phase === PHASE.READY && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-center text-white backdrop-blur-sm">
                <div className="text-5xl font-black">잠시 후 사진을 찍겠습니다</div>
                <p className="mt-5 text-2xl text-white/75">화면을 보고 포즈를 준비해 주세요</p>
                <div className="mt-10 flex h-48 w-48 items-center justify-center rounded-full border-[12px] border-pink-400 text-8xl font-black text-white shadow-2xl">
                  {readyCountdown}
                </div>
              </div>
            )}

            {[PHASE.CAMERA, PHASE.COUNTDOWN, PHASE.PREVIEW].includes(phase) && (
              <>
                <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-black/70 px-6 py-3 text-xl font-bold text-white backdrop-blur">
                  CUT {Math.min(capturedPhotos.length + 1, TOTAL_SHOTS)} / {TOTAL_SHOTS}
                </div>

                {errorMessage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/85 px-8 text-center text-white">
                    <div className="text-3xl font-bold">{errorMessage}</div>
                  </div>
                )}

                {phase === PHASE.CAMERA && !errorMessage && (
                  <div className="absolute bottom-8 left-1/2 w-[90%] max-w-xl -translate-x-1/2 text-center">
                    <div className="w-full rounded-full bg-white/70 py-5 text-3xl font-black text-black shadow-xl">
                      자동 촬영 진행 중
                    </div>
                    <p className="mt-4 rounded-full bg-black/55 px-6 py-3 text-lg text-white/85 backdrop-blur">
                      총 6장을 촬영합니다
                    </p>
                  </div>
                )}

                {phase === PHASE.COUNTDOWN && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
                    <div className="relative flex h-72 w-72 items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-[12px] border-white/70 shadow-[0_0_40px_rgba(0,0,0,0.45)]" />
                      <div
                        className="text-[9rem] font-black leading-none"
                        style={{
                          textShadow:
                            "0 6px 18px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.65)",
                        }}
                      >
                        {countdown}
                      </div>
                    </div>
                  </div>
                )}

                {phase === PHASE.PREVIEW && capturedPhotos.length > 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 text-white backdrop-blur-sm">
                    <img
                      src={capturedPhotos[capturedPhotos.length - 1]}
                      alt="방금 찍은 사진"
                      className="max-h-[60vh] rounded-3xl border-4 border-white object-contain shadow-2xl"
                    />
                    <div className="mt-8 text-4xl font-black text-pink-200">
                      {capturedPhotos.length}번째 컷 완료!
                    </div>
                    <p className="mt-3 text-2xl text-white/80">다음 포즈 준비!</p>
                  </div>
                )}
              </>
            )}
          </CameraStage>
        )}

        {/* ── SELECT ───────────────────────────── */}
        {phase === PHASE.SELECT && (
          <section className="w-full max-w-6xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 shadow-2xl">
            <BackButton onClick={goBack} />
            <div className="flex items-center justify-between gap-6">
              <div>
                <h2 className="text-4xl font-black text-pink-500">마음에 드는 사진 4장을 선택하세요</h2>
                <p className="mt-2 text-lg font-bold text-zinc-500">선택한 순서대로 네컷에 들어갑니다.</p>
              </div>
              <div className="shrink-0 rounded-3xl bg-white px-8 py-5 text-center shadow-lg">
                <div className="font-bold text-zinc-500">남은 시간</div>
                <div className="text-5xl font-black text-pink-500">00:{String(selectSeconds).padStart(2, "0")}</div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-5">
              {capturedPhotos.map((photo, index) => {
                const order    = selectedIndexes.indexOf(index) + 1;
                const selected = order > 0;
                return (
                  <button key={index} onClick={() => toggleSelect(index)}
                    className={`relative overflow-hidden rounded-3xl border-4 bg-white transition active:scale-95 ${
                      selected ? "border-pink-400 shadow-[0_0_30px_rgba(236,72,153,0.45)]" : "border-white"
                    }`}
                  >
                    <img src={photo} alt={`촬영 ${index + 1}`} className="aspect-[13/16] w-full object-cover" />
                    {selected && (
                      <div className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full bg-pink-500 text-2xl font-black text-white shadow-lg">
                        {order}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={confirmSelection}
              disabled={selectedIndexes.length !== REQUIRED_SELECTIONS || isCreating}
              className={`mt-8 flex w-full items-center justify-center gap-3 rounded-full py-5 text-3xl font-black shadow-xl active:scale-95 ${
                selectedIndexes.length === REQUIRED_SELECTIONS && !isCreating
                  ? "bg-gradient-to-r from-pink-400 to-rose-400 text-white"
                  : "bg-zinc-200 text-zinc-400"
              }`}
            >
              <Check size={32} />
              {isCreating ? "결과 만드는 중..." : `${selectedIndexes.length}/4 선택 완료`}
            </button>
          </section>
        )}

        {/* ── CAPTION INPUT ───────────────────── */}
        {phase === PHASE.CAPTION_INPUT && (
          <section className="w-full max-w-4xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-center shadow-2xl">
            <BackButton onClick={goBack} />

            <h2 className="text-5xl font-black text-pink-500">문구를 입력하세요</h2>
            <p className="mt-4 text-xl font-bold text-zinc-500">
              기본 프레임 하단에 들어갈 문구예요. 최대 20자까지 입력할 수 있어요.
            </p>

            <div className="mt-10 rounded-[2rem] bg-white p-6 shadow-xl">
              <input
                value={captionText}
                onChange={(event) => setCaptionText(event.target.value.slice(0, 20))}
                maxLength={20}
                autoFocus
                placeholder="예) 오늘 우리 최고!"
                className="w-full rounded-3xl border-4 border-pink-100 bg-[#fff7f4] px-6 py-6 text-center text-4xl font-black text-zinc-800 outline-none focus:border-pink-400"
              />

              <div className="mt-4 text-lg font-black text-zinc-400">
                {captionText.length}/20
              </div>
            </div>

            <div className="mt-8 rounded-3xl bg-white px-8 py-6 text-center shadow-lg">
              <div className="text-lg font-bold text-zinc-400">미리보기</div>
              <div className="mt-2 text-3xl font-black text-zinc-800">
                {captionText.trim() || "NOLGURO NECUT"}
              </div>
            </div>

            <button
              onClick={confirmCaption}
              disabled={isCreating}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-pink-400 to-rose-400 py-5 text-3xl font-black text-white shadow-xl active:scale-95 disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              <Check size={32} />
              {isCreating ? "결과 만드는 중..." : "이 문구로 만들기"}
            </button>

            <button
              onClick={() => {
                setCaptionText("");
                confirmCaption();
              }}
              disabled={isCreating}
              className="mt-4 text-lg font-bold text-zinc-500 underline active:scale-95"
            >
              문구 없이 기본 문구로 만들기
            </button>
          </section>
        )}

        {/* ── RESULT ───────────────────────────── */}
        {phase === PHASE.RESULT && (
          <section className="grid w-full max-w-6xl grid-cols-1 gap-8 rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 shadow-2xl md:grid-cols-[1fr_1fr]">

            {/* 완성 사진 */}
            <div className="flex items-center justify-center rounded-3xl bg-white p-5 shadow-xl">
              {resultUrl && (
                <img src={resultUrl} alt="완성된 네컷"
                  className="max-h-[75vh] rounded-2xl object-contain shadow-2xl" />
              )}
            </div>

            {/* 우측 액션 */}
            <div className="flex flex-col items-center justify-center text-center">
              <Sparkles className="mb-5 text-pink-400" size={46} />
              <h2 className="text-4xl font-black text-pink-500">네컷 완성!</h2>
              <p className="mt-4 text-2xl font-bold text-zinc-600">
                휴대폰 카메라로 QR을 찍어 사진을 저장하세요
              </p>

              {/* QR 코드 */}
              <div className="mt-8 rounded-3xl bg-white p-5 shadow-2xl">
                <QRCodeCanvas value={publicUrl || "업로드 중..."} size={220} includeMargin />
              </div>
              {uploading && (
                <p className="mt-3 text-lg font-bold text-pink-500">QR 링크 생성 중...</p>
              )}
              {uploadError && (
                <p className="mt-3 max-w-sm text-base font-bold text-red-500">{uploadError}</p>
              )}

              {/* 버튼 그룹 */}
              <div className="mt-7 flex w-full flex-col gap-3">
                <button
                  onClick={downloadResult}
                  className="flex w-full items-center justify-center gap-3 rounded-full bg-zinc-900 py-4 text-xl font-black text-white active:scale-95"
                >
                  <Download size={22} /> 이 기기에 저장하기
                </button>

                {printEnabled && (
                  <button
                    onClick={handlePrint}
                    disabled={!resultUrl || printBusy}
                    className="flex w-full items-center justify-center gap-3 rounded-full bg-pink-500 py-4 text-xl font-black text-white shadow-lg active:scale-95 disabled:bg-zinc-200 disabled:text-zinc-400"
                  >
                    <Printer size={22} />
                    {printBusy ? "준비 중..." : "🖨️ 인쇄하기 (CP1500)"}
                  </button>
                )}
              </div>

              {/* 남은 시간 */}
              <div className="mt-8 rounded-3xl bg-white px-12 py-6 shadow-lg">
                <div className="font-bold text-zinc-500">남은 시간</div>
                <div className="mt-1 text-6xl font-black text-pink-500">
                  00:{String(resetSeconds).padStart(2, "0")}
                </div>
              </div>

              <button onClick={resetAll}
                className="mt-6 inline-flex items-center gap-2 font-bold text-zinc-500 underline active:scale-95">
                <RotateCcw size={18} /> 처음 화면으로 돌아가기
              </button>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
