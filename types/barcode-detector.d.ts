/**
 * THE BARCODE READER THE BROWSER ALREADY HAS.
 *
 * Shipped by Chrome on Android — the phones the Dar counter uses — and absent
 * from Safari on iOS. TypeScript's DOM library does not describe it yet, so it
 * is described here: the three members the counter's camera actually calls, and
 * an optional constructor so that `"BarcodeDetector" in window` remains the
 * only thing that decides whether the camera button is offered at all.
 *
 * Declaring it does not make it exist. Nothing in components/app may call it
 * without having found it on `window` first.
 */
interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource | Blob | ImageData): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
