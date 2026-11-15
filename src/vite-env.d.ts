/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
}

interface BarcodeDetector {
  detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string }>>;
}

declare const BarcodeDetector: {
  new (options?: { formats?: string[] }): BarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
};
