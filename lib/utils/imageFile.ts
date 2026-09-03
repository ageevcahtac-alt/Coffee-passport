// Converts a locally-picked image file into a data: URL so it can be stored
// as a plain string in the same `photos: string[]` field the app already
// uses for photo URLs — no backend file storage exists yet, so this is the
// only way a coffee shop profile can hold a device-picked photo. Resized
// through a canvas first: an unresized phone photo (often several MB) would
// otherwise blow through localStorage's ~5-10MB-per-origin quota after just
// one or two shops upload a couple of pictures each.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Не удалось загрузить изображение'));
      image.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // No canvas support — fall back to the original, uncompressed
          // data URL rather than failing the upload outright.
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
