'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';

interface GalleryImage {
  url: string;
  label: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
}

export default function ImageGallery({ images }: ImageGalleryProps) {
  const [active, setActive] = useState<GalleryImage | null>(null);

  if (images.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">No images uploaded.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-4">
        {images.map((img) => (
          <button
            key={img.url}
            type="button"
            onClick={() => setActive(img)}
            className="group flex flex-col items-center gap-1.5"
          >
            <div className="h-24 w-24 overflow-hidden rounded-lg border border-gray-200 shadow-sm transition-transform group-hover:scale-105 dark:border-gray-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.label} className="h-full w-full object-cover" />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{img.label}</span>
          </button>
        ))}
      </div>

      <Modal isOpen={!!active} onClose={() => setActive(null)} title={active?.label} size="lg">
        {active && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.url} alt={active.label} className="max-h-[70vh] w-full rounded-lg object-contain" />
        )}
      </Modal>
    </>
  );
}
