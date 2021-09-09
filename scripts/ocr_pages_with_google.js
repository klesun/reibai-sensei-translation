const vision = require('@google-cloud/vision');
const { promises: fs } = require('fs');

async function main() {
    const client = new vision.ImageAnnotatorClient();

    for (let volumeNumber = 1; volumeNumber <= 20; ++volumeNumber) {
        const dirName = 'v' + ('00' + volumeNumber).slice(-2);
        const imgDirPath = __dirname + '/../public/unv/volumes/' + dirName;
        const imgNames = await fs.readdir(imgDirPath);
        const ocredDirPath = __dirname + '/../public/assets/ocred_volumes/' + dirName;
        await fs.mkdir(ocredDirPath, {recursive: true});
        for (const imgName of imgNames) {
            const imgPath = imgDirPath + '/' + imgName;
            const ocrPath = ocredDirPath + '/' + imgName + '.json';
            console.log(imgPath);
            const response = await client.documentTextDetection(imgPath);
            await fs.writeFile(ocrPath, JSON.stringify(response));
        }
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
