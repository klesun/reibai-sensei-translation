import vision from '@google-cloud/vision';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
    const client = new vision.ImageAnnotatorClient();

    for (let volumeNumber = 1; volumeNumber <= 20; ++volumeNumber) {
        const dirName = 'v' + ('00' + volumeNumber).slice(-2);
        const imgDirPath = __dirname + '/../docs/unv/volumes/' + dirName;
        const imgNames = await fs.readdir(imgDirPath);
        const ocredDirPath = __dirname + '/../docs/assets/ocred_volumes_with_language_hints/' + dirName;
        await fs.mkdir(ocredDirPath, {recursive: true});
        for (const imgName of imgNames) {
            const imgPath = imgDirPath + '/' + imgName;
            const ocrPath = ocredDirPath + '/' + imgName + '.json';
            console.log(imgPath);
            const response = await client.documentTextDetection({
                image: { source: { filename: imgPath } },
                imageContext: {"languageHints": ["ja"]},
            });
            await fs.writeFile(ocrPath, JSON.stringify(response));
        }
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
