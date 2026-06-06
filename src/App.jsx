import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Download,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Check,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "./supabase";

const APP_TITLE = "놀구로 네컷";
const SUBTITLE = "오늘의 순간을 남겨보세요 ✨";
const SHUTTER_SOUND_PATH = "/sounds/shutter.mp3";
const FRAME_PATH = "/frames/basic.png";
const STORAGE_BUCKET = "photo-results";

const TOTAL_SHOTS = 6;
const REQUIRED_SELECTIONS = 4;
const SELECT_TIME_LIMIT = 30;
const RESULT_TIME_LIMIT = 60;

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

const PHASE = {
  WAITING: "WAITING",
  CAMERA: "CAMERA",
  COUNTDOWN: "COUNTDOWN",
  PREVIEW: "PREVIEW",
  SELECT: "SELECT",
  RESULT: "RESULT",
};

export default function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const shutterRef = useRef(null);

  const [phase, setPhase] = useState(PHASE.WAITING);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [selectedIndexes, setSelectedIndexes] = useState([]);
  const [countdown, setCountdown] = useState(3);
  const [flash, setFlash] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [resetSeconds, setResetSeconds] = useState(RESULT_TIME_LIMIT);
  const [selectSeconds, setSelectSeconds] = useState(SELECT_TIME_LIMIT);
  const [cameraReady, setCameraReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [autoShooting, setAutoShooting] = useState(false);

  useEffect(() => {
    shutterRef.current = new Audio(SHUTTER_SOUND_PATH);
  }, []);

  useEffect(() => {
    if (phase !== PHASE.CAMERA) return;
    if (!autoShooting) return;
    if (!cameraReady) return;
    if (errorMessage) return;

    const timer = setTimeout(() => {
      beginCountdown();
    }, capturedPhotos.length === 0 ? 1000 : 1200);

    return () => clearTimeout(timer);
  }, [phase, autoShooting, cameraReady, capturedPhotos.length, errorMessage]);

  useEffect(() => {
    if ([PHASE.CAMERA, PHASE.COUNTDOWN, PHASE.PREVIEW].includes(phase)) {
      startCamera();
    }
  }, [phase]);

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
  }, [phase, capturedPhotos, selectedIndexes]);

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

  async function startCamera() {
    try {
      if (streamRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("카메라 권한을 허용해 주세요.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setCameraReady(false);
  }

  function goBack() {
    if (phase === PHASE.CAMERA) {
      stopCamera();
      setCapturedPhotos([]);
      setAutoShooting(false);
      setPhase(PHASE.WAITING);
    }

    if (phase === PHASE.SELECT) {
      setSelectedIndexes([]);
      setPhase(PHASE.WAITING);
    }

    if (phase === PHASE.RESULT) {
      resetAll();
    }
  }

  function playShutter() {
    const sound = shutterRef.current;
    if (!sound) return;

    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  function captureFromVideo() {
    const video = videoRef.current;
    if (!video) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;

    const ctx = canvas.getContext("2d");

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.95);
  }

  function startShooting() {
    setCapturedPhotos([]);
    setSelectedIndexes([]);
    setResultUrl("");
    setPublicUrl("");
    setUploadError("");
    setErrorMessage("");
    setAutoShooting(true);
    setPhase(PHASE.CAMERA);
  }

  function beginCountdown() {
    if (!cameraReady && !errorMessage) return;

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
    if (!image) return;

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

  function createSamplePhoto(index) {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;

    const ctx = canvas.getContext("2d");

    const colors = [
      ["#2e1065", "#ec4899"],
      ["#831843", "#8b5cf6"],
      ["#312e81", "#06b6d4"],
      ["#111827", "#f97316"],
      ["#064e3b", "#22c55e"],
      ["#7c2d12", "#facc15"],
    ];

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, colors[index][0]);
    gradient.addColorStop(1, colors[index][1]);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(450, 330, 190, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.font = "bold 68px sans-serif";
    ctx.fillText(`SAMPLE CUT ${index + 1}`, canvas.width / 2, 500);

    ctx.font = "34px sans-serif";
    ctx.fillText("세로 촬영 비율 테스트", canvas.width / 2, 570);

    return canvas.toDataURL("image/jpeg", 0.95);
  }

  function runSampleTest() {
    stopCamera();

    const samplePhotos = Array.from({ length: TOTAL_SHOTS }, (_, index) =>
      createSamplePhoto(index)
    );

    setCapturedPhotos(samplePhotos);
    setSelectedIndexes([]);
    setResultUrl("");
    setPublicUrl("");
    setUploadError("");
    setPhase(PHASE.SELECT);
  }

  function toggleSelect(index) {
    setSelectedIndexes((prev) => {
      if (prev.includes(index)) {
        return prev.filter((item) => item !== index);
      }

      if (prev.length >= REQUIRED_SELECTIONS) {
        return prev;
      }

      return [...prev, index];
    });
  }

  async function autoCompleteSelection() {
    const completed = [...selectedIndexes];

    for (let i = 0; i < capturedPhotos.length; i++) {
      if (completed.length >= REQUIRED_SELECTIONS) break;
      if (!completed.includes(i)) completed.push(i);
    }

    await createResult(completed.slice(0, REQUIRED_SELECTIONS));
  }

  async function confirmSelection() {
    if (selectedIndexes.length !== REQUIRED_SELECTIONS) return;

    await createResult(selectedIndexes);
  }

  async function createResult(indexes) {
    setUploading(true);
    setUploadError("");

    try {
      const selectedPhotos = indexes.map((index) => capturedPhotos[index]);
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
    const fileName = `noguro-${Date.now()}-${crypto.randomUUID()}.png`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, blob, {
        contentType: "image/png",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);

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

    ctx.drawImage(
      img,
      slot.x + offsetX,
      slot.y + offsetY,
      drawWidth,
      drawHeight
    );

    ctx.restore();
  }

  async function composeFinalImage(photoList) {
    const canvas = document.createElement("canvas");
    canvas.width = FOUR_CUT_CONFIG.canvasWidth;
    canvas.height = FOUR_CUT_CONFIG.canvasHeight;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < photoList.length; i++) {
      const img = await loadImage(photoList[i]);
      const slot = FOUR_CUT_CONFIG.slots[i];

      drawCoverImage(ctx, img, slot);
    }

    const frame = await loadImage(FRAME_PATH);
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);

    const today = new Date();
    const dateText = `${today.getFullYear()}.${String(
      today.getMonth() + 1
    ).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(dateText, canvas.width / 2, 1668);

    return canvas.toDataURL("image/png");
  }

  function downloadResult() {
    if (!resultUrl) return;

    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `noguro-necut-${Date.now()}.png`;
    a.click();
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
    setCountdown(3);
    setFlash(false);
    setErrorMessage("");
    setAutoShooting(false);
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#05030a] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(236,72,153,0.35),transparent_30%),radial-gradient(circle_at_80%_75%,rgba(139,92,246,0.38),transparent_35%)]" />
      <div className="absolute inset-0 opacity-30 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.08)_50%,transparent_100%)]" />

      {flash && <div className="fixed inset-0 z-50 bg-white animate-pulse" />}

      <main className="relative z-10 flex min-h-screen items-center justify-center p-6">
        {phase === PHASE.WAITING && (
          <section className="w-full max-w-4xl text-center">
            <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 shadow-2xl backdrop-blur">
              <Camera size={44} className="text-pink-300" />
            </div>

            <h1 className="bg-gradient-to-r from-white via-pink-200 to-violet-300 bg-clip-text text-7xl font-black tracking-tight text-transparent md:text-8xl">
              {APP_TITLE}
            </h1>

            <p className="mt-5 text-2xl text-white/80">{SUBTITLE}</p>

            <div className="mx-auto mt-12 w-52 rotate-[-3deg] rounded-3xl bg-white p-4 shadow-2xl">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-28 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-950"
                  />
                ))}
              </div>

              <div className="mt-4 text-center text-xl font-black text-black">
                4컷
              </div>
            </div>

            <button
              onClick={startShooting}
              className="mt-12 inline-flex items-center gap-4 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 px-16 py-6 text-3xl font-bold shadow-2xl transition hover:scale-105 active:scale-95"
            >
              <Camera size={34} /> 촬영 시작하기
            </button>

            <button
              onClick={runSampleTest}
              className="mx-auto mt-5 block rounded-full border border-white/20 bg-white/10 px-10 py-4 text-xl font-bold text-white/90 active:scale-95"
            >
              카메라 없이 샘플로 테스트하기
            </button>

            <div className="mt-10 flex justify-center gap-8 text-white/70">
              <span>① 6장 촬영</span>
              <span>② 4장 선택</span>
              <span>③ 네컷 생성</span>
              <span>④ QR 저장</span>
            </div>
          </section>
        )}

        {[PHASE.CAMERA, PHASE.COUNTDOWN, PHASE.PREVIEW].includes(phase) && (
          <section className="relative h-[86vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/15 bg-black shadow-2xl">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full scale-x-[-1] object-cover"
            />

            <button
              onClick={goBack}
              className="absolute left-6 top-6 rounded-full bg-black/60 p-4 backdrop-blur active:scale-95"
            >
              <ArrowLeft size={30} />
            </button>

            <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/70 px-6 py-3 text-xl font-bold backdrop-blur">
              CUT {Math.min(capturedPhotos.length + 1, TOTAL_SHOTS)} /{" "}
              {TOTAL_SHOTS}
            </div>

            {errorMessage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 px-8 text-center">
                <div className="text-3xl font-bold">{errorMessage}</div>

                <button
                  onClick={runSampleTest}
                  className="mt-8 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 px-10 py-4 text-2xl font-bold active:scale-95"
                >
                  샘플 이미지로 테스트하기
                </button>
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
              <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-sm">
                <div className="relative flex h-80 w-80 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-[14px] border-white/15" />
                  <div className="absolute inset-0 animate-spin rounded-full border-[14px] border-pink-400 border-b-transparent border-l-violet-500" />
                  <div className="text-9xl font-black">{countdown}</div>
                </div>
              </div>
            )}

            {phase === PHASE.PREVIEW && capturedPhotos.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm">
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
          </section>
        )}

        {phase === PHASE.SELECT && (
          <section className="w-full max-w-6xl rounded-[2rem] border border-white/10 bg-black/55 p-8 shadow-2xl backdrop-blur-xl">
            <BackButton onClick={goBack} />

            <div className="flex items-center justify-between gap-6">
              <div>
                <h2 className="text-4xl font-black">
                  마음에 드는 사진 4장을 선택하세요
                </h2>

                <p className="mt-2 text-white/70">
                  선택한 순서대로 네컷에 들어갑니다.
                </p>
              </div>

              <div className="rounded-3xl bg-white/10 px-8 py-5 text-center">
                <div className="text-white/60">남은 시간</div>
                <div className="text-5xl font-black text-pink-200">
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
                    className={`relative overflow-hidden rounded-3xl border-4 transition active:scale-95 ${
                      selected
                        ? "border-pink-400 shadow-[0_0_30px_rgba(236,72,153,0.45)]"
                        : "border-white/15"
                    }`}
                  >
                    <img
                      src={photo}
                      alt={`촬영 사진 ${index + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                    />

                    {selected && (
                      <div className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full bg-pink-500 text-2xl font-black">
                        {order}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={confirmSelection}
              disabled={selectedIndexes.length !== REQUIRED_SELECTIONS}
              className={`mt-8 flex w-full items-center justify-center gap-3 rounded-full py-5 text-3xl font-bold shadow-xl active:scale-95 ${
                selectedIndexes.length === REQUIRED_SELECTIONS
                  ? "bg-gradient-to-r from-violet-500 to-pink-500"
                  : "bg-white/15 text-white/40"
              }`}
            >
              <Check size={32} /> {selectedIndexes.length}/4 선택 완료
            </button>
          </section>
        )}

        {phase === PHASE.RESULT && (
          <section className="grid w-full max-w-6xl grid-cols-1 gap-8 rounded-[2rem] border border-white/10 bg-black/55 p-8 shadow-2xl backdrop-blur-xl md:grid-cols-[1fr_1fr]">
            <div className="flex items-center justify-center rounded-3xl bg-white/5 p-5">
              {resultUrl && (
                <img
                  src={resultUrl}
                  alt="완성된 네컷"
                  className="max-h-[75vh] rounded-2xl object-contain shadow-2xl"
                />
              )}
            </div>

            <div className="flex flex-col items-center justify-center text-center">
              <Sparkles className="mb-5 text-pink-300" size={46} />

              <h2 className="text-4xl font-black">네컷 완성!</h2>

              <p className="mt-4 text-2xl text-white/80">
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
                <p className="mt-4 text-lg text-pink-200">
                  QR 저장용 링크를 만드는 중입니다...
                </p>
              )}

              {uploadError && (
                <p className="mt-4 max-w-md text-lg text-red-300">
                  {uploadError}
                </p>
              )}

              {publicUrl && (
                <p className="mt-4 max-w-md break-all text-sm text-white/50">
                  {publicUrl}
                </p>
              )}

              <button
                onClick={downloadResult}
                className="mt-7 inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-xl font-bold text-black active:scale-95"
              >
                <Download size={24} /> 이 기기에 저장하기
              </button>

              <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 px-12 py-7">
                <div className="text-white/60">남은 시간</div>
                <div className="mt-2 text-6xl font-black text-pink-200">
                  00:{String(resetSeconds).padStart(2, "0")}
                </div>
              </div>

              <button
                onClick={resetAll}
                className="mt-7 inline-flex items-center gap-2 text-white/70 underline"
              >
                <RotateCcw size={18} /> 처음 화면으로 돌아가기
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 font-bold text-white/85 active:scale-95"
    >
      <ArrowLeft size={22} /> 뒤로가기
    </button>
  );
}