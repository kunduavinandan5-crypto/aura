import React, { useRef, useState, useEffect } from 'react';
import { MAX_IMAGES } from '@/lib/attachments';
import { Camera, RefreshCw, X, Check, AlertCircle } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  /** Photos already attached before opening; the modal closes once MAX_IMAGES is reached in total. */
  existingCount?: number;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  existingCount = 0,
}) => {
  const [addedCount, setAddedCount] = useState(0);
  const totalCount = existingCount + addedCount;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedImage(null);
      setCameraError(null);
      setAddedCount(0);
      return;
    }

    startCamera(facingMode);

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async (mode: 'user' | 'environment') => {
    stopCamera();
    setCameraError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      // Try fallback without constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(fallbackStream);
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play().catch(() => {});
        }
      } catch (fallbackErr: any) {
        setCameraError(
          'Unable to access camera. Please check permissions or upload a photo instead.'
        );
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleTakeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  const handleConfirmPhoto = () => {
    if (!capturedImage) return;
    onCapture(capturedImage);
    const next = addedCount + 1;
    setAddedCount(next);
    setCapturedImage(null);
    if (existingCount + next >= MAX_IMAGES) {
      onClose();
    } else {
      startCamera(facingMode);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(facingMode);
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-screen flex-col bg-black text-white animate-fade-in select-none">
      {/* Full-screen viewport: the live video (or the captured frame) fills the whole screen */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {cameraError ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="space-y-3">
              <AlertCircle className="mx-auto h-12 w-12 text-amber-400" />
              <p className="mx-auto max-w-xs text-sm text-zinc-300">{cameraError}</p>
            </div>
          </div>
        ) : capturedImage ? (
          <img src={capturedImage} alt="Captured frame" className="h-full w-full object-contain" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
        )}

        {/* Hidden Canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Top bar floats over the picture */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 backdrop-blur-md">
            <Camera className="h-4 w-4 text-blue-300" />
            <span className="text-sm font-semibold">
              {totalCount}/{MAX_IMAGES} photos
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!capturedImage && !cameraError && (
              <button
                type="button"
                onClick={toggleCamera}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-all hover:bg-black/70 active:scale-95"
                title="Switch camera"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-all hover:bg-black/70 active:scale-95"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Hint */}
        {!capturedImage && !cameraError && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/80 drop-shadow">
            Keep the question inside the screen, flat and well lit
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex shrink-0 items-center justify-between bg-black px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {capturedImage ? (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white transition-all active:scale-95"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Retake</span>
            </button>
            <button
              type="button"
              onClick={handleConfirmPhoto}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition-all active:scale-95"
            >
              <Check className="h-5 w-5" />
              <span>{totalCount + 1 >= MAX_IMAGES ? 'Use Photo' : 'Add Photo'}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="w-24 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
            >
              {addedCount > 0 ? 'Done' : 'Cancel'}
            </button>
            {!cameraError ? (
              <button
                type="button"
                onClick={handleTakeSnapshot}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-transparent transition-transform active:scale-90"
                title="Snap photo"
              >
                <div className="h-14 w-14 rounded-full bg-white" />
              </button>
            ) : (
              <div className="h-[72px] w-[72px]" />
            )}
            <div className="w-24" />
          </>
        )}
      </div>
    </div>
  );
};
