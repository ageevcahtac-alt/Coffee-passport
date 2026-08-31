'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

type ScannerState = 'idle' | 'starting' | 'scanning' | 'error';

// Friendly, actionable copy per getUserMedia failure — iOS Safari and
// Android Chrome surface camera-permission problems through different
// DOMException names, and "camera doesn't open" is meaningless to a guest
// without knowing which of these it actually is.
function messageForError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Доступ к камере запрещён. На iOS: Настройки → Safari (или Chrome) → Камера → Разрешить. На Android: значок замка в адресной строке → Разрешения → Камера → Разрешить, затем обновите страницу.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'На этом устройстве не найдена камера. Введите код лота вручную ниже.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Камера занята другим приложением. Закройте другие приложения, использующие камеру, и попробуйте снова.';
    case 'OverconstrainedError':
      return 'Не удалось выбрать заднюю камеру устройства. Попробуйте ещё раз или введите код вручную.';
    case 'SecurityError':
      return 'Доступ к камере возможен только по защищённому соединению (https). Введите код лота вручную.';
    default:
      return 'Не удалось открыть камеру. Введите код лота вручную ниже.';
  }
}

// Live camera QR reader: opens the device's back camera via getUserMedia,
// samples video frames onto a hidden canvas, and runs jsQR against each
// frame until a code decodes. No external scan-UI library — jsQR is a pure
// decoder, so the camera plumbing (permissions, iOS playsinline quirks,
// cleanup) lives here.
export function QrScanner({
  onDecode,
  onError,
}: {
  onDecode: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const decodedRef = useRef(false);

  const [state, setState] = useState<ScannerState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        const message = 'Этот браузер не поддерживает доступ к камере. Введите код лота вручную ниже.';
        setErrorMessage(message);
        setState('error');
        onError?.(message);
        return;
      }

      setState('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setState('scanning');
        rafRef.current = requestAnimationFrame(tick);
      } catch (error) {
        if (cancelled) return;
        const message = messageForError(error);
        setErrorMessage(message);
        setState('error');
        onError?.(message);
      }
    }

    function tick() {
      if (decodedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (width > 0 && height > 0) {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const result = jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' });
            if (result && result.data) {
              decodedRef.current = true;
              onDecode(result.data);
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start()/tick() close over refs; onDecode/onError identity churn shouldn't restart the camera
  }, []);

  if (state === 'error') {
    return (
      <div
        className="aspect-[3/2] w-full rounded-md border border-dashed border-ink-300
                   bg-parchment-200 flex flex-col items-center justify-center gap-2 px-6 text-center"
      >
        <span className="text-3xl" aria-hidden="true">
          ⚠
        </span>
        <p className="text-xs text-ink-500">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="relative aspect-[3/2] w-full rounded-md overflow-hidden bg-ink-900">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />
      {state === 'starting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-900/40">
          <p className="text-xs text-parchment-100">Открываем камеру…</p>
        </div>
      )}
      {state === 'scanning' && (
        <div
          className="absolute inset-6 rounded-md border-2 border-gold-400/80"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
