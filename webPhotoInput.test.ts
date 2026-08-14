import {
  prepareWebPhotoFiles,
  WebPhotoInputError,
} from './platform/web/photoInput';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function namedBlob(parts: BlobPart[], type: string, name: string) {
  const blob = new Blob(parts, { type }) as Blob & { name: string };
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}

async function runWebPhotoInputTests() {
  const jpeg = namedBlob(['jpeg'], 'image/jpeg', 'portrait.jpg');
  const jpegAssets = await prepareWebPhotoFiles([jpeg], 6, async () => ({ width: 3024, height: 4032 }));
  assert(jpegAssets.length === 1, 'Single JPEG selection failed');
  assert(jpegAssets[0].blob === jpeg && jpegAssets[0].mimeType === 'image/jpeg', 'JPEG File/Blob or MIME changed');
  assert(jpegAssets[0].originalWidth === 3024 && jpegAssets[0].originalHeight === 4032, 'Portrait dimensions changed');

  const png = namedBlob(['png'], 'image/png', 'landscape.png');
  const limited = await prepareWebPhotoFiles([jpeg, png], 1, async (blob) => blob === jpeg
    ? { width: 3024, height: 4032 }
    : { width: 4032, height: 3024 });
  assert(limited.length === 1 && limited[0].name === 'portrait.jpg', 'Photo selection limit or ordering changed');

  const large = namedBlob([new Uint8Array(1024)], 'image/jpeg', 'iphone-large.jpg');
  const largeAssets = await prepareWebPhotoFiles([large], 1, async () => ({ width: 8064, height: 6048 }));
  assert(largeAssets[0].blob.size === large.size, 'Large photo Blob was altered during input');
  assert(largeAssets[0].originalWidth === 8064 && largeAssets[0].originalHeight === 6048, 'Large photo dimensions were capped');

  const heic = namedBlob(['heic'], '', 'iphone-portrait.HEIC');
  const oriented = await prepareWebPhotoFiles([heic], 1, async () => ({ width: 3024, height: 4032 }));
  assert(oriented[0].mimeType === 'image/heic', 'HEIC MIME inference failed when Safari omits File.type');
  assert(oriented[0].originalWidth < oriented[0].originalHeight, 'Displayed EXIF orientation dimensions were not preserved');

  assert((await prepareWebPhotoFiles([], 6, async () => ({ width: 1, height: 1 }))).length === 0, 'Cancel should return no photos');
  assert((await prepareWebPhotoFiles(null, 6, async () => ({ width: 1, height: 1 }))).length === 0, 'Null file selection should be treated as cancel');

  let unsupportedRejected = false;
  try {
    await prepareWebPhotoFiles([namedBlob(['text'], 'text/plain', 'notes.txt')], 1, async () => ({ width: 1, height: 1 }));
  } catch (error) {
    unsupportedRejected = error instanceof WebPhotoInputError && error.code === 'UNSUPPORTED_INPUT';
  }
  assert(unsupportedRejected, 'Unsupported input did not return a readable error');

  let decodeRejected = false;
  try {
    await prepareWebPhotoFiles([heic], 1, async () => { throw new Error('HEIC decoder unavailable'); });
  } catch (error) {
    decodeRejected = error instanceof WebPhotoInputError && error.code === 'DECODE_FAILED';
  }
  assert(decodeRejected, 'Undecodable HEIC did not expose its browser compatibility limit');
}

runWebPhotoInputTests().catch((error) => { throw error; });
