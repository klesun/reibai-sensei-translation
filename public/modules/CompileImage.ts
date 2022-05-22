import type {PageTransactionBase} from "./Api";
import type { Translations} from "./DataParse";
import {getPageName} from "./DataParse";
import type {TranslationTransaction, UnrecognizedTranslationTransaction} from "./Api";


const FONT_SIZE = 12;
const FONT = FONT_SIZE + 'px Comic Sans MS';

export default async ({qualifier, translations, gui}: {
    qualifier: PageTransactionBase,
    translations: Translations
    gui: {
        src_scan_image: HTMLImageElement | SVGImageElement,
        output_png_canvas: HTMLCanvasElement,
        white_blur_img: HTMLImageElement,
    },
}) => {
    function getLineWidth(text: string) {
        const ctx = gui.output_png_canvas.getContext('2d')!;
        ctx.font = FONT;
        return ctx.measureText(text).width;
    }

    function wrapWords(text: string, boundsWidth: number): string[] {
        const paragraphs = text.trim().split('\n');
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
        const blurHeight = height * 1.2;
        const xRadius = centerX - blurWidth / 2;
        const yRadius = centerY - blurHeight / 2;
        if (!tx.eng_human.includes('\n\n')) {
            ctx.drawImage(gui.white_blur_img, xRadius, yRadius, blurWidth, blurHeight);
        }

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
        const unrecognized = Object.values(unrecognizedBubbleMatrix[volumeNumber]?.[pageIndex] ?? {})
            .filter(u => !u.deleted);
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

    const main = async () => {
        const pageName = getPageName(qualifier);

        const ctx = gui.output_png_canvas.getContext('2d')!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, gui.output_png_canvas.width, gui.output_png_canvas.height);
        gui.src_scan_image.setAttribute('src', `https://reibai.info/unv/volumes/${pageName}.jpg`);
        // gui.src_scan_image.setAttribute('src', `../unv/volumes/${pageName}.jpg`);
        await new Promise<void>((resolve) => {
            gui.src_scan_image.onload = () => {
                ctx.drawImage(gui.src_scan_image, 0, 0);
                ctx.font = FONT;
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 8;
                ctx.fillStyle = 'black';
                drawTranslation(ctx, translations, qualifier);
                resolve();
            };
        });
    };

    return main();
};
