
import { promises as fs } from 'fs';
import OcrDataAdapter, {collectBlockText} from "../docs/modules/OcrDataAdapter.js";
import {dirname} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {import('./../docs/typing/CloudVisionApi.d.ts').CloudVisionApiResponse} CloudVisionApiResponse
 */

const main = async () => {
    const sentences = new Set();
    for (let volumeNumber = 1; volumeNumber <= 20; ++volumeNumber) {
        const dirName = 'v' + ('00' + volumeNumber).slice(-2);
        const ocredDirPath = __dirname + '/../docs/assets/ocred_volumes/' + dirName;
        console.log(ocredDirPath);
        const ocrNames = await fs.readdir(ocredDirPath);
        for (const ocrName of ocrNames) {
            const ocrPath = ocredDirPath + '/' + ocrName;
            const ocrDataStr = await fs.readFile(ocrPath, 'utf8');
            /** @type {CloudVisionApiResponse} */
            const ocrData = JSON.parse(ocrDataStr);
            const { blocks } = OcrDataAdapter(ocrData);
            for (const block of blocks) {
                const text = collectBlockText(block);
                sentences.add(text);
            }
        }
    }
    console.log(JSON.stringify([...sentences], null, 4));
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
