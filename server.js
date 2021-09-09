
import * as url from 'url';
import * as fsSync from 'fs';
import * as path from 'path';
import * as http from 'http';
import {dirname} from "path";
import {fileURLToPath} from "url";

const fs = fsSync.promises;
const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_PATH = path.resolve(__dirname, './public');

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
    fsSync.createReadStream(absPath).pipe(res);
};

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
const handleHttpRequestSafe = (req, res) => {
    serveStaticFile(req, res).catch(exc => {
        res.statusCode = exc?.statusCode || 500;
        res.statusMessage = ((exc || {}).message || exc + '' || '(empty error)')
            // sanitize, as statusMessage seems to not allow special characters
            .slice(0, 300).replace(/[^ -~]/g, '?');
        res.end(JSON.stringify({error: exc + '', stack: exc.stack}));
    });
};

const PORT = 36418;

http.createServer(handleHttpRequestSafe)
    .listen(PORT, () => console.log('Now you can open http://localhost:' + PORT + '/index.html in your browser ;)'));
