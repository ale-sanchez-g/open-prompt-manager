import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../../public');
const manifestPath = resolve(publicDir, 'manifest.json');
const indexHtmlPath = resolve(__dirname, '../../index.html');

// Reads width/height from a PNG's IHDR chunk (big-endian uint32 at offsets 16/20).
function readPngDimensions(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  // 89 50 4E 47 0D 0A 1A 0A is the canonical PNG signature.
  if (signature !== '89504e470d0a1a0a') {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('PWA web app manifest', () => {
  let manifest;

  beforeAll(() => {
    expect(existsSync(manifestPath)).toBe(true);
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  });

  it('is valid JSON with the minimal required PWA fields', () => {
    expect(manifest.name).toBe('Open Prompt Manager');
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('conforms to the manifest icon schema', () => {
    const ajv = new Ajv();
    const validate = ajv.compile({
      type: 'object',
      required: ['name', 'short_name', 'start_url', 'display', 'icons'],
      properties: {
        name: { type: 'string', minLength: 1 },
        short_name: { type: 'string', minLength: 1 },
        start_url: { type: 'string', minLength: 1 },
        display: { enum: ['fullscreen', 'standalone', 'minimal-ui', 'browser'] },
        icons: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['src', 'sizes', 'type'],
            properties: {
              src: { type: 'string', pattern: '^/.+\\.(png|ico|svg|webp)$' },
              sizes: { type: 'string', pattern: '^\\d+x\\d+$' },
              type: { type: 'string' },
              purpose: { enum: ['any', 'maskable', 'monochrome', 'any maskable'] },
            },
          },
        },
      },
    });
    const valid = validate(manifest);
    if (!valid) {
      throw new Error(JSON.stringify(validate.errors, null, 2));
    }
    expect(valid).toBe(true);
  });

  it('includes the 192x192 and 512x512 icons required for installability', () => {
    const sizes = manifest.icons
      .filter((icon) => icon.type === 'image/png')
      .map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('declares a maskable icon for adaptive launchers', () => {
    const hasMaskable = manifest.icons.some(
      (icon) => typeof icon.purpose === 'string' && icon.purpose.includes('maskable'),
    );
    expect(hasMaskable).toBe(true);
  });

  it('references icon files that exist on disk with the declared dimensions', () => {
    for (const icon of manifest.icons) {
      const iconPath = resolve(publicDir, icon.src.replace(/^\//, ''));
      expect(existsSync(iconPath)).toBe(true);

      // PNG dimensions are verifiable from the file header; assert they match.
      if (icon.type === 'image/png') {
        const dims = readPngDimensions(readFileSync(iconPath));
        expect(dims).not.toBeNull();
        const [declaredW, declaredH] = icon.sizes.split('x').map(Number);
        expect(dims.width).toBe(declaredW);
        expect(dims.height).toBe(declaredH);
      }
    }
  });
});

describe('index.html manifest linkage', () => {
  it('links the manifest from the document head', () => {
    const html = readFileSync(indexHtmlPath, 'utf-8');
    expect(html).toMatch(/<link[^>]+rel=["']manifest["'][^>]+href=["']\/manifest\.json["']/);
  });
});
