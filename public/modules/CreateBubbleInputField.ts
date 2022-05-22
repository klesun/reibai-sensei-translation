import type {IndexedBlock} from "../typing/CloudVisionApi";
import type {PageTransactionBase, TranslationTransaction} from "./Api";
import type {BubbleMapping} from "./DataParse";
import {collectBlockText, getBlockBounds} from "./OcrDataAdapter.js";
import {Dom} from "./Dom.js";

export const focusBubbleSvg = (ocrIndex: number | string) => {
    [...document.querySelectorAll('.focused-block-polygon')]
        .forEach(poly => poly.classList.toggle('focused-block-polygon', false));
    [...document.querySelectorAll('polygon[data-block-ocr-index="' + ocrIndex + '"]')]
        .forEach(poly => poly.classList.toggle('focused-block-polygon', true));
};

export default (
    block: IndexedBlock,
    qualifier: PageTransactionBase,
    jpnToEng: Map<string, string>,
    bubbleMapping: BubbleMapping
): HTMLElement => {
    const jpnSentence = collectBlockText(block).trimEnd();
    const engSentence = jpnToEng.get(jpnSentence);

    const txBase = {
        ...qualifier,
        ocrBubbleIndex: block.ocrIndex,
        jpn_ocr: jpnSentence,
        bounds: getBlockBounds(block),
    } as const;

    const updateState = (fields: Partial<TranslationTransaction>) => {
        const oldState = bubbleMapping.get(txBase) || txBase;
        const tx: TranslationTransaction = {
            eng_human: '',
            ...oldState, ...fields,
            sentAt: new Date().toISOString(),
        };
        bubbleMapping.set(tx);
    };

    let lastValue = '';
    const textarea = Dom('textarea', {
        type: 'text',
        placeholder: engSentence || '', rows: 3,
        'data-block-ocr-index': block.ocrIndex,
        onblur: (evt: Event) => {
            if (lastValue !== textarea.value) {
                lastValue = textarea.value;
                updateState({eng_human: lastValue});
            }
        },
    });

    const lastTranslation = bubbleMapping.get(txBase);
    if (lastTranslation) {
        textarea.value = lastTranslation.eng_human + textarea.value;
        lastValue = textarea.value;
    }

    return Dom('div', {
        class: 'sentence-block',
        onmousedown: () => focusBubbleSvg(block.ocrIndex),
    }, [
        Dom('div', {style: 'flex: 1'}),
        Dom('div', {class: 'ocred-text-block'}, [
            Dom('div', {}, jpnSentence),
            Dom('div', {style: 'display: flex; align-items: end'}, [
                Dom('div', {}, [
                    Dom('div', {}, [
                        Dom('button', {
                            class: 'add-remark-button',
                            ...!bubbleMapping.get(txBase)?.note ? {} : {
                                title: bubbleMapping.get(txBase)!.note,
                            },
                            tabindex: '-1',
                            type: 'button',
                            onclick: (event: MouseEvent) => {
                                const oldRemark = bubbleMapping.get(txBase)?.note;
                                const newRemark = prompt('T/N:', oldRemark);
                                if (newRemark !== null) {
                                    updateState({note: newRemark});
                                    if (!newRemark.trim()) {
                                        (event.target as HTMLButtonElement).removeAttribute('title');
                                    } else {
                                        (event.target as HTMLButtonElement).setAttribute('title', newRemark);
                                    }
                                }
                            },
                        }, '🏷'),
                    ]),
                ]),
                Dom('div', {}, [
                    Dom('div', {
                        class: 'confidence-holder',
                        title: 'Recognized Text Confidence'
                    }, block.confidence.toFixed(2)),
                    Dom('div', {class: 'bubble-number-holder'}, '#' + block.ocrIndex),
                ]),
            ]),
        ]),
        textarea,
    ]);
};
