
import * as url from 'url';
import * as fsSync from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import {dirname} from "path";
import {fileURLToPath} from "url";
import { HttpErrorBase } from "@curveball/http-errors";
import submitBubbleUpdate from "./server/api/submitBubbleUpdate.js";
import submitNoteUpdate from "./server/api/submitNoteUpdate.js";
import submitLocalBackup, { listLocalBackups } from "./server/api/submitLocalBackup.js";
import submitUnrecognizedBubbleUpdate from "./server/api/submitUnrecognizedBubbleUpdate.js";
import { createGzip } from 'zlib';
import {readJson} from "./server/utils/Http.js";
import { promises as fs } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_PATH = path.resolve(__dirname, './docs');

class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

const getMimeByExt = (ext) => {
    const mapping = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'text/javascript',
        'ts': 'text/typescript',
        'svg': 'image/svg+xml',
    };
    return mapping[ext];
};

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
const serveStaticFile = async (req, res) => {
    const parsedUrl = url.parse(req.url);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const normalizedPathname = pathname.endsWith('/')
        ? pathname + 'index.html'
        : pathname;

    const absPath = path.resolve(PUBLIC_PATH + '/' + normalizedPathname);
    if (!absPath.startsWith(PUBLIC_PATH + '/') && absPath !== PUBLIC_PATH) {
        throw new HttpError(400, 'Invalid path requested: ' + pathname);
    }
    if (!fsSync.existsSync(absPath)) {
        throw new HttpError(404, 'File ' + pathname + ' does not exist');
    }
    const ext = absPath.replace(/^.*\./, '');
    const mime = getMimeByExt(ext);
    if (mime) {
        res.setHeader('Content-Type', mime);
    }
    let outputStream = fsSync.createReadStream(absPath);
    if (ext === 'json') {
        res.writeHead(200, {
            'content-encoding': 'gzip',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Credentials': true,
        });
        outputStream = outputStream.pipe(createGzip());
    }
    outputStream.pipe(res);
};

const handleDiscordInteraction = async (req) => {
    const params = await readJson(req);
    console.log("ololo interaction", params);
    return { type: 1 };
};

const EXPECTED_STATUS_CODES = new Set([
    400, 401, 403, 404,
]);

const setResponseError = (res, error) => {
    const [statusCode, message] = error instanceof HttpErrorBase
        ? [error.httpStatus, error.message]
        : [520, error?.message || String(error)];
    if (!EXPECTED_STATUS_CODES.has(statusCode)) {
        console.error(error);
    }
    const messages = message.trimEnd().split('\n');
    res.statusCode = statusCode;
    res.statusMessage = messages[0]
        // sanitize, as statusMessage does not allow special characters
        .slice(0, 300).replace(/[^ -~]/g, '?');

    return { messages };
};


const serveJson = (whenResult, res) => {
    whenResult
        .finally(() => {
            res.setHeader('content-type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.setHeader('Access-Control-Allow-Credentials', true);
        })
        .then(result => {
            const payload = JSON.stringify(result);
            res.write(payload);
        })
        .catch(error => {
            const { messages } = setResponseError(res, error);
            const payload = JSON.stringify({
                messages: messages,
            }, null, messages.length > 0 ? 4 : undefined);
            res.write(payload);
        })
        .finally(() => res.end());
};

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
const handleHttpRequestSafe = (req, res) => {
    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Credentials', true);
        res.end();
        return;
    }

    const { protocol } = req;
    const url = new URL(req.url, protocol + '://' + req.headers.host);

    if (url.pathname === '/api/submitBubbleUpdate') {
        const whenResult = Promise.resolve(req).then(submitBubbleUpdate);
        serveJson(whenResult, res);
    } else if (url.pathname === '/api/submitUnrecognizedBubbleUpdate') {
        const whenResult = Promise.resolve(req).then(submitUnrecognizedBubbleUpdate);
        serveJson(whenResult, res);
    } else if (url.pathname === '/api/submitNoteUpdate') {
        const whenResult = Promise.resolve(req).then(submitNoteUpdate);
        serveJson(whenResult, res);
    } else if (url.pathname === '/api/submitLocalBackup') {
        const whenResult = Promise.resolve(req).then(submitLocalBackup);
        serveJson(whenResult, res);
    } else if (url.pathname === '/api/listLocalBackups') {
        const whenResult = Promise.resolve(req).then(listLocalBackups);
        serveJson(whenResult, res);
    } else if (url.pathname === '/api/handleDiscordInteraction') {
        const whenResult = Promise.resolve(req).then(handleDiscordInteraction);
        serveJson(whenResult, res);
    } else {
        serveStaticFile(req, res).catch(exc => {
            res.statusCode = exc?.statusCode || 500;
            res.statusMessage = ((exc || {}).message || exc + '' || '(empty error)')
                // sanitize, as statusMessage seems to not allow special characters
                .slice(0, 300).replace(/[^ -~]/g, '?');
            res.end(JSON.stringify({error: exc + '', stack: exc.stack}));
        });
    }
};

const PORT = 36418;

const server = http.createServer(handleHttpRequestSafe).listen(PORT, '0.0.0.0', () => {
    console.log('listening https://torr.rent:' + PORT);
});
server.keepAliveTimeout = 3 * 60 * 1000; // 3 minutes, for fast browsing

const startEpochMs = Date.now();

async function signalShutdown(signal) {
    console.log("Received a process shutdown signal, preparing to stop the application", signal);

    const versionedOcrBubbles = JSON.parse((await fs.readFile(
        __dirname + "/docs/assets/translation_update_transactions.json", "utf8"
    )) + "null]").slice(0, -1).filter(r => new Date(r.sentAt).getTime() > startEpochMs);
    const versionedNotes = JSON.parse((await fs.readFile(
        __dirname + "/docs/assets/translator_notes_transactions.json", "utf8"
    )) + "null]").slice(0, -1).filter(r => new Date(r.sentAt).getTime() > startEpochMs);
    const versionedPlacedBubbles = JSON.parse((await fs.readFile(
        __dirname + "/docs/assets/unrecognized_bubble_transactions.json", "utf8"
    )) + "null]").slice(0, -1).filter(r => new Date(r.sentAt).getTime() > startEpochMs);

    if (versionedOcrBubbles.length === 0 &&
        versionedNotes.length === 0 &&
        versionedPlacedBubbles.length === 0
    ) {
        console.log("No FS updates");
    } else {
        console.log("FS Updates: " + JSON.stringify({
            versionedOcrBubbles, versionedNotes, versionedPlacedBubbles,
        }));
    }

    console.log("All FS updates logged successfully, exiting gracefully");

    process.exit(0);
}

process.on('SIGINT', signalShutdown);
process.on('SIGTERM', signalShutdown);
process.on('SIGHUP', signalShutdown);
