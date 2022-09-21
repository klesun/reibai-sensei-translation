
import * as url from 'url';
import * as fsSync from 'fs';
import * as path from 'path';
import * as http from 'http';
import {dirname} from "path";
import {fileURLToPath} from "url";
import { HttpErrorBase } from "@curveball/http-errors";
import submitBubbleUpdate from "./server/api/submitBubbleUpdate.js";
import submitNoteUpdate from "./server/api/submitNoteUpdate.js";
import submitLocalBackup from "./server/api/submitLocalBackup.js";
import submitUnrecognizedBubbleUpdate from "./server/api/submitUnrecognizedBubbleUpdate.js";
import { createGzip } from 'zlib';

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
        res.writeHead(200, {'content-encoding': 'gzip'});
        outputStream = outputStream.pipe(createGzip());
    }
    outputStream.pipe(res);
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
        .finally(() => res.setHeader('content-type', 'application/json'))
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
    const { protocol } = req;
    const url = new URL(req.url, protocol + '://' + req.headers.host);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

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

http.createServer(handleHttpRequestSafe)
    .listen(PORT, () => console.log('Now you can open http://localhost:' + PORT + '/index.html in your browser ;)'));
