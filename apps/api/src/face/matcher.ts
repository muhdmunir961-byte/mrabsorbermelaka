import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

/**
 * Face matching runs in Chromium, not in the Node process.
 *
 * Why: @vladmandic/face-api's node build needs @tensorflow/tfjs-node, which calls
 * util.isNullOrUndefined — removed from Node 22 onward. Running the browser build
 * in the environment it was written for avoids patching a dependency, and the
 * models are the unmodified ones shipped in the package.
 *
 * Cost, stated plainly: this keeps one headless Chromium process alive and each
 * comparison crosses a page boundary. That is why the endpoint is rate limited.
 */
const here = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = join(here, '../../../../node_modules/@vladmandic/face-api');
// Resolved against the package, never against the process cwd: the API is started
// from apps/api, so a relative default would point outside the workspace.
const MODEL_ROOT = join(PACKAGE_ROOT, env.FACE_MODEL_DIR);

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
};

interface Matcher {
  server: Server;
  browser: Browser;
  page: Page;
}

let matcherPromise: Promise<Matcher> | null = null;

async function start(): Promise<Matcher> {
  // The request listener is deliberately not `async`: a rejected promise inside a
  // Node http handler would be unhandled, so the work is wrapped and errors are
  // answered explicitly.
  const server = createServer((request, response) => {
    void (async () => {
      const path = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
      if (path === '/') {
        response.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html>
<script type="module">
import * as faceapi from '/dist/face-api.esm.js';
await faceapi.nets.tinyFaceDetector.loadFromUri('/model');
await faceapi.nets.faceLandmark68Net.loadFromUri('/model');
await faceapi.nets.faceRecognitionNet.loadFromUri('/model');

// A named helper on the page. Playwright evaluates simple expressions against
// this, so no function body is ever shipped from Node into the browser.
window.faceCompare = async (reference, capture, threshold) => {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
  const load = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
  const describe = async (src) => {
    const result = await faceapi
      .detectSingleFace(await load(src), options)
      .withFaceLandmarks()
      .withFaceDescriptor();
    return result ? result.descriptor : null;
  };
  const a = await describe(reference);
  const b = await describe(capture);
  if (!a || !b) return { distance: null };
  return { distance: faceapi.euclideanDistance(a, b) };
};
window.ready = true;
</script>`);
        return;
      }
      const file = path.startsWith('/dist/')
        ? join(PACKAGE_ROOT, path)
        : join(MODEL_ROOT, path.replace(/^\/model\//, ''));
      try {
        const body = await readFile(file);
        response
          .writeHead(200, {
            'content-type': MIME[extname(file)] ?? 'application/octet-stream',
          })
          .end(body);
      } catch {
        response.writeHead(404).end('not found');
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Could not bind the face matcher server');
  }

  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(
    () => (window as unknown as { ready?: boolean }).ready === true,
    null,
    { timeout: 60_000 },
  );

  return { server, browser, page };
}

async function getMatcher(): Promise<Matcher> {
  if (!matcherPromise) {
    matcherPromise = start().catch((error: unknown) => {
      matcherPromise = null;
      throw error;
    });
  }
  return matcherPromise;
}

export interface FaceMatchResult {
  faceFound: boolean;
  descriptorsFound: number;
  distance: number | null;
  threshold: number;
  match: boolean;
  detectionScore: number | null;
}

/**
 * Compares a live capture against the enrolled descriptor.
 * Both images are base64 data URLs (JPEG or PNG).
 *
 * The comparison itself lives on the page (`window.faceCompare`), so this side
 * only passes strings in and reads a number out.
 */
export async function compareFaces(
  referenceDataUrl: string,
  captureDataUrl: string,
  threshold = 0.45,
): Promise<FaceMatchResult> {
  const matcher = await getMatcher();

  // A single expression: the page owns the helper, so nothing is evaluated here.
  const outcome = await matcher.page.evaluate(
    (args) =>
      (
        window as unknown as {
          faceCompare: (a: string, b: string) => Promise<{ distance: number | null }>;
        }
      ).faceCompare(args.reference, args.capture),
    { reference: referenceDataUrl, capture: captureDataUrl },
  );

  if (outcome.distance === null) {
    return {
      faceFound: false,
      descriptorsFound: 0,
      distance: null,
      threshold,
      match: false,
      detectionScore: null,
    };
  }

  return {
    faceFound: true,
    descriptorsFound: 1,
    distance: Number(outcome.distance.toFixed(4)),
    threshold,
    match: outcome.distance <= threshold,
    detectionScore: null,
  };
}

export async function shutdownFaceMatcher(): Promise<void> {
  if (!matcherPromise) return;
  const matcher = await matcherPromise.catch(() => null);
  matcherPromise = null;
  if (!matcher) return;
  await matcher.browser.close();
  await new Promise<void>((resolve) => matcher.server.close(() => resolve()));
}
