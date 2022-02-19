import {
    BubbleMatrix,
    collectBubblesStorage,
    collectNotesStorage,
    getPageName, NoteMatrix,
    parseStreamedJson
} from "../modules/DataParse";
import {NoteTransaction, PageTransactionBase, TranslationTransaction} from "../modules/Api";
import {Svg} from "../modules/Dom.js";

const gui = {
    injected_translations_svg_root: document.getElementById("injected_translations_svg_root")!,
    bubble_text_paths_list: document.getElementById("bubble_text_paths_list")!,
    translators_note_text_path: document.getElementById("translators_note_text_path")!,
    download_svg_btn: document.getElementById("download_svg_link") as HTMLAnchorElement,
    src_scan_image: document.getElementById("src_scan_image") as SVGImageElement,
    bubble_texts_list: document.getElementById("bubble_texts_list")!,
    bubble_text_outlines_list: document.getElementById("bubble_text_outlines_list")!,
    output_png_canvas: document.getElementById("output_png_canvas") as HTMLCanvasElement,
};

const makePathId = (tx: TranslationTransaction) => 'path_ocr_bubble_' + tx.ocrBubbleIndex;

const makeTextNode = (tx: TranslationTransaction, classes: string[]) => Svg('text', {
    class: [...classes, 'comic-text'].join(" "),
}, [
    Svg('textPath', {
        'href': '#' + makePathId(tx),
        'xlink:href': '#' + makePathId(tx),
    }, tx.eng_human)
]);

const makeBubbleText = (tx: TranslationTransaction) => {
    const minX = tx.bounds.minX - 4;
    const maxX = tx.bounds.maxX + 4;
    const minY = tx.bounds.minY + 12;
    const width = maxX - minX;
    const pathLines = [];
    for (let i = 0; i < 10; ++i) {
        pathLines.push(`M${minX},${minY + 12 * i} H${minX + width}`);
    }
    return {
        pathNode: Svg('path', {
            id: makePathId(tx),
            d: pathLines.join(" "),
        }),
        outlineNode: makeTextNode(tx, ['outline']),
        textNode: makeTextNode(tx, []),
    };
};

const compilePage = (translations: Translations, qualifier: PageTransactionBase) => {
    const {bubbleMatrix, noteMatrix} = translations;
    const {volumeNumber, pageIndex}  = qualifier;

    const pageName = getPageName(qualifier);
    gui.src_scan_image.setAttribute('href', `https://reibai.info/unv/volumes/${pageName}.jpg`);
    gui.bubble_text_paths_list.innerHTML = '';
    gui.bubble_text_outlines_list.innerHTML = '';
    gui.bubble_texts_list.innerHTML = '';
    const transactions = Object.values(bubbleMatrix[volumeNumber]?.[pageIndex] ?? {})
        .filter(tx => !tx.eng_human.trim().toLocaleLowerCase().match(/^x*$/));
    for (const tx of transactions) {
        const {pathNode, outlineNode, textNode} = makeBubbleText(tx);
        gui.bubble_text_paths_list.appendChild(pathNode);
        gui.bubble_text_outlines_list.appendChild(outlineNode);
        gui.bubble_texts_list.appendChild(textNode);
    }
    const translatorsNote = noteMatrix[volumeNumber]?.[pageIndex]?.text;
    gui.translators_note_text_path.textContent = !translatorsNote ? '' : 'tr. note: ' + translatorsNote;
};

type Translations = {
    bubbleMatrix: BubbleMatrix,
    noteMatrix: NoteMatrix,
};

export default async (
    fetchingBubbles: Promise<Response>,
    fetchingNotes: Promise<Response>
) => {
    const whenBubbleMapping = fetchingBubbles
        .then(rs => parseStreamedJson<TranslationTransaction>(rs))
        .then(txs => collectBubblesStorage(txs));
    const whenNoteMapping = fetchingNotes
        .then(rs => parseStreamedJson<NoteTransaction>(rs))
        .then(txs => collectNotesStorage(txs));

    const bubbleMapping = await whenBubbleMapping;
    const noteMapping = await whenNoteMapping;
    const translations = {
        bubbleMatrix: bubbleMapping.matrix,
        noteMatrix: noteMapping.matrix,
    };

    const zip = new JSZip();

    const volumeNumber = 1;
    let totalSize = 0;
    for (let pageIndex = 0; pageIndex < 156; ++pageIndex) {
        const qualifier = {volumeNumber, pageIndex};
        compilePage(translations, qualifier);
        const svgStr = gui.injected_translations_svg_root.outerHTML;

        const pngUrl = await new Promise((resolve) => {
            const ctx = gui.output_png_canvas.getContext('2d')!;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, gui.output_png_canvas.width, gui.output_png_canvas.height);
            gui.src_scan_image.onload = () => {
                gui.output_png_canvas.getContext('2d')!.drawImage(gui.src_scan_image, 0, 0);
                const img = new Image();
                img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr));
                img.onload = () => {
                    ctx.drawImage(img, 0, 0);
                    resolve(gui.output_png_canvas.toDataURL());
                }
            };
        });

        const svgFileName = 'reibai_v' + volumeNumber + '_p' + pageIndex + '.png';
        const base64 = pngUrl.slice('data:image/png;base64,'.length);
        zip.file(svgFileName, base64, {base64: true});
        totalSize += base64.length;
    }
    console.log("zipping " + totalSize);
    zip.generateAsync({type: 'blob'}).then(content => {
        gui.download_svg_btn.download = 'reibai_sinsei_eng_v' + volumeNumber + '.zip';
        gui.download_svg_btn.setAttribute('href', URL.createObjectURL(content));
    });
};
