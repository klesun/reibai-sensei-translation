import type {Translations} from "../modules/DataParse";
import {
    collectBubblesStorage,
    collectNotesStorage, collectUnrecognizedBubblesStorage, getPageName,
    parseStreamedJson
} from "../modules/DataParse";
import type {NoteTransaction, PageTransactionBase, TranslationTransaction} from "../modules/Api";
import type * as JSZipModule from "../node_modules/jszip/index";
import type {UnrecognizedTranslationTransaction} from "../modules/Api";

declare const JSZip: JSZipModule;

const gui = {
    bubble_text_paths_list: document.getElementById("bubble_text_paths_list")!,
    translators_note_text_path: document.getElementById("translators_note_text_path")!,
    download_result_link: document.getElementById("download_result_link") as HTMLAnchorElement,
    src_scan_image: document.getElementById("src_scan_image") as unknown as SVGImageElement,
    bubble_texts_list: document.getElementById("bubble_texts_list")!,
    bubble_text_outlines_list: document.getElementById("bubble_text_outlines_list")!,
    output_png_canvas: document.getElementById("output_png_canvas") as HTMLCanvasElement,
    white_blur_img: document.getElementById("white_blur_img") as HTMLImageElement,
    status_message_holder: document.getElementById("status_message_holder") as HTMLImageElement,
};

const FONT_SIZE = 12;
const FONT = FONT_SIZE + 'px Comic Sans MS';

function getLineWidth(text: string) {
    const ctx = gui.output_png_canvas.getContext('2d')!;
    ctx.font = FONT;
    return ctx.measureText(text).width;
}

function wrapWords(text: string, boundsWidth: number): string[] {
    const paragraphs = text.split('\n').filter(p => p.trim());
    return paragraphs.flatMap(paragraph => {
        const words = paragraph.split(' ');
        const lines = [''];
        for (const word of words) {
            const joined = (lines[lines.length - 1] + ' ' + word).trim();
            const joinedWidth = getLineWidth(joined);
            if (joinedWidth > boundsWidth) {
                lines.push(word);
            } else {
                lines[lines.length - 1] = joined;
            }
        }
        return lines;
    });
}

const getBubbleDimensions = (tx: TranslationTransaction | UnrecognizedTranslationTransaction) => {
    const minX = tx.bounds.minX - 6;
    const maxX = tx.bounds.maxX + 6;
    const width = Math.max(maxX - minX, 48);
    const centerX = (maxX + minX) / 2;
    const wrapped = wrapWords(tx.eng_human, width);
    const minY = tx.bounds.minY;
    const maxY = tx.bounds.maxY;
    const height = maxY - minY;
    const centerY = (maxY + minY) / 2;
    const startY = centerY - (wrapped.length - 1.5) * FONT_SIZE / 2;

    return {
        centerX,
        centerY,
        width,
        height,
        texts: wrapped.map((line, i) => {
            return {line, x: centerX, y: startY + FONT_SIZE * i};
        }),
    };
};

const eraseOldText = (ctx: CanvasRenderingContext2D, tx: TranslationTransaction | UnrecognizedTranslationTransaction) => {
    const {centerX, centerY, width, height, texts} = getBubbleDimensions(tx);

    const blurWidth = width * 1.2;
    const blurHeight = height * 1.5;
    const xRadius = centerX - blurWidth / 2;
    const yRadius = centerY - blurHeight / 2;
    ctx.drawImage(gui.white_blur_img, xRadius, yRadius, blurWidth, blurHeight);

    for (const {x, y, line} of texts) {
        ctx.strokeText(line, x, y);
    }
};

const drawNewText = (ctx: CanvasRenderingContext2D, tx: TranslationTransaction | UnrecognizedTranslationTransaction) => {
    const {texts} = getBubbleDimensions(tx);

    for (const {x, y, line} of texts) {
        ctx.fillText(line, x, y);
    }
};

const drawTranslation = (ctx: CanvasRenderingContext2D, translations: Translations, qualifier: PageTransactionBase) => {
    const {bubbleMatrix, unrecognizedBubbleMatrix, noteMatrix} = translations;
    const {volumeNumber, pageIndex}  = qualifier;

    const transactions = Object.values(bubbleMatrix[volumeNumber]?.[pageIndex] ?? {})
        .filter(tx => !tx.eng_human.trim().toLocaleLowerCase().match(/^x*$/));
    const unrecognized = Object.values(unrecognizedBubbleMatrix[volumeNumber]?.[pageIndex] ?? {});
    const allTransactions: (TranslationTransaction | UnrecognizedTranslationTransaction)[] = [...transactions, ...unrecognized];

    ctx.textAlign = 'center';
    for (const tx of allTransactions) {
        eraseOldText(ctx, tx);
    }
    // must be in separate loops to make sure that the white won't erase new text
    for (const tx of allTransactions) {
        drawNewText(ctx, tx);
    }
    const translatorsNote = noteMatrix[volumeNumber]?.[pageIndex]?.text;
    if (translatorsNote) {
        ctx.textAlign = 'left';
        const wrapped = wrapWords(translatorsNote, 685);
        for (let i = 0; i < wrapped.length; ++i) {
            ctx.fillText(wrapped[i], 0, 1024 + FONT_SIZE * (i + 1));
        }
    }
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
            const pageName = getPageName(qualifier);

            const ctx = gui.output_png_canvas.getContext('2d')!;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, gui.output_png_canvas.width, gui.output_png_canvas.height);
            // gui.src_scan_image.setAttribute('src', `https://reibai.info/unv/volumes/${pageName}.jpg`);
            gui.src_scan_image.setAttribute('src', `../unv/volumes/${pageName}.jpg`);
            const pngUrl = await new Promise<string>((resolve) => {
                gui.src_scan_image.onload = () => {
                    ctx.drawImage(gui.src_scan_image, 0, 0);
                    ctx.font = FONT;
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 8;
                    ctx.fillStyle = 'black';
                    drawTranslation(ctx, translations, qualifier);
                    resolve(gui.output_png_canvas.toDataURL());
                };
            });

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
