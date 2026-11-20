/**
 * Streaming zip helpers for the ETL — never buffers huge members.
 * Built on yauzl (scans entry offsets without decompressing first).
 */
import yauzl from 'yauzl';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const OPEN_OPTS = { lazyEntries: true, autoClose: true, validateEntrySizes: false };

/** Return the entry object for `name` (case-tolerant of leading ./), or null. */
function findEntry(zipPath, name) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, OPEN_OPTS, (err, zip) => {
      if (err) return reject(err);
      let found = null;
      zip.on('entry', (entry) => {
        const base = entry.fileName.replace(/^\.\//, '');
        if (base === name) found = entry;
        zip.readEntry();
      });
      zip.on('end', () => resolve(found));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

function openEntryStream(zipPath, entry) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { ...OPEN_OPTS, lazyEntries: false }, (err, zip) => {
      if (err) return reject(err);
      let settled = false;
      const base = entry.fileName.replace(/^\.\//, '');
      zip.on('entry', (e) => {
        if (settled) return;
        if (e.fileName.replace(/^\.\//, '') === base) {
          settled = true;
          zip.openReadStream(e, (err2, stream) => {
            if (err2) return reject(err2);
            resolve(stream);
          });
        }
      });
      zip.on('end', () => {
        if (!settled) reject(new Error(`entry ${base} not found in ${zipPath}`));
      });
      zip.on('error', reject);
    });
  });
}

/** Check that an entry exists without decompressing it. */
export async function entryExists(zipPath, name) {
  const entry = await findEntry(zipPath, name);
  return !!entry;
}

/** Read a (small) member fully into memory. Returns string or null. */
export async function readZipText(zipPath, name) {
  const entry = await findEntry(zipPath, name);
  if (!entry) return null;
  const stream = await openEntryStream(zipPath, entry);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** Stream a member into a writable stream (returns true if found). */
export async function extractZipEntry(zipPath, name, destPath) {
  const entry = await findEntry(zipPath, name);
  if (!entry) return false;
  const stream = await openEntryStream(zipPath, entry);
  await pipeline(stream, createWriteStream(destPath));
  return true;
}
