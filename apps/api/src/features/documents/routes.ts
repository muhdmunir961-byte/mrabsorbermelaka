/*
 * Fastify's plugin contract is Promise-based, so this registration is `async`
 * even though route declaration itself awaits nothing.
 */
/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UploadMetadata } from '@mr/shared';
import { currentUser } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import { listMine, readDocument, removeDocument, upload } from './service.js';

const DocumentIdParams = z.object({ documentId: z.uuid() }).strict();

/**
 * Metadata travels in headers, not in the multipart body: the payload here is a
 * raw buffer, so there is no parser to trust or configure.
 *
 * Headers cannot be `.strict()` — a real request always carries host,
 * user-agent, accept and friends — so only the fields we need are read.
 */
const UploadHeaders = z.object({
  'x-document-kind': UploadMetadata.shape.kind,
  'x-document-type': UploadMetadata.shape.mimeType,
  'x-document-size': z.coerce.number().int().positive(),
});

export const documentRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/upload',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = currentUser(request);
      const headers = parseInput(UploadHeaders, request.headers);
      const metadata = parseInput(UploadMetadata, {
        kind: headers['x-document-kind'],
        mimeType: headers['x-document-type'],
        sizeBytes: headers['x-document-size'],
      });

      const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      return reply.code(201).send(await upload(user, metadata, body));
    },
  );

  app.get('/', async (request) => {
    const user = currentUser(request);
    return listMine(user);
  });

  app.get('/:documentId', async (request, reply) => {
    const user = currentUser(request);
    const { documentId } = parseInput(DocumentIdParams, request.params);
    const file = await readDocument(user, documentId);

    return (
      reply
        .header('content-type', file.mimeType)
        .header('content-length', String(file.sizeBytes))
        // Never let a browser sniff an upload into something executable, and never
        // render it inline from our own origin.
        .header('x-content-type-options', 'nosniff')
        .header('content-disposition', `attachment; filename="${documentId}"`)
        .header('cache-control', 'private, no-store')
        .send(file.body)
    );
  });

  app.delete('/:documentId', async (request, reply) => {
    const user = currentUser(request);
    const { documentId } = parseInput(DocumentIdParams, request.params);
    await removeDocument(user, documentId);
    return reply.code(204).send();
  });
};
