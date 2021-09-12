
import {Svg, Dom} from "./modules/Dom.js";
import {collectBlockText, getBlockBounds, getFontSize} from "./modules/OcrDataAdapter.js";
import OcrDataAdapter from "./modules/OcrDataAdapter.js";
import {CloudVisionApiResponse, IndexedBlock, Vertex} from "./typing/CloudVisionApi.d";
import Api from "./modules/Api";
import {TranslationTransactionBase} from "./modules/Api";
import {TranslationTransaction} from "./modules/Api";

const gui = {
    annotations_svg_root: document.getElementById('annotations_svg_root')!,
    node_json_holder: document.getElementById('node_json_holder')!,
    selected_block_text_holder: document.getElementById('selected_block_text_holder')!,
    all_text_holder: document.getElementById('all_text_holder')!,
    current_page_img: document.getElementById('current_page_img')!,
    page_input: document.getElementById('page_input') as HTMLInputElement,
    volume_input: document.getElementById('volume_input') as HTMLInputElement,
    page_select_form: document.getElementById('page_select_form')!,
    bubbles_translations_input_form: document.getElementById('bubbles_translations_input_form') as HTMLFormElement,
    go_to_next_page_button: document.getElementById('go_to_next_page_button')!,
    status_message_holder: document.getElementById('status_message_holder')!,
};

type GoogleSentenceTranslation = {
    jpn_ocr: string,
    eng_google: string,
};

const chunked = function*<T>(items: T[], chunkSize: number): Generator<T[]> {
    for (let i = 0; i < items.length; i += chunkSize) {
        yield items.slice(i, i + chunkSize);
    }
};

const BUBBLE_TRANSLATION = 'BUBBLE_TRANSLATION';

const makeLocalKey = (tx: TranslationTransaction) => {
    return BUBBLE_TRANSLATION + '_' + JSON.stringify([
        tx.volumeIndex, tx.pageIndex, tx.ocrBubbleIndex,
    ])
};

const prepareInitialData = async (rs: Response, api: Api) => {
    const dataStr = await rs.text();
    const transactions: TranslationTransaction[] = JSON
        .parse(dataStr + 'null]').slice(0, -1);
    for (let i = 0; i < window.localStorage.length; ++i) {
        const key = window.localStorage.key(i);
        if (key!.startsWith(BUBBLE_TRANSLATION + '_')) {
            const tx: TranslationTransaction = JSON.parse(window.localStorage.getItem(key!)!);
            transactions.push(tx);
        }
    }
    transactions.sort((a,b) => {
        return new Date(a.sentAt).getTime()
            - new Date(b.sentAt).getTime();
    });
    const mapping: Record<number, Record<number, Record<number, TranslationTransaction>>> = {};
    const setEng = (tx: TranslationTransaction) => {
        mapping[tx.volumeIndex] = mapping[tx.volumeIndex] || {};
        mapping[tx.volumeIndex][tx.pageIndex] = mapping[tx.volumeIndex][tx.pageIndex] || {};
        mapping[tx.volumeIndex][tx.pageIndex][tx.ocrBubbleIndex] = tx;
    };
    transactions.forEach(setEng);
    return {
        getEng: (tx: TranslationTransactionBase): string | undefined => {
            if (tx.volumeIndex in mapping &&
                tx.pageIndex in mapping[tx.volumeIndex] &&
                tx.ocrBubbleIndex in mapping[tx.volumeIndex][tx.pageIndex]
            ) {
                return mapping[tx.volumeIndex][tx.pageIndex][tx.ocrBubbleIndex].eng_human;
            } else {
                return undefined;
            }
        },
        setEng: (tx: TranslationTransaction) => {
            setEng(tx);
            // just to be safe in case some server transactions fail
            const localKey = makeLocalKey(tx);
            window.localStorage.setItem(localKey, JSON.stringify(tx));
            api.submitUpdate({ transactions: [tx] })
                .then(rsData => {
                    const msg = 'Submitted your update at #' + tx.ocrBubbleIndex +
                        ' to server: ' + rsData.status;
                    document.body.setAttribute('data-status', 'SUCCESS');
                    gui.status_message_holder.textContent = msg;
                })
                .catch(error => {
                    const msg = 'Could not submit your update at #' + tx.ocrBubbleIndex +
                        ' to server. Your change was stored offline for now... REASON: ' + String(error).slice(0, 60);
                    document.body.setAttribute('data-status', 'ERROR');
                    gui.status_message_holder.textContent = msg;
                });
        },
    };
};

/** @cudos https://stackoverflow.com/a/50767210/2750743 */
function bufferToHex (buffer: ArrayBuffer) {
    return [...new Uint8Array(buffer)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

const getApiToken = async (): Promise<string> => {
    const urlSearchParams = new URLSearchParams(window.location.search);
    if (urlSearchParams.has('api_token')) {
        window.localStorage.setItem('REIBAI_API_TOKEN', urlSearchParams.get('api_token')!);
    } else if (!window.localStorage.getItem('REIBAI_API_TOKEN')) {
        const msg = 'Missing api_token in the URL. It should have been included in ' +
            'the link I gave you, unless I was a potato... Email me if you need help.';
        throw new Error(msg);
    }
    if (crypto.subtle) { // can check if we are in a secure context
        const passwordBytes = new TextEncoder().encode(
            window.localStorage.getItem('REIBAI_API_TOKEN')!
        );
        const hash = await crypto.subtle
            .digest('SHA-256', passwordBytes)
            .then(bufferToHex);
        if (hash !== 'f9979e5a7bb85ca891ee8819b955a906f68b9a589d9d224dae6f359b9e711c5f' &&
            hash !== '41e90b5d85511ce65e6e3b1a8f915c3d9c91e9d6b069f70f715d96e0c776d3de'
        ) {
            const msg = 'Wrong api_token in the URL. Possibly some characters got ' +
                'missing during a copy-paste or smth. Email me if you need help.';
            throw new Error(msg);
        }
    }
    return window.localStorage.getItem('REIBAI_API_TOKEN')!;
};

export default async (whenInitialProgressDataStr: Promise<Response>) => {
    let api_token: string;
    try {
        api_token = await getApiToken();
    } catch (error: unknown) {
        document.body.setAttribute('data-status', 'ERROR');
        gui.status_message_holder.textContent =
            error instanceof Error ? error.message : String(error);
        return;
    }
    const api = Api({api_token: api_token});

    const googleTranslationsPath = './unv/google_translations.json';
    const whenGoogleTranslations = fetch(googleTranslationsPath).then(rs => rs.json());
    const whenInitialData = whenInitialProgressDataStr.then(rs => prepareInitialData(rs, api));

    const googleTranslations: GoogleSentenceTranslation[] = await whenGoogleTranslations;
    const jpnToEng = new Map(
        googleTranslations.map(r => [r.jpn_ocr, r.eng_google])
    );

    let lastFormListener: ((e: Event) => void) | null = null;
    const showSelectedPage = async () => {
        gui.annotations_svg_root.innerHTML = '';
        const pageIndex = +gui.page_input.value;
        const volumeIndex = +gui.volume_input.value;
        const pageFileName = ('000' + pageIndex).slice(-3);
        const volumeDirName = ('00' + volumeIndex).slice(-2);

        gui.current_page_img.setAttribute('src', "./unv/volumes/v" + volumeDirName + "/" + pageFileName + ".jpg");

        const jsonPath = './assets/ocred_volumes/v' + volumeDirName + '/' + pageFileName + '.jpg.json';
        const whenOcrData = fetch(jsonPath).then(rs => rs.json());

        const jsonData: CloudVisionApiResponse = await whenOcrData;
        const { blocks } = OcrDataAdapter(jsonData);

        const makeBlockStr = (b: IndexedBlock) => {
            const jpnSentence = collectBlockText(b).trimEnd();
            const engSentence = jpnToEng.get(jpnSentence);
            return jpnSentence + '\n' + engSentence;
        };

        for (const block of blocks) {
            const bounds = getBlockBounds(block);
            const pointsStr = [
                {x: bounds.minX, y: bounds.minY},
                {x: bounds.maxX, y: bounds.minY},
                {x: bounds.maxX, y: bounds.maxY},
                {x: bounds.minX, y: bounds.maxY},
            ].map(v => v.x + ',' + v.y).join(' ');
            const polygon = Svg('polygon', {
                points: pointsStr,
                class: 'block-polygon',
                'data-block-ocr-index': block.ocrIndex,
                onmousedown: () => {
                    [...document.querySelectorAll('.focused-block-polygon')]
                        .forEach(poly => poly.classList.toggle('focused-block-polygon', false));
                    polygon.classList.toggle('focused-block-polygon', true);
                },
                onclick: () => {
                    [...document.querySelectorAll('textarea[data-block-ocr-index="' + block.ocrIndex + '"]')]
                        .forEach(area => (area as HTMLElement).focus());
                },
            }, [
                Svg('title', {}, makeBlockStr(block)),
            ]);
            gui.annotations_svg_root.appendChild(polygon);
        }

        const focusBubbleSvg = (ocrIndex: number | string) => {
            [...document.querySelectorAll('.focused-block-polygon')]
                .forEach(poly => poly.classList.toggle('focused-block-polygon', false));
            [...document.querySelectorAll('polygon[data-block-ocr-index="' + ocrIndex + '"]')]
                .forEach(poly => poly.classList.toggle('focused-block-polygon', true));
        };

        gui.all_text_holder.innerHTML = '';
        const CELLS_PER_ROW = 3;
        // TODO: implement saving entered translator notes
        // TODO: implement arrow navigation for bubbles on image
        for (const rowBlocks of chunked(blocks, CELLS_PER_ROW)) {
            const blockCells = rowBlocks.map(block => {
                const jpnSentence = collectBlockText(block).trimEnd();
                const engSentence = jpnToEng.get(jpnSentence);

                const txBase = {
                    volumeIndex,
                    pageIndex,
                    ocrBubbleIndex: block.ocrIndex,
                    jpn_ocr: jpnSentence,
                    bounds: getBlockBounds(block),
                } as const;
                let lastValue = '';
                const textarea = Dom('textarea', {
                    type: 'text',
                    placeholder: engSentence || '', rows: 3,
                    'data-block-ocr-index': block.ocrIndex,
                    // TODO: check if blur triggers when you close browser
                    onblur: (evt: Event) => {
                        if (lastValue !== textarea.value) {
                            lastValue = textarea.value;
                            const tx: TranslationTransaction = {
                                ...txBase,
                                eng_human: lastValue,
                                sentAt: new Date().toISOString(),
                            };
                            whenInitialData.then(data => data.setEng(tx));
                        }
                    },
                });
                whenInitialData.then(data => {
                    const lastTranslation = data.getEng(txBase);
                    if (lastTranslation) {
                        textarea.value = lastTranslation + textarea.value;
                        lastValue = textarea.value;
                    }
                });
                return Dom('div', {
                    class: 'sentence-block',
                    onmousedown: () => focusBubbleSvg(block.ocrIndex),
                }, [
                    Dom('div', {style: 'flex: 1'}),
                    Dom('div', {class: 'ocred-text-block'}, [
                        Dom('div', {}, jpnSentence),
                        Dom('div', {style: 'display: flex; align-items: end'}, [
                            Dom('div', {}, [
                                Dom('div', {class: 'font-size-holder'}, getFontSize(block) + 'px'),
                                Dom('div', {
                                    class: 'confidence-holder',
                                    title: 'Recognized Text Confidence'
                                }, block.confidence.toFixed(2)),
                            ]),
                            Dom('div', {class: 'bubble-number-holder'}, '#' + block.ocrIndex),
                        ]),
                    ]),
                    textarea,
                ]);
            });
            const remainderCells = [];
            for (let i = 0; i < CELLS_PER_ROW - blockCells.length; ++i) {
                remainderCells.push(Dom('div', {class: 'remainder-cell'}));
            }
            gui.all_text_holder.appendChild(
                Dom('div', {class: 'translation-blocks-row'}, blockCells.concat(remainderCells)),
            );
        }

        if (lastFormListener) {
            gui.bubbles_translations_input_form.removeEventListener('focus', lastFormListener);
        }
        lastFormListener = (evt: Event) => {
            const target = evt.target as HTMLElement;
            if (target.hasAttribute('data-block-ocr-index')) {
                focusBubbleSvg(target.getAttribute('data-block-ocr-index')!);
            }
        };
        gui.bubbles_translations_input_form.addEventListener('focus', lastFormListener, true);

        const firstInput = gui.all_text_holder.querySelector('textarea[data-block-ocr-index]') as HTMLTextAreaElement;
        if (firstInput) {
            firstInput.focus();
        }
    };

    await showSelectedPage();
    gui.page_select_form.onchange = showSelectedPage;
    gui.go_to_next_page_button.onclick = () => {
        gui.page_input.value = String(+gui.page_input.value + 1);
        showSelectedPage();
    };

    whenInitialData.then(() => {
        document.body.setAttribute('data-status', 'READY');
        gui.status_message_holder.textContent = 'Ready for input';
    }).catch(error => {
        document.body.setAttribute('data-status', 'INITIALIZATION_ERROR');
        gui.status_message_holder.textContent = 'Failed to restore the last progress - ' + error;
    });
};
