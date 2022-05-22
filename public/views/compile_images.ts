import type {Translations} from "../modules/DataParse";
import {
    collectBubblesStorage,
    collectNotesStorage, collectUnrecognizedBubblesStorage, getPageName,
    parseStreamedJson
} from "../modules/DataParse";
import type {NoteTransaction, PageTransactionBase, TranslationTransaction} from "../modules/Api";
import type * as JSZipModule from "../node_modules/jszip/index";
import type {UnrecognizedTranslationTransaction} from "../modules/Api";
import CompileImage from "../modules/CompileImage";

declare const JSZip: JSZipModule;

const gui = {
    download_result_link: document.getElementById("download_result_link") as HTMLAnchorElement,
    src_scan_image: document.getElementById("src_scan_image") as unknown as SVGImageElement,
    output_png_canvas: document.getElementById("output_png_canvas") as HTMLCanvasElement,
    white_blur_img: document.getElementById("white_blur_img") as HTMLImageElement,
    status_message_holder: document.getElementById("status_message_holder") as HTMLImageElement,
};

export default async (
    fetchingBubbles: Promise<Response>,
    fetchingUnrecognizedBubbles: Promise<Response>,
    fetchingNotes: Promise<Response>
) => {
    const whenBubbleMapping = fetchingBubbles
        .then(rs => parseStreamedJson<TranslationTransaction>(rs))
        .then(txs => collectBubblesStorage(txs));
    const whenUnrecognizedBubbleMapping = fetchingUnrecognizedBubbles
        .then(rs => parseStreamedJson<UnrecognizedTranslationTransaction>(rs))
        .then(txs => collectUnrecognizedBubblesStorage(txs));
    const whenNoteMapping = fetchingNotes
        .then(rs => parseStreamedJson<NoteTransaction>(rs))
        .then(txs => collectNotesStorage(txs));

    const bubbleMapping = await whenBubbleMapping;
    const unrecognizedBubbleMapping = await whenUnrecognizedBubbleMapping;
    const noteMapping = await whenNoteMapping;
    const translations = {
        bubbleMatrix: bubbleMapping.matrix,
        unrecognizedBubbleMatrix: unrecognizedBubbleMapping.matrix,
        noteMatrix: noteMapping.matrix,
    };

    const zip = new JSZip();

    const volumes = [
        {volumeNumber: 1, pages: 156},
        {volumeNumber: 2, pages: 156},
        {volumeNumber: 3, pages: 156},
        {volumeNumber: 4, pages: 158},
        {volumeNumber: 5, pages: 158},
    ];

    let totalSize = 0;
    for (const {volumeNumber, pages} of volumes) {
        for (let pageIndex = 0; pageIndex < pages; ++pageIndex) {
            const qualifier = {volumeNumber, pageIndex};
            await CompileImage({qualifier, translations, gui});
            const pngUrl = gui.output_png_canvas.toDataURL();

            const pngFileName = 'reibai_v' + ("0" + volumeNumber).slice(-2) + '_p' + ("00" + pageIndex).slice(-3) + '.png';
            const base64 = pngUrl.slice('data:image/png;base64,'.length);
            zip.file(pngFileName, base64, {base64: true});
            totalSize += base64.length;
            gui.status_message_holder.textContent = 'Produced ' + pngFileName + ' ' + (base64.length / 1024 / 1024).toFixed(2) + ' MiB';
        }
    }

    gui.status_message_holder.textContent = 'Output images produced, generating zip file, ' + (totalSize / 1024 / 1024).toFixed(2) + ' MiB';

    zip.generateAsync({type: 'blob'}).then(content => {
        gui.download_result_link.download = 'reibai_sensei_eng.zip';
        gui.download_result_link.setAttribute('href', URL.createObjectURL(content));
        gui.status_message_holder.textContent = 'zip file is ready for download!';
    });
};
