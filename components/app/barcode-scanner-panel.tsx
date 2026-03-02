"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type BarcodeScannerPanelProps = {
  isOpen: boolean;
  onResult: (barcode: string) => void;
  onClose: () => void;
  cameraSelectId: string;
};

export function BarcodeScannerPanel({
  isOpen,
  onResult,
  onClose,
  cameraSelectId,
}: BarcodeScannerPanelProps) {
  const scannerRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<import("@zxing/browser").BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<import("@zxing/browser").IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "opening" | "scanning" | "paused" | "no-permission" | "no-camera" | "error"
  >("opening");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState<{
    min: number;
    max: number;
    step: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [manualBarcode, setManualBarcode] = useState("");

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
  };

  type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
    torch?: boolean;
    zoom?: { min: number; max: number; step: number };
  };

  const safeStop = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    stopStream();
  }, []);

  const refreshDevices = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    const cams = list.filter((d) => d.kind === "videoinput");
    setDevices(cams);
    return cams;
  }, []);

  const syncCapabilities = useCallback((track: MediaStreamTrack) => {
    const caps = (track.getCapabilities?.() as ExtendedMediaTrackCapabilities | null) ?? null;
    if (caps && "torch" in caps) {
      setTorchSupported(Boolean(caps.torch));
    } else {
      setTorchSupported(false);
    }
    if (caps && "zoom" in caps) {
      const zoomCaps = caps.zoom;
      if (zoomCaps) {
        setZoomRange({
          min: zoomCaps.min ?? 1,
          max: zoomCaps.max ?? 1,
          step: zoomCaps.step ?? 0.1,
        });
        const current = track.getSettings?.().zoom as number | undefined;
        if (typeof current === "number") {
          setZoom(current);
        }
      }
    } else {
      setZoomRange(null);
    }
  }, []);

  const startScanner = useCallback(
    async (deviceId?: string) => {
      setError(null);
      setStatus("opening");

      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");

        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: "environment" },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        trackRef.current = track ?? null;
        if (track) {
          const settings = track.getSettings?.();
          if (settings?.deviceId) {
            setActiveDeviceId(settings.deviceId);
            window.localStorage.setItem("scanner-camera-id", settings.deviceId);
          }
          syncCapabilities(track);
        }

        await refreshDevices();

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 200,
        });
        codeReaderRef.current = reader;

        if (!scannerRef.current) {
          return;
        }

        const controls = await reader.decodeFromStream(
          stream,
          scannerRef.current,
          (result) => {
            if (!result) return;
            safeStop();
            onResult(result.getText());
          },
        );
        controlsRef.current = controls;
        setStatus("scanning");
      } catch (err) {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setStatus("no-permission");
        } else if (err instanceof DOMException && err.name === "NotFoundError") {
          setStatus("no-camera");
        } else {
          setStatus("error");
        }
        setError("ไม่สามารถเปิดกล้องได้ — กรุณาพิมพ์บาร์โค้ดด้านล่าง");
        safeStop();
      }
    },
    [onResult, refreshDevices, safeStop, syncCapabilities],
  );

  useEffect(() => {
    if (!isOpen) {
      safeStop();
      setStatus("paused");
      return;
    }

    let mounted = true;
    const storedDeviceId = window.localStorage.getItem("scanner-camera-id");
    if (mounted) {
      void startScanner(storedDeviceId || undefined);
    }

    return () => {
      mounted = false;
      safeStop();
      codeReaderRef.current = null;
    };
  }, [isOpen, safeStop, startScanner]);

  return (
    <div className="space-y-4">
      <div className="relative mx-auto w-full max-w-sm">
        <video
          ref={scannerRef}
          className="mx-auto aspect-[3/2] w-full rounded-xl bg-black"
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[46%] w-[80%] rounded-lg border-2 border-blue-400/80" />
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-500">
        วางบาร์โค้ดให้อยู่กลางกรอบและมีแสงสว่างเพียงพอ
      </p>

      {status === "opening" && (
        <p className="text-center text-xs text-slate-500">กำลังเปิดกล้อง...</p>
      )}
      {status === "no-permission" && (
        <p className="text-center text-xs text-amber-600">
          ไม่ได้รับอนุญาตให้ใช้กล้อง — กรุณาเปิดสิทธิ์ในเบราว์เซอร์
        </p>
      )}
      {status === "no-camera" && (
        <p className="text-center text-xs text-amber-600">ไม่พบกล้องในอุปกรณ์นี้</p>
      )}
      {status === "error" && error && (
        <p className="text-center text-xs text-amber-600">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        {devices.length > 1 && (
          <div className="space-y-2">
            <label
              className="text-xs text-muted-foreground"
              htmlFor={cameraSelectId}
            >
              เลือกกล้อง
            </label>
            <select
              id={cameraSelectId}
              value={activeDeviceId ?? devices[0]?.deviceId ?? ""}
              onChange={async (event) => {
                const nextDeviceId = event.target.value;
                if (!nextDeviceId || nextDeviceId === activeDeviceId) return;
                safeStop();
                setActiveDeviceId(nextDeviceId);
                window.localStorage.setItem("scanner-camera-id", nextDeviceId);
                await startScanner(nextDeviceId);
              }}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            >
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `กล้อง ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={async () => {
            if (status === "paused") {
              await startScanner(activeDeviceId ?? undefined);
            } else {
              safeStop();
              setStatus("paused");
            }
          }}
        >
          {status === "paused" ? "เปิดกล้อง" : "พักกล้อง"}
        </Button>

        {torchSupported && (
          <Button
            type="button"
            variant={torchOn ? "default" : "outline"}
            className="h-10 w-full"
            onClick={async () => {
              const track = trackRef.current;
              if (!track) return;
              try {
                await track.applyConstraints({
                  advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
                });
                setTorchOn((prev) => !prev);
              } catch {
                setTorchSupported(false);
              }
            }}
          >
            {torchOn ? "ปิดไฟแฟลช" : "เปิดไฟแฟลช"}
          </Button>
        )}

        {zoomRange && (
          <div className="rounded-lg border px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span>ซูม</span>
              <span>{zoom.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={zoomRange.min}
              max={zoomRange.max}
              step={zoomRange.step}
              value={zoom}
              onChange={async (e) => {
                const next = Number(e.target.value);
                setZoom(next);
                const track = trackRef.current;
                if (!track) return;
                try {
                  await track.applyConstraints({
                    advanced: [{ zoom: next } as MediaTrackConstraintSet],
                  });
                } catch {
                  setZoomRange(null);
                }
              }}
              className="mt-2 w-full"
            />
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="พิมพ์บาร์โค้ดด้วยมือ"
            className="h-10 flex-1 rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualBarcode.trim()) {
                safeStop();
                onResult(manualBarcode.trim());
              }
            }}
          />
          <Button
            type="button"
            className="h-10"
            disabled={!manualBarcode.trim()}
            onClick={() => {
              safeStop();
              onResult(manualBarcode.trim());
            }}
          >
            ค้นหา
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={() => {
            safeStop();
            onClose();
          }}
        >
          ปิดสแกนเนอร์
        </Button>
      </div>
    </div>
  );
}
