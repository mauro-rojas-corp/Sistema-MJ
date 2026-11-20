import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface KudeQrCodeProps {
  url: string;
  size?: number;
  className?: string;
}

export const KudeQrCode: React.FC<KudeQrCodeProps> = ({
  url,
  size = 140,
  className = '',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!url) return;
    let isMounted = true;

    QRCode.toDataURL(url, {
      width: size * 2, // 2x for sharp rendering
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((res) => {
        if (isMounted) {
          setDataUrl(res);
          setError(false);
        }
      })
      .catch((err) => {
        console.error('Error generando QR KuDE:', err);
        if (isMounted) setError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [url, size]);

  if (error || !url) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400 text-center p-2 ${className}`}
      >
        QR no disponible
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-slate-100 animate-pulse flex items-center justify-center ${className}`}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Código QR Oficial KuDE SIFEN"
      width={size}
      height={size}
      className={`block object-contain ${className}`}
      referrerPolicy="no-referrer"
    />
  );
};
