'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, uploadFiles } from '@/lib/apiClient';

interface FileUploadProps {
  label: string;
  multiple?: boolean;
  maxFiles?: number;
  hint?: string;
  value: string[];
  onChange: (urls: string[]) => void;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export default function FileUpload({ label, multiple = false, maxFiles = 8, hint, value, onChange }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    const invalid = files.find((f) => !ACCEPTED_TYPES.includes(f.type));
    if (invalid) {
      toast.error(`"${invalid.name}" is not a supported image type (jpeg, png, webp).`);
      return;
    }
    const tooBig = files.find((f) => f.size > MAX_SIZE_BYTES);
    if (tooBig) {
      toast.error(`"${tooBig.name}" exceeds the 5MB limit.`);
      return;
    }
    if (multiple && value.length + files.length > maxFiles) {
      toast.error(`You can upload up to ${maxFiles} photos.`);
      return;
    }

    setIsUploading(true);
    try {
      const { urls } = await uploadFiles(files);
      onChange(multiple ? [...value, ...urls] : urls);
      toast.success('Upload successful');
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 429) {
        toast.error('Upload limit reached. Please try again later.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Upload failed');
      }
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</label>
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center transition-colors hover:border-primary-light dark:border-gray-600 dark:bg-gray-800"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {isUploading ? 'Uploading…' : 'Click or drag images here to upload'}
        </span>
        {hint && <span className="text-xs text-gray-400 dark:text-gray-500">{hint}</span>}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((url, index) => (
            <div key={url + index} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Uploaded" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(index);
                }}
                className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg bg-red-600 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
