import React, { useEffect, useRef, useState } from "react";
import {
  Download,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Check,
  Lock,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "./supabase";

const SHUTTER_SOUND_PATH = "/sounds/shutter.mp3";
const STORAGE_BUCKET = "photo-results";

const TOTAL_SHOTS = 6;
const REQUIRED_SELECTIONS = 4;
const SELECT_TIME_LIMIT = 30;
const RESULT_TIME_LIMIT = 60;
const READY_TIME_LIMIT = 10;
const ADMIN_PASSWORD = "1318";
const PHOTO_ASPECT_WIDTH = 13;
const PHOTO_ASPECT_HEIGHT = 16;
const PHOTO_OUTPUT_WIDTH = 1300;
const PHOTO_OUTPUT_HEIGHT = 1600;

const PHASE = {
  WAITING: "WAITING",
  ADMIN_LOGIN: "ADMIN_LOGIN",
  ADMIN: "ADMIN",
  FRAME_TYPE_SELECT: "FRAME_TYPE_SELECT",
  BASIC_COLOR_SELECT: "BASIC_COLOR_SELECT",
  EVENT_FRAME_SELECT: "EVENT_FRAME_SELECT",
  READY: "READY",
  CAMERA: "CAMERA",
  COUNTDOWN: "COUNTDOWN",
  PREVIEW: "PREVIEW",
  SELECT: "SELECT",
  RESULT: "RESULT",
};

const FRAME_COLORS = [
  { id: "purple", name: "퍼플", emoji: "💜", bg: "#7c3aed", accent: "#ffffff", text: "#ffffff" },
  { id: "pink", name: "핑크", emoji: "🩷", bg: "#ec4899", accent: "#ffffff", text: "#ffffff" },
  { id: "blue", name: "블루", emoji: "🩵", bg: "#38bdf8", accent: "#ffffff", text: "#ffffff" },
  { id: "mint", name: "민트", emoji: "💚", bg: "#22c55e", accent: "#ffffff", text: "#ffffff" },
  { id: "yellow", name: "옐로우", emoji: "💛", bg: "#facc15", accent: "#ffffff", text: "#111827" },
  { id: "black", name: "블랙", emoji: "🖤", bg: "#111827", accent: "#ffffff", text: "#ffffff" },
  { id: "red", name: "레드", emoji: "❤️", bg: "#ef4444", accent: "#ffffff", text: "#ffffff" },
  { id: "rainbow", name: "스페셜", emoji: "🌈", bg: "#05030a", accent: "#ffffff", text: "#ffffff" },
];

const EVENT_FRAMES = [
  {
    id: "noguroPixel",
    name: "놀구로 픽셀 프레임",
    desc: "놀구로 네컷 전용 이벤트 프레임",
    type: "image",
    image: "/frames/event/noguro-pixel-frame.png",
    bg: "#ffffff",
    accent: "#ffffff",
    text: "#5b3415",
    dateY: 1648,
    event: true,
  },
];

const FOUR_CUT_CONFIG = {
  canvasWidth: 1200,
  canvasHeight: 1800,
  slots: [
    { x: 42, y: 170, width: 520, height: 640 },
    { x: 640, y: 170, width: 520, height: 640 },
    { x: 42, y: 860, width: 520, height: 640 },
    { x: 640, y: 860, width: 520, height: 640 },
  ],
};

export default function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const shutterRef = useRef(null);
  const capturedPhotosRef = useRef([]);
  const selectedIndexesRef = useRef([]);
  const isCreatingResultRef = useRef(false);

  const [phase, setPhase] = useState(PHASE.WAITING);
  const [selectedFrame, setSelectedFrame] = useState(FRAME_COLORS[0]);
  const [mirrorResult, setMirrorResult] = useState(
    () => localStorage.getItem("mirrorResult") !== "false"
  );

  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState("");
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [selectedIndexes, setSelectedIndexes] = useState([]);
  const [countdown, setCountdown] = useState(3);
  const [readyCountdown, setReadyCountdown] = useState(READY_TIME_LIMIT);
  const [flash, setFlash] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isCreatingResult, setIsCreatingResult] = useState(false);
  const [printStatus, setPrintStatus] = useState("");
  const [printImageUrl, setPrintImageUrl] = useState("");
  const [resetSeconds, setResetSeconds] = useState(RESULT_TIME_LIMIT);
  const [selectSeconds, setSelectSeconds] = useState(SELECT_TIME_LIMIT);
  const [cameraReady, setCameraReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [autoShooting, setAutoShooting] = useState(false);

  const isCameraPhase = [
    PHASE.READY,
    PHASE.CAMERA,
    PHASE.COUNTDOWN,
    PHASE.PREVIEW,
  ].includes(phase);

  useEffect(() => {
    capturedPhotosRef.current = capturedPhotos;
  }, [capturedPhotos]);

  useEffect(() => {
    selectedIndexesRef.current = selectedIndexes;
  }, [selectedIndexes]);

  useEffect(() => {
    shutterRef.current = new Audio(SHUTTER_SOUND_PATH);
  }, []);

  useEffect(() => {
    localStorage.setItem("mirrorResult", String(mirrorResult));
  }, [mirrorResult]);

  useEffect(() => {
    if (isCameraPhase) startCamera();
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.READY) return;
    setReadyCountdown(READY_TIME_LIMIT);

    const timer = setInterval(() => {
      setReadyCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setAutoShooting(true);
          setPhase(PHASE.CAMERA);
          return READY_TIME_LIMIT;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.CAMERA) return;
    if (!autoShooting) return;
    if (!cameraReady) return;
    if (errorMessage) return;

    const timer = setTimeout(() => {
      // beginCountdown은 현재 phase/cameraReady/errorMessage 값을 기준으로 다시 한 번 검사합니다.
      beginCountdown();
    }, capturedPhotos.length === 0 ? 800 : 1200);

    return () => clearTimeout(timer);
  }, [phase, autoShooting, cameraReady, capturedPhotos.length, errorMessage]);

  useEffect(() => {
    if (phase !== PHASE.SELECT) return;
    setSelectSeconds(SELECT_TIME_LIMIT);

    const timer = setInterval(() => {
      setSelectSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          autoCompleteSelection();
          return SELECT_TIME_LIMIT;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.RESULT) return;
    setResetSeconds(RESULT_TIME_LIMIT);

    const timer = setInterval(() => {
      setResetSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          resetAll();
          return RESULT_TIME_LIMIT;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  async function attachStreamToVideo(stream) {
    const video = videoRef.current;
    if (!video) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    await video.play();
    setCameraReady(true);
  }

  async function startCamera() {
    try {
      setErrorMessage("");

      if (streamRef.current) {
        await attachStreamToVideo(streamRef.current);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: false,
      });

      streamRef.current = stream;
      await attachStreamToVideo(stream);
    } catch (error) {
      console.error(error);
      setErrorMessage("카메라 권한을 허용해 주세요.");
      setCameraReady(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
  }

  function goBack() {
    if (phase === PHASE.ADMIN_LOGIN) {
      setAdminInput("");
      setAdminError("");
      setPhase(PHASE.WAITING);
      return;
    }

    if (phase === PHASE.ADMIN) {
      setPhase(PHASE.WAITING);
      return;
    }

    if (phase === PHASE.FRAME_TYPE_SELECT) {
      setPhase(PHASE.WAITING);
      return;
    }

    if (phase === PHASE.BASIC_COLOR_SELECT || phase === PHASE.EVENT_FRAME_SELECT) {
      setPhase(PHASE.FRAME_TYPE_SELECT);
      return;
    }

    if (isCameraPhase) {
      stopCamera();
      setCapturedPhotos([]);
      setSelectedIndexes([]);
      setAutoShooting(false);
      setPhase(PHASE.WAITING);
      return;
    }

    if (phase === PHASE.SELECT) {
      setSelectedIndexes([]);
      isCreatingResultRef.current = false;
      setIsCreatingResult(false);
      setPhase(PHASE.WAITING);
      return;
    }

    if (phase === PHASE.RESULT) {
      resetAll();
    }
  }

  function openAdminLogin(event) {
    event.stopPropagation();
    setAdminInput("");
    setAdminError("");
    setPhase(PHASE.ADMIN_LOGIN);
  }

  function handleAdminNumber(number) {
    setAdminError("");
    setAdminInput((prev) => {
      if (prev.length >= 4) return prev;
      return prev + number;
    });
  }

  function clearAdminInput() {
    setAdminInput("");
    setAdminError("");
  }

  function submitAdminPassword() {
    if (adminInput === ADMIN_PASSWORD) {
      setAdminInput("");
      setAdminError("");
      setPhase(PHASE.ADMIN);
      return;
    }

    setAdminError("비밀번호가 맞지 않습니다.");
    setAdminInput("");
  }

  function prepareShooting(frame) {
    setSelectedFrame({
      ...frame,
      bg: frame.bg || "#111827",
      accent: frame.accent || "#facc15",
      text: frame.text || "#ffffff",
    });

    setCapturedPhotos([]);
    setSelectedIndexes([]);
    setResultUrl("");
    setPublicUrl("");
    setUploadError("");
    isCreatingResultRef.current = false;
    setIsCreatingResult(false);
    setErrorMessage("");
    setAutoShooting(false);
    setCameraReady(false);
    setPhase(PHASE.READY);
  }

  function playShutter() {
    const sound = shutterRef.current;
    if (!sound) return;

    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  function captureFromVideo() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;

    // 최종 네컷 사진칸 비율(13:16)에 맞춰 원본 영상을 중앙 크롭합니다.
    // 이렇게 해야 촬영 화면, 선택 화면, 최종 결과물의 구도가 최대한 같아집니다.
    const targetAspect = PHOTO_ASPECT_WIDTH / PHOTO_ASPECT_HEIGHT;
    const sourceAspect = sourceWidth / sourceHeight;

    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    let cropX = 0;
    let cropY = 0;

    if (sourceAspect > targetAspect) {
      cropHeight = sourceHeight;
      cropWidth = sourceHeight * targetAspect;
      cropX = (sourceWidth - cropWidth) / 2;
      cropY = 0;
    } else {
      cropWidth = sourceWidth;
      cropHeight = sourceWidth / targetAspect;
      cropX = 0;
      cropY = (sourceHeight - cropHeight) / 2;
    }

    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_OUTPUT_WIDTH;
    canvas.height = PHOTO_OUTPUT_HEIGHT;

    const ctx = canvas.getContext("2d");

    if (mirrorResult) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(
      video,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL("image/jpeg", 0.95);
  }

  function beginCountdown() {
    if (!cameraReady || errorMessage) return;
    setCountdown(3);
    setPhase(PHASE.COUNTDOWN);
    runCountdown(3);
  }

  function runCountdown(number) {
    setCountdown(number);

    if (number <= 1) {
      setTimeout(shootOneCut, 900);
      return;
    }

    setTimeout(() => runCountdown(number - 1), 1000);
  }

  function shootOneCut() {
    playShutter();
    setFlash(true);
    setTimeout(() => setFlash(false), 180);

    const image = captureFromVideo();

    if (!image) {
      setPhase(PHASE.CAMERA);
      return;
    }

    setCapturedPhotos((prev) => {
      const next = [...prev, image];
      setPhase(PHASE.PREVIEW);

      setTimeout(() => {
        if (next.length >= TOTAL_SHOTS) {
          stopCamera();
          setAutoShooting(false);
          setPhase(PHASE.SELECT);
        } else {
          setPhase(PHASE.CAMERA);
        }
      }, 750);

      return next;
    });
  }

  function toggleSelect(index) {
    setSelectedIndexes((prev) => {
      if (prev.includes(index)) {
        return prev.filter((item) => item !== index);
      }

      if (prev.length >= REQUIRED_SELECTIONS) return prev;
      return [...prev, index];
    });
  }

  async function autoCompleteSelection() {
    if (isCreatingResultRef.current) return;

    const currentSelected = selectedIndexesRef.current;
    const currentPhotos = capturedPhotosRef.current;
    const completed = [...currentSelected];

    for (let i = 0; i < currentPhotos.length; i++) {
      if (completed.length >= REQUIRED_SELECTIONS) break;
      if (!completed.includes(i)) completed.push(i);
    }

    await createResult(completed.slice(0, REQUIRED_SELECTIONS));
  }

  async function confirmSelection() {
    if (isCreatingResultRef.current) return;
    if (selectedIndexes.length !== REQUIRED_SELECTIONS) return;
    await createResult(selectedIndexes);
  }

  async function createResult(indexes) {
    if (isCreatingResultRef.current) return;

    isCreatingResultRef.current = true;
    setIsCreatingResult(true);
    setUploading(true);
    setUploadError("");

    try {
      const selectedPhotos = indexes.map((index) => capturedPhotosRef.current[index]);
      const finalImage = await composeFinalImage(selectedPhotos);
      setResultUrl(finalImage);
      const uploadedUrl = await uploadResultImage(finalImage);
      setPublicUrl(uploadedUrl);
    } catch (error) {
      console.error(error);
      setUploadError("QR 저장용 업로드에 실패했습니다. Supabase 설정을 확인해 주세요.");
    } finally {
      setUploading(false);
      setPhase(PHASE.RESULT);
    }
  }

  function dataUrlToBlob(dataUrl) {
    const [header, base64] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)?.[1] || "image/png";
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }

    return new Blob([array], { type: mime });
  }

  async function uploadResultImage(dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    const uuid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

    const fileName = `noguro-${Date.now()}-${uuid}.png`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, blob, {
        contentType: "image/png",
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function drawCoverImage(ctx, img, slot) {
    const imgRatio = img.width / img.height;
    const slotRatio = slot.width / slot.height;

    let drawWidth;
    let drawHeight;
    let offsetX;
    let offsetY;

    if (imgRatio > slotRatio) {
      drawHeight = slot.height;
      drawWidth = drawHeight * imgRatio;
      offsetX = (slot.width - drawWidth) / 2;
      offsetY = 0;
    } else {
      drawWidth = slot.width;
      drawHeight = drawWidth / imgRatio;
      offsetX = 0;
      offsetY = (slot.height - drawHeight) * 0.38;
    }

    ctx.save();
    roundedRect(ctx, slot.x, slot.y, slot.width, slot.height, 24);
    ctx.clip();
    ctx.drawImage(img, slot.x + offsetX, slot.y + offsetY, drawWidth, drawHeight);
    ctx.restore();
  }

  function drawFrameBackground(ctx, frame) {
    const { canvasWidth, canvasHeight } = FOUR_CUT_CONFIG;

    if (frame.id === "rainbow") {
      const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
      gradient.addColorStop(0, "#ec4899");
      gradient.addColorStop(0.25, "#a855f7");
      gradient.addColorStop(0.5, "#38bdf8");
      gradient.addColorStop(0.75, "#22c55e");
      gradient.addColorStop(1, "#facc15");
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = frame.bg || "#05030a";
    }

    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  function drawBasicFrameOverlay(ctx, frame) {
    const { canvasWidth, slots } = FOUR_CUT_CONFIG;
    const textColor = frame.text || "#ffffff";
    const accentColor = frame.accent || "#ffffff";

    slots.forEach((slot) => {
      ctx.save();
      roundedRect(ctx, slot.x - 7, slot.y - 7, slot.width + 14, slot.height + 14, 30);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.restore();
    });

    ctx.fillStyle = textColor;
    ctx.font = "bold 78px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("NOLGURO", 70, 105);

    ctx.font = "bold 28px sans-serif";

    ctx.save();
    ctx.translate(1128, 900);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("NOLGURO", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(95, 1320);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("NOLGURO", 0, 0);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("NOLGURO NECUT", canvasWidth / 2, 1725);
  }

  function makeEventOverlayTransparent(sourceImage) {
    const { canvasWidth, canvasHeight, slots } = FOUR_CUT_CONFIG;

    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = canvasWidth;
    overlayCanvas.height = canvasHeight;

    const overlayCtx = overlayCanvas.getContext("2d");
    overlayCtx.drawImage(sourceImage, 0, 0, canvasWidth, canvasHeight);

    const imageData = overlayCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;

    slots.forEach((slot) => {
      const startX = Math.max(0, Math.floor(slot.x));
      const startY = Math.max(0, Math.floor(slot.y));
      const endX = Math.min(canvasWidth, Math.ceil(slot.x + slot.width));
      const endY = Math.min(canvasHeight, Math.ceil(slot.y + slot.height));

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const index = (y * canvasWidth + x) * 4;
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const alpha = data[index + 3];

          if (alpha === 0) continue;

          const maxColor = Math.max(red, green, blue);
          const minColor = Math.min(red, green, blue);
          const average = (red + green + blue) / 3;

          const isTransparentSlotBackground =
            (maxColor - minColor < 45 && average > 145) ||
            (red > 210 && green > 210 && blue > 210);

          if (isTransparentSlotBackground) {
            data[index + 3] = 0;
          }
        }
      }
    });

    overlayCtx.putImageData(imageData, 0, 0);
    return overlayCanvas;
  }

  async function drawEventImageFrame(ctx, frame) {
    if (!frame.image) return false;

    try {
      const overlay = await loadImage(frame.image);
      const overlayCanvas = makeEventOverlayTransparent(overlay);
      ctx.drawImage(
        overlayCanvas,
        0,
        0,
        FOUR_CUT_CONFIG.canvasWidth,
        FOUR_CUT_CONFIG.canvasHeight
      );
      return true;
    } catch (error) {
      console.error("이벤트 프레임 이미지를 불러오지 못했습니다.", error);
      return false;
    }
  }

  async function composeFinalImage(photoList) {
    const canvas = document.createElement("canvas");
    canvas.width = FOUR_CUT_CONFIG.canvasWidth;
    canvas.height = FOUR_CUT_CONFIG.canvasHeight;

    const ctx = canvas.getContext("2d");

    const isImageEventFrame =
      selectedFrame.type === "image" && Boolean(selectedFrame.image);

    drawFrameBackground(ctx, selectedFrame);

    for (let i = 0; i < photoList.length; i++) {
      const img = await loadImage(photoList[i]);
      const slot = FOUR_CUT_CONFIG.slots[i];
      drawCoverImage(ctx, img, slot);
    }

    if (isImageEventFrame) {
      const success = await drawEventImageFrame(ctx, selectedFrame);
      if (!success) {
        drawBasicFrameOverlay(ctx, selectedFrame);
      }
    } else {
      drawBasicFrameOverlay(ctx, selectedFrame);
    }

    const today = new Date();
    const dateText = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
    const dateY = selectedFrame.dateY || 1668;

    ctx.fillStyle = selectedFrame.text || "#ffffff";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(dateText, canvas.width / 2, dateY);

    return canvas.toDataURL("image/png");
  }

  function downloadResult() {
    if (!resultUrl) return;

    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `noguro-necut-${Date.now()}.png`;
    a.click();
  }

  async function handlePrintResult() {
    if (!resultUrl) return;

    try {
      setPrintStatus("출력 준비 중입니다");

      const cp1500Image = await createCp1500PrintImage(resultUrl);
      setPrintImageUrl(cp1500Image);

      setPrintStatus("Android 인쇄창을 여는 중입니다");

      setTimeout(() => {
        openPrintWindow(cp1500Image);
      }, 300);
    } catch (error) {
      console.error(error);
      setPrintStatus("인쇄용 이미지를 만들지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function createCp1500PrintImage(sourceDataUrl) {
    const sourceImage = await loadImage(sourceDataUrl);

    // KP-108IN 기준
    // 재단 전: 약 100 x 177mm
    // 재단 후: 약 100 x 148mm
    // 화면/QR용 결과 이미지는 그대로 유지하고,
    // 인쇄용 이미지만 위아래 절단면 영역을 추가한 별도 캔버스로 만듭니다.
    const paperWidth = 1200;
    const paperHeight = Math.round((paperWidth * 177) / 100);
    const cutAreaWidth = paperWidth;
    const cutAreaHeight = Math.round((paperWidth * 148) / 100);
    const tabHeight = Math.round((paperHeight - cutAreaHeight) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = paperWidth;
    canvas.height = paperHeight;

    const ctx = canvas.getContext("2d");

    // 절단면은 흰색으로 둡니다.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, paperWidth, paperHeight);

    const sourceRatio = sourceImage.width / sourceImage.height;
    const cutRatio = cutAreaWidth / cutAreaHeight;

    let drawWidth;
    let drawHeight;

    // 기존 네컷 결과물 비율은 유지하면서,
    // 재단 후 남는 100 x 148 영역 안에 최대한 크게 넣습니다.
    if (sourceRatio > cutRatio) {
      drawWidth = cutAreaWidth;
      drawHeight = drawWidth / sourceRatio;
    } else {
      drawHeight = cutAreaHeight;
      drawWidth = drawHeight * sourceRatio;
    }

    const drawX = (paperWidth - drawWidth) / 2;
    const drawY = tabHeight + (cutAreaHeight - drawHeight) / 2;

    ctx.drawImage(sourceImage, drawX, drawY, drawWidth, drawHeight);

    return canvas.toDataURL("image/png");
  }

  function openPrintWindow(imageDataUrl) {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setPrintStatus("인쇄창이 차단되었습니다. 브라우저 팝업 허용 후 다시 눌러 주세요.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>놀구로 네컷 인쇄</title>
          <style>
            @page {
              size: 100mm 177mm;
              margin: 0;
            }

            html,
            body {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
              background: #ffffff;
            }

            body {
              display: flex;
              align-items: center;
              justify-content: center;
            }

            img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>
          <img src="${imageDataUrl}" alt="놀구로 네컷 인쇄 이미지" />
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      setPrintStatus("인쇄창에서 Canon SELPHY CP1500을 선택하고 인쇄를 눌러 주세요.");
    }, 700);
  }

  function resetAll() {
    stopCamera();

    setPhase(PHASE.WAITING);
    setCapturedPhotos([]);
    setSelectedIndexes([]);
    setResultUrl("");
    setPublicUrl("");
    setUploadError("");
    setUploading(false);
    setPrintStatus("");
    setPrintImageUrl("");
    isCreatingResultRef.current = false;
    setIsCreatingResult(false);
    setCountdown(3);
    setReadyCountdown(READY_TIME_LIMIT);
    setFlash(false);
    setErrorMessage("");
    setAutoShooting(false);
    setAdminInput("");
    setAdminError("");
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#fff7f4] text-zinc-900">
      {flash && <div className="fixed inset-0 z-50 bg-white animate-pulse" />}

      <main
        className={`relative z-10 flex min-h-screen items-center justify-center ${
          phase === PHASE.WAITING ? "p-0" : "p-6"
        }`}
      >
        {phase === PHASE.WAITING && (
          <section
            onClick={() => setPhase(PHASE.FRAME_TYPE_SELECT)}
            className="relative flex h-[100dvh] w-full cursor-pointer items-center justify-center overflow-hidden bg-[#fff7f4]"
          >
            <div className="relative h-full max-w-full aspect-[2/3]">
              <img
                src="/intro/main-image-clean.png"
                alt="놀구로 네컷 메인 화면"
                draggable={false}
                className="pointer-events-none h-full w-full select-none object-contain"
              />

              <button
                onClick={openAdminLogin}
                aria-label="관리자 설정"
                className="absolute right-[4%] top-[2%] z-50 h-[5.4%] w-[8.4%] active:scale-95"
              >
                <img
                  src="/intro/admin-button.png"
                  alt="관리자 버튼"
                  className="h-full w-full object-contain"
                />
              </button>
            </div>
          </section>
        )}

        {phase === PHASE.ADMIN_LOGIN && (
          <section className="w-full max-w-xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-center text-zinc-800 shadow-2xl">
            <BackButton onClick={goBack} />

            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 text-pink-500 shadow-lg">
              <Lock size={42} />
            </div>

            <h2 className="mt-6 text-4xl font-black text-pink-500">
              관리자 비밀번호
            </h2>

            <p className="mt-3 text-lg font-bold text-zinc-500">
              관리자 설정에 들어가려면 비밀번호를 입력해 주세요.
            </p>

            <div className="mx-auto mt-8 flex h-20 w-full max-w-sm items-center justify-center rounded-3xl border-4 border-pink-200 bg-white text-5xl font-black tracking-[0.45em] text-pink-500 shadow-inner">
              {adminInput ? "●".repeat(adminInput.length) : ""}
            </div>

            {adminError && (
              <p className="mt-4 text-xl font-black text-red-500">
                {adminError}
              </p>
            )}

            <div className="mx-auto mt-8 grid max-w-sm grid-cols-3 gap-4">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((number) => (
                <button
                  key={number}
                  onClick={() => handleAdminNumber(number)}
                  className="h-20 rounded-3xl bg-white text-3xl font-black text-zinc-700 shadow-lg active:scale-95"
                >
                  {number}
                </button>
              ))}

              <button
                onClick={clearAdminInput}
                className="h-20 rounded-3xl bg-zinc-200 text-2xl font-black text-zinc-700 shadow-lg active:scale-95"
              >
                지움
              </button>

              <button
                onClick={() => handleAdminNumber("0")}
                className="h-20 rounded-3xl bg-white text-3xl font-black text-zinc-700 shadow-lg active:scale-95"
              >
                0
              </button>

              <button
                onClick={submitAdminPassword}
                className="h-20 rounded-3xl bg-pink-500 text-2xl font-black text-white shadow-lg active:scale-95"
              >
                확인
              </button>
            </div>
          </section>
        )}

        {phase === PHASE.ADMIN && (
          <section className="w-full max-w-3xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-zinc-800 shadow-2xl">
            <BackButton onClick={goBack} />

            <h2 className="text-center text-5xl font-black text-pink-500">
              관리자 설정
            </h2>

            <div className="mt-10 rounded-[2rem] border-2 border-pink-100 bg-white p-8 shadow-xl">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <div className="text-3xl font-black text-zinc-800">
                    최종 사진 좌우반전
                  </div>
                  <p className="mt-2 text-lg font-bold text-zinc-500">
                    ON이면 화면에서 본 모습 그대로 저장됩니다.
                  </p>
                </div>

                <button
                  onClick={() => setMirrorResult((prev) => !prev)}
                  className={`rounded-full px-8 py-4 text-2xl font-black shadow-lg active:scale-95 ${
                    mirrorResult
                      ? "bg-pink-500 text-white"
                      : "bg-zinc-200 text-zinc-700"
                  }`}
                >
                  {mirrorResult ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </section>
        )}

        {phase === PHASE.FRAME_TYPE_SELECT && (
          <section className="w-full max-w-5xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-center text-zinc-800 shadow-2xl">
            <BackButton onClick={goBack} />

            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 text-5xl shadow-lg">
              📸
            </div>

            <h2 className="text-5xl font-black text-pink-500">
              어떤 프레임으로 찍을까요?
            </h2>

            <p className="mt-4 text-2xl font-bold text-zinc-500">
              원하는 프레임을 선택해 주세요
            </p>

            <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
              <button
                onClick={() => setPhase(PHASE.BASIC_COLOR_SELECT)}
                className="rounded-[2rem] border-4 border-pink-100 bg-white p-8 shadow-xl active:scale-95"
              >
                <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-pink-100 text-6xl">
                  🎨
                </div>
                <div className="mt-6 text-4xl font-black text-zinc-800">
                  기본 프레임
                </div>
                <p className="mt-4 text-xl font-bold text-zinc-500">
                  원하는 색상을 골라 촬영해요
                </p>
                <div className="mt-8 rounded-full bg-gradient-to-r from-pink-400 to-rose-400 px-8 py-4 text-2xl font-black text-white shadow-lg">
                  선택하기
                </div>
              </button>

              <button
                onClick={() => setPhase(PHASE.EVENT_FRAME_SELECT)}
                className="rounded-[2rem] border-4 border-yellow-100 bg-white p-8 shadow-xl active:scale-95"
              >
                <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-yellow-100 text-6xl">
                  🎉
                </div>
                <div className="mt-6 text-4xl font-black text-zinc-800">
                  이벤트 프레임
                </div>
                <p className="mt-4 text-xl font-bold text-zinc-500">
                  행사 전용 프레임으로 촬영해요
                </p>
                <div className="mt-8 rounded-full bg-gradient-to-r from-yellow-300 to-pink-400 px-8 py-4 text-2xl font-black text-white shadow-lg">
                  선택하기
                </div>
              </button>
            </div>
          </section>
        )}

        {phase === PHASE.BASIC_COLOR_SELECT && (
          <section className="w-full max-w-6xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-center text-zinc-800 shadow-2xl">
            <BackButton onClick={goBack} />

            <h2 className="text-5xl font-black text-pink-500">
              기본 프레임 색상을 선택하세요
            </h2>

            <p className="mt-4 text-xl font-bold text-zinc-500">
              선택한 색상으로 네컷 프레임이 만들어져요
            </p>

            <div className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4">
              {FRAME_COLORS.map((frame) => (
                <button
                  key={frame.id}
                  onClick={() => prepareShooting(frame)}
                  className="rounded-[2rem] border-4 border-white bg-white p-5 shadow-xl active:scale-95"
                >
                  <FrameMini frame={frame} />

                  <div className="mt-4 text-2xl font-black text-zinc-800">
                    {frame.emoji} {frame.name}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {phase === PHASE.EVENT_FRAME_SELECT && (
          <section className="w-full max-w-5xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-center text-zinc-800 shadow-2xl">
            <BackButton onClick={goBack} />

            <h2 className="text-5xl font-black text-pink-500">
              이벤트 프레임을 선택하세요
            </h2>
            <p className="mt-4 text-xl font-bold text-zinc-500">
              이벤트 프레임은 색상이 고정됩니다
            </p>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {EVENT_FRAMES.map((frame) => (
                <button
                  key={frame.id}
                  onClick={() =>
                    prepareShooting({
                      ...frame,
                      bg: frame.bg || "#111827",
                      accent: frame.accent || "#facc15",
                      text: frame.text || "#ffffff",
                    })
                  }
                  className="rounded-[2rem] border-4 border-yellow-100 bg-white p-6 shadow-xl active:scale-95"
                >
                  <FrameMini frame={frame} />

                  <div className="mt-5 text-2xl font-black text-zinc-800">
                    {frame.name}
                  </div>
                  <div className="mt-2 font-bold text-zinc-500">
                    {frame.desc}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {isCameraPhase && (
          <CameraStage
            videoRef={videoRef}
            goBack={goBack}
            dim={phase === PHASE.READY}
          >
            {phase === PHASE.READY && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-center text-white backdrop-blur-sm">
                <div className="text-5xl font-black">
                  잠시 후 사진을 찍겠습니다
                </div>
                <p className="mt-5 text-2xl text-white/75">
                  화면을 보고 포즈를 준비해 주세요
                </p>

                <div className="mt-10 flex h-48 w-48 items-center justify-center rounded-full border-[12px] border-pink-400 text-8xl font-black text-white shadow-2xl">
                  {readyCountdown}
                </div>
              </div>
            )}

            {[PHASE.CAMERA, PHASE.COUNTDOWN, PHASE.PREVIEW].includes(
              phase
            ) && (
              <>
                <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/70 px-6 py-3 text-xl font-bold text-white backdrop-blur">
                  CUT {Math.min(capturedPhotos.length + 1, TOTAL_SHOTS)} /{" "}
                  {TOTAL_SHOTS}
                </div>

                {errorMessage && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 px-8 text-center text-white">
                    <div className="text-3xl font-bold">{errorMessage}</div>
                  </div>
                )}

                {phase === PHASE.CAMERA && !errorMessage && (
                  <div className="absolute bottom-8 left-1/2 w-[90%] max-w-xl -translate-x-1/2 text-center">
                    <button
                      disabled
                      className="w-full rounded-full bg-white/70 py-5 text-3xl font-black text-black shadow-xl"
                    >
                      자동 촬영 진행 중
                    </button>

                    <p className="mt-4 rounded-full bg-black/55 px-6 py-3 text-lg text-white/85 backdrop-blur">
                      총 6장을 촬영합니다
                    </p>
                  </div>
                )}

                {phase === PHASE.COUNTDOWN && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/65 text-white backdrop-blur-sm">
                    <div className="relative flex h-80 w-80 items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-[14px] border-white/15" />
                      <div className="absolute inset-0 animate-spin rounded-full border-[14px] border-pink-400 border-b-transparent border-l-violet-500" />
                      <div className="text-9xl font-black">{countdown}</div>
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

                    <p className="mt-3 text-2xl text-white/80">
                      다음 포즈 준비!
                    </p>
                  </div>
                )}
              </>
            )}
          </CameraStage>
        )}

        {phase === PHASE.SELECT && (
          <section className="w-full max-w-6xl rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-zinc-800 shadow-2xl">
            <BackButton onClick={goBack} />

            <div className="flex items-center justify-between gap-6">
              <div>
                <h2 className="text-4xl font-black text-pink-500">
                  마음에 드는 사진 4장을 선택하세요
                </h2>
                <p className="mt-2 text-lg font-bold text-zinc-500">
                  선택한 순서대로 네컷에 들어갑니다.
                </p>
              </div>

              <div className="rounded-3xl bg-white px-8 py-5 text-center shadow-lg">
                <div className="font-bold text-zinc-500">남은 시간</div>
                <div className="text-5xl font-black text-pink-500">
                  00:{String(selectSeconds).padStart(2, "0")}
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-5">
              {capturedPhotos.map((photo, index) => {
                const order = selectedIndexes.indexOf(index) + 1;
                const selected = order > 0;

                return (
                  <button
                    key={index}
                    onClick={() => toggleSelect(index)}
                    className={`relative overflow-hidden rounded-3xl border-4 bg-white transition active:scale-95 ${
                      selected
                        ? "border-pink-400 shadow-[0_0_30px_rgba(236,72,153,0.45)]"
                        : "border-white"
                    }`}
                  >
                    <img
                      src={photo}
                      alt={`촬영 사진 ${index + 1}`}
                      className="aspect-[13/16] w-full object-cover"
                    />

                    {selected && (
                      <div className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full bg-pink-500 text-2xl font-black text-white">
                        {order}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={confirmSelection}
              disabled={
                selectedIndexes.length !== REQUIRED_SELECTIONS || isCreatingResult
              }
              className={`mt-8 flex w-full items-center justify-center gap-3 rounded-full py-5 text-3xl font-black shadow-xl active:scale-95 ${
                selectedIndexes.length === REQUIRED_SELECTIONS && !isCreatingResult
                  ? "bg-gradient-to-r from-pink-400 to-rose-400 text-white"
                  : "bg-zinc-200 text-zinc-400"
              }`}
            >
              <Check size={32} />
              {isCreatingResult
                ? "결과 만드는 중..."
                : `${selectedIndexes.length}/4 선택 완료`}
            </button>
          </section>
        )}

        {phase === PHASE.RESULT && (
          <section className="grid w-full max-w-6xl grid-cols-1 gap-8 rounded-[2.5rem] border-4 border-white bg-[#fff7f4] p-8 text-zinc-800 shadow-2xl md:grid-cols-[1fr_1fr]">
            <div className="flex items-center justify-center rounded-3xl bg-white p-5 shadow-xl">
              {resultUrl && (
                <img
                  src={resultUrl}
                  alt="완성된 네컷"
                  className="max-h-[75vh] rounded-2xl object-contain shadow-2xl"
                />
              )}
            </div>

            <div className="flex flex-col items-center justify-center text-center">
              <Sparkles className="mb-5 text-pink-400" size={46} />

              <h2 className="text-4xl font-black text-pink-500">네컷 완성!</h2>

              <p className="mt-4 text-2xl font-bold text-zinc-600">
                휴대폰 카메라로 QR을 찍어 사진을 저장하세요
              </p>

              <div className="mt-8 rounded-3xl bg-white p-5 shadow-2xl">
                <QRCodeCanvas
                  value={publicUrl || "업로드 중입니다."}
                  size={260}
                  includeMargin
                />
              </div>

              {uploading && (
                <p className="mt-4 text-lg font-bold text-pink-500">
                  QR 저장용 링크를 만드는 중입니다...
                </p>
              )}

              {uploadError && (
                <p className="mt-4 max-w-md text-lg font-bold text-red-500">
                  {uploadError}
                </p>
              )}

              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button
                  onClick={downloadResult}
                  className="inline-flex items-center gap-3 rounded-full bg-zinc-900 px-8 py-4 text-xl font-black text-white active:scale-95"
                >
                  <Download size={24} /> 이 기기에 저장하기
                </button>

                <button
                  onClick={handlePrintResult}
                  disabled={!resultUrl || uploading}
                  className="inline-flex items-center gap-3 rounded-full bg-pink-500 px-8 py-4 text-xl font-black text-white shadow-lg active:scale-95 disabled:bg-zinc-300 disabled:text-zinc-500"
                >
                  🖨️ 인쇄하기
                </button>
              </div>

              <div className="mt-8 rounded-3xl bg-white px-12 py-7 shadow-lg">
                <div className="font-bold text-zinc-500">남은 시간</div>
                <div className="mt-2 text-6xl font-black text-pink-500">
                  00:{String(resetSeconds).padStart(2, "0")}
                </div>
              </div>

              <button
                onClick={resetAll}
                className="mt-7 inline-flex items-center gap-2 font-bold text-zinc-500 underline"
              >
                <RotateCcw size={18} /> 처음 화면으로 돌아가기
              </button>
            </div>
          </section>
        )}
        {printStatus && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-8 text-center backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-[2.5rem] bg-white p-8 text-zinc-800 shadow-2xl">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 text-4xl">
                🖨️
              </div>

              <h2 className="mt-6 text-4xl font-black text-pink-500">
                출력 준비 중입니다
              </h2>

              <p className="mt-5 whitespace-pre-line text-xl font-bold text-zinc-600">
                {printStatus}
              </p>

              {printImageUrl && (
                <div className="mt-6 text-base font-bold text-zinc-400">
                  KP-108IN 절단면을 고려한 인쇄용 이미지가 준비되었습니다.
                </div>
              )}

              <button
                onClick={() => setPrintStatus("")}
                className="mt-8 rounded-full bg-zinc-900 px-8 py-4 text-xl font-black text-white active:scale-95"
              >
                결과 화면으로 돌아가기
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

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
  const isImageFrame = frame.type === "image" && frame.image;

  return (
    <div
      className="mx-auto flex h-52 w-36 flex-col justify-between overflow-hidden rounded-2xl p-3 shadow-2xl"
      style={{
        background: isImageFrame
          ? `url(${frame.image}) center / cover no-repeat, ${frame.bg || "#111827"}`
          : frame.id === "rainbow"
          ? "linear-gradient(135deg,#ec4899,#a855f7,#38bdf8,#22c55e,#facc15)"
          : frame.bg,
        border: `5px solid ${frame.accent || "#ffffff"}`,
      }}
    >
      {!isImageFrame && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-16 rounded-lg border border-white/70 bg-white shadow-inner"
              />
            ))}
          </div>

          <div
            className="text-xs font-black"
            style={{ color: frame.text || "#ffffff" }}
          >
            NOLGURO
          </div>
        </>
      )}
    </div>
  );
}

function CameraStage({ videoRef, goBack, children, dim = false }) {
  return (
    <section
      className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-black shadow-2xl"
      style={{
        width: "min(94vw, calc(88dvh * 13 / 16))",
        height: "min(88dvh, calc(94vw * 16 / 13))",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full scale-x-[-1] object-cover ${
          dim ? "opacity-60" : ""
        }`}
      />

      <button
        onClick={goBack}
        className="absolute left-6 top-6 rounded-full bg-black/60 p-4 text-white backdrop-blur active:scale-95"
      >
        <ArrowLeft size={30} />
      </button>

      {children}
    </section>
  );
}
